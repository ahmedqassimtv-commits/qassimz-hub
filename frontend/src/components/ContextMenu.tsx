import React, { useEffect, useRef, useState } from "react";
import { computePosition, flip, offset, shift, VirtualElement } from "@floating-ui/dom";
import { AnimatePresence, m } from "motion/react";
import { Download, ExternalLink, FolderOpen, History, Play, Trash2, Wrench } from "lucide-react";
import { CatalogItem } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface Props {
  menu: { item: CatalogItem; x: number; y: number } | null;
  lang: Lang;
  onClose: () => void;
  onInstall: (id: string) => void;
  onLaunch: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onOtherVersions: (item: CatalogItem) => void;
  onUninstall: (id: string) => void;
  onOpenDetails: (item: CatalogItem) => void;
}

/**
 * Floating UI Virtual Element (0x0) Context Menu with automatic flip() + shift() viewport clamping
 */
export const ContextMenu: React.FC<Props> = ({
  menu,
  lang,
  onClose,
  onInstall,
  onLaunch,
  onOpenFolder,
  onOtherVersions,
  onUninstall,
  onOpenDetails,
}) => {
  const t = I18N[lang];
  const floatingRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>(() =>
    menu ? { x: menu.x, y: menu.y } : { x: 0, y: 0 }
  );

  useEffect(() => {
    if (!menu || !floatingRef.current) return;
    setCoords({ x: menu.x, y: menu.y });
    const virtualEl: VirtualElement = {
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        x: menu.x,
        y: menu.y,
        top: menu.y,
        left: menu.x,
        right: menu.x,
        bottom: menu.y,
      }),
    };
    computePosition(virtualEl, floatingRef.current, {
      placement: "bottom-start",
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => setCoords({ x, y }));
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (floatingRef.current && !floatingRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  const installed = Boolean(menu?.item.state?.installed);

  return (
    <AnimatePresence>
      {menu && (
        <m.div
          ref={floatingRef}
          id="card-more-menu"
          role="menu"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={SPRINGS.snappy}
          style={{
            position: "fixed",
            top: `${Math.round(coords.y)}px`,
            left: `${Math.round(coords.x)}px`,
            zIndex: 450,
            boxShadow: "var(--shadow-elevated)",
          }}
          className="min-w-[215px] p-1.5 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] flex flex-col gap-0.5"
        >
          <button
            role="menuitem"
            onClick={() => {
              onOpenDetails(menu.item);
              onClose();
            }}
            className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[12.5px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-start"
          >
            <ExternalLink size={14} />
            <span dir="ltr">{menu.item.name}</span>
          </button>

          {installed && (
            <button
              role="menuitem"
              onClick={() => {
                onLaunch(menu.item.id);
                onClose();
              }}
              className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[12.5px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-start"
            >
              <Play size={14} />
              <span>{t.open}</span>
            </button>
          )}

          <button
            role="menuitem"
            onClick={() => {
              onInstall(menu.item.id);
              onClose();
            }}
            className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[12.5px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-start"
          >
            {installed && !menu.item.state?.has_update ? <Wrench size={14} /> : <Download size={14} />}
            <span>
              {menu.item.state?.has_update
                ? t.update
                : installed
                ? t.repairReinstall
                : t.install}
            </span>
          </button>

          <button
            role="menuitem"
            onClick={() => {
              onOtherVersions(menu.item);
              onClose();
            }}
            className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[12.5px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-start"
          >
            <History size={14} />
            <span>{t.otherVersions}</span>
          </button>

          {installed && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  onOpenFolder(menu.item.id);
                  onClose();
                }}
                className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[12.5px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-start"
              >
                <FolderOpen size={14} />
                <span>{t.openFolder}</span>
              </button>
              <div className="my-1 h-[1px] bg-[var(--color-border-subtle)]" />
              <button
                role="menuitem"
                onClick={() => {
                  onUninstall(menu.item.id);
                  onClose();
                }}
                className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[12.5px] font-medium text-[#f87171] hover:bg-red-500/10 cursor-pointer text-start"
              >
                <Trash2 size={14} />
                <span>{t.uninstall}</span>
              </button>
            </>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
};
