import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MoreHorizontal } from "lucide-react";
import { CatalogItem, HubTask, humanBytes } from "../lib/api";
import { APP_BLURBS, I18N, Lang } from "../lib/i18n";

interface Props {
  items: CatalogItem[];
  taskMap: Map<string, HubTask>;
  lang: Lang;
  onSelect: (item: CatalogItem) => void;
  onInstall: (id: string) => void;
  onLaunch: (id: string) => void;
  onContextMenu: (item: CatalogItem, x: number, y: number) => void;
}

/**
 * TanStack Virtualized List View (transform: translateY(...) positioning, zero full-table re-renders)
 */
export const VirtualAppList: React.FC<Props> = ({
  items,
  taskMap,
  lang,
  onSelect,
  onInstall,
  onLaunch,
  onContextMenu,
}) => {
  const t = I18N[lang];
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 68,
    overscan: 6,
  });

  return (
    <div ref={scrollParentRef} className="w-full max-h-[calc(100vh-165px)] overflow-y-auto pe-1">
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const item = items[vRow.index];
          const task = taskMap.get(item.id);
          const st = item.state || { installed: false };
          const meta = APP_BLURBS[item.id] || { en: item.tagline_ar || "", color: item.accent || "#3b63fb" };
          const desc = lang === "ar" ? item.tagline_ar || meta.en : meta.en;

          return (
            <div
              key={item.id}
              className="app-list-row absolute top-0 left-0 w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] hover:bg-[var(--color-surface-card-hover)] flex items-center gap-3.5 cursor-pointer transition-colors"
              style={{
                height: "60px",
                transform: `translate3d(0, ${vRow.start}px, 0)`,
              }}
              onClick={() => onSelect(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(item, e.clientX, e.clientY);
              }}
            >
              <img src={`./icons/${item.id}.svg`} alt={item.name} className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold truncate">{item.name}</span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">v{st.installed_version || item.version}</span>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)] truncate">{desc}</div>
              </div>
              <span className="text-[11.5px] text-[var(--color-text-muted)] hidden sm:inline tabular-nums">
                {task && task.status === "downloading" ? `${task.progress}%` : humanBytes(item.setup_size)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (st.installed && !st.has_update) onLaunch(item.id);
                  else onInstall(item.id);
                }}
                className={`h-8 px-3 rounded-lg text-[12px] font-semibold cursor-pointer ${
                  st.installed && !st.has_update
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]"
                    : "bg-[var(--color-action-bg)] text-white"
                }`}
              >
                {st.has_update ? t.update : st.installed ? t.open : t.install}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  onContextMenu(item, r.left, r.bottom + 4);
                }}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
