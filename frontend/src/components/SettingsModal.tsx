import React, { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { FolderOpen, Plus, X } from "lucide-react";
import { CatalogItem, HubSettingsData, MechanicalBgMode } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";
import { ThemePref } from "../lib/theme";

interface Props {
  open: boolean;
  lang: Lang;
  themePref: ThemePref;
  settings: HubSettingsData;
  items: CatalogItem[];
  workspaces: Record<string, string[]>;
  workspaceLabels: Array<{ id: string; label: string }>;
  onClose: () => void;
  onThemePick: (pref: ThemePref, el: HTMLElement | null) => void;
  onLangPick: (l: Lang) => void;
  onMechModePick: (m: MechanicalBgMode) => void;
  onToggleSetting: (key: keyof HubSettingsData, val: boolean) => void;
  onSaveSettings: (values: Partial<HubSettingsData>) => Promise<void>;
  onChooseFolder: () => Promise<void>;
  onSaveWorkspace: (modeId: string, appIds: string[]) => Promise<void>;
  onExport: () => void;
  onImport: (file: File) => void;
  onQuit: () => void;
  onToast: (msg: string, kind?: "info" | "error") => void;
}

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  settingKey?: string;
}> = ({ checked, onChange, settingKey }) => (
  <span className="relative inline-flex items-center shrink-0">
    <input
      type="checkbox"
      data-setting={settingKey}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0"
    />
    <span
      dir="ltr"
      className={`pointer-events-none w-10 h-6 rounded-full p-0.5 flex items-center border transition-colors duration-200 ${
        checked
          ? "bg-[#1473E6] border-[#378EF0]/60 justify-end"
          : "bg-white/10 border-white/15 justify-start"
      }`}
    >
      <m.span
        layout
        transition={SPRINGS.snappy}
        className={`w-[18px] h-[18px] rounded-full block shadow-sm ${checked ? "bg-white" : "bg-white/70"}`}
      />
    </span>
  </span>
);

export const SettingsModal: React.FC<Props> = ({
  open,
  lang,
  themePref,
  settings,
  items,
  workspaces,
  workspaceLabels,
  onClose,
  onThemePick,
  onLangPick,
  onMechModePick,
  onToggleSetting,
  onSaveSettings,
  onChooseFolder,
  onSaveWorkspace,
  onExport,
  onImport,
  onQuit,
  onToast,
}) => {
  const t = I18N[lang];
  const mechMode: MechanicalBgMode = settings.mechanical_bg_mode || "balanced";
  const [activeWs, setActiveWs] = useState<string>(workspaceLabels[0]?.id || "editing");
  const [newWs, setNewWs] = useState("");
  const [draft, setDraft] = useState<Record<string, string[]>>(workspaces);
  const importRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setDraft(workspaces);
  }, [workspaces]);

  const desktopApps = items.filter((it) => it.category === "desktop" && it.state?.installed);
  const current = draft[activeWs] || workspaces[activeWs] || [];

  const toggleApp = (appId: string) => {
    setDraft((prev) => {
      const list = prev[activeWs] || workspaces[activeWs] || [];
      const next = list.includes(appId) ? list.filter((a) => a !== appId) : [...list, appId];
      return { ...prev, [activeWs]: next };
    });
  };

  const addWorkspace = async () => {
    const name = newWs.trim();
    if (!name) return;
    const id = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`.slice(0, 40);
    if (!/^custom_[a-z0-9_]{1,30}$/.test(id)) {
      onToast(t.friendlyErr, "error");
      return;
    }
    await onSaveWorkspace(id, []);
    setActiveWs(id);
    setNewWs("");
  };

  const updateRows: Array<{ key: keyof HubSettingsData; label: string }> = [
    { key: "auto_update_apps", label: t.updateApps },
    { key: "auto_update_hub", label: t.updateHub },
  ];

  const row = "px-3.5 py-3 flex items-center justify-between gap-3";

  return (
    <AnimatePresence>
      {open && (
        <m.div
          id="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-[360] flex items-center justify-center p-5 bg-[var(--color-scrim)]"
        >
          <m.div
            id="settings-sheet"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRINGS.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "var(--shadow-elevated)" }}
            className="w-full max-w-[560px] max-h-[88vh] rounded-2xl overflow-hidden flex flex-col bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)]"
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
              <h2 className="m-0 text-[16px] font-bold tracking-tight">{t.settings}</h2>
              <button
                id="st-close"
                autoFocus
                onClick={onClose}
                aria-label={t.close}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[76vh] flex-1 flex flex-col gap-5">
              {/* Appearance & Language */}
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t.appearanceLang}
                </div>
                <div className="rounded-xl border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40">
                  <div className={`${row} flex-wrap`}>
                    <div>
                      <div className="text-[13px] font-semibold">{t.themeTitle}</div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)]">{t.themeSub}</div>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-black/20 border border-[var(--color-border-subtle)]">
                      {(["light", "dark", "system"] as ThemePref[]).map((pref) => (
                        <button
                          key={pref}
                          onClick={(e) => onThemePick(pref, e.currentTarget)}
                          className={`h-7 px-2.5 rounded-md text-[12px] font-semibold cursor-pointer transition-colors ${
                            themePref === pref
                              ? "bg-[var(--color-action-bg)] text-white"
                              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          }`}
                        >
                          {pref === "light" ? t.themeLight : pref === "dark" ? t.themeDark : t.themeSystem}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`${row} flex-wrap`}>
                    <div>
                      <div className="text-[13px] font-semibold">{t.langTitle}</div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)]">{t.langSub}</div>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-black/20 border border-[var(--color-border-subtle)]">
                      {(["en", "ar"] as Lang[]).map((l) => (
                        <button
                          key={l}
                          onClick={() => onLangPick(l)}
                          className={`h-7 px-3 rounded-md text-[12px] font-semibold cursor-pointer transition-colors ${
                            lang === l
                              ? "bg-[var(--color-action-bg)] text-white"
                              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          }`}
                        >
                          {l === "en" ? "English" : "العربية"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`${row} flex-wrap`}>
                    <div>
                      <div className="text-[13px] font-semibold">{t.mechTitle}</div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)]">{t.mechSub}</div>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-black/20 border border-[var(--color-border-subtle)]">
                      {(["off", "balanced", "overdrive"] as MechanicalBgMode[]).map((mMode) => (
                        <button
                          key={mMode}
                          data-mech-mode={mMode}
                          onClick={() => onMechModePick(mMode)}
                          className={`h-7 px-2.5 rounded-md text-[11.5px] font-semibold cursor-pointer transition-colors ${
                            mechMode === mMode
                              ? "bg-[var(--color-action-bg)] text-white"
                              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          }`}
                        >
                          {mMode === "off" ? t.mechOff : mMode === "balanced" ? t.mechBalanced : t.mechOverdrive}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Updates */}
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t.autoUpdates}
                </div>
                <div className="rounded-xl border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40">
                  {updateRows.map((r) => (
                    <label key={r.key} className={`${row} cursor-pointer hover:bg-[var(--color-surface-hover)]/40`}>
                      <span className="text-[13px] font-medium">{r.label}</span>
                      <Toggle
                        checked={Boolean(settings[r.key])}
                        onChange={(v) => onToggleSetting(r.key, v)}
                        settingKey={String(r.key)}
                      />
                    </label>
                  ))}
                  <label className={`${row} cursor-pointer hover:bg-[var(--color-surface-hover)]/40`}>
                    <span className="text-[13px] font-medium">{t.startWithWindows}</span>
                    <Toggle
                      checked={Boolean(settings.start_with_windows)}
                      onChange={(v) => onToggleSetting("start_with_windows", v)}
                      settingKey="start_with_windows"
                    />
                  </label>
                  <label className={`${row} cursor-pointer hover:bg-[var(--color-surface-hover)]/40`}>
                    <span className="text-[13px] font-medium">{t.silentInstall}</span>
                    <Toggle
                      checked={Boolean(settings.silent_install)}
                      onChange={(v) => onToggleSetting("silent_install", v)}
                      settingKey="silent_install"
                    />
                  </label>
                  <label className={`${row} cursor-pointer hover:bg-[var(--color-surface-hover)]/40`}>
                    <span className="text-[13px] font-medium">{t.minimizeToTray}</span>
                    <Toggle
                      checked={Boolean(settings.minimize_to_tray)}
                      onChange={(v) => onToggleSetting("minimize_to_tray", v)}
                      settingKey="minimize_to_tray"
                    />
                  </label>
                </div>
              </div>

              {/* Storage */}
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t.settingsStorage}
                </div>
                <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40 p-3.5 flex flex-col gap-2">
                  <div className="text-[11.5px] text-[var(--color-text-muted)]">{t.settingsStorageSub}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className="flex-1 min-w-[180px] h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--color-border-subtle)] text-[11.5px] flex items-center truncate"
                      dir="ltr"
                      data-install-root
                    >
                      {settings.install_root || t.defaultLocation}
                    </div>
                    <button
                      id="btn-choose-folder"
                      onClick={() => onChooseFolder()}
                      className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-active)] border border-[var(--color-border-subtle)] text-[12px] font-semibold cursor-pointer"
                    >
                      <FolderOpen size={13} />
                      {t.chooseFolder}
                    </button>
                    {settings.install_root ? (
                      <button
                        onClick={() => onSaveSettings({ install_root: "" }).catch(() => {})}
                        className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                      >
                        {t.defaultLocation}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Smart pause & auto-clean */}
              <div className="flex flex-col gap-2.5">
                <div className="rounded-xl border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40">
                  <label className={`${row} cursor-pointer`}>
                    <div>
                      <div className="text-[13px] font-semibold">{t.smartPauseTitle}</div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)] max-w-[360px]">{t.smartPauseSub}</div>
                    </div>
                    <Toggle
                      checked={Boolean(settings.smart_pause)}
                      onChange={(v) => onToggleSetting("smart_pause", v)}
                      settingKey="smart_pause"
                    />
                  </label>
                  <label className={`${row} cursor-pointer`}>
                    <div>
                      <div className="text-[13px] font-semibold">{t.autoCleanTitle}</div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)] max-w-[360px]">{t.autoCleanSub}</div>
                    </div>
                    <Toggle
                      checked={Boolean(settings.auto_clean_installers)}
                      onChange={(v) => onToggleSetting("auto_clean_installers", v)}
                      settingKey="auto_clean_installers"
                    />
                  </label>
                  <div className={`${row} flex-wrap`}>
                    <span className="text-[13px] font-medium">{t.cacheKeepLabel}</span>
                    <select
                      id="q-cache-days"
                      value={String(settings.cache_cleanup_days ?? 0)}
                      onChange={(e) => onSaveSettings({ cache_cleanup_days: Number(e.target.value) as 0 | 7 | 30 }).catch(() => {})}
                      className="h-8 px-2.5 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border-subtle)] text-[12px] font-medium outline-none cursor-pointer"
                    >
                      <option value="0">{t.cacheOff}</option>
                      <option value="7">{t.cache7}</option>
                      <option value="30">{t.cache30}</option>
                    </select>
                  </div>
                  <label className={`${row} cursor-pointer`}>
                    <div>
                      <div className="text-[13px] font-semibold">{t.quietTitle}</div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)] max-w-[360px]">{t.quietSub}</div>
                    </div>
                    <Toggle
                      checked={Boolean(settings.quiet_mode)}
                      onChange={(v) => onToggleSetting("quiet_mode", v)}
                      settingKey="quiet_mode"
                    />
                  </label>
                  <label className={`${row} cursor-pointer`}>
                    <span className="text-[12.5px] font-medium">{t.quietObs}</span>
                    <Toggle
                      checked={Boolean(settings.quiet_auto_obs)}
                      onChange={(v) => onToggleSetting("quiet_auto_obs", v)}
                      settingKey="quiet_auto_obs"
                    />
                  </label>
                </div>
              </div>

              {/* Workspaces */}
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t.workspacesTitle}
                </div>
                <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40 p-3.5 flex flex-col gap-2.5">
                  <div className="text-[11.5px] text-[var(--color-text-muted)]">{t.workspacesSub}</div>
                  <div className="flex items-center gap-1.5 flex-wrap" id="ws-tabs">
                    {workspaceLabels.map((w) => (
                      <button
                        key={w.id}
                        data-ws-tab={w.id}
                        onClick={() => {
                          onSaveWorkspace(activeWs, current).catch(() => {});
                          setActiveWs(w.id);
                        }}
                        className={`h-7 px-2.5 rounded-full text-[11.5px] font-semibold cursor-pointer transition-colors ${
                          activeWs === w.id
                            ? "bg-[var(--color-action-bg)] text-white"
                            : "bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {desktopApps.length ? (
                      desktopApps.map((app) => {
                        const on = current.includes(app.id);
                        return (
                          <label
                            key={app.id}
                            data-ws-app={app.id}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-hover)]/60 cursor-pointer"
                          >
                            <span className="text-[12px] font-medium truncate">
                              {lang === "ar" ? app.name_ar || app.name : app.name}
                            </span>
                            <Toggle checked={on} onChange={() => toggleApp(app.id)} />
                          </label>
                        );
                      })
                    ) : (
                      <div className="text-[11.5px] text-[var(--color-text-muted)]">{t.libNoItems}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={newWs}
                      onChange={(e) => setNewWs(e.target.value)}
                      placeholder={t.wsAddCustom}
                      className="flex-1 min-w-[150px] h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--color-border-subtle)] text-[12px] outline-none focus:border-[var(--color-action-bg)]"
                    />
                    <button
                      id="btn-add-workspace"
                      onClick={() => {
                        // Saves the workspace being edited, then adds the typed one.
                        onSaveWorkspace(activeWs, current).catch(() => {});
                        if (newWs.trim()) addWorkspace().catch(() => {});
                      }}
                      className="h-8 px-3 rounded-lg inline-flex items-center gap-1 bg-[var(--color-action-bg)] text-white text-[12px] font-semibold cursor-pointer hover:bg-[var(--color-action-hover)]"
                    >
                      <Plus size={13} />
                      {t.wsAddWorkspace}
                    </button>
                  </div>
                </div>
              </div>
              {/* Backup */}
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t.backupTitle}
                </div>
                <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40 p-3.5 flex flex-col gap-2">
                  <div className="text-[11.5px] text-[var(--color-text-muted)]">{t.backupSub}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      id="st-export"
                      onClick={onExport}
                      className="h-8 px-3 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border-subtle)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--color-surface-active)]"
                    >
                      {t.exportSettings}
                    </button>
                    <button
                      id="st-import"
                      onClick={() => importRef.current?.click()}
                      className="h-8 px-3 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border-subtle)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--color-surface-active)]"
                    >
                      {t.importSettings}
                    </button>
                    <input
                      ref={importRef}
                      id="st-import-file"
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onImport(file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-2 flex-wrap">
              <button
                id="st-quit"
                onClick={onQuit}
                className="h-8 px-3.5 rounded-lg bg-red-500/15 text-[#f87171] text-[12.5px] font-semibold cursor-pointer hover:bg-red-500/25"
              >
                {t.quitHub}
              </button>
              <button
                id="st-done"
                onClick={onClose}
                className="h-8 px-4 rounded-lg bg-[var(--color-action-bg)] text-white text-[12.5px] font-semibold cursor-pointer hover:bg-[var(--color-action-hover)]"
              >
                {t.done}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
