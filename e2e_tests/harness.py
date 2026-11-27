"""Shared opaque-box E2E test harness for QASSIMZ Delta / Differential Update Engine.

Provides:
- DeltaTestServer: real local ThreadingHTTPServer with RFC 9110 Range (206/416/200),
  302 redirects preserving Range, exact byte accounting, and fault injection.
- CLI helper for tools/qpkg_packager.py (invoked as a real subprocess).
- Lazy module loaders for app/delta_updater.py, app/detector.py, app/installer_runner.py,
  and app/server.py so unittest discovery never fails while M1-M4 run in parallel.
- Fast deterministic synthetic binary data generator and directory SHA-256 snapshotting.
- Real YAML parser via /usr/bin/yq (with /usr/bin/python3 PyYAML fallback).
"""

from __future__ import annotations

import hashlib
import http.server
import importlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path
from typing import Any

HUB_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = HUB_ROOT.parent
APP_DIR = HUB_ROOT / "app"
PACKAGER_PATH = HUB_ROOT / "tools" / "qpkg_packager.py"
QPKG_MAGIC = b"QPKG\x00\x01\x00\x00"

EXPECTED_CATALOG_PRODUCT_IDS = [
    "qassimz-studio",
    "qassimz-producer",
    "qassimz-music",
    "qdm",
    "qassimz-thumbs",
    "qassimz-organizer",
    "qassimz-study",
    "qassimz-vox-fx",
    "qassimz-captions",
    "qassimz-footage",
    "qassimz-mogrt-hub",
    "qassimz-mogrt-maker",
    "qassimz-export",
]

ALL_15_WORKFLOW_PATHS = [
    WORKSPACE_ROOT / "glasstube-liquid-desktop" / ".github" / "workflows" / "build-release.yml",
    WORKSPACE_ROOT / "qassimz-captions" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-export" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-footage" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-hub" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-mogrt-hub" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-mogrt-maker" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-music" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-organizer" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-producer" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-studio" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-study" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-thumbs" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qassimz-vox-fx" / ".github" / "workflows" / "build.yml",
    WORKSPACE_ROOT / "qdm" / ".github" / "workflows" / "build.yml",
]


def ensure_app_on_sys_path() -> None:
    app_str = str(APP_DIR)
    if app_str not in sys.path:
        sys.path.insert(0, app_str)


def load_delta_updater():
    """Import app/delta_updater.py lazily (never at test module import time)."""
    ensure_app_on_sys_path()
    return importlib.import_module("delta_updater")


def load_detector():
    ensure_app_on_sys_path()
    return importlib.import_module("detector")


def load_installer_runner():
    ensure_app_on_sys_path()
    return importlib.import_module("installer_runner")


def load_server():
    ensure_app_on_sys_path()
    return importlib.import_module("server")


def res_get(obj: Any, key: str, default: Any = None) -> Any:
    """Read a field from either a dataclass/object or a dict."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def run_packager_cli(
    args: list[str],
    cwd: Path | str | None = None,
    timeout: float = 60.0,
) -> subprocess.CompletedProcess[str]:
    """Invoke tools/qpkg_packager.py as a real subprocess."""
    if not PACKAGER_PATH.exists():
        raise AssertionError(f"Packager CLI not found at {PACKAGER_PATH}")
    cmd = [sys.executable, str(PACKAGER_PATH), *args]
    return subprocess.run(
        cmd,
        cwd=str(cwd or HUB_ROOT),
        text=True,
        capture_output=True,
        timeout=timeout,
    )


def pack_directory(
    input_dir: Path,
    output_dir: Path,
    app_id: str,
    version: str,
    extra_args: list[str] | None = None,
) -> tuple[Path, Path, dict[str, Any]]:
    """Run `qpkg_packager.py pack` and return (manifest_path, qpkg_path, manifest_dict)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    args = [
        "pack",
        "--input",
        str(input_dir),
        "--output-dir",
        str(output_dir),
        "--app-id",
        app_id,
        "--version",
        version,
    ]
    if extra_args:
        args.extend(extra_args)
    proc = run_packager_cli(args)
    if proc.returncode != 0:
        raise AssertionError(
            f"qpkg_packager.py pack failed (rc={proc.returncode}):\n"
            f"STDOUT: {proc.stdout}\nSTDERR: {proc.stderr}"
        )
    manifest_path = output_dir / "manifest.json"
    qpkg_path = output_dir / f"{app_id}-v{version}.qpkg"
    if not manifest_path.exists():
        raise AssertionError(f"manifest.json not created at {manifest_path}")
    if not qpkg_path.exists():
        raise AssertionError(f".qpkg archive not created at {qpkg_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return manifest_path, qpkg_path, manifest


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(131072)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def snapshot_dir_hashes(
    root: Path,
    ignore_names: set[str] | None = None,
) -> dict[str, str]:
    """Compute {relative_posix_path: sha256_hex} for every regular file under root."""
    ignore = ignore_names or set()
    result: dict[str, str] = {}
    if not root.exists():
        return result
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(root).as_posix()
        if p.name in ignore or rel in ignore:
            continue
        result[rel] = sha256_file(p)
    return result


def make_deterministic_bytes(size: int, seed: int = 1) -> bytes:
    """Fast deterministic high-entropy synthetic binary data (<50ms for 10MB).

    Uses chained SHA-256 blocks expanded with counter XOR so data is realistic,
    poorly compressible (like compiled binaries/asar/DLLs), and reproducible.
    """
    if size <= 0:
        return b""
    # Build a 64KB base pseudo-random block from SHA-256 digests (2048 * 32B)
    # and vary each 64KB page with a fast XOR mask so consecutive chunks are distinct.
    page_size = 65536
    base_parts: list[bytes] = []
    seed_bytes = f"qassimz-seed-{seed}".encode("ascii")
    digest = hashlib.sha256(seed_bytes).digest()
    # Generate 256 unique 32-byte blocks = 8KB, then expand to 64KB with page variation
    for i in range(256):
        digest = hashlib.sha256(digest + i.to_bytes(2, "little")).digest()
        base_parts.append(digest)
    block_8k = b"".join(base_parts)  # 8192 bytes

    out = bytearray(size)
    offset = 0
    page_idx = 0
    while offset < size:
        # Build up to 8KB at a time with distinct per-block header bytes
        take = min(len(block_8k), size - offset)
        out[offset : offset + take] = block_8k[:take]
        # Stamp unique page index in first 8 bytes of each 8KB block so every 64KB chunk
        # has a unique SHA-256 hash.
        tag = hashlib.sha256(seed_bytes + page_idx.to_bytes(4, "little")).digest()
        tag_len = min(len(tag), take)
        out[offset : offset + tag_len] = tag[:tag_len]
        offset += take
        page_idx += 1
    return bytes(out)


def parse_yaml_via_yq(path: Path) -> dict[str, Any]:
    """Parse a YAML file using /usr/bin/yq (fallback to /usr/bin/python3 PyYAML)."""
    yq_bin = shutil.which("yq")
    if yq_bin:
        proc = subprocess.run(
            [yq_bin, ".", str(path)],
            text=True,
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0:
            raise AssertionError(
                f"yq failed parsing {path} (rc={proc.returncode}): {proc.stderr}"
            )
        return json.loads(proc.stdout)

    sys_py = Path("/usr/bin/python3")
    if sys_py.exists():
        code = (
            "import json, sys, yaml; "
            "print(json.dumps(yaml.safe_load(open(sys.argv[1], encoding='utf-8')), default=str))"
        )
        proc = subprocess.run(
            [str(sys_py), "-c", code, str(path)],
            text=True,
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0:
            raise AssertionError(
                f"PyYAML failed parsing {path} (rc={proc.returncode}): {proc.stderr}"
            )
        return json.loads(proc.stdout)

    raise RuntimeError("Neither /usr/bin/yq nor /usr/bin/python3 PyYAML is available")


_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _parse_single_range(header_val: str, total_len: int) -> tuple[int, int] | None:
    """Parse RFC 9110 single byte-range spec. Returns (start, end) inclusive or None if invalid."""
    m = _RANGE_RE.match(header_val.strip())
    if not m or total_len <= 0:
        return None
    start_s, end_s = m.group(1), m.group(2)
    if not start_s and not end_s:
        return None
    if start_s == "":
        # Suffix range: bytes=-N
        suffix = int(end_s)
        if suffix <= 0:
            return None
        start = max(0, total_len - suffix)
        end = total_len - 1
        return (start, end)
    start = int(start_s)
    if start >= total_len:
        return None
    if end_s == "":
        end = total_len - 1
    else:
        end = min(int(end_s), total_len - 1)
    if start > end:
        return None
    return (start, end)


class DeltaTestServer:
    """Real local ThreadingHTTPServer simulating GitHub Releases + CDN Range/Redirect/Faults."""

    def __init__(self, allow_range: bool = True) -> None:
        self.allow_range = allow_range
        self._lock = threading.Lock()
        self._routes: dict[str, tuple[bytes | Path, str]] = {}
        self._redirects: dict[str, tuple[str, int]] = {}
        self._force_statuses: list[dict[str, Any]] = []
        self._corruptions: list[dict[str, Any]] = []
        self._truncations: list[dict[str, Any]] = []
        self._throttles: list[tuple[str, float]] = []
        self._path_hits: dict[str, int] = {}

        self.total_bytes_served: int = 0
        self.range_requests_count: int = 0
        self.request_log: list[dict[str, Any]] = []

        self._httpd: http.server.ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self.port: int = 0

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def url_for(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}{path}"

    def serve_bytes(
        self,
        path: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        if not path.startswith("/"):
            path = "/" + path
        with self._lock:
            self._routes[path] = (data, content_type)
        return self.url_for(path)

    def serve_file(
        self,
        path: str,
        file_path: Path,
        content_type: str = "application/octet-stream",
    ) -> str:
        if not path.startswith("/"):
            path = "/" + path
        with self._lock:
            self._routes[path] = (Path(file_path), content_type)
        return self.url_for(path)

    def add_redirect(self, src_path: str, dst_path: str, status: int = 302) -> str:
        if not src_path.startswith("/"):
            src_path = "/" + src_path
        with self._lock:
            self._redirects[src_path] = (dst_path, status)
        return self.url_for(src_path)

    def force_status(
        self,
        path_prefix: str,
        status_code: int,
        after_n: int = 0,
        count: int | None = None,
    ) -> None:
        with self._lock:
            self._force_statuses.append(
                {
                    "prefix": path_prefix,
                    "status": int(status_code),
                    "after_n": int(after_n),
                    "count": count,
                    "seen": 0,
                    "fired": 0,
                }
            )

    def corrupt_byte(
        self,
        path_prefix: str,
        byte_index: int = 0,
        on_request_number: int | None = None,
    ) -> None:
        with self._lock:
            self._corruptions.append(
                {
                    "prefix": path_prefix,
                    "byte_index": int(byte_index),
                    "on_req": on_request_number,
                    "seen": 0,
                }
            )

    def truncate_response(
        self,
        path_prefix: str,
        max_bytes: int,
        on_request_number: int | None = None,
    ) -> None:
        with self._lock:
            self._truncations.append(
                {
                    "prefix": path_prefix,
                    "max_bytes": int(max_bytes),
                    "on_req": on_request_number,
                    "seen": 0,
                }
            )

    def throttle_delay(self, path_prefix: str, delay_sec: float) -> None:
        with self._lock:
            self._throttles.append((path_prefix, float(delay_sec)))

    def clear_faults(self) -> None:
        with self._lock:
            self._force_statuses.clear()
            self._corruptions.clear()
            self._truncations.clear()
            self._throttles.clear()

    def reset_stats(self) -> None:
        with self._lock:
            self.total_bytes_served = 0
            self.range_requests_count = 0
            self.request_log.clear()
            self._path_hits.clear()

    def _read_payload(self, source: bytes | Path, start: int | None = None, end: int | None = None) -> tuple[bytes, int]:
        if isinstance(source, bytes):
            total = len(source)
            if start is None:
                return source, total
            return source[start : end + 1], total
        total = source.stat().st_size
        with source.open("rb") as fh:
            if start is None:
                return fh.read(), total
            fh.seek(start)
            return fh.read(end - start + 1), total

    def _check_forced_status(self, path: str) -> int | None:
        with self._lock:
            for rule in self._force_statuses:
                if path.startswith(rule["prefix"]):
                    rule["seen"] += 1
                    if rule["seen"] > rule["after_n"]:
                        if rule["count"] is None or rule["fired"] < rule["count"]:
                            rule["fired"] += 1
                            return rule["status"]
        return None

    def _apply_corruption(self, path: str, payload: bytes) -> bytes:
        with self._lock:
            for rule in self._corruptions:
                if path.startswith(rule["prefix"]):
                    rule["seen"] += 1
                    if rule["on_req"] is None or rule["seen"] == rule["on_req"]:
                        if payload:
                            idx = rule["byte_index"] % len(payload)
                            buf = bytearray(payload)
                            buf[idx] ^= 0xFF
                            payload = bytes(buf)
        return payload

    def _check_truncation(self, path: str) -> int | None:
        with self._lock:
            for rule in self._truncations:
                if path.startswith(rule["prefix"]):
                    rule["seen"] += 1
                    if rule["on_req"] is None or rule["seen"] == rule["on_req"]:
                        return rule["max_bytes"]
        return None

    def _get_throttle(self, path: str) -> float:
        with self._lock:
            for prefix, delay in self._throttles:
                if path.startswith(prefix):
                    return delay
        return 0.0

    def _record_request(
        self,
        method: str,
        path: str,
        status: int,
        range_header: str | None,
        bytes_sent: int,
        counted_range: bool = False,
    ) -> None:
        with self._lock:
            self.total_bytes_served += bytes_sent
            if counted_range:
                self.range_requests_count += 1
            self.request_log.append(
                {
                    "method": method,
                    "path": path,
                    "status": status,
                    "range_header": range_header,
                    "bytes_sent": bytes_sent,
                }
            )

    def start(self) -> "DeltaTestServer":
        owner = self

        class _Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, fmt: str, *args: Any) -> None:
                # Silence noisy test output
                return

            def do_HEAD(self) -> None:
                self._handle("HEAD")

            def do_GET(self) -> None:
                self._handle("GET")

            def _handle(self, method: str) -> None:
                parsed = urllib.parse.urlsplit(self.path)
                req_path = parsed.path
                range_hdr = self.headers.get("Range")

                forced = owner._check_forced_status(req_path)
                if forced is not None:
                    body = f"forced error {forced}".encode("ascii")
                    self.send_response(forced)
                    self.send_header("Content-Type", "text/plain")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Connection", "close")
                    self.end_headers()
                    if method == "GET":
                        self.wfile.write(body)
                    self.close_connection = True
                    owner._record_request(method, req_path, forced, range_hdr, 0)
                    return

                with owner._lock:
                    redir = owner._redirects.get(req_path)
                    route = owner._routes.get(req_path)

                if redir is not None:
                    dst, status = redir
                    if dst.startswith("/"):
                        location = owner.url_for(dst)
                    else:
                        location = dst
                    self.send_response(status)
                    self.send_header("Location", location)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    owner._record_request(method, req_path, status, range_hdr, 0)
                    return

                if route is None:
                    body = b"Not Found"
                    self.send_response(404)
                    self.send_header("Content-Type", "text/plain")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    if method == "GET":
                        self.wfile.write(body)
                    owner._record_request(method, req_path, 404, range_hdr, 0)
                    return

                source, ctype = route
                total_len = len(source) if isinstance(source, bytes) else source.stat().st_size

                if range_hdr and owner.allow_range:
                    parsed_range = _parse_single_range(range_hdr, total_len)
                    if parsed_range is None:
                        self.send_response(416)
                        self.send_header("Content-Range", f"bytes */{total_len}")
                        self.send_header("Content-Length", "0")
                        self.end_headers()
                        owner._record_request(method, req_path, 416, range_hdr, 0, counted_range=True)
                        return
                    start, end = parsed_range
                    payload, _ = owner._read_payload(source, start, end)
                    payload = owner._apply_corruption(req_path, payload)
                    trunc = owner._check_truncation(req_path)
                    delay = owner._get_throttle(req_path)

                    self.send_response(206)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", f"bytes {start}-{end}/{total_len}")
                    self.send_header("Content-Length", str(len(payload)))
                    if trunc is not None:
                        self.send_header("Connection", "close")
                    self.end_headers()

                    to_send = payload[:trunc] if trunc is not None else payload
                    expected_sent = len(to_send) if method == "GET" else 0
                    owner._record_request(
                        method, req_path, 206, range_hdr, expected_sent, counted_range=True
                    )
                    if method == "GET":
                        self._write_body(to_send, delay)
                        if trunc is not None:
                            self.close_connection = True
                    return

                # Full 200 OK response
                payload, _ = owner._read_payload(source)
                payload = owner._apply_corruption(req_path, payload)
                trunc = owner._check_truncation(req_path)
                delay = owner._get_throttle(req_path)

                self.send_response(200)
                self.send_header("Content-Type", ctype)
                if owner.allow_range:
                    self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(len(payload)))
                if trunc is not None:
                    self.send_header("Connection", "close")
                self.end_headers()

                to_send = payload[:trunc] if trunc is not None else payload
                expected_sent = len(to_send) if method == "GET" else 0
                owner._record_request(
                    method, req_path, 200, range_hdr, expected_sent, counted_range=False
                )
                if method == "GET":
                    self._write_body(to_send, delay)
                    if trunc is not None:
                        self.close_connection = True

            def _write_body(self, data: bytes, delay: float) -> int:
                if delay <= 0:
                    try:
                        self.wfile.write(data)
                        self.wfile.flush()
                        return len(data)
                    except (BrokenPipeError, ConnectionResetError):
                        return 0
                sent = 0
                step = 4096
                for off in range(0, len(data), step):
                    time.sleep(delay)
                    chunk = data[off : off + step]
                    try:
                        self.wfile.write(chunk)
                        self.wfile.flush()
                        sent += len(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        break
                return sent

        self._httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self._httpd.daemon_threads = True
        self.port = self._httpd.server_address[1]
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None

    def __enter__(self) -> "DeltaTestServer":
        return self.start()

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.stop()
