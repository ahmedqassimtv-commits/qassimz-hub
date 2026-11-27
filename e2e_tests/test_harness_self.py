"""Standalone self-tests proving e2e_tests/harness.py works independently of M1-M4."""

from __future__ import annotations

import http.client
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from e2e_tests.harness import (
    ALL_15_WORKFLOW_PATHS,
    DeltaTestServer,
    make_deterministic_bytes,
    parse_yaml_via_yq,
    sha256_bytes,
    snapshot_dir_hashes,
)


class TestHarnessSelf(unittest.TestCase):
    def test_200_ok_and_byte_accounting(self) -> None:
        payload = make_deterministic_bytes(16384, seed=10)
        with DeltaTestServer() as srv:
            url = srv.serve_bytes("/files/data.bin", payload)
            with urllib.request.urlopen(url) as resp:
                self.assertEqual(resp.status, 200)
                self.assertEqual(resp.headers.get("Accept-Ranges"), "bytes")
                body = resp.read()
            self.assertEqual(body, payload)
            self.assertEqual(srv.total_bytes_served, len(payload))
            self.assertEqual(srv.range_requests_count, 0)
            self.assertEqual(len(srv.request_log), 1)
            self.assertEqual(srv.request_log[0]["status"], 200)

    def test_206_partial_content_exact_slice_and_ranges(self) -> None:
        payload = make_deterministic_bytes(65536, seed=20)
        with DeltaTestServer() as srv:
            url = srv.serve_bytes("/pkg/app.qpkg", payload)

            # Standard inclusive range
            req = urllib.request.Request(url, headers={"Range": "bytes=100-1099"})
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 206)
                self.assertEqual(resp.headers.get("Content-Range"), f"bytes 100-1099/{len(payload)}")
                self.assertEqual(resp.headers.get("Content-Length"), "1000")
                data = resp.read()
            self.assertEqual(data, payload[100:1100])

            # Open-ended range bytes=65000-
            req2 = urllib.request.Request(url, headers={"Range": "bytes=65000-"})
            with urllib.request.urlopen(req2) as resp2:
                self.assertEqual(resp2.status, 206)
                data2 = resp2.read()
            self.assertEqual(data2, payload[65000:])

            # Suffix range bytes=-512
            req3 = urllib.request.Request(url, headers={"Range": "bytes=-512"})
            with urllib.request.urlopen(req3) as resp3:
                self.assertEqual(resp3.status, 206)
                data3 = resp3.read()
            self.assertEqual(data3, payload[-512:])

            self.assertEqual(srv.range_requests_count, 3)
            self.assertEqual(srv.total_bytes_served, 1000 + len(data2) + 512)

    def test_302_redirect_preserves_range_header(self) -> None:
        payload = make_deterministic_bytes(32768, seed=30)
        with DeltaTestServer() as srv:
            srv.serve_bytes("/cdn/v2/app.qpkg", payload)
            release_url = srv.add_redirect("/releases/v2/app.qpkg", "/cdn/v2/app.qpkg", status=302)

            req = urllib.request.Request(release_url, headers={"Range": "bytes=4096-8191"})
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 206)
                self.assertIn("/cdn/v2/app.qpkg", resp.geturl())
                body = resp.read()
            self.assertEqual(body, payload[4096:8192])
            self.assertEqual(srv.total_bytes_served, 4096)
            self.assertEqual(srv.range_requests_count, 1)
            statuses = [r["status"] for r in srv.request_log]
            self.assertEqual(statuses, [302, 206])

    def test_416_out_of_bounds_range(self) -> None:
        payload = b"0123456789"
        with DeltaTestServer() as srv:
            url = srv.serve_bytes("/tiny.bin", payload)
            req = urllib.request.Request(url, headers={"Range": "bytes=100-200"})
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(req)
            self.assertEqual(ctx.exception.code, 416)
            self.assertEqual(ctx.exception.headers.get("Content-Range"), "bytes */10")

    def test_non_range_server_returns_200_full_body(self) -> None:
        payload = make_deterministic_bytes(4096, seed=40)
        with DeltaTestServer(allow_range=False) as srv:
            url = srv.serve_bytes("/full.qpkg", payload)
            req = urllib.request.Request(url, headers={"Range": "bytes=0-127"})
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = resp.read()
            self.assertEqual(body, payload)
            self.assertEqual(srv.range_requests_count, 0)
            self.assertEqual(srv.total_bytes_served, len(payload))

    def test_fault_injection_status_corruption_and_truncation(self) -> None:
        payload = b"A" * 4096
        with DeltaTestServer() as srv:
            url = srv.serve_bytes("/fault/file.bin", payload)

            # Force 500 on 2nd request
            srv.force_status("/fault/", 500, after_n=1, count=1)
            with urllib.request.urlopen(url) as r1:
                self.assertEqual(r1.status, 200)
                self.assertEqual(r1.read(), payload)
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(url)
            self.assertEqual(ctx.exception.code, 500)

            # Corrupt byte 5 on next request
            srv.clear_faults()
            srv.corrupt_byte("/fault/", byte_index=5, on_request_number=1)
            with urllib.request.urlopen(url) as r3:
                corrupted = r3.read()
            self.assertEqual(len(corrupted), len(payload))
            self.assertNotEqual(corrupted, payload)
            self.assertEqual(corrupted[5], ord("A") ^ 0xFF)

            # Truncate mid-stream
            srv.clear_faults()
            srv.truncate_response("/fault/", max_bytes=100, on_request_number=1)
            with self.assertRaises(http.client.IncompleteRead) as tctx:
                with urllib.request.urlopen(url) as r4:
                    r4.read()
            self.assertEqual(len(tctx.exception.partial), 100)

    def test_snapshot_dir_hashes_and_deterministic_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sub").mkdir()
            d1 = make_deterministic_bytes(1024, seed=7)
            d2 = make_deterministic_bytes(1024, seed=7)
            self.assertEqual(d1, d2)
            (root / "a.bin").write_bytes(d1)
            (root / "sub" / "b.txt").write_text("hello", encoding="utf-8")
            (root / ".qassimz-version.json").write_text("{}", encoding="utf-8")

            snap = snapshot_dir_hashes(root, ignore_names={".qassimz-version.json"})
            self.assertEqual(set(snap.keys()), {"a.bin", "sub/b.txt"})
            self.assertEqual(snap["a.bin"], sha256_bytes(d1))
            self.assertEqual(snap["sub/b.txt"], sha256_bytes(b"hello"))

    def test_parse_yaml_via_yq_on_hub_workflow(self) -> None:
        hub_wf = [p for p in ALL_15_WORKFLOW_PATHS if p.parent.parent.parent.name == "qassimz-hub"][0]
        self.assertTrue(hub_wf.exists(), f"Expected workflow at {hub_wf}")
        parsed = parse_yaml_via_yq(hub_wf)
        self.assertIsInstance(parsed, dict)
        self.assertIn("jobs", parsed)


if __name__ == "__main__":
    unittest.main()
