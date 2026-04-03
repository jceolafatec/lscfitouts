# Raspberry Pi Deployment Summary

Last updated: 2026-04-03

## Overview

This Raspberry Pi is configured to host a Node.js backend behind Nginx and is publicly reachable through Tailscale Funnel.

## Device

- Hostname: lscfitouts
- OS: Debian GNU/Linux 12 (bookworm)
- Kernel: Linux 6.12.75+rpt-rpi-v8
- Architecture: aarch64
- SSH user: jceola
- Raspberry Pi LAN IP: 192.168.1.205

## Application Stack

- Backend runtime: Node.js
- Node.js version: v24.14.1
- npm version: 11.11.0
- Reverse proxy: Nginx
- Backend service name: node-backend
- Backend directory: /media/jceola/Dev/dockerdata/lscdrafting/backend
- Frontend directory: /media/jceola/Dev/dockerdata/lscdrafting/frontend
- Backend internal port: 3100
- Public web port on Pi: 80

## Service Topology

Public internet
-> Tailscale Funnel URL
-> Nginx on Raspberry Pi port 80
-> Node backend on 127.0.0.1:3100

## Public Access

- Public Funnel URL: https://lscfitouts.taild72765.ts.net/
- Funnel status: enabled
- Verified external response: HTTP 200

## Local Access

- Local Pi URL: http://192.168.1.205
- Local backend direct URL: http://192.168.1.205:3100

## Tailscale

- Tailscale installed: yes
- Tailscale node name: lscfitouts
- Tailscale IP: 100.88.50.62
- Tailnet user: jceola.fatec@
- Funnel target: http://127.0.0.1:80

## Network Findings

- Router LAN IP: 192.168.1.1
- Router reported WAN/Public IPv4: 10.27.90.112
- Router subnet mask: 255.255.192.0
- Router gateway: 10.27.64.1
- DNS servers: 1.1.1.1, 1.0.0.1
- NAT: enabled
- ISP-facing public IP observed externally: 203.56.157.21

## Internet Reachability Notes

This connection is behind CGNAT.

Evidence:
- Router WAN IP is 10.27.90.112, which is a private address.
- The externally observed public IP is 203.56.157.21.
- Standard router port forwarding alone will not expose the Pi directly to the internet in this setup.

Because of that, public access is provided through Tailscale Funnel instead of direct port forwarding.

## Firewall

UFW is enabled on the Raspberry Pi.

Allowed web-related ports include:
- 80/tcp
- 443/tcp
- OpenSSH

Note: the Pi still has multiple other open firewall rules from previous software/services and may need a cleanup pass if this device will be used as a production internet-facing host.

## Cleanup Performed

Removed or disabled conflicting web stack components:
- Apache: removed
- Lighttpd: removed
- Caddy: not present
- Cloudflared: not present

Rebuilt working Nginx configuration and verified proxying to the Node backend.

## Verification Results

Successful checks completed:
- SSH login works
- Node backend service is active
- Backend responds locally on port 3100
- Nginx is active on port 80
- LAN access returns HTTP 200
- Public Tailscale Funnel URL returns HTTP 200
- Tailscale node rename from webserver to lscfitouts completed

## Current Public Response

At the time of verification, the root endpoint returned JSON similar to:

```json
{"ok":true,"path":"/","method":"GET","ts":"2026-04-03T02:58:41.840Z"}
```

## Suggested Application Integration Notes

If this Markdown file is being imported into another application, the most useful runtime values are:

```json
{
  "hostname": "lscfitouts",
  "lanIp": "192.168.1.205",
  "tailscaleIp": "100.88.50.62",
  "publicUrl": "https://lscfitouts.taild72765.ts.net/",
  "backendDir": "/media/jceola/Dev/dockerdata/lscdrafting/backend",
  "frontendDir": "/media/jceola/Dev/dockerdata/lscdrafting/frontend",
  "backendPort": 3100,
  "publicPort": 80,
  "serviceName": "node-backend",
  "reverseProxy": "nginx",
  "tunnel": "tailscale-funnel",
  "os": "Debian 12"
}
```

## Security Note

The SSH password is intentionally not stored in this file.
