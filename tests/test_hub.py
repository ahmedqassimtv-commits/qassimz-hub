"""Unit tests for QASSIMZ Hub catalog, detector, local HTTP/1.1 API server, and installer assets."""
from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

import detector  # noqa: E402
import server  # noqa: E402


def _post_json(url: str, payload: dict | None = None) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload or {}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode("utf-8"))


class TestQassimzHub(unittest.TestCase):
    def test_catalog_contains_all_14_products(self):
        cat = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(cat["schema_version"], 1)
        items = cat["items"]
        self.assertEqual(len(items), 14)
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
            "qassimz-fonts",
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
            if it["id"] == "qassimz-fonts":
                # Linked before its first Windows build: listed, but no installer yet.
                self.assertEqual(it["setup_url"], "")
            else:
                self.assertIn("qassimz-hub/releases/download/", it["setup_url"])
        self.assertEqual(len(codes), 14)

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
                self.assertNotIn("liquid-glass.css", html)

            with urllib.request.urlopen(base_url + "fonts/GoogleSans-Arabic.woff2", timeout=5) as r:
                self.assertEqual(r.status, 200)
                self.assertIn("woff2", r.headers.get("Content-Type", ""))
                self.assertGreater(len(r.read()), 50000)

            payload = _post_json(base_url + "api/state")
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["data"]["counts"]["total"], 14)

    def test_window_controls_and_win_quit(self):
        with tempfile.TemporaryDirectory() as tmp:
            api = server.HubApi(Path(tmp))
            quit_called = {"count": 0}
            api._on_quit_request = lambda: quit_called.__setitem__("count", quit_called["count"] + 1)
            base_url = server.start_server(api)

            r1 = _post_json(base_url + "api/win_toggle_maximize")
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["data"], {"ok": True, "maximized": True})

            r2 = _post_json(base_url + "api/win_toggle_maximize")
            self.assertTrue(r2["ok"])
            self.assertEqual(r2["data"], {"ok": True, "maximized": False})

            rq = _post_json(base_url + "api/win_quit")
            self.assertTrue(rq["ok"])
            self.assertEqual(rq["data"], {"ok": True})
            self.assertEqual(quit_called["count"], 1)

            # Failing window maximize should not flip _is_maximized
            class _FailingWindow:
                def maximize(self):
                    raise RuntimeError("maximize failed")

                def restore(self):
                    raise RuntimeError("restore failed")

            api.window = _FailingWindow()
            api._is_maximized = False
            rf = _post_json(base_url + "api/win_toggle_maximize")
            self.assertTrue(rf["ok"])
            self.assertEqual(rf["data"], {"ok": False, "maximized": False})
            self.assertFalse(api._is_maximized)

    def test_save_settings_wrapped_and_flat_payloads(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            api = server.HubApi(tmp_path)
            base_url = server.start_server(api)

            # Wrapped payload matching frontend: {"values": {"minimize_to_tray": False}}
            r_wrapped = _post_json(base_url + "api/save_settings", {"values": {"minimize_to_tray": False}})
            self.assertTrue(r_wrapped["ok"], r_wrapped)
            self.assertIs(r_wrapped["data"]["minimize_to_tray"], False)
            self.assertIs(api.settings.all()["minimize_to_tray"], False)

            # Flat payload backward compatibility: {"auto_check_updates": False}
            r_flat = _post_json(base_url + "api/save_settings", {"auto_check_updates": False})
            self.assertTrue(r_flat["ok"], r_flat)
            self.assertIs(r_flat["data"]["auto_check_updates"], False)
            self.assertIs(api.settings.all()["auto_check_updates"], False)

            # Verify persisted to settings.json on disk
            persisted = json.loads((tmp_path / "settings.json").read_text(encoding="utf-8"))
            self.assertIs(persisted["minimize_to_tray"], False)
            self.assertIs(persisted["auto_check_updates"], False)

    def test_frontend_backend_api_parity_and_no_stale_version(self):
        api_ts = ROOT / "frontend" / "src" / "lib" / "api.ts"
        frontend_src = api_ts.read_text(encoding="utf-8") if api_ts.is_file() else (ROOT / "app" / "ui" / "app.js").read_text(encoding="utf-8")
        index_html = (ROOT / "app" / "ui" / "index.html").read_text(encoding="utf-8")
        setup_iss = (ROOT / "installer" / "setup.iss").read_text(encoding="utf-8-sig")

        # Every api("...") call in frontend must match a public callable method on HubApi
        called_methods = set(re.findall(r'\bapi(?:<[^>]+>)?\(\s*["\']([a-zA-Z0-9_]+)["\']', frontend_src))
        self.assertGreater(len(called_methods), 8)
        for method in sorted(called_methods):
            self.assertFalse(method.startswith("_"), f"Private method called from UI: {method}")
            fn = getattr(server.HubApi, method, None)
            self.assertTrue(callable(fn), f"Frontend calls unknown HubApi endpoint: {method}")

        self.assertNotIn("1.2.0", frontend_src)
        self.assertNotIn("1.2.0", index_html)
        self.assertNotIn("1.2.0", setup_iss)

    def test_inno_setup_utf8_bom(self):
        raw = (ROOT / "installer" / "setup.iss").read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"), "installer/setup.iss must start with UTF-8 BOM")

    def test_installer_bmp_dimensions_and_rgb(self):
        inst = ROOT / "installer"
        anim = inst / "anim"
        expected = [
            (inst / "wizard.bmp", (164, 314)),
            (inst / "wizard-small.bmp", (55, 55)),
        ]
        for i in range(24):
            expected.append((anim / f"big{i:02d}.bmp", (164, 314)))
            expected.append((anim / f"small{i:02d}.bmp", (55, 55)))
            expected.append((anim / f"stage{i:02d}.bmp", (417, 124)))

        self.assertEqual(len(expected), 74)
        for path, dims in expected:
            self.assertTrue(path.is_file(), f"Missing BMP: {path}")
            with Image.open(path) as im:
                self.assertEqual(im.format, "BMP", f"Not BMP: {path}")
                self.assertEqual(im.mode, "RGB", f"Not 24-bit RGB: {path}")
                self.assertEqual(im.size, dims, f"Wrong dimensions for {path}: {im.size} != {dims}")


if __name__ == "__main__":
    unittest.main()
