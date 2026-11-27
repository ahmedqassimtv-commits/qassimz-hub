"""Unit and CLI integration tests for tools/qpkg_packager.py."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import qpkg_packager  # noqa: E402

PACKAGER_SCRIPT = ROOT / "tools" / "qpkg_packager.py"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class TestQpkgPackager(unittest.TestCase):
    def test_small_files_pack_and_range_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()

            files = {
                "app/ui/app.js": b"console.log('hello qassimz');\n" * 40,
                "app/ui/style.css": b"body { color: #fff; background: #111; }\n",
                "README.md": b"# QASSIMZ\nDelta update test.\n",
            }
            for rel, content in files.items():
                p = src / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(content)

            manifest = qpkg_packager.pack_directory(src, out, "qassimz-music", "1.5.0")

            self.assertEqual(manifest["format_version"], 1)
            self.assertEqual(manifest["app_id"], "qassimz-music")
            self.assertEqual(manifest["version"], "1.5.0")
            self.assertEqual(manifest["compression"], "zlib")
            self.assertEqual(manifest["chunk_size"], 65536)
            self.assertEqual(manifest["chunk_threshold"], 1048576)
            self.assertEqual(manifest["qpkg_filename"], "qassimz-music-v1.5.0.qpkg")
            self.assertEqual(manifest["file_count"], len(files))
            self.assertEqual(manifest["total_raw_size"], sum(len(v) for v in files.values()))

            qpkg_path = out / manifest["qpkg_filename"]
            manifest_path = out / "manifest.json"
            self.assertTrue(qpkg_path.is_file())
            self.assertTrue(manifest_path.is_file())

            qpkg_bytes = qpkg_path.read_bytes()
            self.assertTrue(qpkg_bytes.startswith(qpkg_packager.QPKG_MAGIC))
            self.assertEqual(len(qpkg_bytes), manifest["qpkg_size"])
            self.assertEqual(_sha256(qpkg_bytes), manifest["qpkg_sha256"])

            # Verify canonical sorted order and exact HTTP Range-style byte slicing.
            paths = [entry["path"] for entry in manifest["files"]]
            self.assertEqual(paths, sorted(files.keys()))

            for entry in manifest["files"]:
                self.assertNotIn("chunks", entry)
                offset = entry["offset"]
                comp_size = entry["comp_size"]
                self.assertGreaterEqual(offset, len(qpkg_packager.QPKG_MAGIC))
                self.assertGreater(comp_size, 0)
                sliced = qpkg_bytes[offset : offset + comp_size]
                raw = zlib.decompress(sliced)
                self.assertEqual(raw, files[entry["path"]])
                self.assertEqual(len(raw), entry["raw_size"])
                self.assertEqual(_sha256(raw), entry["sha256"])

            res = qpkg_packager.verify_package(manifest_path, qpkg_path)
            self.assertTrue(res["ok"])
            self.assertEqual(res["file_count"], 3)
            self.assertEqual(res["chunk_count"], 0)

    def test_large_file_default_1mb_chunking_and_range_extraction(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()

            # 1 MiB + 100 KiB -> 18 chunks of 64 KiB (17 * 65536 + 36864 = 1150976)
            large_data = bytes((i * 31 + (i >> 8)) & 0xFF for i in range(1048576 + 102400))
            target = src / "resources" / "app.asar"
            target.parent.mkdir(parents=True)
            target.write_bytes(large_data)

            manifest = qpkg_packager.pack_directory(src, out, "qassimz-studio", "2.0.0")
            qpkg_bytes = (out / manifest["qpkg_filename"]).read_bytes()

            self.assertEqual(len(manifest["files"]), 1)
            entry = manifest["files"][0]
            self.assertEqual(entry["path"], "resources/app.asar")
            self.assertEqual(entry["raw_size"], len(large_data))
            self.assertEqual(entry["sha256"], _sha256(large_data))
            self.assertIn("chunks", entry)
            self.assertNotIn("offset", entry)
            self.assertEqual(len(entry["chunks"]), 18)

            reconstructed = bytearray()
            for idx, chunk in enumerate(entry["chunks"]):
                offset = chunk["offset"]
                comp_size = chunk["comp_size"]
                sliced = qpkg_bytes[offset : offset + comp_size]
                raw_chunk = zlib.decompress(sliced)
                self.assertEqual(len(raw_chunk), chunk["raw_size"])
                self.assertEqual(_sha256(raw_chunk), chunk["sha256"])
                if idx < 17:
                    self.assertEqual(len(raw_chunk), 65536)
                else:
                    self.assertEqual(len(raw_chunk), 36864)
                reconstructed.extend(raw_chunk)

            self.assertEqual(bytes(reconstructed), large_data)
            self.assertEqual(_sha256(bytes(reconstructed)), entry["sha256"])

            res = qpkg_packager.verify_package(out / "manifest.json", out / manifest["qpkg_filename"])
            self.assertTrue(res["ok"])
            self.assertEqual(res["chunk_count"], 18)

    def test_chunk_threshold_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()

            threshold = 1024
            chunk_size = 300
            exact_data = b"A" * threshold
            over_data = b"B" * (threshold + 1)
            (src / "exact.bin").write_bytes(exact_data)
            (src / "over.bin").write_bytes(over_data)

            manifest = qpkg_packager.pack_directory(
                src,
                out,
                "boundary-app",
                "1.0.0",
                chunk_size=chunk_size,
                chunk_threshold=threshold,
            )
            by_path = {f["path"]: f for f in manifest["files"]}

            # raw_size == chunk_threshold is NOT chunked
            self.assertNotIn("chunks", by_path["exact.bin"])
            self.assertIn("offset", by_path["exact.bin"])
            self.assertEqual(by_path["exact.bin"]["raw_size"], threshold)

            # raw_size == chunk_threshold + 1 IS chunked (1025 / 300 -> 4 chunks: 300,300,300,125)
            self.assertIn("chunks", by_path["over.bin"])
            self.assertEqual([c["raw_size"] for c in by_path["over.bin"]["chunks"]], [300, 300, 300, 125])

            res = qpkg_packager.verify_package(out / "manifest.json", out / manifest["qpkg_filename"])
            self.assertTrue(res["ok"])
            self.assertEqual(res["chunk_count"], 4)

    def test_empty_zero_byte_file_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()

            (src / "empty.txt").write_bytes(b"")
            manifest = qpkg_packager.pack_directory(src, out, "empty-app", "0.1.0")

            entry = manifest["files"][0]
            self.assertEqual(entry["path"], "empty.txt")
            self.assertEqual(entry["raw_size"], 0)
            self.assertEqual(entry["sha256"], _sha256(b""))
            self.assertGreater(entry["comp_size"], 0)

            qpkg_bytes = (out / manifest["qpkg_filename"]).read_bytes()
            blob = qpkg_bytes[entry["offset"] : entry["offset"] + entry["comp_size"]]
            self.assertEqual(zlib.decompress(blob), b"")

            res = qpkg_packager.verify_package(out / "manifest.json", out / manifest["qpkg_filename"])
            self.assertTrue(res["ok"])

    def test_nested_directories_and_unicode_arabic_filenames(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()

            unicode_files = {
                "دليل/ملف_عربي.txt": "مرحبا بقاسم".encode("utf-8"),
                "assets/icons/أيقونة.svg": b"<svg></svg>",
                "a/b/c/deep.json": b'{"ok": true}\n',
            }
            for rel, content in unicode_files.items():
                p = src / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(content)

            manifest = qpkg_packager.pack_directory(src, out, "qassimz-captions", "1.2.3")
            paths = [f["path"] for f in manifest["files"]]
            self.assertEqual(paths, sorted(unicode_files.keys()))
            for p in paths:
                self.assertNotIn("\\", p)

            # Ensure manifest.json preserves UTF-8 characters (ensure_ascii=False)
            raw_manifest_text = (out / "manifest.json").read_text(encoding="utf-8")
            self.assertIn("دليل/ملف_عربي.txt", raw_manifest_text)

            res = qpkg_packager.verify_package(out / "manifest.json", out / manifest["qpkg_filename"])
            self.assertTrue(res["ok"])

    def test_default_custom_and_no_default_excludes(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            src.mkdir()

            def _touch(rel: str, data: bytes = b"x") -> None:
                p = src / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(data)

            _touch("app/main.py")
            _touch("app/__pycache__/main.cpython-312.pyc")
            _touch("app/helper.pyc")
            _touch("app/helper.pyo")
            _touch(".debug")
            _touch(".git/HEAD")
            _touch(".DS_Store")
            _touch("Thumbs.db")
            _touch("desktop.ini")
            _touch(".qassimz-version.json")
            _touch("mock/sample.json")
            _touch("logs/trace.log")

            # Default excludes + custom globs
            out1 = tmp_path / "out1"
            m1 = qpkg_packager.pack_directory(
                src, out1, "exc-app", "1.0.0", excludes=["mock/*", "*.log"]
            )
            self.assertEqual([f["path"] for f in m1["files"]], ["app/main.py"])

            # --no-default-excludes keeps default-excluded files
            out2 = tmp_path / "out2"
            m2 = qpkg_packager.pack_directory(
                src, out2, "exc-app", "1.0.0", use_default_excludes=False, excludes=["mock/*"]
            )
            paths2 = {f["path"] for f in m2["files"]}
            self.assertIn(".debug", paths2)
            self.assertIn(".qassimz-version.json", paths2)
            self.assertIn("app/helper.pyc", paths2)
            self.assertNotIn("mock/sample.json", paths2)

    def test_extra_file_parsing_override_directory_and_security(self):
        # Unit test Windows drive-letter parsing
        win_src, win_dest = qpkg_packager.parse_extra_file_spec(r"C:\repo\README.md:README.md")
        self.assertEqual(str(win_src), r"C:\repo\README.md")
        self.assertEqual(win_dest, "README.md")

        win_src2, win_dest2 = qpkg_packager.parse_extra_file_spec(r"D:\build\lib.dll:bin/lib.dll")
        self.assertEqual(str(win_src2), r"D:\build\lib.dll")
        self.assertEqual(win_dest2, "bin/lib.dll")

        # Bare Windows drive path without :rel_dest must be rejected
        with self.assertRaises(qpkg_packager.QpkgError):
            qpkg_packager.parse_extra_file_spec(r"C:\foo\bar")
        with self.assertRaises(qpkg_packager.QpkgError):
            qpkg_packager.parse_extra_file_spec("no_colon_here")

        # Path traversal in rel_dest must be rejected
        for bad_spec in (
            "file.txt:../escape.txt",
            "file.txt:/abs/path.txt",
            "file.txt:C:evil.txt",
            "file.txt:a/../../b.txt",
            "file.txt:",
        ):
            with self.assertRaises(qpkg_packager.QpkgError, msg=bad_spec):
                qpkg_packager.parse_extra_file_spec(bad_spec)

        # Functional test: regular extra file, override collision, directory extra file, missing src
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            extra_dir = tmp_path / "extra_dir"
            out = tmp_path / "out"
            src.mkdir()
            extra_dir.mkdir()

            (src / "config.json").write_bytes(b'{"v": 1}')
            override_file = tmp_path / "override.json"
            override_file.write_bytes(b'{"v": 2}')

            nested_file = tmp_path / "license.txt"
            nested_file.write_bytes(b"MIT License")

            (extra_dir / "keep.txt").write_bytes(b"extra-keep")
            (extra_dir / "skip.pyc").write_bytes(b"compiled")

            manifest = qpkg_packager.pack_directory(
                src,
                out,
                "extra-app",
                "1.0.0",
                extra_files=[
                    f"{override_file}:config.json",
                    f"{nested_file}:docs/LICENSE.txt",
                    f"{extra_dir}:bundled",
                ],
            )
            by_path = {f["path"]: f for f in manifest["files"]}
            self.assertEqual(
                sorted(by_path.keys()),
                ["bundled/keep.txt", "config.json", "docs/LICENSE.txt"],
            )
            # Verify override replaced src/config.json
            self.assertEqual(by_path["config.json"]["sha256"], _sha256(b'{"v": 2}'))
            self.assertTrue(
                qpkg_packager.verify_package(out / "manifest.json", out / manifest["qpkg_filename"])["ok"]
            )

            # Missing extra-file source fails cleanly
            with self.assertRaises(qpkg_packager.QpkgError):
                qpkg_packager.pack_directory(
                    src,
                    tmp_path / "out_missing",
                    "extra-app",
                    "1.0.0",
                    extra_files=[f"{tmp_path / 'does_not_exist.bin'}:missing.bin"],
                )

    def test_symlink_and_invalid_params_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()
            outside = tmp_path / "secret.txt"
            outside.write_bytes(b"secret")
            (src / "ok.txt").write_bytes(b"ok")

            # Invalid app_id / version / chunk params
            with self.assertRaises(qpkg_packager.QpkgError):
                qpkg_packager.pack_directory(src, out, "../bad", "1.0.0")
            with self.assertRaises(qpkg_packager.QpkgError):
                qpkg_packager.pack_directory(src, out, "good", "1.0/2")
            with self.assertRaises(qpkg_packager.QpkgError):
                qpkg_packager.pack_directory(src, out, "good", "1.0.0", chunk_size=0)
            with self.assertRaises(qpkg_packager.QpkgError):
                qpkg_packager.pack_directory(src, out, "good", "1.0.0", chunk_threshold=-1)

            # Symlink inside input directory rejected
            os.symlink(outside, src / "escape_link.txt")
            with self.assertRaises(qpkg_packager.QpkgError):
                qpkg_packager.pack_directory(src, out, "sym-app", "1.0.0")

    def test_determinism_identical_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            src.mkdir()
            (src / "z.txt").write_bytes(b"zeta" * 100)
            (src / "a.txt").write_bytes(b"alpha" * 100)
            (src / "big.bin").write_bytes(bytes(range(256)) * 20)

            out1 = tmp_path / "out1"
            out2 = tmp_path / "out2"
            m1 = qpkg_packager.pack_directory(src, out1, "det-app", "1.0.0", chunk_size=1024, chunk_threshold=2048)
            m2 = qpkg_packager.pack_directory(src, out2, "det-app", "1.0.0", chunk_size=1024, chunk_threshold=2048)

            self.assertEqual(m1, m2)
            self.assertEqual((out1 / "manifest.json").read_bytes(), (out2 / "manifest.json").read_bytes())
            self.assertEqual(
                (out1 / m1["qpkg_filename"]).read_bytes(),
                (out2 / m2["qpkg_filename"]).read_bytes(),
            )

    def test_verify_detects_all_corruption_and_security_violations(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()
            (src / "small.txt").write_bytes(b"small payload content")
            (src / "chunked.bin").write_bytes(bytes((i * 17) & 0xFF for i in range(4096)))

            manifest = qpkg_packager.pack_directory(
                src, out, "ver-app", "1.0.0", chunk_size=1024, chunk_threshold=2048
            )
            orig_qpkg = (out / manifest["qpkg_filename"]).read_bytes()
            orig_manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))

            def _check_fail(m_dict: dict, q_bytes: bytes, label: str) -> None:
                case_dir = tmp_path / f"case_{label}"
                case_dir.mkdir(exist_ok=True)
                mp = case_dir / "manifest.json"
                qp = case_dir / "test.qpkg"
                mp.write_text(json.dumps(m_dict), encoding="utf-8")
                qp.write_bytes(q_bytes)
                with self.assertRaises(qpkg_packager.QpkgError, msg=label):
                    qpkg_packager.verify_package(mp, qp)

            # 1. Corrupted payload byte
            bad_q = bytearray(orig_qpkg)
            bad_q[-1] ^= 0xFF
            _check_fail(orig_manifest, bytes(bad_q), "corrupted_payload")

            # 2. Truncated .qpkg
            _check_fail(orig_manifest, orig_qpkg[:-5], "truncated_qpkg")

            # 3. Wrong magic header (even if qpkg_sha256 is updated)
            bad_magic = b"NOPE\x00\x01\x00\x00" + orig_qpkg[8:]
            m_bad_magic = json.loads(json.dumps(orig_manifest))
            m_bad_magic["qpkg_sha256"] = _sha256(bad_magic)
            _check_fail(m_bad_magic, bad_magic, "wrong_magic")

            # 4. qpkg_sha256 mismatch
            m_bad_sha = json.loads(json.dumps(orig_manifest))
            m_bad_sha["qpkg_sha256"] = "0" * 64
            _check_fail(m_bad_sha, orig_qpkg, "qpkg_sha256_mismatch")

            # 5. qpkg_size mismatch
            m_bad_size = json.loads(json.dumps(orig_manifest))
            m_bad_size["qpkg_size"] = len(orig_qpkg) + 1
            _check_fail(m_bad_size, orig_qpkg, "qpkg_size_mismatch")

            # 6. File SHA-256 mismatch
            m_file_sha = json.loads(json.dumps(orig_manifest))
            for f in m_file_sha["files"]:
                if f["path"] == "small.txt":
                    f["sha256"] = "f" * 64
            _check_fail(m_file_sha, orig_qpkg, "file_sha256_mismatch")

            # 7. Chunk SHA-256 mismatch
            m_chunk_sha = json.loads(json.dumps(orig_manifest))
            for f in m_chunk_sha["files"]:
                if f["path"] == "chunked.bin":
                    f["chunks"][1]["sha256"] = "e" * 64
            _check_fail(m_chunk_sha, orig_qpkg, "chunk_sha256_mismatch")

            # 8. Out-of-bounds offset
            m_oob = json.loads(json.dumps(orig_manifest))
            for f in m_oob["files"]:
                if f["path"] == "small.txt":
                    f["offset"] = len(orig_qpkg) - 1
                    f["comp_size"] = 10
            _check_fail(m_oob, orig_qpkg, "out_of_bounds_offset")

            # 9. Path traversal & invalid paths in manifest
            for idx, bad_path in enumerate(("../evil.txt", "/etc/passwd", "C:/evil.txt", r"a\b.txt")):
                m_trav = json.loads(json.dumps(orig_manifest))
                m_trav["files"][0]["path"] = bad_path
                _check_fail(m_trav, orig_qpkg, f"path_traversal_{idx}")

            # 10. Duplicate path in manifest
            m_dup = json.loads(json.dumps(orig_manifest))
            m_dup["files"][1]["path"] = m_dup["files"][0]["path"]
            _check_fail(m_dup, orig_qpkg, "duplicate_path")

    def test_cli_pack_verify_inspect_and_zstd_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            out = tmp_path / "out"
            src.mkdir()
            (src / "index.html").write_bytes(b"<html><body>Hello</body></html>")
            (src / "big.dat").write_bytes(b"0123456789ABCDEF" * 400)

            # 1. CLI pack with --json
            p_pack = subprocess.run(
                [
                    sys.executable,
                    str(PACKAGER_SCRIPT),
                    "pack",
                    "--input",
                    str(src),
                    "--output-dir",
                    str(out),
                    "--app-id",
                    "qassimz-hub",
                    "--version",
                    "1.5.0",
                    "--chunk-size",
                    "2048",
                    "--chunk-threshold",
                    "4096",
                    "--json",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(p_pack.returncode, 0, msg=p_pack.stderr)
            summary = json.loads(p_pack.stdout)
            self.assertTrue(summary["ok"])
            self.assertEqual(summary["app_id"], "qassimz-hub")
            self.assertEqual(summary["file_count"], 2)

            manifest_path = out / "manifest.json"
            qpkg_path = out / "qassimz-hub-v1.5.0.qpkg"

            # 2. CLI pack without --json (human-readable)
            out_hr = tmp_path / "out_hr"
            p_pack_hr = subprocess.run(
                [
                    sys.executable,
                    str(PACKAGER_SCRIPT),
                    "pack",
                    "--input",
                    str(src),
                    "--output-dir",
                    str(out_hr),
                    "--app-id",
                    "qassimz-hub",
                    "--version",
                    "1.5.0",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(p_pack_hr.returncode, 0, msg=p_pack_hr.stderr)
            self.assertIn("Packed qassimz-hub v1.5.0", p_pack_hr.stdout)

            # 3. CLI verify pass
            p_verify = subprocess.run(
                [
                    sys.executable,
                    str(PACKAGER_SCRIPT),
                    "verify",
                    "--manifest",
                    str(manifest_path),
                    "--qpkg",
                    str(qpkg_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(p_verify.returncode, 0, msg=p_verify.stderr)
            self.assertIn("OK: qassimz-hub v1.5.0", p_verify.stdout)

            # 4. CLI inspect
            p_inspect = subprocess.run(
                [
                    sys.executable,
                    str(PACKAGER_SCRIPT),
                    "inspect",
                    "--manifest",
                    str(manifest_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(p_inspect.returncode, 0, msg=p_inspect.stderr)
            self.assertIn("qassimz-hub", p_inspect.stdout)
            self.assertIn("1.5.0", p_inspect.stdout)
            self.assertIn("big.dat", p_inspect.stdout)

            # 5. CLI verify fail on corrupted archive
            corrupt_qpkg = tmp_path / "corrupt.qpkg"
            raw_q = bytearray(qpkg_path.read_bytes())
            raw_q[-1] ^= 0x01
            corrupt_qpkg.write_bytes(bytes(raw_q))
            p_verify_bad = subprocess.run(
                [
                    sys.executable,
                    str(PACKAGER_SCRIPT),
                    "verify",
                    "--manifest",
                    str(manifest_path),
                    "--qpkg",
                    str(corrupt_qpkg),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(p_verify_bad.returncode, 0)
            self.assertIn("ERROR:", p_verify_bad.stderr)

            # 6. CLI --compression zstd fails cleanly when zstandard is not installed
            p_zstd = subprocess.run(
                [
                    sys.executable,
                    str(PACKAGER_SCRIPT),
                    "pack",
                    "--input",
                    str(src),
                    "--output-dir",
                    str(tmp_path / "out_zstd"),
                    "--app-id",
                    "qassimz-hub",
                    "--version",
                    "1.5.0",
                    "--compression",
                    "zstd",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            try:
                import zstandard  # noqa: F401
            except ImportError:
                self.assertNotEqual(p_zstd.returncode, 0)
                self.assertIn("zstandard", p_zstd.stderr)
            else:
                self.assertEqual(p_zstd.returncode, 0)


if __name__ == "__main__":
    unittest.main()
