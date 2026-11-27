#!/usr/bin/env python3
"""QASSIMZ QPKG Delta Archive Packager, Verifier, and Inspector.

Standalone Python 3.12 stdlib CLI (no mandatory third-party packages) that packs
an application or CEP extension directory into:
  - <app-id>-v<version>.qpkg : binary container of independently compressed file
    and 64KB chunk blobs directly fetchable via HTTP Range requests.
  - manifest.json            : deterministic JSON index with per-file and
    per-chunk SHA-256 hashes, byte offsets, and sizes.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import sys
import zlib
from pathlib import Path
from typing import Any, Sequence

QPKG_MAGIC = b"QPKG\x00\x01\x00\x00"
FORMAT_VERSION = 1
DEFAULT_CHUNK_SIZE = 65536  # 64 KiB
DEFAULT_CHUNK_THRESHOLD = 1048576  # 1 MiB
DEFAULT_COMPRESSION = "zlib"
SUPPORTED_COMPRESSIONS = ("zlib", "zstd")
ZLIB_LEVEL = 6
HASH_READ_BLOCK = 262144

DEFAULT_EXCLUDES: tuple[str, ...] = (
    ".debug",
    "__pycache__",
    "*.pyc",
    "*.pyo",
    ".git",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    ".qassimz-version.json",
)

_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_WIN_DRIVE_RE = re.compile(r"^[A-Za-z]:")


class QpkgError(ValueError):
    """Raised on QPKG packaging, validation, security, or verification errors."""


def _is_strict_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _load_zstandard() -> Any:
    try:
        import zstandard  # type: ignore[import-not-found]
    except ImportError as exc:
        raise QpkgError(
            "Compression codec 'zstd' requires the optional 'zstandard' package, "
            "which is not installed. Use '--compression zlib' or install 'zstandard'."
        ) from exc
    return zstandard


def compress_bytes(data: bytes, compression: str = DEFAULT_COMPRESSION) -> bytes:
    """Compress a single blob deterministically using the configured codec."""
    if compression == "zlib":
        return zlib.compress(data, level=ZLIB_LEVEL)
    if compression == "zstd":
        zstd = _load_zstandard()
        compressor = zstd.ZstdCompressor(level=3)
        return compressor.compress(data)
    raise QpkgError(f"Unsupported compression codec: {compression!r}")


def decompress_bytes(data: bytes, compression: str = DEFAULT_COMPRESSION) -> bytes:
    """Decompress a single blob using the configured codec."""
    if compression == "zlib":
        try:
            return zlib.decompress(data)
        except zlib.error as exc:
            raise QpkgError(f"zlib decompression failed: {exc}") from exc
    if compression == "zstd":
        zstd = _load_zstandard()
        try:
            decompressor = zstd.ZstdDecompressor()
            return decompressor.decompress(data)
        except Exception as exc:
            raise QpkgError(f"zstd decompression failed: {exc}") from exc
    raise QpkgError(f"Unsupported compression codec: {compression!r}")


def validate_identifier(value: str, field_name: str) -> str:
    """Ensure app_id or version cannot inject path separators or traversal."""
    if not isinstance(value, str) or not value or value.strip() != value:
        raise QpkgError(f"Invalid {field_name}: must be a non-empty string without surrounding whitespace.")
    if "\x00" in value or "/" in value or "\\" in value or ".." in value or value in (".", ".."):
        raise QpkgError(f"Invalid {field_name} {value!r}: contains disallowed path characters.")
    if _WIN_DRIVE_RE.match(value):
        raise QpkgError(f"Invalid {field_name} {value!r}: drive prefixes are not allowed.")
    return value


def normalize_rel_path(rel_path: str, *, strict: bool = False) -> str:
    """Normalize and validate a relative POSIX path inside a QPKG archive."""
    if not isinstance(rel_path, str) or not rel_path:
        raise QpkgError("Relative path must be a non-empty string.")
    if "\x00" in rel_path:
        raise QpkgError(f"Invalid path {rel_path!r}: NUL byte not allowed.")

    if strict and "\\" in rel_path:
        raise QpkgError(f"Invalid canonical manifest path {rel_path!r}: backslashes are not allowed.")

    p = rel_path.replace("\\", "/")

    if p.startswith("/"):
        raise QpkgError(f"Invalid relative path {rel_path!r}: absolute paths are not allowed.")
    if _WIN_DRIVE_RE.match(p):
        raise QpkgError(f"Invalid relative path {rel_path!r}: Windows drive prefixes are not allowed.")

    if not strict:
        while p.startswith("./"):
            p = p[2:]

    if not p or p.startswith("/") or p.endswith("/"):
        raise QpkgError(f"Invalid relative path {rel_path!r}.")

    parts = p.split("/")
    for part in parts:
        if part in ("", ".", ".."):
            raise QpkgError(f"Invalid relative path {rel_path!r}: traversal or empty segment not allowed.")

    return "/".join(parts)


def parse_extra_file_spec(spec: str) -> tuple[Path, str]:
    """Parse '<src>:<rel_dest>' safely, preserving Windows drive letters in <src>."""
    if not isinstance(spec, str) or not spec:
        raise QpkgError(f"Invalid --extra-file spec {spec!r}: expected '<src>:<rel_dest>'.")

    start_idx = 2 if _WIN_DRIVE_RE.match(spec) else 0
    sep_idx = spec.find(":", start_idx)
    if sep_idx == -1:
        raise QpkgError(f"Invalid --extra-file spec {spec!r}: expected '<src>:<rel_dest>'.")

    src_str = spec[:sep_idx]
    rel_dest = spec[sep_idx + 1 :]

    if not src_str.strip() or not rel_dest.strip():
        raise QpkgError(f"Invalid --extra-file spec {spec!r}: both source and destination must be non-empty.")

    normalized_dest = normalize_rel_path(rel_dest, strict=False)
    return Path(src_str), normalized_dest


def is_excluded(rel_posix_path: str, exclude_patterns: Sequence[str]) -> bool:
    """Return True if a normalized POSIX relative path matches any exclude glob."""
    parts = rel_posix_path.split("/")
    for raw_pat in exclude_patterns:
        pat = raw_pat.replace("\\", "/")
        while pat.startswith("./"):
            pat = pat[2:]
        if not pat:
            continue
        if pat.endswith("/"):
            dir_pat = pat.rstrip("/")
            if rel_posix_path == dir_pat or rel_posix_path.startswith(dir_pat + "/"):
                return True
            if any(fnmatch.fnmatchcase(part, dir_pat) for part in parts):
                return True
            continue
        if fnmatch.fnmatchcase(rel_posix_path, pat):
            return True
        if any(fnmatch.fnmatchcase(part, pat) for part in parts):
            return True
    return False


def _collect_tree_files(
    root_dir: Path,
    exclude_patterns: Sequence[str],
    prefix: str = "",
) -> dict[str, Path]:
    """Walk root_dir deterministically, rejecting symlinks and path escapes."""
    resolved_root = root_dir.resolve()
    collected: dict[str, Path] = {}

    for dirpath, dirnames, filenames in os.walk(resolved_root, followlinks=False):
        current_dir = Path(dirpath)
        rel_dir = current_dir.relative_to(resolved_root)
        rel_dir_posix = "" if rel_dir == Path(".") else rel_dir.as_posix()

        # Sort in-place for deterministic traversal and prune excluded directories.
        dirnames.sort()
        filenames.sort()

        kept_dirs: list[str] = []
        for dname in dirnames:
            dpath = current_dir / dname
            local_rel = f"{rel_dir_posix}/{dname}" if rel_dir_posix else dname
            full_rel = f"{prefix}/{local_rel}" if prefix else local_rel
            if is_excluded(local_rel, exclude_patterns) or is_excluded(full_rel, exclude_patterns):
                continue
            if dpath.is_symlink():
                raise QpkgError(f"Symlink directory is not allowed in package input: {full_rel}")
            kept_dirs.append(dname)
        dirnames[:] = kept_dirs

        for fname in filenames:
            fpath = current_dir / fname
            local_rel = f"{rel_dir_posix}/{fname}" if rel_dir_posix else fname
            full_rel = f"{prefix}/{local_rel}" if prefix else local_rel
            if is_excluded(local_rel, exclude_patterns) or is_excluded(full_rel, exclude_patterns):
                continue
            if fpath.is_symlink():
                raise QpkgError(f"Symlink file is not allowed in package input: {full_rel}")
            resolved_file = fpath.resolve()
            if not resolved_file.is_relative_to(resolved_root):
                raise QpkgError(f"Path escapes input directory: {full_rel}")
            if not resolved_file.is_file():
                continue
            canonical = normalize_rel_path(full_rel, strict=True)
            collected[canonical] = resolved_file

    return collected


def pack_directory(
    input_dir: Path | str,
    output_dir: Path | str,
    app_id: str,
    version: str,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_threshold: int = DEFAULT_CHUNK_THRESHOLD,
    compression: str = DEFAULT_COMPRESSION,
    excludes: Sequence[str] | None = None,
    use_default_excludes: bool = True,
    extra_files: Sequence[str | tuple[Path | str, str]] | None = None,
) -> dict[str, Any]:
    """Pack a built application directory into <app_id>-v<version>.qpkg and manifest.json."""
    validate_identifier(app_id, "app_id")
    validate_identifier(version, "version")

    if not _is_strict_int(chunk_size) or chunk_size <= 0:
        raise QpkgError(f"chunk_size must be a positive integer, got {chunk_size!r}.")
    if not _is_strict_int(chunk_threshold) or chunk_threshold < 0:
        raise QpkgError(f"chunk_threshold must be a non-negative integer, got {chunk_threshold!r}.")
    if compression not in SUPPORTED_COMPRESSIONS:
        raise QpkgError(f"Unsupported compression codec: {compression!r}.")
    if compression == "zstd":
        _load_zstandard()

    input_path = Path(input_dir)
    if not input_path.exists() or not input_path.is_dir():
        raise QpkgError(f"Input directory does not exist or is not a directory: {input_path}")

    exclude_patterns: list[str] = list(DEFAULT_EXCLUDES) if use_default_excludes else []
    if excludes:
        exclude_patterns.extend(excludes)

    file_map = _collect_tree_files(input_path, exclude_patterns)

    for entry in extra_files or ():
        if isinstance(entry, str):
            src_path, rel_dest = parse_extra_file_spec(entry)
        else:
            src_raw, dest_raw = entry
            src_path = Path(src_raw)
            rel_dest = normalize_rel_path(dest_raw, strict=False)

        if not src_path.exists():
            raise QpkgError(f"Extra file source does not exist: {src_path}")
        if src_path.is_symlink():
            raise QpkgError(f"Extra file symlink is not allowed: {src_path}")
        if src_path.is_file():
            file_map[rel_dest] = src_path.resolve()
        elif src_path.is_dir():
            extra_tree = _collect_tree_files(src_path, exclude_patterns, prefix=rel_dest)
            file_map.update(extra_tree)
        else:
            raise QpkgError(f"Extra file source must be a regular file or directory: {src_path}")

    sorted_paths = sorted(file_map.keys())

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    qpkg_filename = f"{app_id}-v{version}.qpkg"
    qpkg_path = output_path / qpkg_filename
    manifest_path = output_path / "manifest.json"

    qpkg_hasher = hashlib.sha256()
    files_entries: list[dict[str, Any]] = []
    total_raw_size = 0
    offset = 0

    with qpkg_path.open("wb") as qpkg_f:
        qpkg_f.write(QPKG_MAGIC)
        qpkg_hasher.update(QPKG_MAGIC)
        offset += len(QPKG_MAGIC)

        for rel_path in sorted_paths:
            src = file_map[rel_path]
            raw_size = src.stat().st_size
            total_raw_size += raw_size

            if raw_size > chunk_threshold:
                full_hasher = hashlib.sha256()
                chunks: list[dict[str, Any]] = []
                with src.open("rb") as src_f:
                    while True:
                        chunk_data = src_f.read(chunk_size)
                        if not chunk_data:
                            break
                        full_hasher.update(chunk_data)
                        chunk_sha = hashlib.sha256(chunk_data).hexdigest()
                        comp_blob = compress_bytes(chunk_data, compression)
                        qpkg_f.write(comp_blob)
                        qpkg_hasher.update(comp_blob)
                        chunks.append(
                            {
                                "sha256": chunk_sha,
                                "offset": offset,
                                "comp_size": len(comp_blob),
                                "raw_size": len(chunk_data),
                            }
                        )
                        offset += len(comp_blob)

                files_entries.append(
                    {
                        "path": rel_path,
                        "sha256": full_hasher.hexdigest(),
                        "raw_size": raw_size,
                        "chunks": chunks,
                    }
                )
            else:
                raw_data = src.read_bytes()
                file_sha = hashlib.sha256(raw_data).hexdigest()
                comp_blob = compress_bytes(raw_data, compression)
                qpkg_f.write(comp_blob)
                qpkg_hasher.update(comp_blob)
                files_entries.append(
                    {
                        "path": rel_path,
                        "sha256": file_sha,
                        "raw_size": raw_size,
                        "offset": offset,
                        "comp_size": len(comp_blob),
                    }
                )
                offset += len(comp_blob)

    manifest: dict[str, Any] = {
        "format_version": FORMAT_VERSION,
        "app_id": app_id,
        "version": version,
        "compression": compression,
        "chunk_size": chunk_size,
        "chunk_threshold": chunk_threshold,
        "qpkg_filename": qpkg_filename,
        "qpkg_size": offset,
        "qpkg_sha256": qpkg_hasher.hexdigest(),
        "total_raw_size": total_raw_size,
        "file_count": len(files_entries),
        "files": files_entries,
    }

    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return manifest


def _validate_sha256_field(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _HEX64_RE.match(value):
        raise QpkgError(f"Invalid SHA-256 hex digest for {label}: {value!r}")
    return value


def verify_package(manifest_path: Path | str, qpkg_path: Path | str) -> dict[str, Any]:
    """Verify manifest schema, path safety, QPKG header/hash, and every file/chunk blob."""
    mpath = Path(manifest_path)
    qpath = Path(qpkg_path)

    if not mpath.is_file():
        raise QpkgError(f"Manifest file not found: {mpath}")
    if not qpath.is_file():
        raise QpkgError(f"QPKG file not found: {qpath}")

    try:
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise QpkgError(f"Failed to parse manifest JSON: {exc}") from exc

    if not isinstance(manifest, dict):
        raise QpkgError("Manifest root must be a JSON object.")

    fmt_ver = manifest.get("format_version")
    if not _is_strict_int(fmt_ver) or fmt_ver != FORMAT_VERSION:
        raise QpkgError(f"Unsupported format_version: {fmt_ver!r} (expected {FORMAT_VERSION}).")

    validate_identifier(manifest.get("app_id", ""), "app_id")
    validate_identifier(manifest.get("version", ""), "version")

    compression = manifest.get("compression")
    if compression not in SUPPORTED_COMPRESSIONS:
        raise QpkgError(f"Unsupported compression codec in manifest: {compression!r}.")

    chunk_size = manifest.get("chunk_size")
    chunk_threshold = manifest.get("chunk_threshold")
    if not _is_strict_int(chunk_size) or chunk_size <= 0:
        raise QpkgError(f"Invalid chunk_size in manifest: {chunk_size!r}.")
    if not _is_strict_int(chunk_threshold) or chunk_threshold < 0:
        raise QpkgError(f"Invalid chunk_threshold in manifest: {chunk_threshold!r}.")

    qpkg_size = manifest.get("qpkg_size")
    if not _is_strict_int(qpkg_size) or qpkg_size < len(QPKG_MAGIC):
        raise QpkgError(f"Invalid qpkg_size in manifest: {qpkg_size!r}.")

    expected_qpkg_sha = _validate_sha256_field(manifest.get("qpkg_sha256"), "qpkg_sha256")

    total_raw_size = manifest.get("total_raw_size")
    file_count = manifest.get("file_count")
    files = manifest.get("files")
    if not _is_strict_int(total_raw_size) or total_raw_size < 0:
        raise QpkgError(f"Invalid total_raw_size in manifest: {total_raw_size!r}.")
    if not _is_strict_int(file_count) or file_count < 0:
        raise QpkgError(f"Invalid file_count in manifest: {file_count!r}.")
    if not isinstance(files, list) or len(files) != file_count:
        raise QpkgError(
            f"Manifest file_count mismatch: declared {file_count}, found {len(files) if isinstance(files, list) else type(files).__name__}."
        )

    actual_size = qpath.stat().st_size
    if actual_size != qpkg_size:
        raise QpkgError(f"QPKG size mismatch: manifest declares {qpkg_size} bytes, actual file is {actual_size} bytes.")

    with qpath.open("rb") as qf:
        magic = qf.read(len(QPKG_MAGIC))
        if magic != QPKG_MAGIC:
            raise QpkgError(f"Invalid QPKG magic header: {magic!r}")

        hasher = hashlib.sha256()
        hasher.update(magic)
        while True:
            buf = qf.read(HASH_READ_BLOCK)
            if not buf:
                break
            hasher.update(buf)
        actual_qpkg_sha = hasher.hexdigest()
        if actual_qpkg_sha != expected_qpkg_sha:
            raise QpkgError(
                f"QPKG SHA-256 mismatch: expected {expected_qpkg_sha}, got {actual_qpkg_sha}."
            )

        seen_paths: set[str] = set()
        computed_total_raw = 0
        total_chunks = 0

        for idx, entry in enumerate(files):
            if not isinstance(entry, dict):
                raise QpkgError(f"Manifest files[{idx}] must be an object.")

            rel_path = normalize_rel_path(entry.get("path", ""), strict=True)
            if rel_path in seen_paths:
                raise QpkgError(f"Duplicate path in manifest: {rel_path!r}")
            seen_paths.add(rel_path)

            expected_file_sha = _validate_sha256_field(entry.get("sha256"), f"file {rel_path}")
            expected_raw_size = entry.get("raw_size")
            if not _is_strict_int(expected_raw_size) or expected_raw_size < 0:
                raise QpkgError(f"Invalid raw_size for {rel_path}: {expected_raw_size!r}")
            computed_total_raw += expected_raw_size

            has_chunks = "chunks" in entry
            has_single = "offset" in entry or "comp_size" in entry
            if has_chunks == has_single:
                raise QpkgError(
                    f"Manifest entry {rel_path!r} must specify either 'chunks' or ('offset', 'comp_size'), not both/neither."
                )

            if has_chunks:
                chunks = entry["chunks"]
                if not isinstance(chunks, list) or not chunks:
                    raise QpkgError(f"Manifest entry {rel_path!r} has empty or invalid 'chunks' list.")

                full_hasher = hashlib.sha256()
                chunk_raw_total = 0

                for c_idx, chunk in enumerate(chunks):
                    if not isinstance(chunk, dict):
                        raise QpkgError(f"Invalid chunk {c_idx} for {rel_path!r}.")
                    c_offset = chunk.get("offset")
                    c_comp_size = chunk.get("comp_size")
                    c_raw_size = chunk.get("raw_size")
                    c_sha = _validate_sha256_field(chunk.get("sha256"), f"{rel_path}[chunk {c_idx}]")

                    if not _is_strict_int(c_offset) or c_offset < len(QPKG_MAGIC):
                        raise QpkgError(f"Invalid chunk offset for {rel_path}[{c_idx}]: {c_offset!r}")
                    if not _is_strict_int(c_comp_size) or c_comp_size <= 0:
                        raise QpkgError(f"Invalid chunk comp_size for {rel_path}[{c_idx}]: {c_comp_size!r}")
                    if not _is_strict_int(c_raw_size) or c_raw_size < 0:
                        raise QpkgError(f"Invalid chunk raw_size for {rel_path}[{c_idx}]: {c_raw_size!r}")
                    if c_offset + c_comp_size > actual_size:
                        raise QpkgError(
                            f"Chunk byte range out of bounds for {rel_path}[{c_idx}]: "
                            f"{c_offset}+{c_comp_size} > {actual_size}"
                        )

                    qf.seek(c_offset)
                    comp_blob = qf.read(c_comp_size)
                    if len(comp_blob) != c_comp_size:
                        raise QpkgError(f"Short read for {rel_path}[{c_idx}].")

                    raw_chunk = decompress_bytes(comp_blob, compression)
                    if len(raw_chunk) != c_raw_size:
                        raise QpkgError(
                            f"Decompressed chunk size mismatch for {rel_path}[{c_idx}]: "
                            f"expected {c_raw_size}, got {len(raw_chunk)}."
                        )
                    actual_c_sha = hashlib.sha256(raw_chunk).hexdigest()
                    if actual_c_sha != c_sha:
                        raise QpkgError(
                            f"Chunk SHA-256 mismatch for {rel_path}[{c_idx}]: "
                            f"expected {c_sha}, got {actual_c_sha}."
                        )

                    full_hasher.update(raw_chunk)
                    chunk_raw_total += len(raw_chunk)
                    total_chunks += 1

                if chunk_raw_total != expected_raw_size:
                    raise QpkgError(
                        f"Reconstructed raw_size mismatch for {rel_path}: "
                        f"expected {expected_raw_size}, got {chunk_raw_total}."
                    )
                if full_hasher.hexdigest() != expected_file_sha:
                    raise QpkgError(
                        f"Reconstructed file SHA-256 mismatch for {rel_path}: "
                        f"expected {expected_file_sha}, got {full_hasher.hexdigest()}."
                    )
            else:
                f_offset = entry.get("offset")
                f_comp_size = entry.get("comp_size")
                if not _is_strict_int(f_offset) or f_offset < len(QPKG_MAGIC):
                    raise QpkgError(f"Invalid offset for {rel_path}: {f_offset!r}")
                if not _is_strict_int(f_comp_size) or f_comp_size <= 0:
                    raise QpkgError(f"Invalid comp_size for {rel_path}: {f_comp_size!r}")
                if f_offset + f_comp_size > actual_size:
                    raise QpkgError(
                        f"Byte range out of bounds for {rel_path}: {f_offset}+{f_comp_size} > {actual_size}"
                    )

                qf.seek(f_offset)
                comp_blob = qf.read(f_comp_size)
                if len(comp_blob) != f_comp_size:
                    raise QpkgError(f"Short read for {rel_path}.")

                raw_data = decompress_bytes(comp_blob, compression)
                if len(raw_data) != expected_raw_size:
                    raise QpkgError(
                        f"Decompressed size mismatch for {rel_path}: "
                        f"expected {expected_raw_size}, got {len(raw_data)}."
                    )
                actual_file_sha = hashlib.sha256(raw_data).hexdigest()
                if actual_file_sha != expected_file_sha:
                    raise QpkgError(
                        f"File SHA-256 mismatch for {rel_path}: "
                        f"expected {expected_file_sha}, got {actual_file_sha}."
                    )

        if computed_total_raw != total_raw_size:
            raise QpkgError(
                f"total_raw_size mismatch: manifest declares {total_raw_size}, sum of files is {computed_total_raw}."
            )

    return {
        "ok": True,
        "app_id": manifest["app_id"],
        "version": manifest["version"],
        "file_count": file_count,
        "chunk_count": total_chunks,
        "total_raw_size": total_raw_size,
        "qpkg_size": actual_size,
    }


def _format_bytes(num_bytes: int) -> str:
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024.0 or unit == "GB":
            return f"{int(value)} {unit}" if unit == "B" else f"{value:.2f} {unit}"
        value /= 1024.0
    return f"{num_bytes} B"


def inspect_manifest(manifest_path: Path | str) -> str:
    """Return a human-readable summary of a QPKG manifest.json file."""
    mpath = Path(manifest_path)
    if not mpath.is_file():
        raise QpkgError(f"Manifest file not found: {mpath}")
    try:
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise QpkgError(f"Failed to parse manifest JSON: {exc}") from exc
    if not isinstance(manifest, dict):
        raise QpkgError("Manifest root must be a JSON object.")

    files = manifest.get("files", [])
    chunked_files = [f for f in files if isinstance(f, dict) and "chunks" in f]
    total_chunks = sum(len(f["chunks"]) for f in chunked_files)
    total_raw = int(manifest.get("total_raw_size", 0))
    qpkg_size = int(manifest.get("qpkg_size", 0))
    ratio = (qpkg_size / total_raw * 100.0) if total_raw > 0 else 0.0

    lines = [
        f"App ID          : {manifest.get('app_id', '?')}",
        f"Version         : {manifest.get('version', '?')}",
        f"Format Version  : {manifest.get('format_version', '?')}",
        f"Compression     : {manifest.get('compression', '?')}",
        f"QPKG Filename   : {manifest.get('qpkg_filename', '?')}",
        f"File Count      : {manifest.get('file_count', len(files))}",
        f"Chunked Files   : {len(chunked_files)} ({total_chunks} chunks)",
        f"Total Raw Size  : {_format_bytes(total_raw)} ({total_raw} bytes)",
        f"QPKG Size       : {_format_bytes(qpkg_size)} ({qpkg_size} bytes, {ratio:.1f}% of raw)",
    ]
    if chunked_files:
        lines.append("Chunked File Details:")
        for cf in chunked_files:
            lines.append(
                f"  - {cf['path']}: {_format_bytes(int(cf['raw_size']))} ({len(cf['chunks'])} chunks)"
            )
    return "\n".join(lines)


def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="qpkg_packager.py",
        description="QASSIMZ QPKG Delta Archive Packager, Verifier, and Inspector.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_pack = sub.add_parser("pack", help="Pack a directory into <app>-v<ver>.qpkg + manifest.json")
    p_pack.add_argument("--input", required=True, help="Input directory to package")
    p_pack.add_argument("--output-dir", required=True, help="Output directory for .qpkg and manifest.json")
    p_pack.add_argument("--app-id", required=True, help="Application identifier (e.g. qassimz-music)")
    p_pack.add_argument("--version", required=True, help="Release version (e.g. 1.5.0)")
    p_pack.add_argument(
        "--chunk-size",
        type=int,
        default=DEFAULT_CHUNK_SIZE,
        help=f"Chunk size in bytes for large files (default: {DEFAULT_CHUNK_SIZE})",
    )
    p_pack.add_argument(
        "--chunk-threshold",
        type=int,
        default=DEFAULT_CHUNK_THRESHOLD,
        help=f"Minimum raw file size in bytes before chunk splitting (default: {DEFAULT_CHUNK_THRESHOLD})",
    )
    p_pack.add_argument(
        "--compression",
        choices=list(SUPPORTED_COMPRESSIONS),
        default=DEFAULT_COMPRESSION,
        help=f"Compression codec (default: {DEFAULT_COMPRESSION})",
    )
    p_pack.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Glob pattern to exclude (repeatable)",
    )
    p_pack.add_argument(
        "--no-default-excludes",
        action="store_true",
        help="Disable built-in default exclude patterns",
    )
    p_pack.add_argument(
        "--extra-file",
        action="append",
        default=[],
        help="Include an additional file or directory as <src>:<rel_dest> (repeatable)",
    )
    p_pack.add_argument(
        "--json",
        action="store_true",
        dest="as_json",
        help="Print compact JSON summary to stdout",
    )

    p_verify = sub.add_parser("verify", help="Verify a .qpkg archive against its manifest.json")
    p_verify.add_argument("--manifest", required=True, help="Path to manifest.json")
    p_verify.add_argument("--qpkg", required=True, help="Path to .qpkg file")

    p_inspect = sub.add_parser("inspect", help="Inspect a manifest.json and print summary stats")
    p_inspect.add_argument("--manifest", required=True, help="Path to manifest.json")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    _configure_stdio()
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        if args.command == "pack":
            manifest = pack_directory(
                input_dir=args.input,
                output_dir=args.output_dir,
                app_id=args.app_id,
                version=args.version,
                chunk_size=args.chunk_size,
                chunk_threshold=args.chunk_threshold,
                compression=args.compression,
                excludes=args.exclude,
                use_default_excludes=not args.no_default_excludes,
                extra_files=args.extra_file,
            )
            if args.as_json:
                summary = {
                    "ok": True,
                    "app_id": manifest["app_id"],
                    "version": manifest["version"],
                    "qpkg_filename": manifest["qpkg_filename"],
                    "qpkg_size": manifest["qpkg_size"],
                    "qpkg_sha256": manifest["qpkg_sha256"],
                    "total_raw_size": manifest["total_raw_size"],
                    "file_count": manifest["file_count"],
                    "compression": manifest["compression"],
                }
                print(json.dumps(summary, ensure_ascii=False))
            else:
                print(
                    f"Packed {manifest['app_id']} v{manifest['version']}: "
                    f"{manifest['file_count']} files, "
                    f"raw={_format_bytes(manifest['total_raw_size'])}, "
                    f"qpkg={_format_bytes(manifest['qpkg_size'])} "
                    f"({manifest['qpkg_filename']})"
                )
            return 0

        if args.command == "verify":
            result = verify_package(args.manifest, args.qpkg)
            print(
                f"OK: {result['app_id']} v{result['version']} "
                f"({result['file_count']} files, {result['chunk_count']} chunks, "
                f"{_format_bytes(result['qpkg_size'])})"
            )
            return 0

        if args.command == "inspect":
            print(inspect_manifest(args.manifest))
            return 0

        parser.error(f"Unknown command: {args.command}")
        return 2
    except (QpkgError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
