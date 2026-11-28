import React, { useRef } from "react";
import { m } from "motion/react";
import { MoreHorizontal } from "lucide-react";
import { CatalogItem, HubTask, humanBytes } from "../lib/api";
import { APP_BLURBS, I18N, Lang, shortAppName } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface Props {
  item: CatalogItem;
  task?: HubTask;
  lang: Lang;
  onSelect: (item: CatalogItem) => void;
  onInstall: (id: string) => void;
  onLaunch: (id: string) => void;
  onContextMenu: (item: CatalogItem, x: number, y: number) => void;
}

export const AppCard: React.FC<Props> = ({
  item,
  task,
  lang,
  onSelect,
  onInstall,
  onLaunch,
  onContextMenu,
}) => {
  const t = I18N[lang];
  const cardRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number>(0);

  const meta = APP_BLURBS[item.id] || { en: item.tagline_ar || "", color: item.accent || "#3b63fb" };
  const desc = lang === "ar" ? item.tagline_ar || item.description_ar || meta.en : meta.en;
  const st = item.state || { installed: false };
  const isBusy = Boolean(task && ["queued", "downloading", "installing"].includes(task.status));
  const displayName = shortAppName(item.name);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const x = e.clientX;
    const y = e.clientY;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${(x - r.left).toFixed(1)}px`);
      el.style.setProperty("--my", `${(y - r.top).toFixed(1)}px`);
    });
  };

  return (
    <m.article
      ref={cardRef}
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={SPRINGS.gentle}
      onPointerMove={handlePointerMove}
      onClick={() => onSelect(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(item, e.clientX, e.clientY);
      }}
      style={{ "--app-color": meta.color } as React.CSSProperties}
      className="craft-card rounded-[14px] p-4 flex flex-col justify-between gap-4 cursor-pointer min-h-[168px]"
    >
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="card-icon-stage">
            <img
              className="card-icon"
              src={`./icons/${item.id}.svg`}
              alt={item.name}
              decoding="async"
              loading="lazy"
            />
          </span>

          <div className="flex-1 min-w-0">
            <div
              dir="ltr"
              title={item.name}
              className={`text-[15px] font-bold text-[var(--color-text-primary)] truncate ${
                lang === "ar" ? "text-right" : "text-left"
              }`}
            >
              {displayName}
            </div>
            <div className="flex items-center flex-nowrap gap-1.5 mt-1.5 overflow-hidden">
              <span
                dir="ltr"
                className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] whitespace-nowrap shrink-0"
              >
                v{st.installed_version || item.version}
              </span>
              <span
                dir="ltr"
                className="text-[11px] font-medium px-1.5 py-0.5 rounded-md border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0"
              >
                {item.category === "adobe" ? "Adobe CEP" : "Desktop"}
              </span>
              {st.has_update && (
                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-md bg-[#3b63fb]/20 text-[#60a5fa] whitespace-nowrap shrink-0">
                  {t.updateTag}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            aria-label="More actions"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onContextMenu(item, r.left, r.bottom + 4);
            }}
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer shrink-0"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>

        <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--color-text-secondary)] line-clamp-2">
          {desc}
        </p>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
        {isBusy && task ? (
          <div className="w-full flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11.5px] text-[var(--color-text-secondary)]">
              <span>{task.status === "installing" ? t.installing : t.downloading}</span>
              <strong dir="ltr" className="tabular-nums">{task.progress}%</strong>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#3b63fb] origin-left transition-transform duration-200"
                style={{ transform: `scaleX(${Math.max(0.04, (task.progress || 0) / 100).toFixed(3)})` }}
              />
            </div>
          </div>
        ) : (
          <>
            <span
              dir={st.installed && !st.has_update ? undefined : "ltr"}
              className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums whitespace-nowrap"
            >
              {st.installed && !st.has_update ? t.installedTag : humanBytes(item.setup_size)}
            </span>

            <m.button
              whileTap={{ scale: 0.96 }}
              transition={SPRINGS.snappy}
              onClick={(e) => {
                e.stopPropagation();
                if (st.installed && !st.has_update) onLaunch(item.id);
                else onInstall(item.id);
              }}
              className={`h-8 px-3.5 rounded-lg text-[12.5px] font-semibold cursor-pointer transition-colors ${
                st.installed && !st.has_update
                  ? "bg-[var(--color-surface-hover)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-active)]"
                  : "bg-[var(--color-action-bg)] text-white hover:bg-[var(--color-action-hover)]"
              }`}
            >
              {st.has_update ? t.update : st.installed ? t.open : t.install}
            </m.button>
          </>
        )}
      </div>
    </m.article>
  );
};
