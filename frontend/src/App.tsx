import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { LayoutGrid, List } from "lucide-react";
import {
  CatalogItem,
  HubBridge,
  HubSettingsData,
  HubStatePayload,
  HubTask,
  MechanicalBgMode,
} from "./lib/api";
import { I18N, Lang } from "./lib/i18n";
import { SPRINGS } from "./lib/motion";
import { applyThemeInstant, resolveDark, switchThemeWithCircle, ThemePref } from "./lib/theme";
import { launchGuidedTour } from "./lib/tour";
import { MechanicalEngineBg } from "./components/MechanicalEngineBg";
import { SplashScreen } from "./components/SplashScreen";
import { Titlebar } from "./components/Titlebar";
import { Sidebar, ViewKey } from "./components/Sidebar";
import { AppCard } from "./components/AppCard";
import { VirtualAppList } from "./components/VirtualAppList";
import { ContextMenu } from "./components/ContextMenu";
import { CommandPalette } from "./components/CommandPalette";
import { AppDetailView } from "./components/AppDetailView";
import { InstallTheater } from "./components/InstallTheater";
import { SettingsModal } from "./components/SettingsModal";
import { UpdateCenterModal, WhatsNewModal } from "./components/UpdateCenterModal";

type SortKey = "default" | "name-asc" | "name-desc" | "status" | "size";
type LayoutMode = "grid" | "list";

interface ToastItem {
  id: string;
  key: string;
  text: string;
  kind: "info" | "error";
}

const DEFAULT_SETTINGS: HubSettingsData = {
  silent_install: true,
  minimize_to_tray: true,
  start_with_windows: false,
  auto_check_updates: true,
  auto_update_apps: false,
  auto_update_hub: false,
  mechanical_bg_mode: "balanced",
};

export const App: React.FC = () => {
  const [lang, setLang] = useState<Lang>(() =>
    localStorage.getItem("qhub_lang") === "ar" ? "ar" : "en"
  );
  const [themePref, setThemePref] = useState<ThemePref>(() => {
    const v = localStorage.getItem("qhub_theme");
    return v === "light" || v === "system" ? v : "dark";
  });
  const [dark, setDark] = useState<boolean>(() => resolveDark(themePref));

  const [state, setState] = useState<HubStatePayload | null>(null);
  const [view, setView] = useState<ViewKey>("all");
  const [layout, setLayout] = useState<LayoutMode>(() =>
    localStorage.getItem("qhub_layout") === "list" ? "list" : "grid"
  );
  const [sort, setSort] = useState<SortKey>(() =>
    (localStorage.getItem("qhub_sort") as SortKey) || "default"
  );
  const [query, setQuery] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Splash choreography
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashProgress, setSplashProgress] = useState(24);
  const [splashStatus, setSplashStatus] = useState("Initializing QASSIMZ Suite…");
  const splashDoneRef = useRef(false);

  // Overlays & modals
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ item: CatalogItem; x: number; y: number } | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateCenterOpen, setUpdateCenterOpen] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [pillDismissed, setPillDismissed] = useState(false);
  const [theaterMinimized, setTheaterMinimized] = useState(false);
  const [terminalTask, setTerminalTask] = useState<HubTask | null>(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [hoveredAccent, setHoveredAccent] = useState<string>("#3B63FB");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const lastCheckRef = useRef<number>(0);
  const t = I18N[lang];

  // Singleton deduplicated toast helper
  const showToast = useCallback((text: string, kind: "info" | "error" = "info") => {
    const clean = text.trim();
    if (!clean) return;
    const key = `${kind}:${clean}`;
    setToasts((prev) => {
      if (prev.some((x) => x.key === key)) return prev;
      const id = `${Date.now()}-${Math.random()}`;
      setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== id));
      }, 4200);
      return [...prev, { id, key, text: clean, kind }];
    });
  }, []);

  // Sync html lang/dir
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("qhub_lang", lang);
  }, [lang]);

  // Sync OS system theme listener
  useEffect(() => {
    const mode = applyThemeInstant(themePref);
    setDark(mode === "dark");
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => {
      if (themePref === "system") {
        const mMode = applyThemeInstant("system");
        setDark(mMode === "dark");
      }
    };
    mq.addEventListener?.("change", onSys);
    return () => mq.removeEventListener?.("change", onSys);
  }, [themePref]);

  const reloadState = useCallback(async (force = false) => {
    const data = await HubBridge.state(force);
    setState(data);
    return data;
  }, []);

  // Dismiss splash & smoothly expand Windows frameless frame
  const finishSplash = useCallback(() => {
    if (splashDoneRef.current) return;
    splashDoneRef.current = true;
    setSplashProgress(100);
    setSplashStatus(lang === "ar" ? "جاهز" : "Ready");
    HubBridge.winRevealMain()
      .then((res) => {
        if (res?.maximized) setIsMaximized(true);
      })
      .catch(() => {});
    setTimeout(() => setSplashVisible(false), 180);
  }, [lang]);

  // Boot sequence + global error boundary + backend event hooks
  useEffect(() => {
    const onErr = (ev: ErrorEvent) => {
      HubBridge.reportUiError({
        kind: "error",
        message: String(ev.message || "UI Error"),
        source: `${ev.filename || ""}:${ev.lineno || 0}`,
        stack: String(ev.error?.stack || ""),
      }).catch(() => {});
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      HubBridge.reportUiError({
        kind: "unhandledrejection",
        message: String(ev.reason?.message || ev.reason || "Promise rejection"),
        stack: String(ev.reason?.stack || ""),
      }).catch(() => {});
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);

    const winAny = window as unknown as Record<string, unknown>;
    winAny.__qhubOnCatalogSynced = () => reloadState(false).catch(() => {});
    winAny.__qhubOnHotPatched = () => reloadState(false).catch(() => {});

    let alive = true;
    setSplashProgress(55);
    reloadState(false)
      .then((data) => {
        if (!alive) return;
        setSplashProgress(90);
        // Quiet In-App Changelog ("What's New") on first boot after version upgrade
        const lastSeen = localStorage.getItem("qhub_last_seen_ver");
        if (
          lastSeen &&
          lastSeen !== data.hub_version &&
          data.hub_release_notes &&
          data.feature_flags?.in_app_changelog !== false
        ) {
          setTimeout(() => setWhatsNewOpen(true), 1200);
        }
        if (data.hub_version) localStorage.setItem("qhub_last_seen_ver", data.hub_version);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setTimeout(finishSplash, 480);
      });

    // Safety ceiling so splash never stalls
    const maxTimer = setTimeout(finishSplash, 1900);

    return () => {
      alive = false;
      clearTimeout(maxTimer);
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, [reloadState, finishSplash]);

  // Silent background auto-check: 3s after launch + every 30 min + on window focus (60s cooldown)
  const checkUpdatesSilently = useCallback(async (reason: "startup" | "interval" | "focus") => {
    const now = Date.now();
    if (reason === "focus" && now - lastCheckRef.current < 60_000) return;
    lastCheckRef.current = now;
    try {
      const fresh = await HubBridge.refreshCatalog();
      setState(fresh);
    } catch (err) {
      console.debug("[QHub Updater] Silent check skipped:", err);
    }
  }, []);

  useEffect(() => {
    const bootTimer = setTimeout(() => checkUpdatesSilently("startup"), 3000);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") checkUpdatesSilently("interval");
    }, 30 * 60 * 1000);
    const onFocus = () => checkUpdatesSilently("focus");
    window.addEventListener("focus", onFocus, { passive: true });
    return () => {
      clearTimeout(bootTimer);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkUpdatesSilently]);

  // Smart visibility-aware task polling (0% CPU when hidden in System Tray!)
  const liveTasks = useMemo(
    () => (state?.tasks || []).filter((tk) => ["queued", "downloading", "installing"].includes(tk.status)),
    [state?.tasks]
  );

  useEffect(() => {
    if (liveTasks.length === 0) return;
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      HubBridge.tasks()
        .then((tasks) => {
          setState((prev) => (prev ? { ...prev, tasks } : prev));
          const finished = tasks.find((tk) => tk.status === "completed" || tk.status === "error");
          if (finished) {
            setTerminalTask(finished);
            reloadState(true).catch(() => {});
          }
        })
        .catch(() => {});
    }, 450);
    return () => clearInterval(poll);
  }, [liveTasks.length, reloadState]);

  // Global keyboard shortcuts (Ctrl+K / Ctrl+Shift+P / Ctrl+, / Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
        e.preventDefault();
        setCmdOpen((o) => !o);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyP") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "Comma") {
        e.preventDefault();
        setSettingsOpen((o) => !o);
        return;
      }
      if (e.code === "Escape") {
        if (cmdOpen) return setCmdOpen(false);
        if (contextMenu) return setContextMenu(null);
        if (updateCenterOpen) return setUpdateCenterOpen(false);
        if (settingsOpen) return setSettingsOpen(false);
        if (selectedItem) return setSelectedItem(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdOpen, contextMenu, updateCenterOpen, settingsOpen, selectedItem]);

  // Filter & sort items
  const taskMap = useMemo(() => {
    const m = new Map<string, HubTask>();
    for (const tk of state?.tasks || []) m.set(tk.id, tk);
    return m;
  }, [state?.tasks]);

  const visibleItems = useMemo(() => {
    const all = state?.items || [];
    const q = query.trim().toLowerCase();
    const filtered = all.filter((it) => {
      if (view === "installed" && !it.state?.installed) return false;
      if (view === "updates" && !it.state?.has_update) return false;
      if (view === "desktop" && it.category !== "desktop") return false;
      if (view === "adobe" && it.category !== "adobe") return false;
      if (q) {
        const hay = `${it.name} ${it.name_ar || ""} ${it.tagline_ar || ""} ${it.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const list = [...filtered];
    if (sort === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "name-desc") list.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "size") list.sort((a, b) => (b.setup_size || 0) - (a.setup_size || 0));
    else if (sort === "status") {
      const rank = (x: CatalogItem) => (x.state?.has_update ? 0 : x.state?.installed ? 1 : 2);
      list.sort((a, b) => rank(a) - rank(b));
    }
    return list;
  }, [state?.items, view, query, sort]);

  // Actions
  const handleInstall = async (id: string) => {
    setTheaterMinimized(false);
    setTerminalTask(null);
    try {
      if (id === "qassimz-hub") await HubBridge.installHubUpdate(true);
      else await HubBridge.install(id);
      await reloadState(false);
    } catch {
      showToast(t.friendlyErr, "error");
    }
  };

  const handleLaunch = async (id: string) => {
    try {
      await HubBridge.launch(id);
    } catch (e) {
      showToast((e as Error).message || t.friendlyErr, "error");
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      await HubBridge.uninstall(id);
      await reloadState(true);
    } catch (e) {
      showToast((e as Error).message || t.friendlyErr, "error");
    }
  };

  const handleManualUpdateCheck = async () => {
    setUpdateCenterOpen(true);
    setCheckingUpdates(true);
    try {
      const fresh = await HubBridge.refreshCatalog();
      setState(fresh);
    } catch {
      // Friendly update center handles offline quietly
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleWinMax = async () => {
    try {
      const res = await HubBridge.winToggleMaximize();
      if (res && typeof res.maximized === "boolean") {
        setIsMaximized(res.maximized);
        document.documentElement.classList.toggle("is-maximized", res.maximized);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveSetting = async (key: keyof HubSettingsData, val: boolean) => {
    try {
      const updated = await HubBridge.saveSettings({ [key]: val });
      setState((prev) => (prev ? { ...prev, settings: updated } : prev));
    } catch {
      showToast(t.friendlyErr, "error");
    }
  };

  const handleSaveMechMode = async (mode: MechanicalBgMode) => {
    try {
      const updated = await HubBridge.saveSettings({ mechanical_bg_mode: mode });
      setState((prev) => (prev ? { ...prev, settings: updated } : prev));
    } catch {
      showToast(t.friendlyErr, "error");
    }
  };

  const activeTheaterTask = liveTasks[0] || terminalTask;
  const hubTask = (state?.tasks || []).find((tk) => tk.id === "qassimz-hub");
  const viewTitle =
    view === "installed"
      ? t.installed
      : view === "updates"
      ? t.updates
      : view === "desktop"
      ? t.desktopApps
      : view === "adobe"
      ? t.adobeCep
      : t.allApps;

  const attentionCount = (state?.counts?.updates || 0) + (state?.hub_has_update ? 1 : 0);

  return (
    <>
      <SplashScreen
        visible={splashVisible}
        progress={splashProgress}
        status={splashStatus}
        onSkip={finishSplash}
      />

      <div className="cc-shell">
        <div className="cc-aurora" aria-hidden="true">
          <span className="aurora-orb orb-a" />
          <span className="aurora-orb orb-b" />
        </div>

        <MechanicalEngineBg
          dark={dark}
          accentColor={hoveredAccent}
          mode={state?.settings?.mechanical_bg_mode || "balanced"}
          overdriveActive={liveTasks.length > 0}
        />

        <Titlebar
          lang={lang}
          dark={dark}
          query={query}
          isMaximized={isMaximized}
          liveTasks={liveTasks}
          ccUpdater={state?.cc_updater}
          attentionCount={attentionCount}
          checking={checkingUpdates}
          onQueryChange={setQuery}
          onOpenCommandPalette={() => setCmdOpen(true)}
          onToggleSidebar={() => setSidebarExpanded((s) => !s)}
          onBrandHome={() => {
            setView("all");
            setQuery("");
            setSelectedItem(null);
          }}
          onToggleTheme={(btn) => {
            const next: ThemePref = dark ? "light" : "dark";
            switchThemeWithCircle(next, btn, (p) => {
              setThemePref(p);
              setDark(resolveDark(p));
            });
          }}
          onToggleLang={() => setLang((l) => (l === "ar" ? "en" : "ar"))}
          onOpenActivity={() => {
            if (liveTasks.length > 0) setTheaterMinimized(false);
            else handleManualUpdateCheck();
          }}
          onOpenUpdateCenter={handleManualUpdateCheck}
          onOpenSettings={() => setSettingsOpen(true)}
          onWinMin={() => HubBridge.winMinimize().catch(() => {})}
          onWinMax={handleWinMax}
          onWinClose={() => HubBridge.winClose().catch(() => {})}
        />

        <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">
          <Sidebar
            lang={lang}
            view={view}
            expanded={sidebarExpanded}
            state={state}
            hubTask={hubTask}
            ccUpdater={state?.cc_updater}
            checking={checkingUpdates}
            pillDismissed={pillDismissed}
            onSelectView={(v) => {
              setView(v);
              setSidebarExpanded(false);
            }}
            onCheckUpdates={handleManualUpdateCheck}
            onOpenReleases={() => HubBridge.openUrl("https://github.com/ahmedqassimtv-commits/qassimz-hub/releases")}
            onStartTour={() => launchGuidedTour(lang).catch(() => {})}
            onFixCep={async () => {
              try {
                await HubBridge.fixCep();
                await reloadState(true);
              } catch {
                showToast(t.friendlyErr, "error");
              }
            }}
            onQuit={() => HubBridge.winQuit().catch(() => {})}
            onHubUpdateNow={() => handleInstall("qassimz-hub")}
            onApplyStaged={() => HubBridge.applyStagedUpdate().catch(() => {})}
            onDismissPill={() => setPillDismissed(true)}
          />

          <main id="page-scroll" className="flex-1 overflow-y-auto px-6 py-5 min-w-0">
            <div className="max-w-[1440px] mx-auto flex flex-col gap-5">
              {/* Section Toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <h1 id="view-title" className="m-0 text-[21px] font-bold tracking-tight">
                    {viewTitle}
                  </h1>
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] tabular-nums">
                    {visibleItems.length}
                  </span>
                  {(state?.counts?.updates || 0) > 0 && (
                    <m.button
                      id="btn-update-all"
                      whileTap={{ scale: 0.96 }}
                      transition={SPRINGS.snappy}
                      onClick={async () => {
                        setTheaterMinimized(false);
                        await HubBridge.updateAll().catch(() => showToast(t.friendlyErr, "error"));
                        await reloadState(false);
                      }}
                      className="h-7 px-3 rounded-lg bg-[var(--color-action-bg)] text-white text-[12px] font-semibold cursor-pointer"
                    >
                      {t.updateAll(state?.counts?.updates || 0)}
                    </m.button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    id="q-sort"
                    value={sort}
                    onChange={(e) => {
                      const v = e.target.value as SortKey;
                      setSort(v);
                      localStorage.setItem("qhub_sort", v);
                    }}
                    aria-label={t.sort}
                    className="h-8 px-2.5 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border-subtle)] text-[12px] font-medium text-[var(--color-text-primary)] outline-none cursor-pointer"
                  >
                    <option value="default">{t.sortDefault}</option>
                    <option value="name-asc">{t.sortNameAsc}</option>
                    <option value="name-desc">{t.sortNameDesc}</option>
                    <option value="status">{t.sortStatus}</option>
                    <option value="size">{t.sortSize}</option>
                  </select>

                  <div className="flex items-center p-0.5 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border-subtle)]">
                    <button
                      id="btn-view-grid"
                      onClick={() => {
                        setLayout("grid");
                        localStorage.setItem("qhub_layout", "grid");
                      }}
                      aria-label="Grid view"
                      className={`w-7 h-7 rounded-md inline-flex items-center justify-center cursor-pointer ${
                        layout === "grid" ? "bg-[var(--color-surface-active)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      <LayoutGrid size={14} />
                    </button>
                    <button
                      id="btn-view-list"
                      onClick={() => {
                        setLayout("list");
                        localStorage.setItem("qhub_layout", "list");
                      }}
                      aria-label="List view"
                      className={`w-7 h-7 rounded-md inline-flex items-center justify-center cursor-pointer ${
                        layout === "list" ? "bg-[var(--color-surface-active)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      <List size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Apps Grid (Auto-Split Installed vs Available in Suite in All Apps) or TanStack Virtual List */}
              {layout === "grid" ? (
                (() => {
                  const installedList = visibleItems.filter((it) => it.state?.installed);
                  const availableList = visibleItems.filter((it) => !it.state?.installed);
                  const shouldSplit = view === "all" && installedList.length > 0 && availableList.length > 0;
                  const gridCls = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4";
                  const renderCard = (item: CatalogItem) => (
                    <AppCard
                      key={item.id}
                      item={item}
                      task={taskMap.get(item.id)}
                      lang={lang}
                      onSelect={setSelectedItem}
                      onInstall={handleInstall}
                      onLaunch={handleLaunch}
                      onContextMenu={(it, x, y) => setContextMenu({ item: it, x, y })}
                      onHoverColor={(c) => setHoveredAccent(c || "#3B63FB")}
                    />
                  );

                  if (shouldSplit) {
                    return (
                      <div id="apps-grid" className="flex flex-col gap-6">
                        <section className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <h2 className="m-0 text-[13px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                              {t.installed}
                            </h2>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#10b981]/15 text-[#34d399] tabular-nums">
                              {installedList.length}
                            </span>
                          </div>
                          <div className={gridCls}>{installedList.map(renderCard)}</div>
                        </section>

                        <section className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <h2 className="m-0 text-[13px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                              {t.availableInSuite}
                            </h2>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] tabular-nums">
                              {availableList.length}
                            </span>
                          </div>
                          <div className={gridCls}>{availableList.map(renderCard)}</div>
                        </section>
                      </div>
                    );
                  }

                  return (
                    <div id="apps-grid" className={gridCls}>
                      {visibleItems.map(renderCard)}
                    </div>
                  );
                })()
              ) : (
                <VirtualAppList
                  items={visibleItems}
                  taskMap={taskMap}
                  lang={lang}
                  onSelect={setSelectedItem}
                  onInstall={handleInstall}
                  onLaunch={handleLaunch}
                  onContextMenu={(it, x, y) => setContextMenu({ item: it, x, y })}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Floating UI Virtual Context Menu */}
      <ContextMenu
        menu={contextMenu}
        lang={lang}
        onClose={() => setContextMenu(null)}
        onInstall={handleInstall}
        onLaunch={handleLaunch}
        onOpenFolder={(id) => HubBridge.openFolder(id).catch(() => {})}
        onOtherVersions={(it) => {
          const url = it.repo
            ? `https://github.com/${it.repo}/releases`
            : "https://github.com/ahmedqassimtv-commits/qassimz-hub/releases";
          HubBridge.openUrl(url).catch(() => {});
        }}
        onUninstall={handleUninstall}
        onOpenDetails={setSelectedItem}
      />

      {/* cmdk Command Palette (Ctrl+K / Ctrl+Shift+P) */}
      <CommandPalette
        open={cmdOpen}
        lang={lang}
        items={state?.items || []}
        onClose={() => setCmdOpen(false)}
        onSelectApp={setSelectedItem}
        onCheckUpdates={handleManualUpdateCheck}
        onToggleTheme={() => {
          const next: ThemePref = dark ? "light" : "dark";
          switchThemeWithCircle(next, null, (p) => {
            setThemePref(p);
            setDark(resolveDark(p));
          });
        }}
        onToggleLang={() => setLang((l) => (l === "ar" ? "en" : "ar"))}
        onOpenSettings={() => setSettingsOpen(true)}
        onStartTour={() => launchGuidedTour(lang).catch(() => {})}
      />

      {/* Standalone Animated App Detail View */}
      <AppDetailView
        item={selectedItem}
        lang={lang}
        onClose={() => setSelectedItem(null)}
        onInstall={handleInstall}
        onLaunch={handleLaunch}
        onOpenFolder={(id) => HubBridge.openFolder(id).catch(() => {})}
        onUninstall={handleUninstall}
      />

      {/* Install Theater & Minimized Transfer Strip */}
      <InstallTheater
        task={activeTheaterTask}
        minimized={theaterMinimized}
        lang={lang}
        onMinimize={() => setTheaterMinimized(true)}
        onRestore={() => setTheaterMinimized(false)}
        onCancel={async (id) => {
          await HubBridge.cancelTask(id).catch(() => {});
          await reloadState(false);
        }}
        onRetry={(id) => {
          setTerminalTask(null);
          handleInstall(id);
        }}
        onLaunch={handleLaunch}
        onDone={() => setTerminalTask(null)}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        lang={lang}
        themePref={themePref}
        settings={state?.settings || DEFAULT_SETTINGS}
        onClose={() => setSettingsOpen(false)}
        onThemePick={(pref, el) =>
          switchThemeWithCircle(pref, el, (p) => {
            setThemePref(p);
            setDark(resolveDark(p));
          })
        }
        onLangPick={setLang}
        onMechModePick={handleSaveMechMode}
        onToggleSetting={handleSaveSetting}
        onQuit={() => HubBridge.winQuit().catch(() => {})}
      />

      {/* Update Center Modal */}
      <UpdateCenterModal
        open={updateCenterOpen}
        checking={checkingUpdates}
        lang={lang}
        state={state}
        onClose={() => setUpdateCenterOpen(false)}
        onUpdateHub={() => handleInstall("qassimz-hub")}
        onUpdateAllApps={async () => {
          setTheaterMinimized(false);
          await HubBridge.updateAll().catch(() => showToast(t.friendlyErr, "error"));
          await reloadState(false);
        }}
      />

      {/* Quiet In-App "What's New" Changelog */}
      <WhatsNewModal
        open={whatsNewOpen}
        lang={lang}
        version={state?.hub_version || "1.6.3"}
        notes={state?.hub_release_notes || ""}
        onClose={() => setWhatsNewOpen(false)}
      />

      {/* Singleton Deduplicated Toasts */}
      <div id="toasts" className="fixed bottom-4 inset-inline-end-4 z-[520] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((tk) => (
            <m.div
              key={tk.id}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={SPRINGS.snappy}
              className={`cc-toast pointer-events-auto min-w-[260px] max-w-[360px] px-3.5 py-2.5 rounded-xl bg-[var(--color-surface-elevated)] border text-[12.5px] font-medium shadow-xl ${
                tk.kind === "error" ? "error border-red-500/40 text-[#fca5a5]" : "border-[var(--color-border-strong)]"
              }`}
            >
              {tk.text}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
