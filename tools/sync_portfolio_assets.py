#!/usr/bin/env python3
"""Sync portfolio projects.json from assets/models and assets/content.

Usage:
  python tools/sync_portfolio_assets.py         # one-time sync
  python tools/sync_portfolio_assets.py --watch # continuous watch mode
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
PROJECTS_JSON = ROOT_DIR / "assets" / "data" / "projects.json"
MODELS_DIR = ROOT_DIR / "assets" / "models"
CONTENT_DIR = ROOT_DIR / "assets" / "content"

MODEL_EXTS = {".glb", ".gltf", ".obj", ".fbx"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
AUTO_SOURCES = {"auto-model", "auto-content"}
WATCHABLE_EXTS = MODEL_EXTS | IMAGE_EXTS


def to_posix_relative(path: Path) -> str:
    return path.relative_to(ROOT_DIR).as_posix()


def prettify_name(raw_name: str) -> str:
    text = raw_name.replace("_", " ").replace("-", " ").strip()
    return " ".join(part.capitalize() for part in text.split()) or raw_name


def pick_first_file(folder: Path, extensions: Iterable[str], preferred_name: str = "") -> Path | None:
    files = [p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in extensions]
    if not files:
        return None

    if preferred_name:
        for file_path in files:
            if file_path.name.lower() == preferred_name.lower():
                return file_path

    files.sort(key=lambda p: to_posix_relative(p).lower())
    return files[0]


def load_projects() -> List[dict]:
    if not PROJECTS_JSON.exists():
        return []
    try:
        data = json.loads(PROJECTS_JSON.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def parse_ids(projects: List[dict]) -> set[int]:
    ids: set[int] = set()
    for project in projects:
        try:
            ids.add(int(str(project.get("id", "")).strip()))
        except ValueError:
            continue
    return ids


def next_id(used_ids: set[int]) -> str:
    value = 1
    while value in used_ids:
        value += 1
    used_ids.add(value)
    return str(value)


def discover_model_projects() -> List[dict]:
    year = datetime.now().year
    discovered: List[dict] = []

    if not MODELS_DIR.exists():
        return discovered

    for folder in sorted([p for p in MODELS_DIR.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
        model_file = pick_first_file(folder, MODEL_EXTS, preferred_name="model.glb")
        if not model_file:
            continue

        image_file = pick_first_file(folder, IMAGE_EXTS, preferred_name="model.png")
        title = prettify_name(folder.name)

        discovered.append(
            {
                "source": "auto-model",
                "asset_key": f"models/{folder.name.lower()}",
                "title": title,
                "meta": f"3D Model · {year}",
                "description": f"Interactive 3D model for {title}.",
                "image": to_posix_relative(image_file) if image_file else "",
                "model_path": to_posix_relative(model_file),
                "github_link": "",
                "demo_link": "",
                "tags": ["3D", "Model", "Auto Sync"],
            }
        )

    return discovered


def discover_content_projects() -> List[dict]:
    year = datetime.now().year
    discovered: List[dict] = []

    if not CONTENT_DIR.exists():
        return discovered

    for folder in sorted([p for p in CONTENT_DIR.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
        image_files = sorted(
            [p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS],
            key=lambda p: to_posix_relative(p).lower(),
        )
        if not image_files:
            continue

        image_file = image_files[0]
        title = prettify_name(folder.name)
        discovered.append(
            {
                "source": "auto-content",
                "asset_key": f"content/{folder.name.lower()}",
                "title": title,
                "meta": f"Project Gallery · {year}",
                "description": f"Gallery assets for {title}.",
                "image": to_posix_relative(image_file),
                "model_path": "",
                "github_link": "",
                "demo_link": "",
                "tags": ["Gallery", "Content", "Auto Sync"],
                "gallery_images": [to_posix_relative(path) for path in image_files],
            }
        )

    return discovered


def coerce_project_strings(project: dict) -> dict:
    normalized = dict(project)
    for key in ["id", "title", "meta", "description", "image", "model_path", "github_link", "demo_link", "source", "asset_key"]:
        normalized[key] = str(normalized.get(key, "") or "")

    tags = normalized.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    normalized["tags"] = [str(tag) for tag in tags if str(tag).strip()]

    gallery_images = normalized.get("gallery_images", [])
    if not isinstance(gallery_images, list):
        gallery_images = []
    normalized["gallery_images"] = [str(path) for path in gallery_images if str(path).strip()]

    return normalized


def merge_projects(existing_projects: List[dict], discovered_auto: List[dict]) -> List[dict]:
    manual_projects = [coerce_project_strings(p) for p in existing_projects if str(p.get("source", "")) not in AUTO_SOURCES]

    existing_auto_map: Dict[Tuple[str, str], dict] = {}
    for project in existing_projects:
        source = str(project.get("source", ""))
        asset_key = str(project.get("asset_key", ""))
        if source in AUTO_SOURCES and asset_key:
            existing_auto_map[(source, asset_key)] = coerce_project_strings(project)

    used_ids = parse_ids(manual_projects)
    merged_auto: List[dict] = []

    for discovered in discovered_auto:
        discovered = coerce_project_strings(discovered)
        key = (discovered["source"], discovered["asset_key"])
        previous = existing_auto_map.get(key)

        if previous:
            discovered["id"] = previous.get("id", "") or next_id(used_ids)
            # Keep user-customized text fields while still refreshing asset paths.
            for custom_field in ["title", "meta", "description", "tags", "github_link", "demo_link"]:
                value = previous.get(custom_field)
                if custom_field == "tags":
                    if isinstance(value, list) and value:
                        discovered[custom_field] = [str(v) for v in value if str(v).strip()]
                elif isinstance(value, str) and value.strip():
                    discovered[custom_field] = value
        else:
            discovered["id"] = next_id(used_ids)

        merged_auto.append(discovered)

    merged_auto.sort(key=lambda p: (p.get("source", ""), p.get("title", "").lower()))
    return manual_projects + merged_auto


def write_if_changed(projects: List[dict]) -> bool:
    PROJECTS_JSON.parent.mkdir(parents=True, exist_ok=True)

    old_data = load_projects()
    if old_data == projects:
        return False

    PROJECTS_JSON.write_text(json.dumps(projects, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return True


def sync_once(verbose: bool = True) -> bool:
    existing = load_projects()
    discovered = discover_model_projects() + discover_content_projects()
    merged = merge_projects(existing, discovered)
    changed = write_if_changed(merged)

    if verbose:
        auto_models = sum(1 for p in merged if p.get("source") == "auto-model")
        auto_content = sum(1 for p in merged if p.get("source") == "auto-content")
        status = "updated" if changed else "no changes"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Sync {status}: {auto_models} model projects, {auto_content} content projects")

    return changed


def snapshot_state() -> Dict[str, Tuple[int, int]]:
    """Build a lightweight state snapshot for robust watch-mode change detection.

    The snapshot includes directory entries as well as relevant file entries so
    folder rename/delete operations are detected even when file mtimes/sizes
    are unchanged.
    """
    state: Dict[str, Tuple[int, int]] = {}
    watched_roots = [MODELS_DIR, CONTENT_DIR]

    for base in watched_roots:
        root_key = to_posix_relative(base) if base.exists() else str(base)
        state[f"root::{root_key}"] = (1 if base.exists() else 0, 0)
        if not base.exists():
            continue

        for entry in base.rglob("*"):
            rel_path = to_posix_relative(entry)
            stat = entry.stat()

            if entry.is_dir():
                # Track directories so rename/delete events cannot be missed.
                state[f"dir::{rel_path}"] = (stat.st_mtime_ns, 0)
                continue

            if entry.suffix.lower() not in WATCHABLE_EXTS:
                continue

            state[f"file::{rel_path}"] = (stat.st_mtime_ns, stat.st_size)

    return state


def watch(interval: float, force_sync_seconds: float) -> None:
    print(
        f"Watching for changes every {interval:.1f}s "
        f"(forced sync every {force_sync_seconds:.1f}s)..."
    )
    previous = snapshot_state()
    sync_once(verbose=True)
    last_sync = time.monotonic()

    while True:
        time.sleep(interval)
        current = snapshot_state()
        needs_sync = current != previous
        timed_force = (time.monotonic() - last_sync) >= force_sync_seconds

        if needs_sync or timed_force:
            previous = current
            sync_once(verbose=True)
            last_sync = time.monotonic()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync portfolio projects from assets folders")
    parser.add_argument("--watch", action="store_true", help="Keep watching and resync on changes")
    parser.add_argument("--interval", type=float, default=5.0, help="Polling interval in seconds for watch mode")
    parser.add_argument(
        "--force-sync-seconds",
        type=float,
        default=60.0,
        help="Forced resync interval in seconds while watching",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.watch:
        watch(max(args.interval, 1.0), max(args.force_sync_seconds, 5.0))
    else:
        sync_once(verbose=True)


if __name__ == "__main__":
    main()
