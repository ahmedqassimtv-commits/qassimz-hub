"""Tier 3 E2E Tests: Cross-Feature Pairwise Interactions."""

from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path

from e2e_tests.harness import (
    DeltaTestServer,
    load_delta_updater,
    load_detector,
    load_installer_runner,
    make_deterministic_bytes,
    pack_directory,
    res_get,
    snapshot_dir_hashes,
)


class TestTier3Interactions(unittest.TestCase):
    def test_i1_redirect_coalescing_chunk_reuse(self) -> None:
        """302 redirect + Range coalescing + 64KB chunk reuse on a multi-MB file with 2 disjoint changed chunks."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            # 2.5 MB file (40 chunks of 64KB)
            raw_v1 = bytearray(make_deterministic_bytes(2_621_440, seed=1001))
            raw_v2 = bytearray(raw_v1)
            # Patch chunk 0 (offset 100) and chunk 30 (offset 30 * 65536 + 200) — far apart (>16KB gap)
            raw_v2[100:228] = b"\xAA" * 128
            raw_v2[30 * 65536 + 200 : 30 * 65536 + 328] = b"\xBB" * 128

            (install_dir / "bundle.asar").write_bytes(bytes(raw_v1))
            (v2_dir / "bundle.asar").write_bytes(bytes(raw_v2))

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "chunk-redir", "2.0.0")
            qpkg_size = manifest["qpkg_size"]

            with DeltaTestServer() as srv:
                srv.serve_file("/cdn/manifest.json", manifest_path, "application/json")
                srv.serve_file("/cdn/chunk-redir-v2.0.0.qpkg", qpkg_path)
                m_url = srv.add_redirect("/releases/v2/manifest.json", "/cdn/manifest.json", status=302)
                q_url = srv.add_redirect("/releases/v2/chunk-redir-v2.0.0.qpkg", "/cdn/chunk-redir-v2.0.0.qpkg", status=302)

                item = {
                    "id": "chunk-redir",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": qpkg_size,
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed: {res}")
                self.assertEqual(res_get(res, "chunks_downloaded"), 2)
                self.assertEqual(res_get(res, "chunks_reused"), 38)
                self.assertGreater(res_get(res, "saved_pct", 0.0), 90.0)
                self.assertLess(
                    srv.total_bytes_served,
                    int(qpkg_size * 0.10),
                    msg=f"Expected <10% of qpkg transferred, served {srv.total_bytes_served} / {qpkg_size}",
                )
                self.assertTrue(any(r["status"] == 302 for r in srv.request_log))
                self.assertTrue(any(r["status"] == 206 for r in srv.request_log))
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

    def test_i2_chunk_n_corruption_rollback_and_fallback(self) -> None:
        """Corruption on chunk #2 triggers rollback + fallback_needed=True + TaskQueue Setup.exe fallback."""
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

            # 2MB file with 2 disjoint changed chunks (far apart so 2 separate Range requests)
            raw_v1 = bytearray(make_deterministic_bytes(2_097_152, seed=1002))
            raw_v2 = bytearray(raw_v1)
            raw_v2[64:128] = b"\xCC" * 64
            raw_v2[25 * 65536 + 64 : 25 * 65536 + 128] = b"\xDD" * 64

            (install_dir / "engine.dll").write_bytes(bytes(raw_v1))
            (v2_dir / "engine.dll").write_bytes(bytes(raw_v2))
            v1_snap = snapshot_dir_hashes(install_dir)

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "corrupt-n", "2.0.0")
            setup_payload = make_deterministic_bytes(16384, seed=1099)

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/corrupt-n-v2.0.0.qpkg", qpkg_path)
                setup_url = srv.serve_bytes("/Setup.exe", setup_payload)
                # Corrupt 2nd Range request to .qpkg
                srv.corrupt_byte("/corrupt-n-v2.0.0.qpkg", byte_index=10, on_request_number=2)

                item = {
                    "id": "corrupt-n",
                    "code": "Cn",
                    "name": "CorruptN",
                    "name_ar": "اختبار",
                    "accent": "#EF4444",
                    "version": "2.0.0",
                    "setup_filename": "Setup.exe",
                    "setup_url": setup_url,
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }

                # Direct DeltaUpdater call must fail safely and preserve v1
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertFalse(res_get(res, "ok"))
                self.assertTrue(res_get(res, "fallback_needed"))
                self.assertEqual(snapshot_dir_hashes(install_dir), v1_snap)

                # Now reset corruption to trigger on request #2 again and run via TaskQueue
                srv.clear_faults()
                srv.corrupt_byte("/corrupt-n-v2.0.0.qpkg", byte_index=10, on_request_number=2)
                item_with_state = dict(item)
                item_with_state["state"] = {
                    "installed": True,
                    "installed_version": "1.0.0",
                    "has_update": True,
                    "install_dir": str(install_dir),
                }
                tq = ir.TaskQueue(cache_dir / "tq")
                tq.enqueue_install(item_with_state, silent=True)

                deadline = time.time() + 10.0
                final_task = None
                while time.time() < deadline:
                    snaps = tq.snapshot()
                    if snaps and snaps[0]["status"] in ("completed", "error", "cancelled"):
                        final_task = snaps[0]
                        break
                    time.sleep(0.05)

                self.assertIsNotNone(final_task)
                self.assertEqual(final_task["status"], "completed", msg=f"Fallback task failed: {final_task}")
                self.assertEqual(final_task["update_mode"], "fallback")
                self.assertTrue(bool(final_task["delta_fallback_reason"]))
                self.assertTrue(
                    any(r["path"] == "/Setup.exe" and r["status"] == 200 for r in srv.request_log),
                    "Expected TaskQueue to fall back to downloading /Setup.exe",
                )

    def test_i3_cancel_mid_download_then_clean_retry(self) -> None:
        """Cancel mid-download leaves v1 clean; subsequent retry succeeds to 100% v2 parity."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            (install_dir / "core.bin").write_bytes(make_deterministic_bytes(131072, seed=1101))
            (v2_dir / "core.bin").write_bytes(make_deterministic_bytes(131072, seed=1102))
            v1_snap = snapshot_dir_hashes(install_dir)

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "retry-app", "2.0.0")

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/retry-app-v2.0.0.qpkg", qpkg_path)
                srv.throttle_delay("/retry-app-v2.0.0.qpkg", 0.015)

                item = {
                    "id": "retry-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }

                seen_dl = False

                def _on_prog(ev: dict) -> None:
                    nonlocal seen_dl
                    if ev.get("stage") == "downloading" or ev.get("downloaded", 0) > 0:
                        seen_dl = True

                res1 = du.DeltaUpdater().apply_delta_update(
                    item, install_dir, cache_dir, cancel_check=lambda: seen_dl, on_progress=_on_prog
                )
                self.assertFalse(res_get(res1, "ok"))
                self.assertTrue(res_get(res1, "cancelled"))
                self.assertEqual(snapshot_dir_hashes(install_dir), v1_snap)

                # Clear throttle and retry cleanly
                srv.clear_faults()
                res2 = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res2, "ok"), msg=f"Clean retry failed: {res2}")
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

    def test_i4_prune_preserves_version_stamp_and_detector(self) -> None:
        """Obsolete file pruning preserves .qassimz-version.json and detector sees updated version."""
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

            # Pre-existing v1 stamp + obsolete file + exe
            (install_dir / "App.exe").write_bytes(make_deterministic_bytes(8192, seed=1201))
            (install_dir / "legacy_plugin.dll").write_bytes(b"old plugin")
            (install_dir / ".qassimz-version.json").write_text(
                json.dumps({"app_id": "prune-stamp", "version": "1.0.0", "updated_at": "2026-01-01T00:00:00Z", "method": "delta"}),
                encoding="utf-8",
            )

            (v2_dir / "App.exe").write_bytes(make_deterministic_bytes(8192, seed=1202))

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "prune-stamp", "2.0.0")

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/prune-stamp-v2.0.0.qpkg", qpkg_path)
                item = {
                    "id": "prune-stamp",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                    "detection": {"exe_paths": [str(install_dir / "App.exe")]},
                }

                # Before update: detector sees 1.0.0 and has_update=True
                st_before = detector.detect_item_state(item, reg_map={})
                self.assertTrue(st_before["installed"])
                self.assertEqual(st_before["installed_version"], "1.0.0")
                self.assertTrue(st_before["has_update"])

                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed: {res}")
                self.assertFalse((install_dir / "legacy_plugin.dll").exists())
                self.assertTrue((install_dir / ".qassimz-version.json").exists())

                st_after = detector.detect_item_state(item, reg_map={})
                self.assertTrue(st_after["installed"])
                self.assertEqual(st_after["installed_version"], "2.0.0")
                self.assertFalse(st_after["has_update"])

    def test_i5_non_range_200_server_and_sha256(self) -> None:
        """Server ignoring Range (returning 200 OK full body) still verifies SHA-256 and applies cleanly."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            shared = make_deterministic_bytes(16384, seed=1301)
            (install_dir / "shared.bin").write_bytes(shared)
            (install_dir / "changed.txt").write_text("v1", encoding="utf-8")
            (v2_dir / "shared.bin").write_bytes(shared)
            (v2_dir / "changed.txt").write_text("v2-from-200-server", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "nonrange-app", "2.0.0")

            with DeltaTestServer(allow_range=False) as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/nonrange-app-v2.0.0.qpkg", qpkg_path)
                item = {
                    "id": "nonrange-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed on non-Range 200 server: {res}")
                self.assertEqual(srv.range_requests_count, 0)
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )


if __name__ == "__main__":
    unittest.main()
