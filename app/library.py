"""QASSIMZ Hub — Shared Library (local AI models, brand assets, fonts).

A single per-user folder shared by every app in the suite:

    %APPDATA%/QASSIMZ Hub/library/
        models/      # e.g. ggml-base.bin used by QASSIMZ Captions
        fonts/       # downloaded font files
        assets/      # shared brand assets (logos, LUTs, templates)

Downloads are atomic (``.part`` -> ``os.replace``), resumable through an HTTP
``Range`` header, size-checked, and optionally SHA-256 verified when the catalog
entry carries a hash. Fonts are additionally registered with Windows so they
appear in every app without a reboot.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
import shutil
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

try:
    import certifi
except Exception:  # pragma: no cover - certifi is a declared dependency
    certifi = None

UA = "QASSIMZ-Hub/2.2 (+library)"
KINDS = ("model", "font", "asset")


def _ssl_context() -> ssl.SSLContext:
    if certifi is not None:
        try:
            return ssl.create_default_context(cafile=certifi.where())
        except Exception:
            pass
    return ssl.create_default_context()


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(262144)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


class LibraryManager:
    """Shared-folder manager for downloadable models, fonts and brand assets."""

    def __init__(self, root: Path, catalog_path: Path):
        self.root = Path(root)
        self.catalog_path = Path(catalog_path)
        self.base = self.root / "library"
        self.models_dir = self.base / "models"
        self.fonts_dir = self.base / "fonts"
        self.assets_dir = self.base / "assets"
        for folder in (self.models_dir, self.fonts_dir, self.assets_dir):
            folder.mkdir(parents=True, exist_ok=True)

    # --- catalog -----------------------------------------------------------
    def catalog(self) -> list[dict[str, Any]]:
        try:
            raw = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        except Exception:
            return []
        items = raw.get("items") if isinstance(raw, dict) else None
        return [it for it in (items or []) if isinstance(it, dict) and it.get("id")]

    def _item(self, item_id: str) -> dict[str, Any] | None:
        for it in self.catalog():
            if it.get("id") == item_id:
                return it
        return None

    def _target_dir(self, kind: str) -> Path:
        if kind == "model":
            return self.models_dir
        if kind == "font":
            return self.fonts_dir
        return self.assets_dir

    def target_path(self, item: dict[str, Any]) -> Path:
        name = str(item.get("filename") or f"{item.get('id')}.bin")
        name = os.path.basename(name)
        return self._target_dir(str(item.get("kind", "model"))) / name

    # --- state -------------------------------------------------------------
    def state(self) -> dict[str, Any]:
        rows: list[dict[str, Any]] = []
        installed_bytes = 0
        for item in self.catalog():
            target = self.target_path(item)
            size = int(item.get("size_bytes") or 0)
            present = target.is_file()
            actual = target.stat().st_size if present else 0
            if present:
                installed_bytes += actual
            rows.append(
                {
                    "id": item.get("id"),
                    "kind": item.get("kind", "model"),
                    "name": item.get("name") or item.get("id"),
                    "name_ar": item.get("name_ar") or item.get("name") or item.get("id"),
                    "note_ar": item.get("note_ar") or "",
                    "note_en": item.get("note_en") or "",
                    "size_bytes": size,
                    "installed": present and (not size or actual >= max(1, int(size * 0.98))),
                    "partial": present and bool(size) and actual < max(1, int(size * 0.98)),
                    "installed_bytes": actual,
                    "used_by": item.get("used_by") or [],
                    "license": item.get("license") or "",
                }
            )
        return {
            "items": rows,
            "installed_bytes": installed_bytes,
            "models_dir": str(self.models_dir),
            "fonts_dir": str(self.fonts_dir),
            "assets_dir": str(self.assets_dir),
        }

    # --- install -----------------------------------------------------------
    def install(
        self,
        item_id: str,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        item = self._item(item_id)
        if not item:
            raise ValueError("العنصر غير موجود في المكتبة.")
        url = str(item.get("url") or "").strip()
        if not url.lower().startswith("https://"):
            raise RuntimeError("مصدر هذا العنصر غير متاح بعد.")
        target = self.target_path(item)
        expected_size = int(item.get("size_bytes") or 0)
        expected_sha = str(item.get("sha256") or "").strip().lower()
        part = target.with_suffix(target.suffix + ".part")

        def emit(pct: int, **extra: Any) -> None:
            if on_progress:
                payload = {"id": item_id, "progress": max(0, min(100, pct))}
                payload.update(extra)
                try:
                    on_progress(payload)
                except Exception:
                    pass

        if target.is_file() and expected_size and target.stat().st_size == expected_size:
            if not expected_sha or _sha256(target) == expected_sha:
                emit(100, status="completed")
                return self.state()

        resume_from = part.stat().st_size if part.is_file() else 0
        headers = {"User-Agent": UA, "Accept": "*/*"}
        if resume_from > 0:
            headers["Range"] = f"bytes={resume_from}-"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=45, context=_ssl_context()) as resp:
                status = getattr(resp, "status", 200)
                resumed = resume_from > 0 and status == 206
                mode = "ab" if resumed else "wb"
                done = resume_from if resumed else 0
                total = expected_size or (done + int(resp.headers.get("Content-Length") or 0))
                emit(1, status="downloading")
                with part.open(mode) as fh:
                    last = time.monotonic()
                    while True:
                        chunk = resp.read(262144)
                        if not chunk:
                            break
                        fh.write(chunk)
                        done += len(chunk)
                        now = time.monotonic()
                        if now - last >= 0.25:
                            last = now
                            emit(int(done * 100 / total) if total else 0, status="downloading", downloaded=done, total=total)
        except urllib.error.HTTPError as exc:
            if exc.code == 416 and resume_from > 0:
                part.replace(target)
                emit(100, status="completed")
                return self.state()
            part.unlink(missing_ok=True)
            raise RuntimeError("تعذّر تنزيل العنصر من المصدر.") from exc
        except Exception as exc:
            raise RuntimeError("تعذّر تنزيل العنصر من المصدر.") from exc

        if expected_sha:
            actual = _sha256(part)
            if actual != expected_sha:
                part.unlink(missing_ok=True)
                raise RuntimeError("فشل التحقق من سلامة الملف (SHA-256).")
        if expected_size and part.stat().st_size < max(1, int(expected_size * 0.98)):
            raise RuntimeError("الملف المنزّل أصغر من الحجم المتوقع.")
        part.replace(target)

        if str(item.get("kind")) == "font":
            self.register_font(target)
        emit(100, status="completed")
        return self.state()

    # --- fonts -------------------------------------------------------------
    def remove(self, item_id: str) -> bool:
        """Delete a downloaded model/font from the shared library."""
        item = self._item(item_id)
        if not item:
            raise ValueError(f"Unknown library item: {item_id}")
        target = self.target_path(item)
        part = target.with_suffix(target.suffix + ".part")
        removed = False
        for path in (target, part):
            try:
                if path.is_file():
                    path.unlink()
                    removed = True
            except OSError:
                pass
        return removed

    def register_font(self, font_path: Path) -> bool:
        """Register a font with the OS. Windows: per-user font folder + HKCU key."""
        if os.name != "nt":
            target_dir = Path.home() / ".local" / "share" / "fonts"
            target_dir.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(font_path, target_dir / font_path.name)
                return True
            except OSError:
                return False
        try:
            import winreg  # type: ignore

            fonts_dir = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Microsoft" / "Windows" / "Fonts"
            fonts_dir.mkdir(parents=True, exist_ok=True)
            dest = fonts_dir / font_path.name
            shutil.copy2(font_path, dest)
            name = font_path.stem
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts") as k:
                winreg.SetValueEx(k, f"{name} (TrueType)", 0, winreg.REG_SZ, str(dest))
            try:
                ctypes.windll.gdi32.AddFontResourceW(str(dest))
            except Exception:
                pass
            return True
        except Exception:
            return False

    def open_folder(self, kind: str = "assets") -> str:
        folder = self._target_dir(str(kind or "assets"))
        folder.mkdir(parents=True, exist_ok=True)
        return str(folder)
