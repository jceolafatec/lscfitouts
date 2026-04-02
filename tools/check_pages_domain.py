#!/usr/bin/env python3
"""Diagnose common GitHub Pages custom-domain redirect issues.

This script is intentionally dependency-light so it can run in the existing
workspace without extra packages. It checks:

1. Which custom domain is configured in the local CNAME file.
2. Basic DNS resolution for the custom domain and optional GitHub Pages host.
3. HTTP redirect chains for both hosts without automatically following them.
4. Common misconfiguration hints, including redirect loops and missing DNS.
"""

from __future__ import annotations

import argparse
import pathlib
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


ROOT_DIR = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CNAME_PATH = ROOT_DIR / "CNAME"
TIMEOUT_SECONDS = 10
MAX_REDIRECTS = 8
GITHUB_PAGES_IPS = {
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
}
DOMAIN_FORWARDING_IPS = {
    "15.197.225.128",
    "3.33.251.168",
}


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_cname(path: pathlib.Path) -> str | None:
    if not path.exists():
        return None
    value = path.read_text(encoding="utf-8").strip()
    return value or None


def resolve_ips(hostname: str) -> list[str]:
    ips = set()
    try:
        for result in socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP):
            sockaddr = result[4]
            if sockaddr:
                ips.add(sockaddr[0])
    except socket.gaierror:
        return []
    return sorted(ips)


def nslookup(hostname: str, record_type: str) -> str:
    command = ["nslookup", f"-type={record_type}", hostname]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError:
        return "nslookup not found on PATH."
    except subprocess.TimeoutExpired:
        return "nslookup timed out."

    output = (completed.stdout or "") + (completed.stderr or "")
    return output.strip() or "No output."


def fetch_once(url: str) -> tuple[int | None, str | None, str | None]:
    opener = urllib.request.build_opener(NoRedirectHandler)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "pages-domain-check/1.0",
            "Cache-Control": "no-cache",
        },
        method="GET",
    )

    try:
        with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
            return response.getcode(), None, None
    except urllib.error.HTTPError as error:
        location = error.headers.get("Location")
        return error.code, location, None
    except ssl.SSLError as error:
        return None, None, f"SSL error: {error}"
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", error)
        return None, None, f"URL error: {reason}"


def trace_redirects(start_url: str) -> list[dict[str, str | int | None]]:
    hops: list[dict[str, str | int | None]] = []
    current_url = start_url
    seen = set()

    for _ in range(MAX_REDIRECTS):
        status, location, error = fetch_once(current_url)
        hop = {
            "url": current_url,
            "status": status,
            "location": location,
            "error": error,
        }
        hops.append(hop)

        if error or not location or status not in {301, 302, 303, 307, 308}:
            return hops

        next_url = urllib.parse.urljoin(current_url, location)
        if next_url in seen:
            hops.append(
                {
                    "url": next_url,
                    "status": None,
                    "location": None,
                    "error": "Redirect loop detected.",
                }
            )
            return hops

        seen.add(current_url)
        current_url = next_url

    hops.append(
        {
            "url": current_url,
            "status": None,
            "location": None,
            "error": f"Stopped after {MAX_REDIRECTS} hops.",
        }
    )
    return hops


def format_hops(title: str, hops: list[dict[str, str | int | None]]) -> list[str]:
    lines = [title]
    for index, hop in enumerate(hops, start=1):
        status = hop["status"] if hop["status"] is not None else "n/a"
        lines.append(f"  {index}. {hop['url']} -> status {status}")
        if hop["location"]:
            lines.append(f"     location: {hop['location']}")
        if hop["error"]:
            lines.append(f"     error: {hop['error']}")
    return lines


def print_resolution(title: str, hostname: str) -> list[str]:
    lines = [title]
    ips = resolve_ips(hostname)
    if not ips:
        lines.append("  No A/AAAA records resolved via socket lookup.")
        return lines

    lines.append(f"  Resolved IPs: {', '.join(ips)}")
    github_matches = sorted(set(ips) & GITHUB_PAGES_IPS)
    if github_matches:
        lines.append(f"  Matches GitHub Pages apex IPs: {', '.join(github_matches)}")
    return lines


def recommendations(custom_domain: str, github_host: str | None, custom_hops, github_hops, custom_ips) -> list[str]:
    notes: list[str] = []

    custom_loop = any(hop.get("error") == "Redirect loop detected." for hop in custom_hops)
    github_loop = any(hop.get("error") == "Redirect loop detected." for hop in github_hops)

    if not custom_ips:
        notes.append(
            f"`{custom_domain}` does not currently resolve. Check DNS at your registrar or DNS host first."
        )
    elif set(custom_ips) == DOMAIN_FORWARDING_IPS:
        notes.append(
            f"`{custom_domain}` resolves to common registrar/domain-forwarding IPs instead of GitHub Pages. Disable URL forwarding and point DNS directly to GitHub Pages records."
        )
    elif not (set(custom_ips) & GITHUB_PAGES_IPS):
        notes.append(
            f"`{custom_domain}` resolves, but not to the standard GitHub Pages apex IPs. Verify there is no external forwarding rule or proxy creating a loop."
        )

    if custom_loop or github_loop:
        notes.append(
            "A redirect loop was detected. Check GitHub Pages custom-domain settings and remove any registrar-level URL forwarding for the same domain."
        )

    if github_host and github_hops:
        first_location = github_hops[0].get("location")
        if first_location and custom_domain not in str(first_location):
            notes.append(
                f"`{github_host}` is redirecting somewhere unexpected: {first_location}. Confirm the repository's Pages custom domain is set to `{custom_domain}`."
            )

    if not notes:
        notes.append("No obvious local misconfiguration pattern was detected. If the browser still loops, verify the GitHub Pages settings UI and HTTPS certificate status.")

    return notes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check GitHub Pages custom-domain DNS and redirect behavior.")
    parser.add_argument(
        "--domain",
        help="Custom domain to test. Defaults to the local CNAME file if present.",
    )
    parser.add_argument(
        "--github-host",
        help="GitHub Pages host to test, for example `jceolafatec.github.io`.",
    )
    parser.add_argument(
        "--cname-path",
        default=str(DEFAULT_CNAME_PATH),
        help="Path to the local CNAME file. Defaults to the website root CNAME.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    cname_path = pathlib.Path(args.cname_path)
    cname_value = read_cname(cname_path)
    custom_domain = args.domain or cname_value

    if not custom_domain:
        print("No custom domain provided and no CNAME file found.", file=sys.stderr)
        return 1

    github_host = args.github_host

    print("GitHub Pages Domain Check")
    print("=" * 28)
    print(f"Website root: {ROOT_DIR}")
    print(f"CNAME path: {cname_path}")
    print(f"CNAME value: {cname_value or 'not found'}")
    print(f"Custom domain under test: {custom_domain}")
    print(f"GitHub host under test: {github_host or 'not provided'}")
    print()

    custom_ips = resolve_ips(custom_domain)
    for line in print_resolution("Custom domain resolution", custom_domain):
        print(line)
    print()

    print("Custom domain CNAME lookup")
    print(nslookup(custom_domain, "CNAME"))
    print()

    custom_hops = trace_redirects(f"https://{custom_domain}")
    for line in format_hops("HTTPS redirect trace for custom domain", custom_hops):
        print(line)
    print()

    github_hops = []
    if github_host:
        for line in print_resolution("GitHub host resolution", github_host):
            print(line)
        print()
        print("GitHub host CNAME lookup")
        print(nslookup(github_host, "CNAME"))
        print()

        github_hops = trace_redirects(f"https://{github_host}")
        for line in format_hops("HTTPS redirect trace for GitHub host", github_hops):
            print(line)
        print()

    print("Recommendations")
    for item in recommendations(custom_domain, github_host, custom_hops, github_hops, custom_ips):
        print(f"- {item}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())