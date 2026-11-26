"""QASSIMZ Hub — Windows installation, version, Adobe CEP, and AI-engine detector."""
from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


def parse_version(v: str | None) -> tuple[int, ...]:
    if not v:
        return (0,)
    cleaned = re.sub(r"^[^0-9]*", "", str(v).strip())
    nums = []
    for part in re.split(r"[.\-+_]", cleaned):
        m = re.match(r"^(\d+)", part)
        if m:
            nums.append(int(m.group(1)))
        else:
            break
    return tuple(nums[:4]) if nums else (0,)


def expand_win_path(raw: str) -> Path:
    """Expand %VAR% style Windows environment variables cross-platform."""
    def _repl(match: re.Match[str]) -> str:
        var = match.group(1)
        val = os.environ.get(var) or os.environ.get(var.upper())
        if val:
            return val
        home = str(Path.home())
        fallbacks = {
            "LOCALAPPDATA": os.path.join(home, "AppData", "Local"),
            "APPDATA": os.path.join(home, "AppData", "Roaming"),
            "USERPROFILE": home,
            "PROGRAMFILES": r"C:\Program Files",
            "PROGRAMFILES(X86)": r"C:\Program Files (x86)",
        }
        return fallbacks.get(var.upper(), match.group(0))

    expanded = re.sub(r"%([^%]+)%", _repl, raw)
    if os.name != "nt":
        expanded = expanded.replace("\\", "/")
    return Path(expanded)


def _read_windows_uninstall_map() -> dict[str, dict[str, str]]:
    """Return mapping of lowercase Uninstall subkey name -> registry values on Windows."""
    if os.name != "nt":
        return {}
    import winreg  # type: ignore

    out: dict[str, dict[str, str]] = {}
    roots = [
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall", 0),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", winreg.KEY_WOW64_64KEY),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", winreg.KEY_WOW64_32KEY),
    ]
    fields = ("DisplayName", "DisplayVersion", "InstallLocation", "DisplayIcon", "UninstallString", "QuietUninstallString")
    for hive, subkey, flag in roots:
        try:
            with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ | flag) as k:
                count = winreg.QueryInfoKey(k)[0]
                for idx in range(count):
                    try:
                        name = winreg.EnumKey(k, idx)
                        with winreg.OpenKey(k, name, 0, winreg.KEY_READ | flag) as sk:
                            entry: dict[str, str] = {"_key": name}
                            for fn in fields:
                                try:
                                    val, _ = winreg.QueryValueEx(sk, fn)
                                    if val is not None:
                                        entry[fn] = str(val).strip()
                                except OSError:
                                    pass
                            low = name.lower()
                            if low not in out or ("DisplayVersion" in entry and "DisplayVersion" not in out[low]):
                                out[low] = entry
                    except OSError:
                        continue
        except OSError:
            continue
    return out


def _read_cep_manifest_version(bundle_id: str) -> tuple[str | None, Path | None]:
    """Locate Adobe CEP extension folder and parse ExtensionBundleVersion from CSXS/manifest.xml."""
    candidates = [
        expand_win_path(rf"%PROGRAMFILES(X86)%\Common Files\Adobe\CEP\extensions\{bundle_id}"),
        expand_win_path(rf"%APPDATA%\Adobe\CEP\extensions\{bundle_id}"),
        expand_win_path(rf"%PROGRAMFILES%\Common Files\Adobe\CEP\extensions\{bundle_id}"),
    ]
    for folder in candidates:
        manifest = folder / "CSXS" / "manifest.xml"
        if manifest.is_file():
            try:
                root = ET.parse(manifest).getroot()
                ver = root.attrib.get("ExtensionBundleVersion")
                if not ver:
                    for elem in root.iter():
                        if elem.tag.endswith("Extension") and elem.attrib.get("Version"):
                            ver = elem.attrib["Version"]
                            break
                return (ver or "1.0.0"), folder
            except Exception:
                return "1.0.0", folder
    return None, None


def detect_adobe_environment() -> dict[str, Any]:
    """Detect installed Adobe Premiere Pro / After Effects executables and CSXS PlayerDebugMode."""
    premiere_exes: list[str] = []
    ae_exes: list[str] = []
    debug_enabled = True

    if os.name == "nt":
        adobe_root = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Adobe"
        if adobe_root.is_dir():
            for child in sorted(adobe_root.iterdir(), reverse=True):
                if not child.is_dir():
                    continue
                nm = child.name.lower()
                if "premiere pro" in nm:
                    exe = child / "Adobe Premiere Pro.exe"
                    if exe.is_file():
                        premiere_exes.append(str(exe))
                elif "after effects" in nm:
                    exe = child / "Support Files" / "AfterFX.exe"
                    if exe.is_file():
                        ae_exes.append(str(exe))

        try:
            import winreg  # type: ignore
            ok_count = 0
            for ver in range(9, 17):
                try:
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, rf"Software\Adobe\CSXS.{ver}") as k:
                        val, _ = winreg.QueryValueEx(k, "PlayerDebugMode")
                        if str(val) == "1":
                            ok_count += 1
                except OSError:
                    pass
            debug_enabled = ok_count >= 5
        except Exception:
            debug_enabled = False

    return {
        "premiere_installed": bool(premiere_exes),
        "premiere_exe": premiere_exes[0] if premiere_exes else "",
        "aftereffects_installed": bool(ae_exes),
        "aftereffects_exe": ae_exes[0] if ae_exes else "",
        "cep_debug_ready": debug_enabled,
    }


def enable_cep_player_debug_mode() -> bool:
    """Set PlayerDebugMode=1 across HKCU\\Software\\Adobe\\CSXS.9..16 on Windows."""
    if os.name != "nt":
        return True
    import winreg  # type: ignore

    for ver in range(9, 17):
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Adobe\CSXS.{ver}") as k:
            winreg.SetValueEx(k, "PlayerDebugMode", 0, winreg.REG_SZ, "1")
    return True


def detect_item_state(item: dict[str, Any], reg_map: dict[str, dict[str, str]] | None = None) -> dict[str, Any]:
    """Compute installation state, installed version, launch path, and update availability for a catalog item."""
    if reg_map is None:
        reg_map = _read_windows_uninstall_map()

    det = item.get("detection") or {}
    latest_ver = item.get("version", "1.0.0")

    reg_entry: dict[str, str] | None = None
    for uid in det.get("uninstall_ids") or []:
        found = reg_map.get(uid.lower())
        if found:
            reg_entry = found
            break

    if not reg_entry and det.get("display_name_match"):
        needle = det["display_name_match"].lower()
        for entry in reg_map.values():
            if needle in entry.get("DisplayName", "").lower():
                reg_entry = entry
                break

    installed_ver: str | None = reg_entry.get("DisplayVersion") if reg_entry else None
    install_dir: str = reg_entry.get("InstallLocation", "").strip('" ') if reg_entry else ""
    uninstall_cmd: str = (
        (reg_entry.get("QuietUninstallString") or reg_entry.get("UninstallString") or "")
        if reg_entry
        else ""
    )

    exe_path: str = ""
    cep_dir: str = ""

    # Check CEP bundle if applicable
    bundle_id = det.get("cep_bundle_id")
    if bundle_id:
        cep_ver, cep_folder = _read_cep_manifest_version(bundle_id)
        if cep_folder is not None:
            cep_dir = str(cep_folder)
            if not installed_ver:
                installed_ver = cep_ver
            elif cep_ver and parse_version(cep_ver) > parse_version(installed_ver):
                installed_ver = cep_ver

    # Check candidate executable paths
    candidates: list[Path] = []
    if install_dir:
        for raw_p in det.get("exe_paths") or []:
            exe_name = Path(raw_p.replace("\\", "/")).name
            candidates.append(Path(install_dir) / exe_name)
    for raw_p in det.get("exe_paths") or []:
        candidates.append(expand_win_path(raw_p))

    for cand in candidates:
        if cand.is_file():
            exe_path = str(cand)
            if not install_dir:
                install_dir = str(cand.parent)
            break

    # Determine whether genuinely installed on disk (avoid stale orphaned registry entries)
    if bundle_id:
        is_installed = bool(cep_dir)
    elif det.get("exe_paths"):
        is_installed = bool(exe_path)
    else:
        is_installed = reg_entry is not None

    if is_installed and not installed_ver:
        installed_ver = "1.0.0"
    if not is_installed:
        installed_ver = None

    has_update = bool(
        is_installed
        and installed_ver
        and parse_version(latest_ver) > parse_version(installed_ver)
    )

    # Check optional AI / FFmpeg readiness
    ai_paths = det.get("ai_ready_paths") or []
    ai_applicable = len(ai_paths) > 0
    ai_ready = all(expand_win_path(p).exists() for p in ai_paths) if ai_applicable else True
    ai_script_raw = det.get("ai_setup_script") or ""
    ai_script = str(expand_win_path(ai_script_raw)) if ai_script_raw else ""

    # Sub-app actions (e.g., Studio Edit / Studio Motion)
    sub_apps_out = []
    for sa in det.get("sub_apps") or []:
        if sa.get("rel_exe") and install_dir:
            target = Path(install_dir) / sa["rel_exe"]
            if target.is_file():
                sub_apps_out.append({"label_ar": sa["label_ar"], "exe": str(target), "args": sa.get("args") or []})
        elif sa.get("args") and exe_path:
            sub_apps_out.append({"label_ar": sa["label_ar"], "exe": exe_path, "args": sa["args"]})

    extra_folders_out = []
    for ef in det.get("extra_folders") or []:
        fp = expand_win_path(ef["path"])
        extra_folders_out.append({"label_ar": ef["label_ar"], "path": str(fp), "exists": fp.exists()})

    return {
        "installed": is_installed,
        "installed_version": installed_ver,
        "has_update": has_update,
        "exe_path": exe_path,
        "cep_dir": cep_dir,
        "install_dir": install_dir or cep_dir,
        "uninstall_cmd": uninstall_cmd,
        "ai_applicable": ai_applicable,
        "ai_ready": ai_ready,
        "ai_setup_script": ai_script if (ai_script and Path(ai_script).is_file()) else "",
        "sub_apps": sub_apps_out,
        "extra_folders": extra_folders_out,
    }


def enrich_catalog(catalog: dict[str, Any]) -> dict[str, Any]:
    """Attach live installation & update status to all catalog items."""
    reg_map = _read_windows_uninstall_map()
    adobe_env = detect_adobe_environment()
    items_out = []
    installed_count = 0
    updates_count = 0

    for item in catalog.get("items") or []:
        state = detect_item_state(item, reg_map)
        merged = {**item, "state": state}
        if state["installed"]:
            installed_count += 1
        if state["has_update"]:
            updates_count += 1
        items_out.append(merged)

    return {
        "schema_version": catalog.get("schema_version", 1),
        "updated_at": catalog.get("updated_at", ""),
        "hub": catalog.get("hub", {}),
        "adobe": adobe_env,
        "counts": {
            "total": len(items_out),
            "installed": installed_count,
            "updates": updates_count,
            "desktop": sum(1 for x in items_out if x.get("category") == "desktop"),
            "adobe": sum(1 for x in items_out if x.get("category") == "adobe"),
        },
        "items": items_out,
    }
