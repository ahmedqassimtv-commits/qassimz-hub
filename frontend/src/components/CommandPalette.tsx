import React, { useMemo, useState } from "react";
import { Command } from "cmdk";
import { AnimatePresence, m } from "motion/react";
import { Compass, Languages, Moon, RefreshCw, Search, Settings, Sparkles } from "lucide-react";
import { CatalogItem } from "../lib/api";
import { fuzzyScore, getFrecencyScore, recordCommandUse } from "../lib/frecency";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface Props {
  open: boolean;
  lang: Lang;
  items: CatalogItem[];
  onClose: () => void;
  onSelectApp: (item: CatalogItem) => void;
  onCheckUpdates: () => void;
  onToggleTheme: () => void;
  onToggleLang: () => void;
  onOpenSettings: () => void;
  onStartTour: () => void;
}

/**
 * cmdk Command Palette (Ctrl+K / Ctrl+Shift+P) with Fuzzy Search + Frecency + WAI-ARIA combobox
 */
export const CommandPalette: React.FC<Props> = ({
  open,
  lang,
  items,
  onClose,
  onSelectApp,
  onCheckUpdates,
  onToggleTheme,
  onToggleLang,
  onOpenSettings,
  onStartTour,
}) => {
  const t = I18N[lang];
  const [search, setSearch] = useState("");

  const rankedApps = useMemo(() => {
    return [...items]
      .map((item) => {
        const hay = `${item.name} ${item.name_ar || ""} ${item.tagline_ar || ""} ${item.category}`;
        const fz = fuzzyScore(search, hay);
        const frec = getFrecencyScore(`app:${item.id}`);
        return { item, score: fz === 0 ? 0 : fz + frec * 2 };
      })
      .filter((x) => (search.trim() ? x.score > 0 : true))
      .sort((a, b) => b.score - a.score);
  }, [items, search]);

  const runAndClose = (cmdId: string, fn: () => void) => {
    recordCommandUse(cmdId);
    setSearch("");
    onClose();
    fn();
  };

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[480] flex items-start justify-center pt-[13vh] px-4 bg-[var(--color-scrim)]"
        >
          <m.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={SPRINGS.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "var(--shadow-elevated)" }}
            className="w-full max-w-[560px] rounded-2xl overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)]"
          >
            <Command shouldFilter={false} label="QASSIMZ Command Palette">
              <div className="flex items-center gap-2.5 px-4 h-12 border-b border-[var(--color-border-subtle)]">
                <Search size={16} className="text-[var(--color-text-muted)] shrink-0" />
                <Command.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder={t.commandPlaceholder}
                  className="w-full bg-transparent border-none outline-none text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                />
                <kbd className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-[360px] overflow-y-auto p-2 flex flex-col gap-1">
                <Command.Empty className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">
                  {t.commandEmpty}
                </Command.Empty>

                {rankedApps.length > 0 && (
                  <Command.Group
                    heading={
                      <span className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                        {t.allApps}
                      </span>
                    }
                  >
                    {rankedApps.slice(0, 8).map(({ item }) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => runAndClose(`app:${item.id}`, () => onSelectApp(item))}
                        className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] cursor-pointer data-[selected=true]:bg-[var(--color-surface-active)] text-[var(--color-text-primary)]"
                      >
                        <img src={`./icons/${item.id}.svg`} alt="" className="w-6 h-6 rounded-md shrink-0" />
                        <span className="font-semibold flex-1 truncate">{item.name}</span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          v{item.state?.installed_version || item.version}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group
                  heading={
                    <span className="px-2 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                      {lang === "ar" ? "إجراءات سريعة" : "Quick Actions"}
                    </span>
                  }
                >
                  <Command.Item
                    value="check-updates"
                    onSelect={() => runAndClose("cmd:updates", onCheckUpdates)}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] cursor-pointer data-[selected=true]:bg-[var(--color-surface-active)]"
                  >
                    <RefreshCw size={15} className="text-[#38bdf8]" />
                    <span>{t.checkUpdates}</span>
                  </Command.Item>
                  <Command.Item
                    value="toggle-theme"
                    onSelect={() => runAndClose("cmd:theme", onToggleTheme)}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] cursor-pointer data-[selected=true]:bg-[var(--color-surface-active)]"
                  >
                    <Moon size={15} className="text-[#60a5fa]" />
                    <span>{lang === "ar" ? "تبديل المظهر (داكن / فاتح)" : "Toggle Dark / Light Theme"}</span>
                  </Command.Item>
                  <Command.Item
                    value="toggle-lang"
                    onSelect={() => runAndClose("cmd:lang", onToggleLang)}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] cursor-pointer data-[selected=true]:bg-[var(--color-surface-active)]"
                  >
                    <Languages size={15} className="text-[#34d399]" />
                    <span>{lang === "ar" ? "التبديل إلى English" : "Switch to العربية (RTL)"}</span>
                  </Command.Item>
                  <Command.Item
                    value="open-settings"
                    onSelect={() => runAndClose("cmd:settings", onOpenSettings)}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] cursor-pointer data-[selected=true]:bg-[var(--color-surface-active)]"
                  >
                    <Settings size={15} className="text-[var(--color-text-secondary)]" />
                    <span>{t.settings}</span>
                  </Command.Item>
                  <Command.Item
                    value="guided-tour"
                    onSelect={() => runAndClose("cmd:tour", onStartTour)}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] cursor-pointer data-[selected=true]:bg-[var(--color-surface-active)]"
                  >
                    <Compass size={15} className="text-[#fbbf24]" />
                    <span>{t.guidedTour}</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
