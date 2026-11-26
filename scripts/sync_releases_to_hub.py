#!/usr/bin/env python3
"""
QASSIMZ Hub — Public Binary Mirror & Catalog Sync Tool
Pulls compiled Windows Setup (.exe) & Portable packages from all 13 QASSIMZ repositories
(both the 4 public repos and the 9 private repos), publishes them onto public releases
of `ahmedqassimtv-commits/qassimz-hub` so anonymous users can install/update without login,
and updates `catalog.json` with exact URLs, byte sizes, and SHA-256 hashes.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HUB_ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = HUB_ROOT / "catalog.json"
HUB_REPO = "ahmedqassimtv-commits/qassimz-hub"


def run_gh(args: list[str], check: bool = True) -> str:
    res = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout.strip()


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        while True:
            chunk = fh.read(262144)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest().lower()


def sync_item(item: dict, apps_map: dict, only_ids: set[str] | None = None) -> bool:
    item_id = item["id"]
    if only_ids and item_id not in only_ids:
        return False

    src_repo = item["repo"]
    ver = item["version"]
    src_tag = f"v{ver}"
    hub_tag = f"pkg-{item_id}-v{ver}"

    print(f"==> Syncing {item_id} ({src_repo} @ {src_tag}) -> {HUB_REPO} [{hub_tag}]", flush=True)

    with tempfile.TemporaryDirectory(prefix=f"qhub_{item_id}_") as tmp:
        tmp_dir = Path(tmp)
        try:
            run_gh(["release", "download", src_tag, "-R", src_repo, "--dir", str(tmp_dir), "--clobber"])
        except Exception as e:
            print(f"  [WARN] Could not download {src_repo}@{src_tag}: {e}", flush=True)
            return False

        files = sorted(f for f in tmp_dir.iterdir() if f.is_file())
        if not files:
            print(f"  [WARN] No release assets found in {src_repo}@{src_tag}", flush=True)
            return False

        setup_file = next(
            (f for f in files if f.suffix.lower() == ".exe" and "portable" not in f.name.lower()),
            None,
        )
        portable_file = next(
            (f for f in files if "portable" in f.name.lower()),
            None,
        )
        ext_file = next(
            (f for f in files if "extension" in f.name.lower() and f.suffix.lower() == ".zip"),
            None,
        )

        if not setup_file:
            print(f"  [WARN] No Setup .exe found among {[f.name for f in files]}", flush=True)
            return False

        # Create or update public release on qassimz-hub
        title = f"{item['name']} v{ver}"
        notes = item.get("release_notes_ar") or f"Official public distribution for {item['name']} v{ver}."
        exists = subprocess.run(
            ["gh", "release", "view", hub_tag, "-R", HUB_REPO],
            capture_output=True,
            text=True,
        ).returncode == 0

        str_files = [str(f) for f in files]
        if exists:
            run_gh(["release", "upload", hub_tag, *str_files, "--clobber", "-R", HUB_REPO])
        else:
            run_gh(["release", "create", hub_tag, *str_files, "--title", title, "--notes", notes, "-R", HUB_REPO])

        base_dl = f"https://github.com/{HUB_REPO}/releases/download/{hub_tag}"
        item["setup_filename"] = setup_file.name
        item["setup_url"] = f"{base_dl}/{setup_file.name}"
        item["setup_size"] = setup_file.stat().st_size
        item["setup_sha256"] = sha256_file(setup_file)

        app_entry = {"version": ver, "setup_url": item["setup_url"]}
        if portable_file:
            item["portable_url"] = f"{base_dl}/{portable_file.name}"
            app_entry["portable_url"] = item["portable_url"]
        if ext_file and item.get("extra_assets"):
            item["extra_assets"][0]["url"] = f"{base_dl}/{ext_file.name}"
            app_entry["extension_url"] = item["extra_assets"][0]["url"]

        apps_map[item_id] = app_entry
        print(
            f"  [OK] Mirrored {setup_file.name} ({item['setup_size']:,} B, sha256={item['setup_sha256'][:12]}...)",
            flush=True,
        )
        return True


def main() -> None:
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    apps_map = catalog.setdefault("apps", {})
    changed = 0

    for item in catalog.get("items", []):
        if sync_item(item, apps_map, only):
            changed += 1

    catalog["updated_at"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Done. Synced {changed} product(s) and updated {CATALOG_PATH}.", flush=True)


if __name__ == "__main__":
    main()
