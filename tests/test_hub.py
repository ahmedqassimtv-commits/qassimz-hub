"""Unit tests for QASSIMZ Hub catalog, detector, and local HTTP/1.1 API server."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

import detector  # noqa: E402
import server  # noqa: E402


class TestQassimzHub(unittest.TestCase):
    def test_catalog_contains_all_13_products(self):
        cat = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(cat["schema_version"], 1)
        items = cat["items"]
        self.assertEqual(len(items), 13)
        expected_ids = {
            "qassimz-music",
            "qassimz-producer",
            "qassimz-thumbs",
            "qassimz-organizer",
            "qassimz-study",
            "qdm",
            "qassimz-studio",
            "qassimz-footage",
            "qassimz-mogrt-hub",
            "qassimz-export",
            "qassimz-mogrt-maker",
            "qassimz-captions",
            "qassimz-vox-fx",
        }
        self.assertEqual({it["id"] for it in items}, expected_ids)
        self.assertEqual(set(cat["apps"].keys()), expected_ids)

        # Ensure every item has an offline SVG & PNG icon in app/ui/icons/
        codes = set()
        for it in items:
            self.assertTrue((ROOT / "app" / "ui" / "icons" / f"{it['id']}.svg").is_file())
            self.assertTrue((ROOT / "app" / "ui" / "icons" / f"{it['id']}.png").is_file())
            self.assertEqual(len(it["code"]), 2)
            codes.add(it["code"])
            self.assertIn("qassimz-hub/releases/download/", it["setup_url"])
        self.assertEqual(len(codes), 13)

    def test_version_parser_and_detector(self):
        self.assertGreater(detector.parse_version("1.1.0"), detector.parse_version("1.0.0"))
        self.assertGreater(detector.parse_version("v2.3.0"), detector.parse_version("2.2.0"))
        self.assertEqual(detector.parse_version(""), (0,))

    def test_http_server_and_woff2_fonts(self):
        with tempfile.TemporaryDirectory() as tmp:
            api = server.HubApi(Path(tmp))
            base_url = server.start_server(api)

            # Verify index.html & offline woff2 font delivery
            with urllib.request.urlopen(base_url, timeout=5) as r:
                self.assertEqual(r.status, 200)
                html = r.read().decode("utf-8")
                self.assertIn("QASSIMZ Hub", html)

            with urllib.request.urlopen(base_url + "fonts/GoogleSans-Arabic.woff2", timeout=5) as r:
                self.assertEqual(r.status, 200)
                self.assertIn("woff2", r.headers.get("Content-Type", ""))
                self.assertGreater(len(r.read()), 50000)

            # Verify POST /api/state
            req = urllib.request.Request(
                base_url + "api/state",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                payload = json.loads(r.read().decode("utf-8"))
                self.assertTrue(payload["ok"])
                self.assertEqual(payload["data"]["counts"]["total"], 13)

    def test_inno_setup_utf8_bom(self):
        raw = (ROOT / "installer" / "setup.iss").read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"), "installer/setup.iss must start with UTF-8 BOM")


if __name__ == "__main__":
    unittest.main()
