import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { BookOpen, Film, LayoutGrid, List, Mic, Palette } from "lucide-react";
import {
  CatalogItem,
  HubBridge,
  HubSettingsData,
  HubStatePayload,
  HubTask,
  MechanicalBgMode,
  TelemetryData,
} from "./lib/api";
import { APP_BLURBS, I18N, Lang, shortAppName } from "./lib/i18n";
import { SPRINGS } from "./lib/motion";
import { soundEngine } from "./lib/sound";
import { applyThemeInstant, resolveDark, switchThemeWithCircle, ThemePref } from "./lib/theme";
import { launchGuidedTour } from "./lib/tour";
import { MechanicalEngineBg } from "./components/MechanicalEngineBg";
import { SplashScreen } from "./components/SplashScreen";
import { Titlebar } from "./components/Titlebar";
import { Sidebar, ViewKey } from "./components/Sidebar";
import { AppCard, DropTargetState, InstalledAppRow } from "./components/AppCard";
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
  sound_enabled: true,
};

// Smart Drag & Drop Router: file extension -> compatible app IDs
const EXT_COMPAT_MAP: Record<string, string[]> = {
  ".mp4": ["qassimz-studio", "qassimz-captions", "qassimz-export", "qassimz-footage", "qassimz-organizer"],
  ".mov": ["qassimz-studio", "qassimz-captions", "qassimz-export", "qassimz-footage", "qassimz-organizer"],
  ".mkv": ["qassimz-studio", "qassimz-captions", "qassimz-organizer"],
  ".wav": ["qassimz-music", "qassimz-vox-fx", "qassimz-studio", "qassimz-captions"],
  ".mp3": ["qassimz-music", "qassimz-vox-fx", "qassimz-studio", "qassimz-captions"],
  ".aac": ["qassimz-music", "qassimz-vox-fx"],
  ".mogrt": ["qassimz-mogrt-hub", "qassimz-mogrt-maker", "qassimz-studio"],
  ".aep": ["qassimz-mogrt-maker", "qassimz-studio"],
  ".pdf": ["qassimz-study", "qassimz-producer", "qassimz-organizer"],
  ".srt": ["qassimz-captions", "qassimz-studio", "qassimz-producer"],
  ".psd": ["qassimz-thumbs", "qassimz-organizer"],
  ".png": ["qassimz-thumbs", "qassimz-studio", "qassimz-organizer"],
  ".jpg": ["qassimz-thumbs", "qassimz-studio", "qassimz-organizer"],
  ".jpeg": ["qassimz-thumbs", "qassimz-studio", "qassimz-organizer"],
  ".webp": ["qassimz-thumbs", "qassimz-organizer"],
  ".txt": ["qassimz-producer", "qassimz-study", "qassimz-captions"],
  ".md": ["qassimz-producer", "qassimz-study"],
};

function extractDragExt(dt: DataTransfer | null): string {
  if (!dt) return "";
  const file = dt.files?.[0];
  if (file?.name && file.name.includes(".")) {
    return "." + file.name.split(".").pop()!.toLowerCase();
  }
  const item = dt.items?.[0];
  if (item?.type) {
    if (item.type.startsWith("video/")) return ".mp4";
    if (item.type.startsWith("audio/")) return ".wav";
    if (item.type === "application/pdf") return ".pdf";
    if (item.type.startsWith("image/")) return ".png";
  }
  return "";
}

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
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
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
  const [hoveredAccent, setHoveredAccent] = useState<string>("#1473E6");
  const [successGlowId, setSuccessGlowId] = useState<string | null>(null);
  const [dragExt, setDragExt] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const lastCheckRef = useRef<number>(0);
  const t = I18N[lang];
  const soundEnabled = state?.settings?.sound_enabled !== false;

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

  // Sync sound engine with persisted setting
  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // Live hardware telemetry polling (every 2s while visible)
  useEffect(() => {
    let alive = true;
    const fetchTel = () => {
      if (document.visibilityState !== "visible") return;
      HubBridge.telemetry()
        .then((d) => {
          if (alive) setTelemetry(d);
        })
        .catch(() => {});
    };
    fetchTel();
    const timer = setInterval(fetchTel, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Smart Drag & Drop Router window listeners
  useEffect(() => {
    let dragDepth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragDepth += 1;
      const ext = extractDragExt(e.dataTransfer);
      if (ext) setDragExt(ext);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
    };
    const onDragLeave = () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragExt(null);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth = 0;
      setDragExt(null);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Smart visibility-aware task polling (0% CPU when hidden in System Tray!)
  const liveTasks = useMemo(
    () =>
      (state?.tasks || []).filter((tk) =>
        ["queued", "checking", "downloading", "paused", "verifying", "installing", "app_running"].includes(tk.status)
      ),
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
            if (finished.status === "completed") {
              soundEngine.playChime();
              setSuccessGlowId(finished.id);
              setTimeout(() => setSuccessGlowId((cur) => (cur === finished.id ? null : cur)), 1150);
            } else {
              soundEngine.playError();
            }
            reloadState(true).catch(() => {});
          }
        })
        .catch(() => {});
    }, 450);
    return () => clearInterval(poll);
  }, [liveTasks.length, reloadState]);

  // Global keyboard shortcuts (Ctrl+K / Ctrl+Shift+P / Ctrl+, / Ctrl+Q / Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
        e.preventDefault();
        setCmdOpen((o) => {
          if (!o) soundEngine.playWhoosh();
          return !o;
        });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyP") {
        e.preventDefault();
        soundEngine.playWhoosh();
        setCmdOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "Comma") {
        e.preventDefault();
        soundEngine.playClick();
        setSettingsOpen((o) => !o);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyQ") {
        e.preventDefault();
        HubBridge.winQuit().catch(() => {});
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
    soundEngine.playClick();
    try {
      const updated = await HubBridge.saveSettings({ mechanical_bg_mode: mode });
      setState((prev) => (prev ? { ...prev, settings: updated } : prev));
    } catch {
      showToast(t.friendlyErr, "error");
    }
  };

  const handleToggleSound = async () => {
    const next = !soundEnabled;
    soundEngine.setEnabled(next);
    if (next) soundEngine.playClick();
    try {
      const updated = await HubBridge.saveSettings({ sound_enabled: next });
      setState((prev) => (prev ? { ...prev, settings: updated } : prev));
    } catch {
      // ignore
    }
  };

  const handleClearCache = async () => {
    soundEngine.playClick();
    try {
      const res = await HubBridge.clearCache();
      showToast(t.cacheCleaned(res?.freed_mb ?? 0), "info");
      HubBridge.telemetry().then(setTelemetry).catch(() => {});
    } catch {
      showToast(t.friendlyErr, "error");
    }
  };

  const handleLaunchWorkspace = async (modeId: string, label: string) => {
    soundEngine.playClick();
    try {
      const res = await HubBridge.launchWorkspace(modeId);
      if (res.launched.length > 0) {
        soundEngine.playChime();
        showToast(t.wsLaunched(res.launched.length, label), "info");
      } else {
        showToast(t.wsNoneInstalled(label), "info");
      }
    } catch {
      showToast(t.friendlyErr, "error");
    }
  };

  const handleDropFile = async (item: CatalogItem, filePath: string) => {
    setDragExt(null);
    soundEngine.playChime();
    try {
      await HubBridge.openWith(item.id, filePath);
      showToast(t.dropOpened(shortAppName(item.name)), "info");
    } catch {
      showToast(t.friendlyErr, "error");
    }
  };

  const handlePauseTask = async (id: string) => {
    await HubBridge.pauseTask(id).catch(() => {});
    await reloadState(false);
  };

  const handleResumeTask = async (id: string) => {
    await HubBridge.resumeTask(id).catch(() => {});
    await reloadState(false);
  };

  const handleCancelTask = async (id: string) => {
    await HubBridge.cancelTask(id).catch(() => {});
    await reloadState(false);
  };

  const handleToggleAutoLaunch = async (id: string, enabled: boolean) => {
    await HubBridge.setTaskAutoLaunch(id, enabled).catch(() => {});
    await reloadState(false);
  };

  const handleForceCloseRetry = async (id: string) => {
    await HubBridge.forceCloseAndRetry(id).catch(() => {});
    await reloadState(false);
  };

  const getDropState = (item: CatalogItem): DropTargetState => {
    if (!dragExt) return "idle";
    const compat = EXT_COMPAT_MAP[dragExt];
    if (!compat) return "idle";
    return compat.includes(item.id) ? "match" : "dim";
  };

  const activeTheaterTask = liveTasks[0] || terminalTask;
  const activeTaskAccent = liveTasks[0]
    ? APP_BLURBS[liveTasks[0].id]?.color || liveTasks[0].accent || "#1473E6"
    : hoveredAccent;
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

  const workspaces = [
    { id: "editing", label: t.wsEditing, icon: <Film size={13} /> },
    { id: "podcast", label: t.wsPodcast, icon: <Mic size={13} /> },
    { id: "study", label: t.wsStudy, icon: <BookOpen size={13} /> },
    { id: "design", label: t.wsDesign, icon: <Palette size={13} /> },
  ];

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
          accentColor={activeTaskAccent}
          mode={state?.settings?.mechanical_bg_mode || "balanced"}
          overdriveActive={liveTasks.length > 0}
        />

        <Titlebar
          lang={lang}
          dark={dark}
          soundEnabled={soundEnabled}
          query={query}
          isMaximized={isMaximized}
          liveTasks={liveTasks}
          ccUpdater={state?.cc_updater}
          attentionCount={attentionCount}
          checking={checkingUpdates}
          onQueryChange={setQuery}
          onOpenCommandPalette={() => {
            soundEngine.playWhoosh();
            setCmdOpen(true);
          }}
          onToggleSidebar={() => setSidebarExpanded((s) => !s)}
          onBrandHome={() => {
            soundEngine.playClick();
            setView("all");
            setQuery("");
            setSelectedItem(null);
          }}
          onToggleTheme={(btn) => {
            soundEngine.playClick();
            const next: ThemePref = dark ? "light" : "dark";
            switchThemeWithCircle(next, btn, (p) => {
              setThemePref(p);
              setDark(resolveDark(p));
            });
          }}
          onToggleSound={handleToggleSound}
          onToggleLang={() => {
            soundEngine.playClick();
            setLang((l) => (l === "ar" ? "en" : "ar"));
          }}
          onOpenActivity={() => {
            soundEngine.playClick();
            if (liveTasks.length > 0) setTheaterMinimized(false);
            else handleManualUpdateCheck();
          }}
          onOpenUpdateCenter={handleManualUpdateCheck}
          onOpenSettings={() => {
            soundEngine.playClick();
            setSettingsOpen(true);
          }}
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
            telemetry={telemetry}
            hubTask={hubTask}
            ccUpdater={state?.cc_updater}
            checking={checkingUpdates}
            pillDismissed={pillDismissed}
            onSelectView={(v) => {
              soundEngine.playClick();
              setView(v);
              setSidebarExpanded(false);
            }}
            onCheckUpdates={handleManualUpdateCheck}
            onOpenReleases={() => HubBridge.openUrl("https://github.com/ahmedqassimtv-commits/qassimz-hub/releases")}
            onStartTour={() => launchGuidedTour(lang).catch(() => {})}
            onFixCep={async () => {
              soundEngine.playClick();
              try {
                await HubBridge.fixCep();
                await reloadState(true);
              } catch {
                showToast(t.friendlyErr, "error");
              }
            }}
            onClearCache={handleClearCache}
            onHubUpdateNow={() => handleInstall("qassimz-hub")}
            onApplyStaged={() => HubBridge.applyStagedUpdate().catch(() => {})}
            onDismissPill={() => setPillDismissed(true)}
          />

          <main id="page-scroll" className="flex-1 overflow-y-auto px-6 py-5 min-w-0">
            <div className="max-w-[1440px] mx-auto flex flex-col gap-5">
              {/* Smart Drag & Drop Router Banner */}
              <AnimatePresence>
                {dragExt && (
                  <m.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={SPRINGS.snappy}
                    className="px-4 py-2.5 rounded-xl bg-[#1473E6]/15 border border-[#1473E6]/45 text-[12.5px] font-semibold text-[var(--color-text-primary)] flex items-center justify-center gap-2"
                  >
                    <span>{t.dropBanner(dragExt)}</span>
                  </m.div>
                )}
              </AnimatePresence>

              {/* Section Toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <h1 id="view-title" className="m-0 text-[22px] font-bold tracking-tight">
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
                        soundEngine.playClick();
                        setTheaterMinimized(false);
                        await HubBridge.updateAll().catch(() => showToast(t.friendlyErr, "error"));
                        await reloadState(false);
                      }}
                      className="h-7 px-3.5 rounded-full bg-[#1473E6] hover:bg-[#0D66D0] text-white text-[12px] font-semibold cursor-pointer"
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
                        soundEngine.playClick();
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
                        soundEngine.playClick();
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

              {/* Creator OS: 1-Click Workspace Modes Bar */}
              {view === "all" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-[var(--color-text-muted)] me-1">
                    {t.workspaceLabel}
                  </span>
                  {workspaces.map((ws) => (
                    <m.button
                      key={ws.id}
                      data-workspace={ws.id}
                      whileTap={{ scale: 0.96 }}
                      transition={SPRINGS.snappy}
                      onClick={() => handleLaunchWorkspace(ws.id, ws.label)}
                      className="h-7 px-3 rounded-full bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-active)] border border-[var(--color-border-subtle)] text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {ws.icon}
                      <span>{ws.label}</span>
                    </m.button>
                  ))}
                </div>
              )}

              {/* Adobe Creative Cloud Layout: Compact Horizontal Installed Rows + Clean Available Grid */}
              {layout === "grid" ? (
                (() => {
                  const installedList = visibleItems.filter((it) => it.state?.installed);
                  const availableList = visibleItems.filter((it) => !it.state?.installed);
                  const shouldSplit = view === "all" && installedList.length > 0 && availableList.length > 0;
                  const gridCls = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4";

                  const sharedCardHandlers = {
                    lang,
                    onSelect: setSelectedItem,
                    onInstall: handleInstall,
                    onLaunch: handleLaunch,
                    onPauseTask: handlePauseTask,
                    onResumeTask: handleResumeTask,
                    onCancelTask: handleCancelTask,
                    onForceCloseRetry: handleForceCloseRetry,
                    onContextMenu: (it: CatalogItem, x: number, y: number) => setContextMenu({ item: it, x, y }),
                    onHoverColor: (c: string | null) => setHoveredAccent(c || "#1473E6"),
                    onDropFile: handleDropFile,
                  };

                  const renderCard = (item: CatalogItem) => (
                    <AppCard
                      key={item.id}
                      item={item}
                      task={taskMap.get(item.id)}
                      successGlow={successGlowId === item.id}
                      dropState={getDropState(item)}
                      {...sharedCardHandlers}
                    />
                  );

                  const renderInstalledRow = (item: CatalogItem) => (
                    <InstalledAppRow
                      key={item.id}
                      item={item}
                      task={taskMap.get(item.id)}
                      successGlow={successGlowId === item.id}
                      dropState={getDropState(item)}
                      {...sharedCardHandlers}
                    />
                  );

                  if (shouldSplit) {
                    return (
                      <div id="apps-grid" className="flex flex-col gap-6">
                        <section className="flex flex-col gap-2.5">
                          <div className="flex items-center gap-2">
                            <h2 className="m-0 text-[13.5px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                              {t.installed}
                            </h2>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] tabular-nums">
                              {installedList.length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-2">{installedList.map(renderInstalledRow)}</div>
                        </section>

                        <section className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <h2 className="m-0 text-[13.5px] font-semibold tracking-tight text-[var(--color-text-primary)]">
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
        onCancel={handleCancelTask}
        onPause={handlePauseTask}
        onResume={handleResumeTask}
        onToggleAutoLaunch={handleToggleAutoLaunch}
        onForceCloseRetry={handleForceCloseRetry}
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
