import React from "react";
import { AnimatePresence, m } from "motion/react";
import { X } from "lucide-react";
import { HubSettingsData, MechanicalBgMode } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";
import { ThemePref } from "../lib/theme";

interface Props {
  open: boolean;
  lang: Lang;
  themePref: ThemePref;
  settings: HubSettingsData;
  onClose: () => void;
  onThemePick: (pref: ThemePref, el: HTMLElement | null) => void;
  onLangPick: (l: Lang) => void;
  onMechModePick: (m: MechanicalBgMode) => void;
  onToggleSetting: (key: keyof HubSettingsData, val: boolean) => void;
  onQuit: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  open,
  lang,
  themePref,
  settings,
  onClose,
  onThemePick,
  onLangPick,
  onMechModePick,
  onToggleSetting,
  onQuit,
}) => {
  const t = I18N[lang];
  const mechMode: MechanicalBgMode = settings.mechanical_bg_mode || "balanced";

  const toggleRows: Array<{ key: keyof HubSettingsData; label: string }> = [
    { key: "auto_check_updates", label: t.autoCheck },
    { key: "auto_update_apps", label: t.autoApps },
    { key: "auto_update_hub", label: t.autoHub },
    { key: "silent_install", label: t.silentInstall },
    { key: "minimize_to_tray", label: t.minimizeToTray },
    { key: "start_with_windows", label: t.startWithWindows },
  ];

  return (
    <AnimatePresence>
      {open && (
        <m.div
          id="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
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
            className="w-full max-w-[520px] max-h-[86vh] rounded-2xl overflow-hidden flex flex-col bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)]"
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
              <h2 className="m-0 text-[16px] font-bold tracking-tight">{t.settings}</h2>
              <button
                id="st-close"
                onClick={onClose}
                aria-label={t.close}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[75vh] flex-1 flex flex-col gap-5">
              {/* Appearance & Language */}
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t.appearanceLang}
                </div>
                <div className="rounded-xl border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40">
                  <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
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

                  <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
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

                  <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
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

              {/* Updates & Behavior */}
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t.autoUpdates}
                </div>
                <div className="rounded-xl border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40">
                  {toggleRows.map((row) => {
                    const checked = Boolean(settings[row.key]);
                    return (
                      <label
                        key={row.key}
                        className="px-3.5 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--color-surface-hover)]/40"
                      >
                        <span className="text-[13px] font-medium">{row.label}</span>
                        <span className="relative inline-flex items-center shrink-0">
                          <input
                            type="checkbox"
                            data-setting={row.key}
                            checked={checked}
                            onChange={(e) => onToggleSetting(row.key, e.target.checked)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0"
                          />
                          <span
                            dir="ltr"
                            className={`pointer-events-none w-10 h-6 rounded-full p-0.5 flex items-center border transition-colors duration-200 ${
                              checked
                                ? "bg-[#1473E6] border-[#378EF0]/60 justify-end"
                                : "bg-black/25 dark:bg-white/10 border-[var(--color-border-strong)] justify-start"
                            }`}
                          >
                            <m.span
                              layout
                              transition={SPRINGS.snappy}
                              className="w-[18px] h-[18px] rounded-full bg-white shadow-sm block"
                            />
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
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
