import React, { useRef } from "react";
import { m } from "motion/react";
import { MoreHorizontal, Pause, Play, X, AlertTriangle } from "lucide-react";
import { CatalogItem, HubTask, humanBytes } from "../lib/api";
import { APP_BLURBS, I18N, Lang, shortAppName } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";
import { soundEngine } from "../lib/sound";

export type DropTargetState = "idle" | "match" | "dim";

interface SharedAppProps {
  item: CatalogItem;
  task?: HubTask;
  lang: Lang;
  successGlow?: boolean;
  dropState?: DropTargetState;
  onSelect: (item: CatalogItem) => void;
  onInstall: (id: string) => void;
  onLaunch: (id: string) => void;
  onPauseTask?: (id: string) => void;
  onResumeTask?: (id: string) => void;
  onCancelTask?: (id: string) => void;
  onForceCloseRetry?: (id: string) => void;
  onContextMenu: (item: CatalogItem, x: number, y: number) => void;
  onHoverColor?: (color: string | null) => void;
  onDropFile?: (item: CatalogItem, filePath: string) => void;
}

function isTaskBusy(task?: HubTask): boolean {
  return Boolean(
    task && ["queued", "checking", "downloading", "paused", "verifying", "installing", "app_running"].includes(task.status)
  );
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return "";
  const mb = bps / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.round(bps / 1024)} KB/s`;
}

function stageLabel(task: HubTask, lang: Lang): string {
  const t = I18N[lang];
  if (task.status === "paused") return t.paused;
  if (task.status === "checking" || task.stage === "checking") return t.checking;
  if (task.status === "verifying" || task.stage === "verifying") return t.verifying;
  if (task.status === "installing" || task.stage === "installing") return t.installing;
  return `${Math.round(task.progress || 0)}%`;
}

const InlineProgressPill: React.FC<{
  task: HubTask;
  lang: Lang;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onForceCloseRetry?: (id: string) => void;
}> = ({ task, lang, onPause, onResume, onCancel, onForceCloseRetry }) => {
  const t = I18N[lang];

  if (task.status === "app_running") {
    return (
      <m.div
        layout
        transition={SPRINGS.snappy}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5"
      >
        <button
          onClick={() => {
            soundEngine.playClick();
            onForceCloseRetry?.(task.id);
          }}
          className="h-7 px-2.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer hover:bg-amber-500/25"
        >
          <AlertTriangle size={11} />
          {t.appRunningClose}
        </button>
        <button
          onClick={() => onCancel?.(task.id)}
          aria-label={t.cancel}
          className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
        >
          <X size={12} />
        </button>
      </m.div>
    );
  }

  const pct = Math.max(2, Math.min(100, Math.round(task.progress || 0)));
  const spd = formatSpeed(task.speed_bps);
  const paused = task.status === "paused";
  const canPause = ["queued", "checking", "downloading"].includes(task.status);

  return (
    <m.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRINGS.snappy}
      onClick={(e) => e.stopPropagation()}
      className="relative h-8 min-w-[148px] px-2.5 rounded-full bg-[var(--color-surface-hover)] border border-[var(--color-border-strong)] inline-flex items-center justify-between gap-2 overflow-hidden"
    >
      {/* Live fill progress bar */}
      <div
        className="absolute inset-y-0 start-0 transition-all duration-200 pointer-events-none"
        style={{
          width: `${pct}%`,
          background: paused
            ? "rgba(251, 191, 36, 0.22)"
            : "linear-gradient(90deg, rgba(20, 115, 230, 0.28), rgba(55, 142, 240, 0.42))",
        }}
      />
      <div className="relative z-10 flex items-center gap-1.5 text-[11px] font-semibold tabular-nums whitespace-nowrap">
        <span className={paused ? "text-amber-400" : "text-[var(--color-text-primary)]"}>
          {stageLabel(task, lang)}
        </span>
        {spd && !paused && (
          <span className="text-[10px] text-[var(--color-text-muted)]" dir="ltr">
            {spd}
          </span>
        )}
      </div>
      <div className="relative z-10 flex items-center gap-0.5">
        {paused ? (
          <button
            onClick={() => {
              soundEngine.playClick();
              onResume?.(task.id);
            }}
            title={t.resume}
            aria-label={t.resume}
            className="w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-white/15 text-[var(--color-text-primary)] cursor-pointer"
          >
            <Play size={10} />
          </button>
        ) : canPause ? (
          <button
            onClick={() => {
              soundEngine.playClick();
              onPause?.(task.id);
            }}
            title={t.pause}
            aria-label={t.pause}
            className="w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-white/15 text-[var(--color-text-primary)] cursor-pointer"
          >
            <Pause size={10} />
          </button>
        ) : null}
        {task.status !== "installing" && (
          <button
            onClick={() => {
              soundEngine.playClick();
              onCancel?.(task.id);
            }}
            title={t.cancel}
            aria-label={t.cancel}
            className="w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-white/15 text-[var(--color-text-muted)] hover:text-red-400 cursor-pointer"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </m.div>
  );
};

/* ============================================================================
   ADOBE CREATIVE CLOUD COMPACT HORIZONTAL ROW (Installed Section)
   ============================================================================ */
export const InstalledAppRow: React.FC<SharedAppProps> = ({
  item,
  task,
  lang,
  successGlow = false,
  dropState = "idle",
  onSelect,
  onInstall,
  onLaunch,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onForceCloseRetry,
  onContextMenu,
  onHoverColor,
  onDropFile,
}) => {
  const t = I18N[lang];
  const blurb = APP_BLURBS[item.id];
  const color = blurb?.color || item.accent || "#1473E6";
  const hasUpdate = Boolean(item.state?.has_update);
  const busy = isTaskBusy(task);
  const isAdobe = item.category === "adobe";
  const title = shortAppName(item.name);
  const desc = lang === "ar" ? item.tagline_ar || item.description_ar || "" : blurb?.en || item.tagline_ar || "";

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
    const fpath = file?.path || file?.name || "";
    if (fpath && onDropFile) onDropFile(item, fpath);
  };

  return (
    <div
      data-id={item.id}
      style={{ "--app-color": color } as React.CSSProperties}
      onMouseEnter={() => onHoverColor?.(color)}
      onMouseLeave={() => onHoverColor?.(null)}
      onDragOver={(e) => {
        if (dropState === "match") e.preventDefault();
      }}
      onDrop={handleDrop}
      onClick={() => onSelect(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(item, e.clientX, e.clientY);
      }}
      className={`cc-installed-row rounded-xl px-3.5 py-2.5 flex items-center gap-3.5 cursor-pointer ${
        successGlow ? "success-glow" : ""
      } ${dropState === "dim" ? "drop-dim" : dropState === "match" ? "drop-match" : ""}`}
    >
      <div className="w-9 h-9 rounded-[9px] flex-shrink-0 inline-flex items-center justify-center overflow-hidden">
        <img
          src={`./icons/${item.id}.png`}
          alt={item.name}
          className="w-9 h-9 object-contain"
          loading="lazy"
          draggable={false}
        />
      </div>

      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-[13.5px] font-semibold tracking-tight text-[var(--color-text-primary)] whitespace-nowrap"
            dir="ltr"
          >
            {title}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums whitespace-nowrap" dir="ltr">
            v{item.state?.installed_version || item.version}
          </span>
        </div>
        <p className="m-0 text-[12px] text-[var(--color-text-secondary)] truncate">{desc}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {busy && task ? (
          <InlineProgressPill
            task={task}
            lang={lang}
            onPause={onPauseTask}
            onResume={onResumeTask}
            onCancel={onCancelTask}
            onForceCloseRetry={onForceCloseRetry}
          />
        ) : hasUpdate ? (
          <m.button
            whileTap={{ scale: 0.96 }}
            transition={SPRINGS.snappy}
            onClick={() => {
              soundEngine.playClick();
              onInstall(item.id);
            }}
            className="h-7 px-3.5 rounded-full bg-[#1473E6] hover:bg-[#0D66D0] text-white text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            {t.update}
          </m.button>
        ) : (
          <m.button
            whileTap={{ scale: 0.96 }}
            transition={SPRINGS.snappy}
            onClick={() => {
              soundEngine.playClick();
              isAdobe ? onSelect(item) : onLaunch(item.id);
            }}
            className="h-7 px-3.5 rounded-full border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)] text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            {t.open}
          </m.button>
        )}

        <button
          onClick={(e) => {
            soundEngine.playClick();
            const r = e.currentTarget.getBoundingClientRect();
            onContextMenu(item, r.right, r.bottom + 4);
          }}
          aria-label="More options"
          className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
    </div>
  );
};

/* ============================================================================
   ADOBE CREATIVE CLOUD CLEAN CARD (Available in your plan + 3D Magnetic Tilt)
   ============================================================================ */
export const AppCard: React.FC<SharedAppProps> = ({
  item,
  task,
  lang,
  successGlow = false,
  dropState = "idle",
  onSelect,
  onInstall,
  onLaunch,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onForceCloseRetry,
  onContextMenu,
  onHoverColor,
  onDropFile,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const t = I18N[lang];
  const blurb = APP_BLURBS[item.id];
  const color = blurb?.color || item.accent || "#1473E6";
  const installed = Boolean(item.state?.installed);
  const hasUpdate = Boolean(item.state?.has_update);
  const busy = isTaskBusy(task);
  const isAdobe = item.category === "adobe";
  const title = shortAppName(item.name);
  const desc = lang === "ar" ? item.tagline_ar || item.description_ar || "" : blurb?.en || item.tagline_ar || "";

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);

    // 3D Magnetic Tilt (max ±4.5deg, GPU transform only, disabled under prefers-reduced-motion)
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      const nx = (x / Math.max(1, rect.width) - 0.5) * 2; // [-1..1]
      const ny = (y / Math.max(1, rect.height) - 0.5) * 2;
      const rotY = nx * 4.5;
      const rotX = -ny * 4.5;
      el.style.transform = `perspective(760px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-2px)`;
    }
  };

  const handlePointerLeave = () => {
    onHoverColor?.(null);
    const el = cardRef.current;
    if (el) {
      el.style.transform = "";
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
    const fpath = file?.path || file?.name || "";
    if (fpath && onDropFile) onDropFile(item, fpath);
  };

  return (
    <div
      ref={cardRef}
      data-id={item.id}
      style={{ "--app-color": color } as React.CSSProperties}
      onPointerMove={handlePointerMove}
      onMouseEnter={() => onHoverColor?.(color)}
      onPointerLeave={handlePointerLeave}
      onDragOver={(e) => {
        if (dropState === "match") e.preventDefault();
      }}
      onDrop={handleDrop}
      onClick={() => onSelect(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(item, e.clientX, e.clientY);
      }}
      className={`craft-card rounded-2xl p-4 flex flex-col gap-3 cursor-pointer ${
        successGlow ? "success-glow" : ""
      } ${dropState === "dim" ? "drop-dim" : dropState === "match" ? "drop-match" : ""}`}
    >
      {/* Header Row: Icon + Clean Short Title + Subtle Meta (no badge clutter) */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="card-icon-stage">
          <img
            src={`./icons/${item.id}.png`}
            alt={item.name}
            className="card-icon-img"
            loading="lazy"
            draggable={false}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3
              className="m-0 text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)] truncate"
              dir="ltr"
              title={item.name}
            >
              {title}
            </h3>
            <button
              onClick={(e) => {
                e.stopPropagation();
                soundEngine.playClick();
                const r = e.currentTarget.getBoundingClientRect();
                onContextMenu(item, r.right, r.bottom + 4);
              }}
              aria-label="More options"
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer flex-shrink-0"
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
            <span dir="ltr" className="tabular-nums">v{item.version}</span>
            {isAdobe && (
              <>
                <span>•</span>
                <span>{t.pluginBadge}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Clean 2-Line Description */}
      <p className="relative z-10 m-0 text-[12.5px] leading-[1.52] text-[var(--color-text-secondary)] line-clamp-2 min-h-[38px]">
        {desc}
      </p>

      {/* Footer: Size + Spectrum Blue #1473E6 Install / Outlined Open / Inline Progress Pill */}
      <div className="relative z-10 mt-auto pt-1 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums" dir="ltr">
          {installed && !hasUpdate
            ? t.installedTag
            : item.coming_soon
              ? `v${item.version}`
              : humanBytes(item.setup_size)}
        </span>

        {busy && task ? (
          <InlineProgressPill
            task={task}
            lang={lang}
            onPause={onPauseTask}
            onResume={onResumeTask}
            onCancel={onCancelTask}
            onForceCloseRetry={onForceCloseRetry}
          />
        ) : item.coming_soon ? (
          <span className="h-8 px-3.5 rounded-full border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-muted)] text-[12px] font-semibold inline-flex items-center">
            {t.comingSoon}
          </span>
        ) : hasUpdate ? (
          <m.button
            whileTap={{ scale: 0.96 }}
            transition={SPRINGS.snappy}
            onClick={(e) => {
              e.stopPropagation();
              soundEngine.playClick();
              onInstall(item.id);
            }}
            className="h-8 px-4 rounded-full bg-[#1473E6] hover:bg-[#0D66D0] text-white text-[12.5px] font-semibold transition-colors cursor-pointer"
          >
            {t.update}
          </m.button>
        ) : installed ? (
          <m.button
            whileTap={{ scale: 0.96 }}
            transition={SPRINGS.snappy}
            onClick={(e) => {
              e.stopPropagation();
              soundEngine.playClick();
              isAdobe ? onSelect(item) : onLaunch(item.id);
            }}
            className="h-8 px-4 rounded-full border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)] text-[12.5px] font-semibold transition-colors cursor-pointer"
          >
            {t.open}
          </m.button>
        ) : (
          <m.button
            whileTap={{ scale: 0.96 }}
            transition={SPRINGS.snappy}
            onClick={(e) => {
              e.stopPropagation();
              soundEngine.playClick();
              onInstall(item.id);
            }}
            className="h-8 px-4 rounded-full bg-[#1473E6] hover:bg-[#0D66D0] text-white text-[12.5px] font-semibold transition-colors cursor-pointer"
          >
            {t.install}
          </m.button>
        )}
      </div>
    </div>
  );
};
