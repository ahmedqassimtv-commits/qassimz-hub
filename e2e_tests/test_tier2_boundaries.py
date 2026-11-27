"""Tier 2 E2E Tests: Boundary, Error, Security & Corner Cases."""

from __future__ import annotations

import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from e2e_tests.harness import (
    DeltaTestServer,
    load_delta_updater,
    make_deterministic_bytes,
    pack_directory,
    res_get,
    run_packager_cli,
    sha256_bytes,
    snapshot_dir_hashes,
)


class TestTier2Boundaries(unittest.TestCase):
    def test_b1_zero_byte_files(self) -> None:
        """0-byte files pack, verify, and delta-apply cleanly."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            (install_dir / "existing.txt").write_text("v1", encoding="utf-8")
            (v2_dir / "existing.txt").write_text("v2", encoding="utf-8")
            (v2_dir / "empty.dat").write_bytes(b"")
            (v2_dir / "nested").mkdir()
            (v2_dir / "nested" / "zero.log").write_bytes(b"")

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "zero-app", "1.0.1")
            v_proc = run_packager_cli(
                ["verify", "--manifest", str(manifest_path), "--qpkg", str(qpkg_path)]
            )
            self.assertEqual(v_proc.returncode, 0, msg=v_proc.stderr)

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/zero-app-v1.0.1.qpkg", qpkg_path)
                item = {
                    "id": "zero-app",
                    "version": "1.0.1",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed on 0-byte files: {res}")
                self.assertTrue((install_dir / "empty.dat").exists())
                self.assertEqual((install_dir / "empty.dat").stat().st_size, 0)
                self.assertEqual((install_dir / "nested" / "zero.log").stat().st_size, 0)
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

    def test_b2_exact_1mb_vs_1mb_plus_1(self) -> None:
        """Exact 1MB (1048576 B) is NOT chunked; 1MB+1 (1048577 B) IS chunked into 64KB chunks."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "src"
            out = root / "out"
            src.mkdir()

            (src / "exact_1mb.bin").write_bytes(make_deterministic_bytes(1048576, seed=11))
            (src / "one_over_1mb.bin").write_bytes(make_deterministic_bytes(1048577, seed=12))

            _, _, manifest = pack_directory(src, out, "bound-1mb", "1.0.0")
            by_path = {f["path"]: f for f in manifest["files"]}

            self.assertNotIn("chunks", by_path["exact_1mb.bin"])
            self.assertIn("offset", by_path["exact_1mb.bin"])
            self.assertIn("comp_size", by_path["exact_1mb.bin"])

            self.assertIn("chunks", by_path["one_over_1mb.bin"])
            chunks = by_path["one_over_1mb.bin"]["chunks"]
            self.assertEqual(len(chunks), 17)  # 16 * 65536 + 1
            self.assertEqual(chunks[-1]["raw_size"], 1)

    def test_b3_exact_64kb_vs_64kb_plus_1(self) -> None:
        """Exact 64KB (65536 B) vs 64KB+1 (65537 B) chunk boundary with custom threshold."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "src"
            out = root / "out"
            src.mkdir()

            (src / "exact_64k.bin").write_bytes(make_deterministic_bytes(65536, seed=21))
            (src / "over_64k.bin").write_bytes(make_deterministic_bytes(65537, seed=22))

            _, _, manifest = pack_directory(
                src,
                out,
                "bound-64k",
                "1.0.0",
                extra_args=["--chunk-size", "65536", "--chunk-threshold", "32768"],
            )
            by_path = {f["path"]: f for f in manifest["files"]}
            self.assertEqual(len(by_path["exact_64k.bin"]["chunks"]), 1)
            self.assertEqual(by_path["exact_64k.bin"]["chunks"][0]["raw_size"], 65536)
            self.assertEqual(len(by_path["over_64k.bin"]["chunks"]), 2)
            self.assertEqual(by_path["over_64k.bin"]["chunks"][0]["raw_size"], 65536)
            self.assertEqual(by_path["over_64k.bin"]["chunks"][1]["raw_size"], 1)

    def test_b4_identical_v1_v2_zero_bytes(self) -> None:
        """Identical v1 -> v2 update downloads 0 bytes from .qpkg."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            for i in range(4):
                d = make_deterministic_bytes(16384, seed=30 + i)
                (install_dir / f"f{i}.bin").write_bytes(d)
                (v2_dir / f"f{i}.bin").write_bytes(d)

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "same-app", "2.0.0")

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/same-app-v2.0.0.qpkg", qpkg_path)
                item = {
                    "id": "same-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed: {res}")
                self.assertEqual(res_get(res, "downloaded_bytes", -1), 0)
                self.assertEqual(srv.range_requests_count, 0)
                qpkg_reqs = [r for r in srv.request_log if "qpkg" in r["path"]]
                self.assertEqual(len(qpkg_reqs), 0, f"Unexpected .qpkg requests: {qpkg_reqs}")

    def test_b5_100pct_changed_files(self) -> None:
        """100% changed files all download, verify, and swap cleanly."""
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
                (install_dir / f"f{i}.bin").write_bytes(make_deterministic_bytes(8192, seed=40 + i))
                (v2_dir / f"f{i}.bin").write_bytes(make_deterministic_bytes(8192, seed=50 + i))

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "all-new", "2.0.0")

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/all-new-v2.0.0.qpkg", qpkg_path)
                item = {
                    "id": "all-new",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Delta failed: {res}")
                self.assertEqual(res_get(res, "files_reused", -1), 0)
                self.assertEqual(res_get(res, "files_updated", 0), 5)
                self.assertEqual(
                    snapshot_dir_hashes(install_dir, ignore_names={".qassimz-version.json"}),
                    snapshot_dir_hashes(v2_dir),
                )

    def test_b6_missing_manifest_404_and_corrupted_qpkg_verify(self) -> None:
        """404 manifest returns fallback_needed=True (no_manifest); corrupted .qpkg fails CLI verify."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            src_dir = root / "src"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            src_dir.mkdir()
            (install_dir / "a.txt").write_text("v1", encoding="utf-8")
            (src_dir / "a.txt").write_text("v2", encoding="utf-8")

            # Part A: Corrupted .qpkg fails CLI verify
            manifest_path, qpkg_path, _ = pack_directory(src_dir, dist_dir, "corrupt-cli", "1.0.0")
            raw = bytearray(qpkg_path.read_bytes())
            raw[-1] ^= 0xFF
            qpkg_path.write_bytes(bytes(raw))
            v_proc = run_packager_cli(
                ["verify", "--manifest", str(manifest_path), "--qpkg", str(qpkg_path)]
            )
            self.assertNotEqual(v_proc.returncode, 0, "Corrupted .qpkg MUST fail verify")

            # Part B: 404 manifest triggers clean fallback
            with DeltaTestServer() as srv:
                item = {
                    "id": "missing-manifest-app",
                    "version": "2.0.0",
                    "delta_manifest_url": srv.url_for("/releases/v2/manifest.json"),
                    "delta_qpkg_url": srv.url_for("/releases/v2/missing.qpkg"),
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertFalse(res_get(res, "ok"))
                self.assertTrue(res_get(res, "fallback_needed"))
                self.assertEqual(res_get(res, "fallback_reason"), "no_manifest")

    def test_b7_corrupted_chunk_rollback_and_path_traversal_rejected(self) -> None:
        """Corrupted downloaded chunk triggers fallback & preserves v1; path traversal is rejected."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            (install_dir / "app.bin").write_bytes(make_deterministic_bytes(16384, seed=71))
            (v2_dir / "app.bin").write_bytes(make_deterministic_bytes(16384, seed=72))
            v1_snap = snapshot_dir_hashes(install_dir)

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "sec-app", "2.0.0")

            # Part A: Corrupted byte on .qpkg download
            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/sec-app-v2.0.0.qpkg", qpkg_path)
                srv.corrupt_byte("/sec-app-v2.0.0.qpkg", byte_index=0, on_request_number=1)

                item = {
                    "id": "sec-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertFalse(res_get(res, "ok"))
                self.assertTrue(res_get(res, "fallback_needed"))
                self.assertEqual(snapshot_dir_hashes(install_dir), v1_snap)

            # Part B: Malicious path traversal in manifest.json
            evil_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            for bad_path in ("../escape.txt", "/etc/passwd", "a/../../outside.txt"):
                bad_m = dict(evil_manifest)
                bad_m["files"] = [dict(evil_manifest["files"][0], path=bad_path)]
                bad_bytes = json.dumps(bad_m).encode("utf-8")

                with DeltaTestServer() as srv:
                    m_url = srv.serve_bytes("/evil/manifest.json", bad_bytes, "application/json")
                    q_url = srv.serve_file("/evil/sec-app-v2.0.0.qpkg", qpkg_path)
                    item = {
                        "id": "sec-app",
                        "version": "2.0.0",
                        "delta_manifest_url": m_url,
                        "delta_qpkg_url": q_url,
                        "delta_qpkg_size": manifest["qpkg_size"],
                    }
                    res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                    self.assertFalse(res_get(res, "ok"), msg=f"Path traversal {bad_path!r} MUST be rejected")
                    self.assertFalse((root / "escape.txt").exists())
                    self.assertFalse((root / "outside.txt").exists())
                    self.assertEqual(snapshot_dir_hashes(install_dir), v1_snap)

    def test_b8_unwritable_install_dir_fallback(self) -> None:
        """Unwritable install_dir returns fallback_needed=True (unwritable_dir)."""
        du = load_delta_updater()
        updater = du.DeltaUpdater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "readonly_app"
            cache_dir = root / "cache"
            install_dir.mkdir()
            (install_dir / "app.exe").write_bytes(b"v1")

            item = {
                "id": "ro-app",
                "version": "2.0.0",
                "delta_manifest_url": "http://127.0.0.1:1/manifest.json",
                "delta_qpkg_url": "http://127.0.0.1:1/ro-app-v2.0.0.qpkg",
            }

            if hasattr(os, "geteuid") and os.geteuid() != 0:
                os.chmod(install_dir, stat.S_IRUSR | stat.S_IXUSR)
                try:
                    self.assertFalse(updater.check_writable(install_dir))
                    res = updater.apply_delta_update(item, install_dir, cache_dir)
                    self.assertFalse(res_get(res, "ok"))
                    self.assertTrue(res_get(res, "fallback_needed"))
                    self.assertEqual(res_get(res, "fallback_reason"), "unwritable_dir")
                finally:
                    os.chmod(install_dir, 0o755)
            else:
                # If running as root where chmod 0o555 is bypassed by kernel, simulate unwritable check
                with mock.patch.object(updater, "check_writable", return_value=False):
                    res = updater.apply_delta_update(item, install_dir, cache_dir)
                    self.assertFalse(res_get(res, "ok"))
                    self.assertTrue(res_get(res, "fallback_needed"))
                    self.assertEqual(res_get(res, "fallback_reason"), "unwritable_dir")

    def test_b9_cancel_mid_download(self) -> None:
        """Cancellation mid-download returns cancelled=True and leaves v1 files untouched."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            (install_dir / "big.bin").write_bytes(make_deterministic_bytes(131072, seed=81))
            (v2_dir / "big.bin").write_bytes(make_deterministic_bytes(131072, seed=82))
            v1_snap = snapshot_dir_hashes(install_dir)

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "cancel-app", "2.0.0")
            progress_hits = 0

            def _on_progress(ev: dict) -> None:
                nonlocal progress_hits
                if ev.get("stage") == "downloading" or ev.get("downloaded", 0) > 0:
                    progress_hits += 1

            def _cancel_check() -> bool:
                return progress_hits >= 1

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/cancel-app-v2.0.0.qpkg", qpkg_path)
                srv.throttle_delay("/cancel-app-v2.0.0.qpkg", 0.015)

                item = {
                    "id": "cancel-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(
                    item,
                    install_dir,
                    cache_dir,
                    cancel_check=_cancel_check,
                    on_progress=_on_progress,
                )
                self.assertFalse(res_get(res, "ok"))
                self.assertTrue(res_get(res, "cancelled"), msg=f"Expected cancelled=True, got: {res}")
                self.assertEqual(snapshot_dir_hashes(install_dir), v1_snap)

    def test_b10_range_416_and_500_fallback(self) -> None:
        """HTTP 500 during Range download triggers clean fallback and preserves v1."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            (install_dir / "a.bin").write_bytes(make_deterministic_bytes(8192, seed=91))
            (v2_dir / "a.bin").write_bytes(make_deterministic_bytes(8192, seed=92))
            v1_snap = snapshot_dir_hashes(install_dir)

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "err500-app", "2.0.0")

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/err500-app-v2.0.0.qpkg", qpkg_path)
                srv.force_status("/err500-app-v2.0.0.qpkg", 500, after_n=0)

                item = {
                    "id": "err500-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertFalse(res_get(res, "ok"))
                self.assertTrue(res_get(res, "fallback_needed"))
                self.assertEqual(snapshot_dir_hashes(install_dir), v1_snap)

    def test_b11_locked_file_during_prune(self) -> None:
        """Locked/unremovable obsolete file during pruning does NOT fail the update."""
        du = load_delta_updater()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            install_dir = root / "installed"
            v2_dir = root / "v2"
            dist_dir = root / "dist"
            cache_dir = root / "cache"
            install_dir.mkdir()
            v2_dir.mkdir()

            (install_dir / "app.txt").write_text("v1", encoding="utf-8")
            (install_dir / "locked_old.dll").write_bytes(b"in-use-on-windows")
            (v2_dir / "app.txt").write_text("v2-fresh", encoding="utf-8")

            manifest_path, qpkg_path, manifest = pack_directory(v2_dir, dist_dir, "lock-app", "2.0.0")
            orig_unlink = Path.unlink

            def _guarded_unlink(self_path: Path, *args, **kwargs):
                if self_path.name == "locked_old.dll":
                    raise PermissionError("Simulated Windows file lock")
                return orig_unlink(self_path, *args, **kwargs)

            with DeltaTestServer() as srv:
                m_url = srv.serve_file("/manifest.json", manifest_path, "application/json")
                q_url = srv.serve_file("/lock-app-v2.0.0.qpkg", qpkg_path)
                item = {
                    "id": "lock-app",
                    "version": "2.0.0",
                    "delta_manifest_url": m_url,
                    "delta_qpkg_url": q_url,
                    "delta_qpkg_size": manifest["qpkg_size"],
                }
                with mock.patch.object(Path, "unlink", _guarded_unlink):
                    res = du.DeltaUpdater().apply_delta_update(item, install_dir, cache_dir)
                self.assertTrue(res_get(res, "ok"), msg=f"Locked obsolete file should not fail update: {res}")
                self.assertEqual((install_dir / "app.txt").read_text(encoding="utf-8"), "v2-fresh")


if __name__ == "__main__":
    unittest.main()
