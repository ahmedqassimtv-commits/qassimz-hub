/**
 * Typed HTTP/1.1 API bridge to Python HubApi (100% endpoint parity).
 */
export interface AppItemState {
  installed: boolean;
  installed_version?: string;
  has_update?: boolean;
  install_dir?: string;
  cep_dir?: string;
  exe_path?: string;
  uninstall_cmd?: string;
}

export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  name_ar?: string;
  category: "desktop" | "adobe";
  accent: string;
  version: string;
  tagline_ar?: string;
  description_ar?: string;
  setup_size?: number;
  repo?: string;
  state: AppItemState;
}

export interface HubTask {
  id: string;
  code?: string;
  name: string;
  name_ar?: string;
  accent?: string;
  version: string;
  status:
    | "queued"
    | "checking"
    | "downloading"
    | "paused"
    | "verifying"
    | "installing"
    | "app_running"
    | "completed"
    | "error"
    | "cancelled";
  stage?: string;
  update_mode?: "delta" | "full" | "fallback";
  progress: number;
  downloaded?: number;
  total?: number;
  speed_bps?: number;
  eta_sec?: number;
  delta_saved_bytes?: number;
  delta_saved_pct?: number;
  auto_launch?: boolean;
  running_exe?: string;
  message_ar?: string;
  error?: string;
}

export type MechanicalBgMode = "off" | "balanced" | "overdrive";

export interface HubSettingsData {
  silent_install: boolean;
  minimize_to_tray: boolean;
  start_with_windows: boolean;
  auto_check_updates: boolean;
  auto_update_apps: boolean;
  auto_update_hub: boolean;
  mechanical_bg_mode?: MechanicalBgMode;
  sound_enabled?: boolean;
}

export interface TelemetryData {
  cpu_pct: number;
  ram_pct: number;
  ram_used_gb: number;
  ram_total_gb: number;
  disk_free_gb: number;
  disk_total_gb: number;
  disk_used_pct: number;
  cache_bytes: number;
  cache_mb: number;
}

export interface CCUpdaterState {
  phase: "idle" | "downloading" | "extracting" | "staged_ready" | "applied";
  progress: number;
  target_version: string;
  method: string;
}

export interface HubStatePayload {
  hub_version: string;
  hub_has_update: boolean;
  hub_remote_version: string;
  hub_release_notes?: string;
  hub_repo_url: string;
  cc_updater?: CCUpdaterState;
  feature_flags?: Record<string, boolean>;
  settings: HubSettingsData;
  tasks: HubTask[];
  items: CatalogItem[];
  counts: {
    total: number;
    installed: number;
    updates: number;
    desktop: number;
    adobe: number;
  };
  adobe?: {
    cep_debug_ready?: boolean;
  };
  cache_size_bytes?: number;
}

export async function api<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`./api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || "تعذّر إكمال العملية حالياً.");
  }
  return json.data as T;
}

export const HubBridge = {
  state: (force = false) => api<HubStatePayload>("state", { force }),
  tasks: () => api<HubTask[]>("tasks"),
  refreshCatalog: () => api<HubStatePayload>("refresh_catalog"),
  install: (id: string, silent?: boolean) => api<HubTask>("install", silent === undefined ? { id } : { id, silent }),
  updateAll: () => api<HubTask[]>("update_all"),
  launch: (id: string) => api<{ ok: boolean }>("launch", { id }),
  uninstall: (id: string) => api<{ ok: boolean }>("uninstall", { id }),
  openFolder: (id: string) => api<{ ok: boolean }>("open_folder", { id }),
  openUrl: (url: string) => api<{ ok: boolean }>("open_url", { url }),
  fixCep: () => api<{ ok: boolean }>("fix_cep"),
  saveSettings: (values: Partial<HubSettingsData>) => api<HubSettingsData>("save_settings", { values }),
  cancelTask: (id: string) => api<{ ok: boolean }>("cancel_task", { id }),
  pauseTask: (item_id: string) => api<{ ok: boolean }>("pause_task", { item_id }),
  resumeTask: (item_id: string) => api<{ ok: boolean }>("resume_task", { item_id }),
  setTaskAutoLaunch: (item_id: string, enabled: boolean) =>
    api<{ ok: boolean; enabled: boolean }>("set_task_auto_launch", { item_id, enabled }),
  forceCloseAndRetry: (item_id: string) => api<{ ok: boolean }>("force_close_and_retry", { item_id }),
  telemetry: () => api<TelemetryData>("telemetry"),
  clearCache: () => api<{ ok: boolean; freed_mb?: number; files_removed?: number }>("clear_cache"),
  launchWorkspace: (mode_id: string) =>
    api<{ ok: boolean; mode?: string; launched: string[]; skipped: string[] }>("launch_workspace", { mode_id }),
  openWith: (item_id: string, file_path: string) =>
    api<{ ok: boolean; item_id: string; file_path: string }>("open_with", { item_id, file_path }),
  clearFinishedTasks: () => api<{ ok: boolean }>("clear_finished_tasks"),
  installHubUpdate: (force = false) => api<HubTask>("install_hub_update", { force }),
  applyStagedUpdate: () => api<{ ok: boolean }>("apply_staged_update"),
  reportUiError: (info: { kind: string; message: string; source?: string; stack?: string }) =>
    api<{ ok: boolean }>("report_ui_error", info),
  winMinimize: () => api<{ ok: boolean }>("win_minimize"),
  winToggleMaximize: () => api<{ ok: boolean; maximized: boolean }>("win_toggle_maximize"),
  winRevealMain: () => api<{ ok: boolean; expanded: boolean; maximized?: boolean }>("win_reveal_main"),
  winClose: () => api<{ ok: boolean }>("win_close"),
  winQuit: () => api<{ ok: boolean }>("win_quit"),
};

export function humanBytes(n = 0): string {
  const bytes = Number(n || 0);
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
