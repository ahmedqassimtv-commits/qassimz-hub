"""QASSIMZ Hub — GitHub-Releases-native Delta / Differential Update Engine.

Pure Python 3.12 stdlib runtime client that updates installed QASSIMZ apps and
Adobe CEP extensions by downloading ONLY changed files and 64 KiB chunks from a
single `.qpkg` archive on GitHub Releases via HTTP `Range` requests.

Key guarantees:
  - Strict path traversal & schema validation of remote `manifest.json`
  - Redirect-safe HTTP `Range: bytes=start-end` fetching (301/302/307/308)
  - Adjacent range coalescing for minimal HTTP round-trips
  - Per-chunk AND full-file SHA-256 verification before touching `install_dir`
  - Staged atomic swap with backup & automatic rollback on write/swap failure
  - Graceful cancellation & live byte/chunk/savings telemetry
  - Clean fallback signals (`fallback_needed=True`) so TaskQueue falls back to
    full `Setup.exe` whenever delta update is ineligible or fails
"""
from __future__ import annotations

import dataclasses
import datetime as _dt
import hashlib
import http.client
import json
import os
import re
import shutil
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from pathlib import Path
from typing import Any, Callable

try:
    import certifi
except Exception:
    certifi = None

UA = "QASSIMZ-Hub-Delta/1.4"
VERSION_STAMP_NAME = ".qassimz-version.json"
FORMAT_VERSION = 1
DEFAULT_CHUNK_SIZE = 65536
DEFAULT_MAX_GAP = 16384
DEFAULT_MAX_BATCH_BYTES = 4 * 1024 * 1024  # 4 MiB
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_WIN_DRIVE_RE = re.compile(r"^[A-Za-z]:")


class DeltaError(RuntimeError):
    """Base error for delta update operations."""


class DeltaCancelled(DeltaError):
    """Raised internally when a delta update is cancelled by the user."""


class DeltaManifestError(DeltaError):
    """Raised when a remote manifest is missing, malformed, or unsafe."""


class DeltaHashError(DeltaError):
    """Raised when SHA-256 verification fails on any chunk or file."""


def _ssl_context() -> ssl.SSLContext:
    if certifi is not None:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl.create_default_context()


class _RangePreservingRedirectHandler(urllib.request.HTTPRedirectHandler):
    """HTTP redirect handler that preserves `Range` & `User-Agent` headers across 301/302/303/307/308."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is None:
            return None
        for hdr in ("Range", "User-Agent"):
            val = req.get_header(hdr)
            if val is not None:
                new_req.add_header(hdr, val)
        return new_req


def _build_opener() -> urllib.request.OpenerDirector:
    https_handler = urllib.request.HTTPSHandler(context=_ssl_context())
    return urllib.request.build_opener(_RangePreservingRedirectHandler(), https_handler)


def _validate_rel_path(rel_path: str) -> str:
    if not isinstance(rel_path, str) or not rel_path:
        raise DeltaManifestError("Manifest file path must be a non-empty string.")
    if "\x00" in rel_path or "\\" in rel_path:
        raise DeltaManifestError(f"Unsafe manifest path: {rel_path!r}")
    if rel_path.startswith("/") or rel_path.endswith("/") or _WIN_DRIVE_RE.match(rel_path):
        raise DeltaManifestError(f"Unsafe absolute/drive manifest path: {rel_path!r}")
    parts = rel_path.split("/")
    for part in parts:
        if part in ("", ".", ".."):
            raise DeltaManifestError(f"Unsafe traversal segment in manifest path: {rel_path!r}")
    return rel_path


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def validate_manifest(manifest: Any) -> dict[str, Any]:
    """Validate remote `manifest.json` structure and reject unsafe paths/offsets."""
    if not isinstance(manifest, dict):
        raise DeltaManifestError("Manifest root must be a JSON object.")
    if manifest.get("format_version") != FORMAT_VERSION:
        raise DeltaManifestError(f"Unsupported manifest format_version: {manifest.get('format_version')!r}")
    compression = manifest.get("compression", "zlib")
    if compression not in ("zlib", "zstd"):
        raise DeltaManifestError(f"Unsupported compression codec: {compression!r}")
    qpkg_filename = manifest.get("qpkg_filename")
    if not isinstance(qpkg_filename, str) or not qpkg_filename or "/" in qpkg_filename or "\\" in qpkg_filename or ".." in qpkg_filename:
        raise DeltaManifestError(f"Invalid qpkg_filename: {qpkg_filename!r}")
    qpkg_size = manifest.get("qpkg_size")
    if not _is_int(qpkg_size) or qpkg_size < 8:
        raise DeltaManifestError(f"Invalid qpkg_size: {qpkg_size!r}")
    files = manifest.get("files")
    if not isinstance(files, list):
        raise DeltaManifestError("Manifest 'files' must be a list.")

    seen_paths: set[str] = set()
    for entry in files:
        if not isinstance(entry, dict):
            raise DeltaManifestError("Manifest file entry must be an object.")
        path = _validate_rel_path(entry.get("path", ""))
        if path in seen_paths:
            raise DeltaManifestError(f"Duplicate path in manifest: {path!r}")
        seen_paths.add(path)
        sha = entry.get("sha256", "")
        if not isinstance(sha, str) or not _HEX64_RE.match(sha):
            raise DeltaManifestError(f"Invalid sha256 for {path!r}")
        raw_size = entry.get("raw_size")
        if not _is_int(raw_size) or raw_size < 0:
            raise DeltaManifestError(f"Invalid raw_size for {path!r}")

        if "chunks" in entry:
            chunks = entry["chunks"]
            if not isinstance(chunks, list) or not chunks:
                raise DeltaManifestError(f"Invalid chunks list for {path!r}")
            total_chunk_raw = 0
            for idx, ch in enumerate(chunks):
                if not isinstance(ch, dict):
                    raise DeltaManifestError(f"Chunk {idx} for {path!r} must be an object.")
                c_sha = ch.get("sha256", "")
                if not isinstance(c_sha, str) or not _HEX64_RE.match(c_sha):
                    raise DeltaManifestError(f"Invalid chunk sha256 for {path!r}[{idx}]")
                off = ch.get("offset")
                csz = ch.get("comp_size")
                rsz = ch.get("raw_size")
                if not (_is_int(off) and _is_int(csz) and _is_int(rsz)):
                    raise DeltaManifestError(f"Invalid chunk integers for {path!r}[{idx}]")
                if off < 8 or csz <= 0 or rsz < 0 or off + csz > qpkg_size:
                    raise DeltaManifestError(f"Chunk range out of bounds for {path!r}[{idx}]")
                total_chunk_raw += rsz
            if total_chunk_raw != raw_size:
                raise DeltaManifestError(f"Chunk raw_size sum mismatch for {path!r}")
        else:
            off = entry.get("offset")
            csz = entry.get("comp_size")
            if not (_is_int(off) and _is_int(csz)):
                raise DeltaManifestError(f"Invalid offset/comp_size for {path!r}")
            if off < 8 or csz <= 0 or off + csz > qpkg_size:
                raise DeltaManifestError(f"Blob range out of bounds for {path!r}")
    return manifest


def _decompress(data: bytes, compression: str) -> bytes:
    if compression == "zlib":
        try:
            return zlib.decompress(data)
        except zlib.error as exc:
            raise DeltaHashError(f"zlib decompression failed: {exc}") from exc
    if compression == "zstd":
        try:
            import zstandard  # type: ignore[import-not-found]
            return zstandard.ZstdDecompressor().decompress(data)
        except Exception as exc:
            raise DeltaHashError(f"zstd decompression failed: {exc}") from exc
    raise DeltaManifestError(f"Unsupported compression: {compression!r}")


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            buf = fh.read(262144)
            if not buf:
                break
            h.update(buf)
    return h.hexdigest()


@dataclasses.dataclass
class RangeItem:
    """Single compressed blob range inside a `.qpkg` archive."""
    offset: int
    length: int
    path: str = ""
    chunk_index: int | None = None
    expected_sha256: str = ""
    raw_size: int = 0

    @property
    def end(self) -> int:
        return self.offset + self.length - 1


@dataclasses.dataclass
class CoalescedRange:
    """Contiguous HTTP Range batch containing one or more RangeItems."""
    start: int
    end: int
    items: list[RangeItem]

    @property
    def length(self) -> int:
        return self.end - self.start + 1


@dataclasses.dataclass
class DeltaPlan:
    """Computed diff plan between remote `manifest.json` and local `install_dir`."""
    manifest: dict[str, Any]
    range_items: list[RangeItem]
    files_to_update: list[dict[str, Any]]
    files_reused: int
    files_reused_paths: list[str]
    obsolete_files: list[str]
    chunks_to_download: int
    chunks_reused: int
    reused_chunks_map: dict[str, dict[int, tuple[int, int]]]  # rel_path -> {chunk_idx: (file_offset, raw_size)}
    total_download_bytes: int
    full_package_bytes: int
    total_raw_size: int

    @property
    def saved_bytes(self) -> int:
        return max(0, self.full_package_bytes - self.total_download_bytes)

    @property
    def saved_pct(self) -> float:
        if self.full_package_bytes <= 0:
            return 0.0
        return round(max(0.0, min(100.0, (self.saved_bytes / self.full_package_bytes) * 100.0)), 1)


@dataclasses.dataclass
class DeltaResult:
    """Result returned by `DeltaUpdater.apply_delta_update`."""
    ok: bool = False
    fallback_needed: bool = False
    fallback_reason: str = ""
    cancelled: bool = False
    downloaded_bytes: int = 0
    full_package_bytes: int = 0
    saved_bytes: int = 0
    saved_pct: float = 0.0
    files_updated: int = 0
    files_reused: int = 0
    files_pruned: int = 0
    chunks_downloaded: int = 0
    chunks_reused: int = 0
    rolled_back: bool = False
    error: str = ""
    staged_dir: str = ""

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def write_version_stamp(install_dir: Path, app_id: str, version: str, method: str = "delta") -> Path:
    """Atomically write `<install_dir>/.qassimz-version.json`."""
    stamp_path = install_dir / VERSION_STAMP_NAME
    payload = {
        "app_id": str(app_id),
        "version": str(version),
        "updated_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": method,
    }
    tmp = install_dir / f"{VERSION_STAMP_NAME}.tmp.{os.getpid()}"
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, stamp_path)
    return stamp_path


def _update_hkcu_display_version(item: dict[str, Any], version: str) -> None:
    """Best-effort update of HKCU Uninstall DisplayVersion on Windows after delta swap."""
    if sys.platform != "win32":
        return
    det = item.get("detection") or {}
    key_prefix = (det.get("uninstall_key_prefix") or "").lower()
    if not key_prefix:
        return
    try:
        import winreg  # type: ignore[import-not-found]
        root_sub = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, root_sub) as root:
            idx = 0
            while True:
                try:
                    sub_name = winreg.EnumKey(root, idx)
                except OSError:
                    break
                idx += 1
                if sub_name.lower().startswith(key_prefix):
                    try:
                        with winreg.OpenKey(
                            winreg.HKEY_CURRENT_USER,
                            f"{root_sub}\\{sub_name}",
                            0,
                            winreg.KEY_SET_VALUE,
                        ) as sk:
                            winreg.SetValueEx(sk, "DisplayVersion", 0, winreg.REG_SZ, str(version))
                    except OSError:
                        pass
    except Exception:
        pass


class DeltaUpdater:
    """Runtime differential update engine for QASSIMZ Hub."""

    def __init__(self, *, timeout: float = 30.0, max_gap: int = DEFAULT_MAX_GAP, max_batch_bytes: int = DEFAULT_MAX_BATCH_BYTES):
        self.timeout = float(timeout)
        self.max_gap = int(max_gap)
        self.max_batch_bytes = int(max_batch_bytes)
        self._opener = _build_opener()

    @staticmethod
    def check_writable(install_dir: Path) -> bool:
        """Return True if `install_dir` exists and is writable without elevation."""
        try:
            d = Path(install_dir)
            if not d.exists() or not d.is_dir():
                return False
            probe = d / f".qassimz_write_probe_{os.getpid()}_{time.time_ns()}.tmp"
            with probe.open("wb") as fh:
                fh.write(b"ok")
            probe.unlink(missing_ok=True)
            return True
        except Exception:
            return False

    @staticmethod
    def candidate_manifest_urls(item: dict[str, Any]) -> list[str]:
        urls: list[str] = []
        direct_m = (item.get("delta_manifest_url") or "").strip()
        if direct_m:
            urls.append(direct_m)
        repo = (item.get("repo") or "").strip()
        ver = (item.get("version") or "").strip().lstrip("v")
        if repo and ver:
            u = f"https://github.com/{repo}/releases/download/v{ver}/manifest.json"
            if u not in urls:
                urls.append(u)
        return urls

    @staticmethod
    def candidate_qpkg_urls(item: dict[str, Any], manifest: dict[str, Any], resolved_manifest_url: str) -> list[str]:
        urls: list[str] = []
        direct_q = (item.get("delta_qpkg_url") or "").strip()
        if direct_q:
            urls.append(direct_q)
        qpkg_name = manifest.get("qpkg_filename", "")
        if resolved_manifest_url and qpkg_name:
            sibling = urllib.parse.urljoin(resolved_manifest_url, qpkg_name)
            if sibling not in urls:
                urls.append(sibling)
        repo = (item.get("repo") or "").strip()
        ver = (item.get("version") or manifest.get("version") or "").strip().lstrip("v")
        if repo and ver and qpkg_name:
            u = f"https://github.com/{repo}/releases/download/v{ver}/{qpkg_name}"
            if u not in urls:
                urls.append(u)
        return urls

    def fetch_manifest(self, manifest_urls: list[str], timeout: float | None = None) -> tuple[dict[str, Any], str]:
        """Fetch and validate `manifest.json` from the first working candidate URL."""
        eff_timeout = self.timeout if timeout is None else float(timeout)
        last_err: Exception | None = None
        for url in manifest_urls:
            if not url:
                continue
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with self._opener.open(req, timeout=eff_timeout) as resp:
                    status = getattr(resp, "status", 200)
                    if status >= 400:
                        raise DeltaManifestError(f"HTTP {status} fetching manifest")
                    raw = resp.read(16 * 1024 * 1024)  # 16 MiB safety cap
                    resolved_url = resp.geturl() or url
                data = json.loads(raw.decode("utf-8"))
                return validate_manifest(data), resolved_url
            except DeltaManifestError:
                raise
            except Exception as exc:
                last_err = exc
        raise DeltaManifestError(f"Unable to fetch manifest.json: {last_err}")

    def compute_plan(self, manifest: dict[str, Any], install_dir: Path) -> DeltaPlan:
        """Scan `install_dir` and compute exact files/chunks to download, reuse, or prune."""
        manifest = validate_manifest(manifest)
        root = Path(install_dir)
        chunk_size = int(manifest.get("chunk_size") or DEFAULT_CHUNK_SIZE)
        files = manifest["files"]

        manifest_paths: set[str] = set()
        range_items: list[RangeItem] = []
        files_to_update: list[dict[str, Any]] = []
        files_reused: list[str] = []
        reused_chunks_map: dict[str, dict[int, tuple[int, int]]] = {}
        chunks_to_download = 0
        chunks_reused = 0
        total_download_bytes = 0

        for entry in files:
            rel = entry["path"]
            manifest_paths.add(rel)
            local_path = root / rel

            if local_path.is_file():
                try:
                    if local_path.stat().st_size == entry["raw_size"] and _sha256_file(local_path) == entry["sha256"]:
                        files_reused.append(rel)
                        if "chunks" in entry:
                            chunks_reused += len(entry["chunks"])
                        continue
                except OSError:
                    pass

            files_to_update.append(entry)
            if "chunks" in entry:
                # Hash local file chunks by block index for partial chunk reuse
                local_chunk_hashes: dict[str, tuple[int, int]] = {}
                if local_path.is_file():
                    try:
                        with local_path.open("rb") as fh:
                            off = 0
                            while True:
                                buf = fh.read(chunk_size)
                                if not buf:
                                    break
                                ch_hash = hashlib.sha256(buf).hexdigest()
                                if ch_hash not in local_chunk_hashes:
                                    local_chunk_hashes[ch_hash] = (off, len(buf))
                                off += len(buf)
                    except OSError:
                        local_chunk_hashes = {}

                reused_for_file: dict[int, tuple[int, int]] = {}
                for idx, ch in enumerate(entry["chunks"]):
                    match = local_chunk_hashes.get(ch["sha256"])
                    if match is not None and match[1] == ch["raw_size"]:
                        reused_for_file[idx] = match
                        chunks_reused += 1
                    else:
                        ri = RangeItem(
                            offset=int(ch["offset"]),
                            length=int(ch["comp_size"]),
                            path=rel,
                            chunk_index=idx,
                            expected_sha256=ch["sha256"],
                            raw_size=int(ch["raw_size"]),
                        )
                        range_items.append(ri)
                        chunks_to_download += 1
                        total_download_bytes += ri.length
                if reused_for_file:
                    reused_chunks_map[rel] = reused_for_file
            else:
                ri = RangeItem(
                    offset=int(entry["offset"]),
                    length=int(entry["comp_size"]),
                    path=rel,
                    chunk_index=None,
                    expected_sha256=entry["sha256"],
                    raw_size=int(entry["raw_size"]),
                )
                range_items.append(ri)
                chunks_to_download += 1
                total_download_bytes += ri.length

        # Find obsolete files in install_dir (never prune VERSION_STAMP_NAME or temp dirs)
        obsolete_files: list[str] = []
        if root.exists() and root.is_dir():
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = sorted(d for d in dirnames if not d.startswith(".qassimz-delta-"))
                for fname in sorted(filenames):
                    if fname == VERSION_STAMP_NAME or fname.startswith(".qassimz_write_probe_") or fname.startswith(VERSION_STAMP_NAME + ".tmp."):
                        continue
                    full = Path(dirpath) / fname
                    rel_posix = full.relative_to(root).as_posix()
                    if rel_posix not in manifest_paths:
                        obsolete_files.append(rel_posix)

        return DeltaPlan(
            manifest=manifest,
            range_items=range_items,
            files_to_update=files_to_update,
            files_reused=len(files_reused),
            files_reused_paths=files_reused,
            obsolete_files=obsolete_files,
            chunks_to_download=chunks_to_download,
            chunks_reused=chunks_reused,
            reused_chunks_map=reused_chunks_map,
            total_download_bytes=total_download_bytes,
            full_package_bytes=int(manifest.get("qpkg_size") or 0),
            total_raw_size=int(manifest.get("total_raw_size") or 0),
        )

    def coalesce_ranges(
        self,
        items: list[RangeItem],
        max_gap: int | None = None,
        max_batch_bytes: int | None = None,
    ) -> list[CoalescedRange]:
        """Sort and merge adjacent/nearby RangeItems into efficient HTTP Range batches."""
        if not items:
            return []
        eff_gap = self.max_gap if max_gap is None else int(max_gap)
        eff_max_batch = self.max_batch_bytes if max_batch_bytes is None else int(max_batch_bytes)

        ordered = sorted(items, key=lambda x: (x.offset, x.length))
        batches: list[CoalescedRange] = []

        cur_start = ordered[0].offset
        cur_end = ordered[0].end
        cur_items: list[RangeItem] = [ordered[0]]

        for ri in ordered[1:]:
            gap = ri.offset - (cur_end + 1)
            proposed_end = max(cur_end, ri.end)
            proposed_len = proposed_end - cur_start + 1
            if gap <= eff_gap and proposed_len <= eff_max_batch:
                cur_end = proposed_end
                cur_items.append(ri)
            else:
                batches.append(CoalescedRange(start=cur_start, end=cur_end, items=cur_items))
                cur_start = ri.offset
                cur_end = ri.end
                cur_items = [ri]

        batches.append(CoalescedRange(start=cur_start, end=cur_end, items=cur_items))
        return batches

    def _fetch_range_bytes(
        self,
        qpkg_urls: list[str],
        start: int,
        end: int,
        *,
        cancel_check: Callable[[], bool] | None = None,
        on_chunk: Callable[[int], None] | None = None,
    ) -> bytes:
        """Fetch exact byte range `[start, end]` inclusive, preserving Range across redirects."""
        expected_len = end - start + 1
        last_err: Exception | None = None

        for url in qpkg_urls:
            for attempt in range(2):
                if cancel_check and cancel_check():
                    raise DeltaCancelled("Cancelled during download")
                try:
                    req = urllib.request.Request(
                        url,
                        headers={
                            "User-Agent": UA,
                            "Range": f"bytes={start}-{end}",
                        },
                    )
                    with self._opener.open(req, timeout=self.timeout) as resp:
                        status = getattr(resp, "status", 200)
                        if status == 416:
                            raise DeltaError(f"HTTP 416 Range Not Satisfiable for bytes={start}-{end}")
                        if status not in (200, 206):
                            raise DeltaError(f"Unexpected HTTP {status} for Range request")

                        buf = bytearray()
                        while True:
                            if cancel_check and cancel_check():
                                raise DeltaCancelled("Cancelled during download")
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            buf.extend(chunk)
                            if on_chunk:
                                on_chunk(len(chunk))

                        data = bytes(buf)
                        if status == 200:
                            # Server ignored Range and sent full body; slice requested range
                            if len(data) < end + 1:
                                raise DeltaError(f"Short 200 response ({len(data)} < {end + 1})")
                            return data[start : end + 1]
                        if len(data) != expected_len:
                            raise DeltaError(f"Short 206 response ({len(data)} != {expected_len})")
                        return data
                except DeltaCancelled:
                    raise
                except urllib.error.HTTPError as exc:
                    if exc.code == 416:
                        raise DeltaError(f"HTTP 416 Range Not Satisfiable for bytes={start}-{end}") from exc
                    last_err = exc
                except (urllib.error.URLError, http.client.HTTPException, OSError, DeltaError) as exc:
                    last_err = exc
                if attempt == 0:
                    time.sleep(0.25)

        raise DeltaError(f"Failed downloading range {start}-{end}: {last_err}")

    def apply_delta_update(
        self,
        item: dict[str, Any],
        install_dir: Path,
        cache_dir: Path,
        *,
        cancel_check: Callable[[], bool] | None = None,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
        stage_only: bool = False,
    ) -> DeltaResult:
        """Execute full delta update lifecycle with verification, atomic swap, and rollback."""
        root = Path(install_dir)
        cache = Path(cache_dir)
        cache.mkdir(parents=True, exist_ok=True)
        res = DeltaResult()

        def emit(stage: str, **fields: Any) -> None:
            if on_progress:
                payload = {"update_mode": "delta", "stage": stage}
                payload.update(fields)
                try:
                    on_progress(payload)
                except Exception:
                    pass

        def check_cancel() -> None:
            if cancel_check and cancel_check():
                raise DeltaCancelled("Delta update cancelled")

        # 1. Pre-flight eligibility checks
        if not root.exists() or not root.is_dir():
            res.fallback_needed = True
            res.fallback_reason = "not_installed"
            res.error = "Install directory does not exist"
            return res

        if not stage_only and not self.check_writable(root):
            res.fallback_needed = True
            res.fallback_reason = "unwritable_dir"
            res.error = "Install directory is not writable without elevation"
            return res

        # 2. Fetch manifest.json
        manifest_urls = self.candidate_manifest_urls(item)
        if not manifest_urls:
            res.fallback_needed = True
            res.fallback_reason = "no_manifest"
            res.error = "No manifest.json URL available"
            return res

        try:
            check_cancel()
            emit("manifest", progress=2)
            manifest, resolved_manifest_url = self.fetch_manifest(manifest_urls)
        except DeltaCancelled:
            res.cancelled = True
            return res
        except DeltaManifestError as exc:
            res.fallback_needed = True
            res.fallback_reason = "no_manifest"
            res.error = str(exc)
            return res

        # 3. Scan installed directory & compute diff plan
        try:
            check_cancel()
            emit("scanning", progress=6, delta_full_size=int(manifest.get("qpkg_size") or 0))
            plan = self.compute_plan(manifest, root)
        except DeltaCancelled:
            res.cancelled = True
            return res
        except Exception as exc:
            res.fallback_needed = True
            res.fallback_reason = "scan_error"
            res.error = str(exc)
            return res

        res.full_package_bytes = plan.full_package_bytes
        res.files_reused = plan.files_reused
        res.chunks_reused = plan.chunks_reused
        res.saved_bytes = plan.saved_bytes
        res.saved_pct = plan.saved_pct

        qpkg_urls = self.candidate_qpkg_urls(item, manifest, resolved_manifest_url)
        compression = manifest.get("compression", "zlib")
        batches = self.coalesce_ranges(plan.range_items)
        total_chunks = plan.chunks_to_download
        total_dl_target = plan.total_download_bytes

        emit(
            "downloading",
            progress=10,
            downloaded=0,
            total=total_dl_target,
            delta_full_size=plan.full_package_bytes,
            delta_saved_bytes=plan.saved_bytes,
            delta_saved_pct=plan.saved_pct,
            delta_chunks_done=0,
            delta_chunks_total=total_chunks,
        )

        # 4. Download ONLY needed ranges and verify every blob SHA-256
        downloaded_blobs: dict[tuple[str, int | None], bytes] = {}
        downloaded_bytes_actual = 0
        chunks_done = 0
        t0 = time.monotonic()

        try:
            for batch in batches:
                check_cancel()

                def _on_net_chunk(n: int) -> None:
                    nonlocal downloaded_bytes_actual
                    downloaded_bytes_actual += n
                    elapsed = max(0.05, time.monotonic() - t0)
                    speed = int(downloaded_bytes_actual / elapsed)
                    rem = max(0, total_dl_target - downloaded_bytes_actual)
                    eta = int(rem / speed) if (rem > 0 and speed > 0) else 0
                    pct = 10 + int(min(1.0, downloaded_bytes_actual / max(1, total_dl_target)) * 68)
                    emit(
                        "downloading",
                        progress=pct,
                        downloaded=downloaded_bytes_actual,
                        total=total_dl_target,
                        speed_bps=speed,
                        eta_sec=eta,
                        delta_full_size=plan.full_package_bytes,
                        delta_saved_bytes=max(0, plan.full_package_bytes - downloaded_bytes_actual),
                        delta_saved_pct=round(
                            max(0.0, min(100.0, ((plan.full_package_bytes - downloaded_bytes_actual) / max(1, plan.full_package_bytes)) * 100.0)),
                            1,
                        ),
                        delta_chunks_done=chunks_done,
                        delta_chunks_total=total_chunks,
                    )

                batch_bytes = self._fetch_range_bytes(
                    qpkg_urls,
                    batch.start,
                    batch.end,
                    cancel_check=cancel_check,
                    on_chunk=_on_net_chunk,
                )

                for ri in batch.items:
                    rel_off = ri.offset - batch.start
                    comp_blob = batch_bytes[rel_off : rel_off + ri.length]
                    raw_blob = _decompress(comp_blob, compression)
                    if len(raw_blob) != ri.raw_size:
                        raise DeltaHashError(f"Decompressed size mismatch for {ri.path}#{ri.chunk_index}")
                    actual_sha = hashlib.sha256(raw_blob).hexdigest()
                    if actual_sha != ri.expected_sha256:
                        raise DeltaHashError(f"SHA-256 mismatch for {ri.path}#{ri.chunk_index}")
                    downloaded_blobs[(ri.path, ri.chunk_index)] = raw_blob
                    chunks_done += 1

                emit(
                    "downloading",
                    progress=10 + int((chunks_done / max(1, total_chunks)) * 68),
                    downloaded=downloaded_bytes_actual,
                    total=total_dl_target,
                    delta_chunks_done=chunks_done,
                    delta_chunks_total=total_chunks,
                )
        except DeltaCancelled:
            res.cancelled = True
            return res
        except DeltaHashError as exc:
            res.fallback_needed = True
            res.fallback_reason = "hash_mismatch"
            res.error = str(exc)
            return res
        except Exception as exc:
            res.fallback_needed = True
            res.fallback_reason = "download_error"
            res.error = str(exc)
            return res

        res.downloaded_bytes = downloaded_bytes_actual
        res.chunks_downloaded = chunks_done
        res.saved_bytes = max(0, plan.full_package_bytes - downloaded_bytes_actual)
        res.saved_pct = round(
            max(0.0, min(100.0, (res.saved_bytes / max(1, plan.full_package_bytes)) * 100.0)),
            1,
        )

        # 5. Stage reconstructed files and verify full-file SHA-256
        stage_dir = Path(tempfile.mkdtemp(prefix=f"qpkg_stage_{item.get('id', 'app')}_", dir=str(cache)))
        try:
            check_cancel()
            emit("verifying", progress=82, delta_chunks_done=chunks_done, delta_chunks_total=total_chunks)

            staged_rel_paths: list[str] = []
            for entry in plan.files_to_update:
                check_cancel()
                rel = entry["path"]
                dst = stage_dir / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                hasher = hashlib.sha256()

                if "chunks" in entry:
                    reused_map = plan.reused_chunks_map.get(rel, {})
                    local_src = root / rel
                    local_fh = local_src.open("rb") if reused_map and local_src.is_file() else None
                    try:
                        with dst.open("wb") as out_fh:
                            for idx, ch in enumerate(entry["chunks"]):
                                if idx in reused_map and local_fh is not None:
                                    off, rsz = reused_map[idx]
                                    local_fh.seek(off)
                                    data = local_fh.read(rsz)
                                    if len(data) != rsz or hashlib.sha256(data).hexdigest() != ch["sha256"]:
                                        raise DeltaHashError(f"Reused local chunk mismatch for {rel}[{idx}]")
                                else:
                                    data = downloaded_blobs[(rel, idx)]
                                out_fh.write(data)
                                hasher.update(data)
                    finally:
                        if local_fh is not None:
                            local_fh.close()
                else:
                    data = downloaded_blobs[(rel, None)]
                    dst.write_bytes(data)
                    hasher.update(data)

                if hasher.hexdigest() != entry["sha256"]:
                    raise DeltaHashError(f"Reconstructed full-file SHA-256 mismatch for {rel}")
                staged_rel_paths.append(rel)

            if stage_only:
                # Copy unchanged files into stage_dir so it is a complete self-contained image
                for rel in plan.files_reused_paths:
                    src = root / rel
                    dst = stage_dir / rel
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
                write_version_stamp(
                    stage_dir,
                    item.get("id") or manifest.get("app_id") or "qassimz-hub",
                    manifest.get("version") or item.get("version") or "",
                    method="delta",
                )
                res.ok = True
                res.files_updated = len(staged_rel_paths)
                res.files_pruned = len(plan.obsolete_files)
                res.staged_dir = str(stage_dir)
                emit("completed", progress=100, delta_saved_bytes=res.saved_bytes, delta_saved_pct=res.saved_pct)
                return res
        except DeltaCancelled:
            shutil.rmtree(stage_dir, ignore_errors=True)
            res.cancelled = True
            return res
        except DeltaHashError as exc:
            shutil.rmtree(stage_dir, ignore_errors=True)
            res.fallback_needed = True
            res.fallback_reason = "hash_mismatch"
            res.error = str(exc)
            return res
        except Exception as exc:
            shutil.rmtree(stage_dir, ignore_errors=True)
            res.fallback_needed = True
            res.fallback_reason = "apply_error"
            res.error = str(exc)
            return res

        # 6. Atomic swap with backup & automatic rollback on failure
        backup_dir = root / f".qassimz-delta-backup-{os.getpid()}-{time.time_ns()}"
        backed_up: list[tuple[str, Path]] = []
        created_new: list[str] = []
        created_tmps: list[Path] = []
        pruned_count = 0

        try:
            check_cancel()
            emit("applying", progress=90)
            backup_dir.mkdir(parents=True, exist_ok=True)

            # Swap updated/new files
            for rel in staged_rel_paths:
                src_staged = stage_dir / rel
                target = root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    bk = backup_dir / rel
                    bk.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(target, bk)
                    backed_up.append((rel, bk))
                else:
                    created_new.append(rel)
                # Copy into temp beside target then atomic os.replace (works cross-device)
                tmp_target = target.parent / f".{target.name}.qdelta.{os.getpid()}"
                created_tmps.append(tmp_target)
                shutil.copy2(src_staged, tmp_target)
                os.replace(tmp_target, target)

            # Prune obsolete files (gracefully tolerate locked files on Windows)
            for rel in plan.obsolete_files:
                target = root / rel
                if not target.exists():
                    continue
                try:
                    bk = backup_dir / rel
                    bk.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(target, bk)
                    backed_up.append((rel, bk))
                    target.unlink()
                    pruned_count += 1
                except OSError:
                    # Locked file on Windows — leave it rather than failing the whole update
                    pass

            # Remove empty parent directories left after pruning
            for rel in plan.obsolete_files:
                parent = (root / rel).parent
                while parent != root and parent.exists():
                    try:
                        parent.rmdir()
                        parent = parent.parent
                    except OSError:
                        break

            # Stamp updated version
            target_ver = str(manifest.get("version") or item.get("version") or "")
            write_version_stamp(root, item.get("id") or manifest.get("app_id") or "", target_ver, method="delta")
            _update_hkcu_display_version(item, target_ver)

            res.ok = True
            res.files_updated = len(staged_rel_paths)
            res.files_pruned = pruned_count
            emit("completed", progress=100, delta_saved_bytes=res.saved_bytes, delta_saved_pct=res.saved_pct)
            return res

        except Exception as exc:
            # Automatic rollback: clean temp files, remove newly added files & restore backups
            for tmp_p in created_tmps:
                try:
                    tmp_p.unlink(missing_ok=True)
                except OSError:
                    pass
            for rel in created_new:
                try:
                    (root / rel).unlink(missing_ok=True)
                except OSError:
                    pass
            for rel, bk in backed_up:
                try:
                    target = root / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if bk.exists():
                        tmp_restore = target.parent / f".{target.name}.qrestore.{os.getpid()}"
                        try:
                            shutil.copy2(bk, tmp_restore)
                            os.replace(tmp_restore, target)
                        except OSError:
                            tmp_restore.unlink(missing_ok=True)
                            shutil.copy2(bk, target)
                except OSError:
                    pass
            res.ok = False
            res.rolled_back = True
            res.fallback_needed = True
            res.fallback_reason = "apply_error"
            res.error = str(exc)
            return res
        finally:
            shutil.rmtree(backup_dir, ignore_errors=True)
            shutil.rmtree(stage_dir, ignore_errors=True)
