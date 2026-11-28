import React from "react";
import { m } from "motion/react";
import {
  CheckCircle2,
  Compass,
  ExternalLink,
  LayoutGrid,
  LogOut,
  Monitor,
  Puzzle,
  RefreshCw,
} from "lucide-react";
import { CCUpdaterState, HubStatePayload, HubTask } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

export type ViewKey = "all" | "installed" | "updates" | "desktop" | "adobe";

interface Props {
  lang: Lang;
  view: ViewKey;
  expanded: boolean;
  state: HubStatePayload | null;
  hubTask?: HubTask;
  ccUpdater?: CCUpdaterState;
  checking: boolean;
  pillDismissed: boolean;
  onSelectView: (v: ViewKey) => void;
  onCheckUpdates: () => void;
  onOpenReleases: () => void;
  onStartTour: () => void;
  onFixCep: () => void;
  onQuit: () => void;
  onHubUpdateNow: () => void;
  onApplyStaged: () => void;
  onDismissPill: () => void;
}

export const Sidebar: React.FC<Props> = ({
  lang,
  view,
  expanded,
  state,
  hubTask,
  ccUpdater,
  checking,
  pillDismissed,
  onSelectView,
  onCheckUpdates,
  onOpenReleases,
  onStartTour,
  onFixCep,
  onQuit,
  onHubUpdateNow,
  onApplyStaged,
  onDismissPill,
}) => {
  const t = I18N[lang];
  const counts = state?.counts || { total: 13, installed: 0, updates: 0, desktop: 7, adobe: 6 };
  const cepReady = Boolean(state?.adobe?.cep_debug_ready);
  const isAr = lang === "ar";

  const primaryNav: Array<{ id: string; key: ViewKey; label: string; count: number; icon: React.ReactNode }> = [
    { id: "nav-all", key: "all", label: t.allApps, count: counts.total, icon: <LayoutGrid size={15} /> },
    { id: "nav-installed", key: "installed", label: t.installed, count: counts.installed, icon: <CheckCircle2 size={15} /> },
    { id: "nav-updates", key: "updates", label: t.updates, count: counts.updates, icon: <RefreshCw size={15} /> },
  ];

  const catNav: Array<{ id: string; key: ViewKey; label: string; count: number; icon: React.ReactNode }> = [
    { id: "nav-desktop", key: "desktop", label: t.desktopApps, count: counts.desktop, icon: <Monitor size={15} /> },
    { id: "nav-adobe", key: "adobe", label: t.adobeCep, count: counts.adobe, icon: <Puzzle size={15} /> },
  ];

  const renderNavBtn = (item: { id: string; key: ViewKey; label: string; count: number; icon: React.ReactNode }) => {
    const active = view === item.key;
    return (
      <button
        key={item.key}
        id={item.id}
        role="tab"
        aria-selected={active}
        onClick={() => onSelectView(item.key)}
        className={`relative w-full h-9 px-2.5 rounded-[10px] flex items-center gap-2.5 text-[13px] font-medium cursor-pointer transition-colors ${
          active ? "text-[var(--color-text-primary)] font-semibold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        }`}
      >
        {active && (
          <m.span
            layoutId="sidebar-active-pill"
            transition={SPRINGS.snappy}
            className="absolute inset-0 rounded-[10px] bg-[var(--color-surface-active)] border border-[var(--color-border-subtle)]"
          />
        )}
        <span className="relative z-10 shrink-0">{item.icon}</span>
        <span className="relative z-10 sb-collapse-hide flex-1 text-start truncate">{item.label}</span>
        <span className="relative z-10 sb-collapse-hide text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] tabular-nums">
          {item.count}
        </span>
      </button>
    );
  };

  // Minimalist Glassmorphic Sidebar Update Pill (3 clean human stages)
  const renderUpdatePill = () => {
    if (hubTask && ["queued", "downloading", "installing", "completed"].includes(hubTask.status)) {
      const pct = Math.max(2, Math.min(100, Number(hubTask.progress || 0)));
      const st = String(hubTask.stage || hubTask.status);
      const label =
        hubTask.status === "completed" || st === "completed"
          ? isAr ? "تم التحديث بنجاح — أعد التشغيل" : "Update ready — Restarting…"
          : st === "verifying" || st === "applying" || hubTask.status === "installing" || pct >= 82
          ? isAr ? "جارٍ التحقق والتجهيز..." : "Verifying & preparing…"
          : isAr ? "جارٍ تنزيل التحديث..." : "Downloading update…";
      return (
        <div
          id="hub-update-pill"
          className="sb-collapse-hide mb-2.5 p-2.5 rounded-xl border border-[#60a5fa]/25 bg-[#3b63fb]/10 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 text-[11.5px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">{pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#3b63fb] to-[#38bdf8] origin-left transition-transform duration-200"
              style={{ transform: `scaleX(${(pct / 100).toFixed(3)})` }}
            />
          </div>
        </div>
      );
    }

    if (ccUpdater?.phase === "staged_ready") {
      return (
        <div
          id="hub-update-pill"
          className="sb-collapse-hide mb-2.5 p-2.5 rounded-xl border border-[#34d399]/30 bg-[#10b981]/10 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 text-[11.5px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#34d399] shrink-0" />
            <span className="flex-1 truncate">{isAr ? "تم التحديث بنجاح — أعد التشغيل" : "Update ready — Restart"}</span>
          </div>
          <button
            onClick={onApplyStaged}
            className="w-full h-7 rounded-lg bg-[#10b981] text-white text-[11.5px] font-semibold hover:opacity-90 cursor-pointer"
          >
            {isAr ? "إعادة التشغيل الآن" : "Restart Now"}
          </button>
        </div>
      );
    }

    if (state?.hub_has_update && !pillDismissed) {
      const rv = state.hub_remote_version;
      return (
        <m.div
          id="hub-update-pill"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRINGS.smooth}
          className="sb-collapse-hide mb-2.5 p-2.5 rounded-xl border border-[#60a5fa]/25 bg-[#3b63fb]/12 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 text-[11.5px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0" />
            <span className="flex-1 truncate">{isAr ? `تحديث جديد متاح v${rv}` : `Update available v${rv}`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onHubUpdateNow}
              className="flex-1 h-7 rounded-lg bg-[#3b63fb] text-white text-[11.5px] font-semibold hover:bg-[#4e73ff] cursor-pointer"
            >
              {isAr ? "تحديث الآن" : "Update Now"}
            </button>
            <button
              onClick={onDismissPill}
              aria-label="Dismiss"
              className="w-7 h-7 rounded-lg text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </m.div>
      );
    }
    return null;
  };

  return (
    <aside
      id="app-sidebar"
      data-tour="sidebar"
      aria-label="Suite Navigation"
      className={`cc-sidebar ${expanded ? "expanded" : ""}`}
    >
      <div className="flex-1 overflow-y-auto px-2.5 py-3 flex flex-col gap-1">
        <nav role="tablist" className="flex flex-col gap-0.5">
          {primaryNav.map(renderNavBtn)}
        </nav>

        <div className="sb-collapse-hide text-[10.5px] font-bold tracking-[0.08em] text-[var(--color-text-muted)] px-2.5 pt-4 pb-1.5">
          {t.categories}
        </div>
        <nav className="flex flex-col gap-0.5">{catNav.map(renderNavBtn)}</nav>

        <div className="sb-collapse-hide text-[10.5px] font-bold tracking-[0.08em] text-[var(--color-text-muted)] px-2.5 pt-4 pb-1.5">
          {t.resources}
        </div>
        <div className="flex flex-col gap-0.5">
          <button
            id="btn-refresh"
            onClick={onCheckUpdates}
            className="w-full h-9 px-2.5 rounded-[10px] flex items-center gap-2.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
          >
            <RefreshCw size={15} className={checking ? "animate-spin" : ""} />
            <span className="sb-collapse-hide truncate">{t.checkUpdates}</span>
          </button>

          <button
            onClick={onStartTour}
            className="w-full h-9 px-2.5 rounded-[10px] flex items-center gap-2.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
          >
            <Compass size={15} />
            <span className="sb-collapse-hide truncate">{t.guidedTour}</span>
          </button>

          <button
            onClick={onOpenReleases}
            className="w-full h-9 px-2.5 rounded-[10px] flex items-center gap-2.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
          >
            <ExternalLink size={15} />
            <span className="sb-collapse-hide truncate">{t.githubReleases}</span>
          </button>
        </div>
      </div>

      {/* Pinned Sidebar Footer */}
      <div className="p-2.5 border-t border-[var(--color-border-subtle)] bg-black/10">
        {renderUpdatePill()}

        <button
          id="btn-fix-cep"
          onClick={onFixCep}
          className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2 text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer mb-2"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${cepReady ? "bg-[#34d399]" : "bg-[#fbbf24]"}`} />
          <span className="sb-collapse-hide truncate">{cepReady ? t.cepReady : t.cepEnable}</span>
        </button>

        <div className="sb-collapse-hide flex items-center justify-between px-2 text-[11px] text-[var(--color-text-muted)] mb-2">
          <span>{t.installedSummary(counts.installed, counts.total)}</span>
          <span className="font-semibold">v{state?.hub_version || "1.6.3"}</span>
        </div>

        <button
          id="btn-sidebar-quit"
          onClick={onQuit}
          className="w-full h-8 px-2.5 rounded-lg flex items-center justify-center gap-2 text-[12px] font-semibold text-[var(--color-text-secondary)] hover:text-[#f87171] hover:bg-red-500/10 border border-[var(--color-border-subtle)] cursor-pointer transition-colors"
        >
          <LogOut size={14} />
          <span className="sb-collapse-hide">{t.quit}</span>
        </button>
      </div>
    </aside>
  );
};
