"""Tier 4 E2E Tests: 5 Realistic Multi-Feature End-User Workloads."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

try:
    from playwright.sync_api import sync_playwright

    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

from e2e_tests.harness import (
    ALL_15_WORKFLOW_PATHS,
    EXPECTED_CATALOG_PRODUCT_IDS,
    HUB_ROOT,
    DeltaTestServer,
    load_delta_updater,
    load_detector,
    load_server,
    make_deterministic_bytes,
    pack_directory,
    parse_yaml_via_yq,
    res_get,
    snapshot_dir_hashes,
)


class TestTier4Scenarios(unittest.TestCase):
    def test_scenario_1_electron_app_update_over_90pct_savings(self) -> None:
        """Scenario 1: Electron-like app (10+ MB app.asar + 20 assets) achieves >90% real HTTP byte savings."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            (install_dir / "resources").mkdir(parents=True)
            (install_dir / "assets").mkdir(parents=True)
            (v2_dir / "resources").mkdir(parents=True)
            (v2_dir / "assets").mkdir(parents=True)

            # 10.5 MB incompressible synthetic app.asar
            import random
            asar_v1 = bytearray(random.Random(4001).randbytes(10_500_000))
            asar_v2 = bytearray(asar_v1)
            # Patch only 4 KB inside app.asar (falls within 1 chunk of 64KB)
            patch_offset = 50 * 65536 + 1024
            asar_v2[patch_offset : patch_offset + 4096] = random.Random(4999).randbytes(4096)

            (install_dir / "resources" / "app.asar").write_bytes(bytes(asar_v1))
            (v2_dir / "resources" / "app.asar").write_bytes(bytes(asar_v2))

            # 20 unchanged assets
            for i in range(20):
                asset = make_deterministic_bytes(16384, seed=4100 + i)
                (install_dir / "assets" / f"asset_{i:02d}.bin").write_bytes(asset)
                (v2_dir / "assets" / f"asset_{i:02d}.bin").write_bytes(asset)

            # 1 small JS file updated
            (install_dir / "preload.js").write_text("window.VERSION='1.4.0';\n", encoding="utf-8")
            (v2_dir / "preload.js").write_text("window.VERSION='1.5.0';\n", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(
                v2_dir, dist_dir, "qassimz-music", "1.5.0"
            )
            qpkg_size = manifest["qpkg_size"]
            self.assertGreater(qpkg_size, 10_000_000)

            with DeltaTestServer() as srv:
                srv.serve_file("/cdn/manifest.json", manifest_path, "application/json")
                srv.serve_file("/cdn/qassimz-music-v1.5.0.qpkg", qpkg_path)
                m_url = srv.add_redirect("/releases/v1.5.0/manifest.json", "/cdn/manifest.json", status=302)
                q_url = srv.add_redirect(
                    "/releases/v1.5.0/qassimz-music-v1.5.0.qpkg",
                    "/cdn/qassimz-music-v1.5.0.qpkg",
                    status=302,
                )

                item = {
                    "id": "qassimz-music",
                    "version": "1.5.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": qpkg_size,
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Scenario 1 delta failed: {res}")
                self.assertGreater(res_get(res, "saved_pct", 0.0), 90.0)
                self.assertGreater(res_get(res, "chunks_reused", 0), 150)

                # Measure REAL HTTP bytes served by DeltaTestServer (excluding nothing, including manifest!)
                self.assertLess(
                    srv.total_bytes_served,
                    int(qpkg_size * 0.10),
                    msg=(
                        f"Real HTTP transfer must be <10% of qpkg_size: "
                        f"served={srv.total_bytes_served}, qpkg_size={qpkg_size}"
                    ),
                )
                self.assertGreaterEqual(srv.range_requests_count, 1)
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

    def test_scenario_2_pyinstaller_onedir_update_prune_and_detector_parity(self) -> None:
        """Scenario 2: PyInstaller onedir bundle (>90% savings + obsolete pruning + detector v2 parity)."""
        du = load_delta_updater()
        detector = load_detector()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            (install_dir / "_internal").mkdir(parents=True)
            (v2_dir / "_internal").mkdir(parents=True)

            # Several >1MB unchanged DLLs (total ~6MB)
            for idx, name in enumerate(("python312.dll", "Qt6Core.dll", "libcrypto-3.dll")):
                dll_bytes = make_deterministic_bytes(2_100_000, seed=4200 + idx)
                (install_dir / "_internal" / name).write_bytes(dll_bytes)
                (v2_dir / "_internal" / name).write_bytes(dll_bytes)

            exe_bytes = make_deterministic_bytes(262144, seed=4210)
            (install_dir / "QassimzHub.exe").write_bytes(exe_bytes)
            (v2_dir / "QassimzHub.exe").write_bytes(exe_bytes)

            # 1 updated script, 1 removed legacy file, 1 newly added file
            (install_dir / "_internal" / "ui.js").write_text("const v = '1.4.0';", encoding="utf-8")
            (install_dir / "_internal" / "legacy_bridge.pyd").write_bytes(b"obsolete-module")
            (v2_dir / "_internal" / "ui.js").write_text("const v = '1.5.0';", encoding="utf-8")
            (v2_dir / "_internal" / "delta_telemetry.js").write_text("export const ok = true;", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(
                v2_dir, dist_dir, "qassimz-hub", "1.5.0"
            )
            qpkg_size = manifest["qpkg_size"]

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/qassimz-hub-v1.5.0.qpkg", qpkg_path)
                item = {
                    "id": "qassimz-hub",
                    "version": "1.5.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": qpkg_size,
                    "detection": {"exe_paths": [str(install_dir / "QassimzHub.exe")]},
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Scenario 2 delta failed: {res}")
                self.assertGreater(res_get(res, "saved_pct", 0.0), 90.0)
                self.assertLess(
                    srv.total_bytes_served,
                    int(qpkg_size * 0.10),
                    msg=f"Expected <10% real HTTP bytes served: {srv.total_bytes_served} / {qpkg_size}",
                )
                self.assertFalse((install_dir / "_internal" / "legacy_bridge.pyd").exists())
                self.assertTrue((install_dir / "_internal" / "delta_telemetry.js").exists())
                self.assertTrue((install_dir / ".qassimz-version.json").exists())
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

                state = detector.detect_item_state(item, reg_map={})
                self.assertTrue(state["installed"])
                self.assertEqual(state["installed_version"], "1.5.0")
                self.assertFalse(state["has_update"])

    def test_scenario_3_mid_apply_write_failure_100pct_atomic_rollback(self) -> None:
        """Scenario 3: Mid-apply swap failure rolls back 100% byte-for-byte to v1 and signals fallback."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            for i in range(5):
                (install_dir / f"mod_{i}.bin").write_bytes(make_deterministic_bytes(16384, seed=4300 + i))
                (v2_dir / f"mod_{i}.bin").write_bytes(make_deterministic_bytes(16384, seed=4400 + i))
            (install_dir / "keep.txt").write_text("unchanged-v1", encoding="utf-8")
            (v2_dir / "keep.txt").write_text("unchanged-v1", encoding="utf-8")

            v1_snapshot = snapshot_dir_hashes(install_dir)
            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "rollback-app", "2.0.0")

            orig_replace = os.replace
            orig_copy2 = shutil.copy2
            install_resolved = install_dir.resolve()
            swap_writes_into_install = 0
            fault_fired = False

            def _is_target_inside_install(dst: os.PathLike | str) -> bool:
                try:
                    p = Path(dst).resolve()
                    return p.parent == install_resolved and p.name.startswith("mod_")
                except Exception:
                    return False

            def _faulty_replace(src, dst):
                nonlocal swap_writes_into_install, fault_fired
                if not fault_fired and _is_target_inside_install(dst):
                    swap_writes_into_install += 1
                    if swap_writes_into_install == 3:
                        fault_fired = True
                        raise OSError("Simulated mid-swap disk full / access denied")
                return orig_replace(src, dst)

            def _faulty_copy2(src, dst, *args, **kwargs):
                nonlocal swap_writes_into_install, fault_fired
                if not fault_fired and _is_target_inside_install(dst):
                    swap_writes_into_install += 1
                    if swap_writes_into_install == 3:
                        fault_fired = True
                        raise OSError("Simulated mid-swap copy failure")
                return orig_copy2(src, dst, *args, **kwargs)

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/rollback-app-v2.0.0.qpkg", qpkg_path)
                item = {
                    "id": "rollback-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                with mock.patch("os.replace", side_effect=_faulty_replace), mock.patch(
                    "shutil.copy2", side_effect=_faulty_copy2
                ):
                    res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)

            self.assertTrue(fault_fired, "Expected simulated mid-swap write failure to fire")
            self.assertFalse(res_get(res, "ok"))
            self.assertTrue(res_get(res, "rolled_back"), msg=f"Expected rolled_back=True, got: {res}")
            self.assertTrue(res_get(res, "fallback_needed"), msg=f"Expected fallback_needed=True, got: {res}")
            self.assertEqual(
                snapshot_dir_hashes(install_dir),
                v1_snapshot,
                "Install directory MUST be 100% byte-for-byte identical to v1 after rollback",
            )

    def test_scenario_4_suite_ci_workflows_and_catalog_verification(self) -> None:
        """Scenario 4: Validate catalog.json + all 15 repos' build*.yml YAML & delta packaging steps."""
        cat = json.loads((HUB_ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(cat["schema_version"], 1)
        self.assertEqual([it["id"] for it in cat["items"]], EXPECTED_CATALOG_PRODUCT_IDS)
        self.assertEqual(set(cat["apps"].keys()), set(EXPECTED_CATALOG_PRODUCT_IDS))
        self.assertIn("hub", cat)
        self.assertEqual(cat["hub"]["id"], "qassimz-hub")

        self.assertEqual(len(ALL_15_WORKFLOW_PATHS), 15)
        for wf in ALL_15_WORKFLOW_PATHS:
            self.assertTrue(wf.exists(), msg=f"Missing workflow: {wf}")
            parsed = parse_yaml_via_yq(wf)
            self.assertIsInstance(parsed, dict)
            self.assertIn("jobs", parsed, msg=f"Workflow missing jobs: {wf}")

            raw_text = wf.read_text(encoding="utf-8")
            self.assertIn(
                "qpkg_packager.py",
                raw_text,
                msg=f"Workflow {wf} missing qpkg_packager.py delta packaging step",
            )
            self.assertIn(
                "manifest.json",
                raw_text,
                msg=f"Workflow {wf} missing manifest.json release asset",
            )
            self.assertIn(
                ".qpkg",
                raw_text,
                msg=f"Workflow {wf} missing .qpkg release asset",
            )

    @unittest.skipUnless(HAS_PLAYWRIGHT, "playwright not installed")
    def test_scenario_5_playwright_install_theater_delta_telemetry_and_rtl(self) -> None:
        """Scenario 5: Headless Chromium verifies Install Theater delta telemetry, completion, and EN/AR RTL."""
        server_mod = load_server()
        tmp_dir = tempfile.TemporaryDirectory()
        pw = None
        browser = None
        try:
            api = server_mod.HubApi(Path(tmp_dir.name))
            url = server_mod.start_server(api)

            pw = sync_playwright().start()
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1360, "height": 860})
            page = context.new_page()

            phase = {"completed": False}

            def _make_task() -> dict:
                if not phase["completed"]:
                    return {
                        "id": "qassimz-music",
                        "code": "Qm",
                        "name": "QASSIMZ Music",
                        "name_ar": "قسمز ميوزك",
                        "accent": "#22C55E",
                        "version": "1.5.0",
                        "status": "downloading",
                        "progress": 64,
                        "downloaded": 2_560_000,
                        "total": 4_000_000,
                        "speed_bps": 2_000_000,
                        "eta_sec": 4,
                        "silent": True,
                        "self_update": False,
                        "message_ar": "جاري تنزيل التحديث التفاضلي...",
                        "error": "",
                        "update_mode": "delta",
                        "stage": "downloading",
                        "delta_saved_bytes": 58_000_000,
                        "delta_saved_pct": 93.5,
                        "delta_full_size": 62_000_000,
                        "delta_chunks_done": 3,
                        "delta_chunks_total": 5,
                        "delta_fallback_reason": "",
                    }
                return {
                    "id": "qassimz-music",
                    "code": "Qm",
                    "name": "QASSIMZ Music",
                    "name_ar": "قسمز ميوزك",
                    "accent": "#22C55E",
                    "version": "1.5.0",
                    "status": "completed",
                    "progress": 100,
                    "downloaded": 4_000_000,
                    "total": 4_000_000,
                    "speed_bps": 2_000_000,
                    "eta_sec": 0,
                    "silent": True,
                    "self_update": False,
                    "message_ar": "تم التحديث بنجاح",
                    "error": "",
                    "update_mode": "delta",
                    "stage": "completed",
                    "delta_saved_bytes": 58_000_000,
                    "delta_saved_pct": 93.5,
                    "delta_full_size": 62_000_000,
                    "delta_chunks_done": 5,
                    "delta_chunks_total": 5,
                    "delta_fallback_reason": "",
                }

            def _handle_route(route) -> None:
                req_url = route.request.url
                if req_url.endswith("/api/state"):
                    real_state = api.state()
                    real_state["tasks"] = [_make_task()]
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps({"ok": True, "data": real_state}),
                    )
                    return
                if req_url.endswith("/api/tasks"):
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps({"ok": True, "data": [_make_task()]}),
                    )
                    return
                route.continue_()

            page.route("**/api/*", _handle_route)
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_selector("#brand-intro", state="hidden", timeout=5000)
            page.wait_for_selector("#install-theater:not([hidden])", timeout=5000)

            # Verify percentage and delta telemetry visibility in EN mode
            pct_text = page.locator("#th-pct").inner_text()
            self.assertIn("64%", pct_text)
            theater_text = page.locator("#install-theater").inner_text().lower()
            self.assertTrue(
                ("delta" in theater_text) or ("93" in theater_text) or ("94" in theater_text),
                msg=f"Expected delta badge or saved % in Install Theater, got:\n{theater_text}",
            )

            # Verify zero horizontal overflow in EN mode
            overflow_en = page.evaluate(
                "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"
            )
            self.assertTrue(overflow_en, "Horizontal overflow detected in EN mode")

            # Switch to Arabic RTL while Install Theater is open and verify dir/lang + zero overflow
            page.evaluate("() => document.getElementById('btn-lang').click()")
            page.wait_for_function("() => document.documentElement.dir === 'rtl'", timeout=3000)
            lang_ar = page.evaluate("() => document.documentElement.lang")
            self.assertEqual(lang_ar, "ar")
            overflow_ar = page.evaluate(
                "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"
            )
            self.assertTrue(overflow_ar, "Horizontal overflow detected in AR RTL mode")

            # Transition to completed and verify completion box appears
            phase["completed"] = True
            page.wait_for_selector("#th-complete-box:not([hidden])", timeout=5000)
            complete_text = page.locator("#th-complete-box").inner_text()
            self.assertTrue(len(complete_text.strip()) > 0)
        finally:
            if browser is not None:
                browser.close()
            if pw is not None:
                pw.stop()
            tmp_dir.cleanup()


if __name__ == "__main__":
    unittest.main()
