import React from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowLeft, Download, FolderOpen, Play, Trash2 } from "lucide-react";
import { CatalogItem, humanBytes } from "../lib/api";
import { APP_BLURBS, I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface Props {
  item: CatalogItem | null;
  lang: Lang;
  onClose: () => void;
  onInstall: (id: string) => void;
  onLaunch: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onUninstall: (id: string) => void;
}

export const AppDetailView: React.FC<Props> = ({
  item,
  lang,
  onClose,
  onInstall,
  onLaunch,
  onOpenFolder,
  onUninstall,
}) => {
  const t = I18N[lang];
  const isAr = lang === "ar";
  const meta = item ? APP_BLURBS[item.id] || { en: item.tagline_ar || "", color: item.accent || "#3b63fb" } : null;

  return (
    <AnimatePresence>
      {item && meta && (
        <m.div
          id="detail-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[320] flex items-center justify-center p-5 bg-[var(--color-scrim)]"
        >
          <m.div
            id="detail-drawer"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={SPRINGS.gentle}
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "var(--shadow-elevated)" }}
            className="w-full max-w-[820px] max-h-[88vh] rounded-2xl overflow-hidden flex flex-col bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)]"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)]">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
              >
                <ArrowLeft size={15} className={isAr ? "rotate-180" : ""} />
                <span>{t.allApps}</span>
              </button>
              <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">
                v{item.state?.installed_version || item.version}
              </span>
            </div>

            <div className="overflow-y-auto p-6 flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-4">
                <img src={`./icons/${item.id}.svg`} alt={item.name} className="w-16 h-16 rounded-2xl shadow-lg" />
                <div className="flex-1 min-w-[200px]">
                  <h2 className="m-0 text-[22px] font-bold">{item.name}</h2>
                  <p className="m-0 mt-1 text-[13.5px] text-[var(--color-text-secondary)]">
                    {isAr ? item.tagline_ar || meta.en : meta.en}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.state?.installed && !item.state?.has_update ? (
                    <button
                      onClick={() => onLaunch(item.id)}
                      className="h-9 px-4 rounded-xl bg-[var(--color-action-bg)] text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Play size={14} /> {t.open}
                    </button>
                  ) : (
                    <button
                      onClick={() => onInstall(item.id)}
                      className="h-9 px-4 rounded-xl bg-[var(--color-action-bg)] text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Download size={14} /> {item.state?.has_update ? t.update : t.install}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl overflow-hidden border border-[var(--color-border-subtle)] bg-black/30 aspect-[16/9]">
                <img
                  src={`./previews/${item.id}.jpg`}
                  alt={`${item.name} preview`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                  }}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
                <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]">
                  <div className="text-[var(--color-text-muted)] text-[11px]">{isAr ? "الإصدار" : "Version"}</div>
                  <div className="font-bold mt-0.5">v{item.version}</div>
                </div>
                <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]">
                  <div className="text-[var(--color-text-muted)] text-[11px]">{isAr ? "الحجم" : "Package Size"}</div>
                  <div className="font-bold mt-0.5">{humanBytes(item.setup_size)}</div>
                </div>
                <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]">
                  <div className="text-[var(--color-text-muted)] text-[11px]">{isAr ? "الفئة" : "Category"}</div>
                  <div className="font-bold mt-0.5">{item.category === "adobe" ? "Adobe CEP" : "Windows Desktop"}</div>
                </div>
              </div>

              {item.state?.installed && (
                <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                  <button
                    onClick={() => onOpenFolder(item.id)}
                    className="h-8 px-3 rounded-lg border border-[var(--color-border-subtle)] text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--color-surface-hover)] cursor-pointer"
                  >
                    <FolderOpen size={13} /> {t.openFolder}
                  </button>
                  <button
                    onClick={() => onUninstall(item.id)}
                    className="h-8 px-3 rounded-lg border border-red-500/25 text-[#f87171] text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 size={13} /> {t.uninstall}
                  </button>
                </div>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
