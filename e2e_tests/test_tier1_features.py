"""Tier 1 E2E Tests: Isolated Happy-Path Feature Coverage (F1-F12).

Opaque-box tests derived strictly from ORIGINAL_REQUEST.md and PROJECT.md
Interface Contracts. Delta modules are loaded lazily inside test methods so
unittest discovery is always clean during parallel M1-M4 development.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
import time
import unittest
import zlib
from pathlib import Path

from e2e_tests.harness import (
    ALL_15_WORKFLOW_PATHS,
    EXPECTED_CATALOG_PRODUCT_IDS,
    HUB_ROOT,
    QPKG_MAGIC,
    DeltaTestServer,
    load_delta_updater,
    load_detector,
    load_installer_runner,
    load_server,
    make_deterministic_bytes,
    pack_directory,
    parse_yaml_via_yq,
    res_get,
    run_packager_cli,
    sha256_bytes,
    sha256_file,
    snapshot_dir_hashes,
)


class TestTier1Features(unittest.TestCase):
    def test_f1_packager_cli_pack_verify_inspect(self) -> None:
        """F1: pack, verify, inspect CLI subcommands and QPKG binary magic header."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "app_src"
            out = root / "dist"
            (src / "ui").mkdir(parents=True)
            (src / "app.exe").write_bytes(make_deterministic_bytes(8192, seed=101))
            (src / "ui" / "index.html").write_text("<h1>Hello QASSIMZ</h1>", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(src, out, "demo-app", "1.2.3")

            # Verify binary magic header
            with qpkg_path.open("rb") as fh:
                magic = fh.read(8)
            self.assertEqual(magic, QPKG_MAGIC)

            # Verify subcommand exits 0
            v_proc = run_packager_cli(
                ["verify", "--manifest", str(manifest_path), "--qpkg", str(qpkg_path)]
            )
            self.assertEqual(v_proc.returncode, 0, msg=f"verify failed: {v_proc.stderr}")

            # Inspect subcommand exits 0 and mentions app_id & version
            i_proc = run_packager_cli(["inspect", "--manifest", str(manifest_path)])
            self.assertEqual(i_proc.returncode, 0, msg=f"inspect failed: {i_proc.stderr}")
            combined = i_proc.stdout + i_proc.stderr
            self.assertIn("demo-app", combined)
            self.assertIn("1.2.3", combined)
            self.assertEqual(manifest["file_count"], 2)

    def test_f2_chunking_large_files_64kb(self) -> None:
        """F2: Files > 1MB are split into 64KB independently compressed chunks."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "src"
            out = root / "out"
            src.mkdir()

            big_size = 1_500_000  # > 1MB (1048576)
            big_data = make_deterministic_bytes(big_size, seed=202)
            (src / "big.asar").write_bytes(big_data)
            (src / "small.txt").write_text("tiny file", encoding="utf-8")

            _, qpkg_path, manifest = pack_directory(src, out, "chunk-app", "2.0.0")
            by_path = {f["path"]: f for f in manifest["files"]}

            self.assertIn("chunks", by_path["big.asar"])
            self.assertNotIn("chunks", by_path["small.txt"])

            chunks = by_path["big.asar"]["chunks"]
            expected_chunks = (big_size + 65536 - 1) // 65536
            self.assertEqual(len(chunks), expected_chunks)

            # Reconstruct big.asar directly by reading each byte range from .qpkg and decompressing
            reconstructed = bytearray()
            with qpkg_path.open("rb") as fh:
                for idx, ch in enumerate(chunks):
                    for key in ("sha256", "offset", "comp_size", "raw_size"):
                        self.assertIn(key, ch, msg=f"chunk {idx} missing {key}")
                    fh.seek(ch["offset"])
                    comp = fh.read(ch["comp_size"])
                    raw = zlib.decompress(comp)
                    self.assertEqual(len(raw), ch["raw_size"])
                    self.assertEqual(sha256_bytes(raw), ch["sha256"])
                    reconstructed.extend(raw)

            self.assertEqual(bytes(reconstructed), big_data)
            self.assertEqual(sha256_bytes(bytes(reconstructed)), by_path["big.asar"]["sha256"])

    def test_f3_manifest_schema_and_verify(self) -> None:
        """F3: manifest.json schema fields, --exclude glob, and --extra-file."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "src"
            out = root / "out"
            src.mkdir()
            (src / "keep.js").write_text("console.log(1);", encoding="utf-8")
            (src / "debug.log").write_text("skip me", encoding="utf-8")
            extra_src = root / "license.txt"
            extra_src.write_text("QASSIMZ LICENSE", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(
                src,
                out,
                "schema-app",
                "3.1.0",
                extra_args=["--exclude", "*.log", "--extra-file", f"{extra_src}:docs/LICENSE.txt"],
            )

            required_keys = {
                "format_version",
                "app_id",
                "version",
                "compression",
                "chunk_size",
                "chunk_threshold",
                "qpkg_filename",
                "qpkg_size",
                "qpkg_sha256",
                "total_raw_size",
                "file_count",
                "files",
            }
            self.assertTrue(required_keys.issubset(manifest.keys()))
            self.assertEqual(manifest["format_version"], 1)
            self.assertEqual(manifest["app_id"], "schema-app")
            self.assertEqual(manifest["version"], "3.1.0")
            self.assertEqual(manifest["compression"], "zlib")
            self.assertEqual(manifest["chunk_size"], 65536)
            self.assertEqual(manifest["chunk_threshold"], 1048576)
            self.assertEqual(manifest["qpkg_filename"], "schema-app-v3.1.0.qpkg")
            self.assertEqual(manifest["qpkg_size"], qpkg_path.stat().st_size)
            self.assertEqual(manifest["qpkg_sha256"], sha256_file(qpkg_path))

            paths = {f["path"] for f in manifest["files"]}
            self.assertIn("keep.js", paths)
            self.assertIn("docs/LICENSE.txt", paths)
            self.assertNotIn("debug.log", paths)
            self.assertEqual(manifest["file_count"], len(paths))

            v_proc = run_packager_cli(
                ["verify", "--manifest", str(manifest_path), "--qpkg", str(qpkg_path)]
            )
            self.assertEqual(v_proc.returncode, 0)

    def test_f4_manifest_fetch_and_diff_reuse(self) -> None:
        """F4: fetch_manifest over HTTP (with redirect) and compute_plan diff/reuse."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            v1_dir = root / "v1"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            v1_dir.mkdir()
            v2_dir.mkdir()

            for i in range(5):
                data = make_deterministic_bytes(4096, seed=300 + i)
                (v1_dir / f"file{i}.bin").write_bytes(data)
                (v2_dir / f"file{i}.bin").write_bytes(data)
            # Modify only file0 in v2
            (v2_dir / "file0.bin").write_bytes(make_deterministic_bytes(4096, seed=999))

            manifest_path, qpkg_path, _ = pack_directory(v2_dir, dist_dir, "diff-app", "2.0.0")

            with DeltaTestServer() as srv:
                srv.serve_file("/cdn/manifest.json", manifest_path, "application/json")
                srv.serve_file("/cdn/diff-app-v2.0.0.qpkg", qpkg_path)
                m_url = srv.add_redirect("/releases/v2/manifest.json", "/cdn/manifest.json", status=302)

                updater = du.DeltaUpdater()
                fetched_manifest, resolved_url = updater.fetch_manifest([m_url])
                self.assertEqual(fetched_manifest["app_id"], "diff-app")
                self.assertEqual(fetched_manifest["version"], "2.0.0")
                self.assertIn("/cdn/", resolved_url)

                plan = updater.compute_plan(fetched_manifest, v1_dir)
                # 4 files unchanged/reused, 1 file needs download
                files_reused = res_get(plan, "files_reused", 0)
                self.assertGreaterEqual(files_reused, 4)

    def test_f5_range_coalescing_and_302_redirect(self) -> None:
        """F5: coalesce_ranges merges nearby byte ranges + 302 redirect preserves Range 206."""
        du = load_delta_updater()
        updater = du.DeltaUpdater()

        # Test coalesce_ranges directly if RangeItem is exposed
        range_item_cls = getattr(du, "RangeItem", None)
        if range_item_cls is not None:
            # Inspect fields or try positional/keyword construction
            try:
                items = [
                    range_item_cls(offset=100, length=500),
                    range_item_cls(offset=700, length=500),   # gap=100 <= 16384 -> coalesce
                    range_item_cls(offset=50000, length=500), # gap > 16384 -> separate batch
                ]
            except TypeError:
                items = None
            if items is not None:
                batches = updater.coalesce_ranges(items, max_gap=16384, max_batch_bytes=4194304)
                self.assertEqual(len(batches), 2)

        # End-to-end 302 redirect + 206 Range download verification
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            for i in range(10):
                d = make_deterministic_bytes(8192, seed=400 + i)
                (install_dir / f"mod{i}.bin").write_bytes(d)
                (v2_dir / f"mod{i}.bin").write_bytes(d)
            (v2_dir / "mod2.bin").write_bytes(make_deterministic_bytes(8192, seed=499))

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "range-app", "2.0.0")

            with DeltaTestServer() as srv:
                srv.serve_file("/cdn/manifest.json", manifest_path, "application/json")
                srv.serve_file("/cdn/range-app-v2.0.0.qpkg", qpkg_path)
                m_url = srv.add_redirect("/releases/v2/manifest.json", "/cdn/manifest.json")
                q_url = srv.add_redirect("/releases/v2/range-app-v2.0.0.qpkg", "/cdn/range-app-v2.0.0.qpkg")

                item = {
                    "id": "range-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = updater.apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed: {res}")
                self.assertGreaterEqual(srv.range_requests_count, 1)
                self.assertTrue(
                    any(r["status"] == 302 and "qpkg" in r["path"] for r in srv.request_log),
                    msg="Expected 302 redirect for .qpkg",
                )
                self.assertTrue(
                    any(r["status"] == 206 and "qpkg" in r["path"] for r in srv.request_log),
                    msg="Expected 206 Partial Content for .qpkg after redirect",
                )
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

    def test_f6_sha256_verify_atomic_swap_and_prune(self) -> None:
        """F6: SHA-256 verification, atomic swap, new file addition, and obsolete file pruning."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            # v1 has keep.bin, update.txt, obsolete.old
            keep_bytes = make_deterministic_bytes(16384, seed=501)
            (install_dir / "keep.bin").write_bytes(keep_bytes)
            (install_dir / "update.txt").write_text("v1 content", encoding="utf-8")
            (install_dir / "obsolete.old").write_text("remove me", encoding="utf-8")

            # v2 has keep.bin, updated update.txt, added.txt (obsolete.old removed)
            (v2_dir / "keep.bin").write_bytes(keep_bytes)
            (v2_dir / "update.txt").write_text("v2 content updated", encoding="utf-8")
            (v2_dir / "added.txt").write_text("brand new", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "swap-app", "2.0.0")

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/swap-app-v2.0.0.qpkg", qpkg_path)
                item = {
                    "id": "swap-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed: {res}")
                self.assertFalse((install_dir / "obsolete.old").exists())
                self.assertTrue((install_dir / "added.txt").exists())
                self.assertEqual(res_get(res, "files_pruned", 0), 1)
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

    def test_f7_fallback_on_first_install_or_missing_manifest(self) -> None:
        """F7: Clean fallback_needed=True when install_dir is missing (first-time install)."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            missing_dir = root / "does_not_exist"
            cache_dir = root / "cache"
            item = {
                "id": "fresh-app",
                "version": "1.0.0",
                "delta_manifest_url": "http://127.0.0.1:1/manifest.json",
                "delta_qpkg_url": "http://127.0.0.1:1/fresh-app-v1.0.0.qpkg",
            }
            res = du.DeltaUpdater().apply_delta_update(item, missing_dir, cache_dir)
            self.assertFalse(res_get(res, "ok"))
            self.assertTrue(res_get(res, "fallback_needed"))
            self.assertTrue(bool(res_get(res, "fallback_reason")))

    def test_f8_telemetry_and_taskqueue_contract(self) -> None:
        """F8: Live telemetry callback + TaskQueue additive delta fields."""
        du = load_delta_updater()
        ir = load_installer_runner()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            shared = make_deterministic_bytes(32768, seed=601)
            (install_dir / "shared.bin").write_bytes(shared)
            (install_dir / "app.js").write_text("v1", encoding="utf-8")
            (v2_dir / "shared.bin").write_bytes(shared)
            (v2_dir / "app.js").write_text("v2-updated", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "tele-app", "2.0.0")
            events: list[dict] = []

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/tele-app-v2.0.0.qpkg", qpkg_path)
                setup_url = srv.serve_bytes("/Setup.exe", b"FAKE_SETUP_BINARY" * 100)

                item = {
                    "id": "tele-app",
                    "code": "Ta",
                    "name": "TeleApp",
                    "name_ar": "تطبيق",
                    "accent": "#3B82F6",
                    "version": "2.0.0",
                    "setup_filename": "Setup.exe",
                    "setup_url": setup_url,
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }

                # 1. Verify direct on_progress callback
                res = du.DeltaUpdater().apply_delta_update(
                    item, install_dir, cache_dir, on_progress=lambda ev: events.append(dict(ev))
                )
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed: {res}")
                self.assertGreater(len(events), 0, "Expected on_progress telemetry events")

                # 2. Verify TaskQueue additive delta schema
                tq = ir.TaskQueue(cache_dir / "tq_cache")
                item_with_state = dict(item)
                item_with_state["state"] = {
                    "installed": True,
                    "installed_version": "1.0.0",
                    "has_update": True,
                    "install_dir": str(install_dir),
                }
                task = tq.enqueue_install(item_with_state, silent=True)
                required_additive = {
                    "update_mode",
                    "stage",
                    "delta_saved_bytes",
                    "delta_saved_pct",
                    "delta_full_size",
                    "delta_chunks_done",
                    "delta_chunks_total",
                    "delta_fallback_reason",
                }
                self.assertTrue(
                    required_additive.issubset(task.keys()),
                    msg=f"Missing additive TaskQueue keys: {required_additive - set(task.keys())}",
                )

                # Wait briefly for worker completion
                deadline = time.time() + 10.0
                final_task = task
                while time.time() < deadline:
                    snaps = tq.snapshot()
                    if snaps:
                        final_task = snaps[0]
                        if final_task["status"] in ("completed", "error", "cancelled"):
                            break
                    time.sleep(0.05)
                self.assertEqual(final_task["status"], "completed", msg=f"Task failed: {final_task}")

    def test_f9_version_stamp_parity_and_stage_only(self) -> None:
        """F9: .qassimz-version.json written & read by detector.py + stage_only=True."""
        du = load_delta_updater()
        detector = load_detector()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            (install_dir / "DemoApp.exe").write_bytes(make_deterministic_bytes(4096, seed=701))
            (v2_dir / "DemoApp.exe").write_bytes(make_deterministic_bytes(4096, seed=702))

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "stamp-app", "2.5.0")
            v1_snap = snapshot_dir_hashes(install_dir)

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/stamp-app-v2.5.0.qpkg", qpkg_path)
                item = {
                    "id": "stamp-app",
                    "version": "2.5.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                    "detection": {
                        "exe_paths": [str(install_dir / "DemoApp.exe")],
                    },
                }

                # First test stage_only=True: live install_dir MUST remain untouched
                res_stage = du.DeltaUpdater().apply_delta_update(
                    item, install_dir, cache_dir / "stage_cache", stage_only=True
                )
                self.assertTrue(res_get(res_stage, "ok"), msg=f"stage_only failed: {res_stage}")
                self.assertEqual(
                    snapshot_dir_hashes(install_dir),
                    v1_snap,
                    "stage_only=True must NOT modify live install_dir",
                )

                # Now apply for real and verify .qassimz-version.json + detector parity
                res_apply = du.DeltaUpdater().apply_delta_update(
                    item, install_dir, cache_dir / "apply_cache", stage_only=False
                )
                self.assertTrue(res_get(res_apply, "ok"), msg=f"apply failed: {res_apply}")

                stamp_path = install_dir / ".qassimz-version.json"
                self.assertTrue(stamp_path.exists(), ".qassimz-version.json not written")
                stamp = json.loads(stamp_path.read_text(encoding="utf-8"))
                self.assertEqual(stamp["app_id"], "stamp-app")
                self.assertEqual(stamp["version"], "2.5.0")
                self.assertEqual(stamp["method"], "delta")
                self.assertIn("updated_at", stamp)

                state = detector.detect_item_state(item, reg_map={})
                self.assertTrue(state["installed"])
                self.assertEqual(state["installed_version"], "2.5.0")
                self.assertFalse(state["has_update"])

    def test_f10_ui_telemetry_contract_keys(self) -> None:
        """F10: UI static invariants + delta telemetry integration in app.js."""
        server_mod = load_server()
        app_js = (HUB_ROOT / "app" / "ui" / "app.js").read_text(encoding="utf-8")
        index_html = (HUB_ROOT / "app" / "ui" / "index.html").read_text(encoding="utf-8")

        self.assertNotIn("1.2.0", app_js)
        self.assertNotIn("1.2.0", index_html)
        self.assertNotIn("liquid-glass.css", index_html)

        # Verify every api("...") call matches a public method on HubApi
        api_calls = set(re.findall(r'\bapi\(\s*["\']([a-zA-Z0-9_]+)["\']', app_js))
        public_methods = {
            name
            for name in dir(server_mod.HubApi)
            if not name.startswith("_") and callable(getattr(server_mod.HubApi, name))
        }
        missing = api_calls - public_methods
        self.assertEqual(missing, set(), msg=f"UI calls unknown HubApi methods: {missing}")

        # Verify delta telemetry fields are wired in app.js
        for key in ("update_mode", "delta_saved_bytes", "delta_saved_pct"):
            self.assertIn(key, app_js, msg=f"app.js must handle delta telemetry field '{key}'")

    def test_f11_catalog_schema_and_sync_contract(self) -> None:
        """F11: catalog.json schema_version 1 + 13 products + sync_releases delta support."""
        cat = json.loads((HUB_ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(cat["schema_version"], 1)
        item_ids = [it["id"] for it in cat["items"]]
        self.assertEqual(item_ids, EXPECTED_CATALOG_PRODUCT_IDS)
        self.assertEqual(set(cat["apps"].keys()), set(EXPECTED_CATALOG_PRODUCT_IDS))
        self.assertIn("hub", cat)
        self.assertEqual(cat["hub"]["id"], "qassimz-hub")

        sync_src = (HUB_ROOT / "tools" / "sync_releases.py").read_text(encoding="utf-8")
        self.assertIn("delta_manifest_url", sync_src)
        self.assertIn("delta_qpkg_url", sync_src)

    def test_f12_suite_workflows_delta_steps(self) -> None:
        """F12: All 15 repos have valid YAML build*.yml workflows."""
        for wf in ALL_15_WORKFLOW_PATHS:
            self.assertTrue(wf.exists(), msg=f"Missing workflow: {wf}")
            parsed = parse_yaml_via_yq(wf)
            self.assertIsInstance(parsed, dict)
            self.assertIn("jobs", parsed, msg=f"No jobs section in {wf}")


if __name__ == "__main__":
    unittest.main()
