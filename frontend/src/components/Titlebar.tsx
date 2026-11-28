import React, { useRef, useState } from "react";
import { m } from "motion/react";
import {
  ArrowDownToLine,
  Bell,
  Check,
  Command,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { QassimzWordmark } from "./QassimzWordmark";
import { CCUpdaterState, HubTask } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface Props {
  lang: Lang;
  dark: boolean;
  query: string;
  isMaximized: boolean;
  liveTasks: HubTask[];
  ccUpdater?: CCUpdaterState;
  attentionCount: number;
  checking: boolean;
  onQueryChange: (q: string) => void;
  onOpenCommandPalette: () => void;
  onToggleSidebar: () => void;
  onBrandHome: () => void;
  onToggleTheme: (btn: HTMLElement | null) => void;
  onToggleLang: () => void;
  onOpenActivity: () => void;
  onOpenUpdateCenter: () => void;
  onOpenSettings: () => void;
  onWinMin: () => void;
  onWinMax: () => void;
  onWinClose: () => void;
}

export const Titlebar: React.FC<Props> = ({
  lang,
  dark,
  query,
  isMaximized,
  liveTasks,
  ccUpdater,
  attentionCount,
  checking,
  onQueryChange,
  onOpenCommandPalette,
  onToggleSidebar,
  onBrandHome,
  onToggleTheme,
  onToggleLang,
  onOpenActivity,
  onOpenUpdateCenter,
  onOpenSettings,
  onWinMin,
  onWinMax,
  onWinClose,
}) => {
  const t = I18N[lang];
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const [wave, setWave] = useState(false);

  const ccActive = ccUpdater?.phase === "downloading" || ccUpdater?.phase === "extracting";
  const ccDone = ccUpdater?.phase === "applied" || ccUpdater?.phase === "staged_ready";
  const ringBusy = liveTasks.length > 0 || ccActive;
  const pct = liveTasks.length > 0
    ? Math.round(liveTasks.reduce((a, b) => a + Number(b.progress || 0), 0) / liveTasks.length)
    : Math.max(0, Math.min(100, Number(ccUpdater?.progress || 0)));
  const ringCirc = 84.82;
  const ringOffset = ringBusy ? ringCirc * (1 - pct / 100) : ccDone ? 0 : ringCirc;

  const triggerHome = () => {
    setWave(false);
    requestAnimationFrame(() => setWave(true));
    setTimeout(() => setWave(false), 750);
    onBrandHome();
  };

  return (
    <header
      id="app-titlebar"
      className="cc-titlebar pywebview-drag-region"
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest(".no-drag")) onWinMax();
      }}
    >
      {/* Left: Sidebar Toggle + Unified Qh | QASSIMZ Lockup */}
      <div className="flex items-center gap-1.5 ps-3.5 pe-3 h-full">
        <button
          id="btn-sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
          className="no-drag md:hidden w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
        >
          <Menu size={16} />
        </button>

        <m.button
          id="btn-replay-logo"
          data-tour="brand"
          whileTap={{ scale: 0.97 }}
          transition={SPRINGS.snappy}
          onClick={triggerHome}
          title="QASSIMZ Hub — Home"
          className={`hdr-brand-btn no-drag inline-flex items-center gap-2 h-8 px-2 rounded-[9px] hover:bg-[var(--color-surface-hover)] border border-transparent hover:border-[var(--color-border-subtle)] cursor-pointer transition-colors ${
            wave ? "wave" : ""
          } ${checking ? "opacity-80" : ""}`}
        >
          <span className="w-6 h-6 rounded-[6.5px] overflow-hidden shrink-0 inline-flex items-center justify-center">
            <img src="./logo.svg" alt="QASSIMZ" width={24} height={24} className="w-6 h-6 block" />
          </span>
          <span className="w-[1px] h-3.5 bg-[var(--color-border-strong)] shrink-0" aria-hidden="true" />
          <QassimzWordmark className="h-[19px] w-auto text-[var(--color-text-primary)]" />
        </m.button>
      </div>

      {/* Center: Global Pill Search + Command Palette Trigger */}
      <div className="flex items-center justify-center px-3 min-w-0">
        <div
          data-tour="search"
          className="no-drag relative w-full max-w-[420px] h-8 flex items-center rounded-full px-3 gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-surface-hover)] focus-within:border-[#60a5fa]/50 transition-colors"
        >
          <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
          <input
            id="q-search"
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            autoComplete="off"
            className="w-full bg-transparent border-none outline-none text-[12.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
          {query ? (
            <button
              id="btn-search-clear"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              <X size={12} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              title="Command Palette (Ctrl+K)"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] cursor-pointer shrink-0"
            >
              <Command size={10} />K
            </button>
          )}
        </div>
      </div>

      {/* Right: Utility Icons + Divider + Flush 46x48 Win11 Caption Controls */}
      <div className="no-drag flex items-center h-full">
        <div className="flex items-center gap-1 px-2">
          {/* Circular Progress Ring Activity Button */}
          <m.button
            id="btn-activity"
            data-tour="activity"
            whileTap={{ scale: 0.94 }}
            transition={SPRINGS.snappy}
            onClick={onOpenActivity}
            title={ringBusy ? `${pct}%` : ccDone ? t.upToDateTitle : "Activity"}
            className="relative w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          >
            <svg
              viewBox="0 0 32 32"
              className={`absolute inset-0 w-full h-full -rotate-90 pointer-events-none transition-opacity ${
                ringBusy || ccDone ? "opacity-100" : "opacity-0"
              }`}
            >
              <circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" />
              <circle
                cx="16"
                cy="16"
                r="13.5"
                fill="none"
                stroke={ccDone ? "#34d399" : "#38bdf8"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                strokeDashoffset={ringOffset}
                style={{ transition: "stroke-dashoffset 220ms ease" }}
              />
            </svg>
            {ccDone ? <Check size={15} className="text-[#34d399]" /> : <ArrowDownToLine size={15} />}
            {liveTasks.length > 0 && (
              <span className="absolute -top-0.5 -end-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#3b63fb] text-white text-[10px] font-bold flex items-center justify-center">
                {liveTasks.length}
              </span>
            )}
          </m.button>

          {/* Circular View Transition Theme Toggle */}
          <m.button
            ref={themeBtnRef}
            id="btn-theme-toggle"
            whileTap={{ scale: 0.94 }}
            transition={SPRINGS.snappy}
            onClick={() => onToggleTheme(themeBtnRef.current)}
            title="Toggle Dark / Light Theme"
            aria-label="Toggle Theme"
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          >
            {dark ? <Moon size={15} /> : <Sun size={15} />}
          </m.button>

          {/* Language Toggle */}
          <m.button
            id="btn-lang"
            whileTap={{ scale: 0.94 }}
            transition={SPRINGS.snappy}
            onClick={onToggleLang}
            title="Switch Language / تبديل اللغة"
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[11.5px] font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          >
            {lang === "ar" ? "EN" : "AR"}
          </m.button>

          {/* Update Center / Bell */}
          <m.button
            id="btn-bell"
            whileTap={{ scale: 0.94 }}
            transition={SPRINGS.snappy}
            onClick={onOpenUpdateCenter}
            title={t.checkUpdates}
            className="relative w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          >
            <Bell size={15} />
            {attentionCount > 0 && (
              <span className="absolute top-1 end-1 w-2 h-2 rounded-full bg-[#38bdf8]" />
            )}
          </m.button>

          {/* Settings */}
          <m.button
            id="btn-settings-top"
            whileTap={{ scale: 0.94 }}
            transition={SPRINGS.snappy}
            onClick={onOpenSettings}
            title={`${t.settings} (Ctrl+,)`}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          >
            <Settings size={15} />
          </m.button>
        </div>

        <span className="w-[1px] h-5 bg-[var(--color-border-subtle)] mx-1" aria-hidden="true" />

        {/* Flush 46x48 Windows 11 Native Caption Controls (Always LTR) */}
        <div className="hdr-win-controls" dir="ltr">
          <button id="btn-win-min" className="hdr-win-btn" onClick={onWinMin} title="Minimize" aria-label="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1" shapeRendering="crispEdges">
              <line x1="0" y1="5" x2="10" y2="5" />
            </svg>
          </button>
          <button id="btn-win-max" className="hdr-win-btn" onClick={onWinMax} title={isMaximized ? "Restore" : "Maximize"} aria-label="Maximize">
            <svg
              id="ico-win-maximize"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              shapeRendering="crispEdges"
              style={{ display: isMaximized ? "none" : "block" }}
            >
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
            <svg
              id="ico-win-restore"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              shapeRendering="crispEdges"
              style={{ display: isMaximized ? "block" : "none" }}
            >
              <path d="M2.5 2.5V0.5H9.5V7.5H7.5" />
              <rect x="0.5" y="2.5" width="7" height="7" />
            </svg>
          </button>
          <button id="btn-win-close" className="hdr-win-btn hdr-win-close" onClick={onWinClose} title="Close" aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.05" strokeLinecap="square">
              <line x1="0.8" y1="0.8" x2="9.2" y2="9.2" />
              <line x1="9.2" y1="0.8" x2="0.8" y2="9.2" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};
