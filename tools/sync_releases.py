"""Mirror latest GitHub Release installers of all QASSIMZ apps to public qassimz-hub and update catalog.json."""
from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HUB_REPO = "ahmedqassimtv-commits/qassimz-hub"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "catalog.json"


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=check)


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        while True:
            b = fh.read(131072)
            if not b:
                break
            h.update(b)
    return h.hexdigest().lower()


def main() -> None:
    cat = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    hub_releases_raw = run(["gh", "release", "list", "-R", HUB_REPO, "--limit", "100", "--json", "tagName"])
    existing_hub_tags = {r["tagName"] for r in json.loads(hub_releases_raw.stdout or "[]")}

    changed = False
    for item in cat["items"]:
        app_id = item["id"]
        repo = item["repo"]
        res = run(["gh", "release", "view", "-R", repo, "--json", "tagName,assets"], check=False)
        if res.returncode != 0 or not res.stdout.strip():
            print(f"[SKIP] {app_id}: no release found in {repo}")
            continue

        rel = json.loads(res.stdout)
        tag = rel["tagName"]
        ver = tag.lstrip("vV")
        assets = rel.get("assets") or []
        if not assets:
            print(f"[SKIP] {app_id} ({tag}): release has no assets")
            continue

        mirror_tag = f"pkg-{app_id}-v{ver}"
        setup_asset = next((a for a in assets if a["name"].lower().endswith(".exe") and "portable" not in a["name"].lower()), None)
        portable_asset = next((a for a in assets if "portable" in a["name"].lower()), None)
        ext_asset = next((a for a in assets if "extension" in a["name"].lower()), None)

        if not setup_asset:
            print(f"[SKIP] {app_id} ({tag}): no setup .exe asset")
            continue

        setup_sha = ""
        setup_size = int(setup_asset.get("size") or 0)

        if mirror_tag not in existing_hub_tags:
            print(f"[MIRROR] {app_id} ({tag}) -> {HUB_REPO}@{mirror_tag} ...")
            with tempfile.TemporaryDirectory() as tmp:
                tmp_dir = Path(tmp)
                dl = run(["gh", "release", "download", tag, "-R", repo, "-D", str(tmp_dir)], check=False)
                if dl.returncode != 0:
                    print(f"  [ERR] download failed: {dl.stderr.strip()}")
                    continue
                files = [p for p in sorted(tmp_dir.iterdir()) if p.is_file()]
                if not files:
                    continue
                for p in files:
                    if p.name == setup_asset["name"]:
                        setup_sha = sha256_file(p)
                        setup_size = p.stat().st_size
                cmd = [
                    "gh", "release", "create", mirror_tag,
                    "-R", HUB_REPO,
                    "--title", f"{item['name']} v{ver} (Mirror)",
                    "--notes", f"Official public installer mirror for {item['name']} v{ver} distributed via QASSIMZ Hub.",
                    "--latest=false",
                    *[str(p) for p in files],
                ]
                cr = run(cmd, check=False)
                if cr.returncode != 0:
                    print(f"  [ERR] create failed: {cr.stderr.strip()}")
                    continue
                existing_hub_tags.add(mirror_tag)
                print(f"  [OK] mirrored {len(files)} file(s)")
        else:
            print(f"[EXISTS] {app_id} -> {mirror_tag}")

        base_dl = f"https://github.com/{HUB_REPO}/releases/download/{mirror_tag}"
        item["version"] = ver
        item["setup_filename"] = setup_asset["name"]
        item["setup_url"] = f"{base_dl}/{setup_asset['name']}"
        item["setup_size"] = setup_size
        if setup_sha:
            item["setup_sha256"] = setup_sha
        if portable_asset:
            item["portable_url"] = f"{base_dl}/{portable_asset['name']}"
        if ext_asset:
            item["extra_assets"] = [{"label_ar": "تحميل إضافة متصفح كروم (ZIP)", "url": f"{base_dl}/{ext_asset['name']}"}]

        app_entry = {"version": ver, "setup_url": item["setup_url"]}
        if portable_asset:
            app_entry["portable_url"] = item["portable_url"]
        if ext_asset:
            app_entry["extension_url"] = f"{base_dl}/{ext_asset['name']}"
        cat["apps"][app_id] = app_entry
        changed = True

    if changed:
        cat["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        CATALOG_PATH.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {CATALOG_PATH} successfully!")


if __name__ == "__main__":
    main()
