import React, { useEffect, useMemo, useState } from "react";
import { m } from "motion/react";
import { CheckCircle2, Download, FolderOpen, Loader2, Sparkles, Trash2 } from "lucide-react";
import { HubBridge, LibraryItemState, LibraryPayload, humanBytes } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface Props {
  lang: Lang;
  library: LibraryPayload | null;
  onRefresh: () => void;
  onToast: (msg: string, kind?: "info" | "error") => void;
}

/**
 * Library & AI Models — shared AI models and brand assets used by every app.
 * (Fonts live in the separate QASSIMZ FONTs app.)
 */
export const LibraryView: React.FC<Props> = ({ lang, library, onRefresh, onToast }) => {
  const t = I18N[lang];
  const [live, setLive] = useState<LibraryPayload | null>(library);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLive(library);
  }, [library]);

  const downloads = live?.downloads || {};
  const active = Object.values(downloads).some((d) => d.status === "downloading" || d.status === "queued");

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const timer = setInterval(() => {
      HubBridge.libraryState()
        .then((next) => {
          if (!alive) return;
          setLive(next);
          const stillActive = Object.values(next.downloads || {}).some(
            (d) => d.status === "downloading" || d.status === "queued"
          );
          if (!stillActive) onRefresh();
        })
        .catch(() => {});
    }, 1200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, onRefresh]);

  const items = live?.items || [];
  const models = useMemo(() => items.filter((it) => it.kind === "model"), [items]);
  const installedBytes = live?.installed_bytes || 0;

  const startInstall = async (item: LibraryItemState) => {
    setBusy((b) => ({ ...b, [item.id]: true }));
    try {
      await HubBridge.installLibraryItem(item.id);
      setLive(await HubBridge.libraryState());
    } catch {
      onToast(t.friendlyErr, "error");
    } finally {
      setBusy((b) => ({ ...b, [item.id]: false }));
    }
  };

  const removeItem = async (item: LibraryItemState) => {
    setBusy((b) => ({ ...b, [item.id]: true }));
    try {
      await HubBridge.removeLibraryItem(item.id);
      setLive(await HubBridge.libraryState());
      onRefresh();
    } catch {
      onToast(t.friendlyErr, "error");
    } finally {
      setBusy((b) => ({ ...b, [item.id]: false }));
    }
  };

  const renderRow = (item: LibraryItemState) => {
    const dl = downloads[item.id];
    const downloading = dl?.status === "downloading" || dl?.status === "queued" || busy[item.id];
    const pct = Math.max(2, Math.min(100, Number(dl?.progress || 0)));
    const done = item.installed;
    const note = lang === "ar" ? item.note_ar : item.note_en;
    return (
      <m.div
        key={item.id}
        layout
        transition={SPRINGS.smooth}
        data-library-item={item.id}
        className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/40 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-lg shrink-0 inline-flex items-center justify-center bg-[var(--color-surface-active)] text-[var(--color-text-secondary)]">
          <Sparkles size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold truncate">{lang === "ar" ? item.name_ar : item.name}</span>
            <span className="text-[10.5px] font-semibold text-[var(--color-text-muted)] shrink-0 whitespace-nowrap tabular-nums" dir="ltr">
              {humanBytes(item.size_bytes)}
            </span>
            {done && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#34d399] shrink-0 whitespace-nowrap">
                <CheckCircle2 size={11} />
                {t.libInstalled}
              </span>
            )}
            {!done && item.partial && (
              <span className="text-[10.5px] font-semibold text-[var(--color-text-muted)] shrink-0 whitespace-nowrap">
                {t.libPartial}
              </span>
            )}
          </div>
          {note ? (
            <div className="text-[11px] text-[var(--color-text-muted)] truncate">{note}</div>
          ) : null}
          {downloading && (
            <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3b63fb] to-[#38bdf8] origin-left transition-transform duration-200"
                style={{ transform: `scaleX(${(pct / 100).toFixed(3)})` }}
              />
            </div>
          )}
        </div>
        {done ? (
          <button
            onClick={() => removeItem(item)}
            disabled={busy[item.id]}
            data-library-remove={item.id}
            className="h-8 px-3 rounded-lg shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#f87171] bg-red-500/12 hover:bg-red-500/22 cursor-pointer transition-colors disabled:opacity-60"
          >
            <Trash2 size={13} />
            <span className="whitespace-nowrap">{t.libRemove}</span>
          </button>
        ) : (
          <button
            onClick={() => startInstall(item)}
            disabled={downloading}
            data-library-install={item.id}
            className={`h-8 px-3 rounded-lg text-[12px] font-semibold shrink-0 inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              downloading
                ? "bg-[var(--color-surface-active)] text-[var(--color-text-muted)] cursor-wait"
                : "bg-[var(--color-action-bg)] text-white hover:bg-[var(--color-action-hover)]"
            }`}
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span className="whitespace-nowrap">
              {downloading ? `${t.libInstalling} ${pct > 2 ? `${Math.round(pct)}%` : ""}` : t.libInstall}
            </span>
          </button>
        )}
      </m.div>
    );
  };

  return (
    <div id="library-view" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-[12.5px] text-[var(--color-text-secondary)] max-w-[620px]">{t.librarySub}</p>
        <div className="px-3 py-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)]/50">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t.libTotalInstalled}
          </div>
          <div className="text-[13px] font-bold tabular-nums" dir="ltr">
            {humanBytes(installedBytes)}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2.5" data-library-section="models">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[13.5px] font-semibold tracking-tight text-[var(--color-text-primary)]">{t.aiModels}</h2>
            <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{t.aiModelsSub}</p>
          </div>
          <button
            onClick={() => HubBridge.openLibraryFolder("models").catch(() => {})}
            className="h-7 px-2.5 rounded-lg shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-active)] border border-[var(--color-border-subtle)] cursor-pointer transition-colors"
          >
            <FolderOpen size={12} />
            <span>{t.libOpenFolder}</span>
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {models.length ? models.map(renderRow) : <div className="text-[12px] text-[var(--color-text-muted)]">{t.libNoItems}</div>}
        </div>
      </section>

      <section className="flex flex-col gap-2.5" data-library-section="assets">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[13.5px] font-semibold tracking-tight text-[var(--color-text-primary)]">{t.brandAssets}</h2>
            <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{t.brandAssetsSub}</p>
          </div>
          <button
            onClick={() => HubBridge.openLibraryFolder("assets").catch(() => {})}
            className="h-7 px-2.5 rounded-lg shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-active)] border border-[var(--color-border-subtle)] cursor-pointer transition-colors"
          >
            <FolderOpen size={12} />
            <span>{t.libOpenFolder}</span>
          </button>
        </div>
        <div className="p-3.5 rounded-xl border border-dashed border-[var(--color-border-subtle)] text-[11.5px] text-[var(--color-text-muted)]" dir="ltr">
          {live?.assets_dir || "%APPDATA%/QASSIMZ Hub/library/assets"}
        </div>
      </section>
    </div>
  );
};
