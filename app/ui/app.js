/* QASSIMZ Hub v1.3.0 — Adobe Creative Cloud Desktop / Spectrum 2 Frontend */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const APP_META = {
    "qassimz-studio": {
      prefix: "Studio",
      suffix: "Craft",
      color: "#0EA5E9",
      taglineEn: "Video editing, keyframes & motion compositing",
      blurbEn: "Unified timeline editing, cubic-bezier keyframe motion curves, and GPU WebAssembly effects.",
    },
    "qassimz-producer": {
      prefix: "Producer",
      suffix: "Pro",
      color: "#EF4444",
      taglineEn: "YouTube production planning & AI script studio",
      blurbEn: "End-to-end episode production workbench with shot lists, hooks, and timeline planning.",
    },
    "qassimz-music": {
      prefix: "Music",
      suffix: "Studio",
      color: "#F59E0B",
      taglineEn: "Stem separation, BPM waveforms & sound library",
      blurbEn: "Organize soundtracks, separate vocals & stems locally, and drag cues straight into your NLE.",
    },
    "qdm": {
      prefix: "QDM",
      suffix: "Turbo",
      color: "#3B82F6",
      taglineEn: "Multi-stream media & 4K video downloader",
      blurbEn: "High-speed segmented download manager with built-in yt-dlp + FFmpeg remuxing.",
    },
    "qassimz-thumbs": {
      prefix: "Thumbs",
      suffix: "View",
      color: "#EC4899",
      taglineEn: "YouTube feed simulator & A/B CTR tester",
      blurbEn: "Preview thumbnails live inside dark/light home, search, and mobile feeds before publishing.",
    },
    "qassimz-organizer": {
      prefix: "Organize",
      suffix: "Pro",
      color: "#10B981",
      taglineEn: "Production folder templates & asset sorting",
      blurbEn: "One-click project folder structures and rule-based media sorting for editors.",
    },
    "qassimz-study": {
      prefix: "Study",
      suffix: "Flow",
      color: "#14B8A6",
      taglineEn: "Focused deep-work & visual study companion",
      blurbEn: "Distraction-free study sessions, structured notes, and spaced review decks.",
    },
    "qassimz-vox-fx": {
      prefix: "VOX",
      suffix: "FX",
      color: "#84CC16",
      taglineEn: "Documentary motion & highlighter toolkit for Adobe",
      blurbEn: "Vox-style kinetic highlights, map zooms, paper boil, and camera rigs inside Premiere & AE.",
    },
    "qassimz-captions": {
      prefix: "Captions",
      suffix: "AI",
      color: "#EAB308",
      taglineEn: "Offline Whisper Arabic/English word-level captions",
      blurbEn: "Generate word-by-word animated captions directly on your Premiere Pro timeline.",
    },
    "qassimz-footage": {
      prefix: "Footage",
      suffix: "AI",
      color: "#06B6D4",
      taglineEn: "Instant B-Roll & stock media search inside Premiere",
      blurbEn: "Search, preview, and import HD/4K stock footage directly into active bins.",
    },
    "qassimz-mogrt-hub": {
      prefix: "MOGRT",
      suffix: "Hub",
      color: "#E11D48",
      taglineEn: "Visual Motion Graphics Template browser & previewer",
      blurbEn: "Browse, hover-preview, favorite, and drop .mogrt templates onto your sequence.",
    },
    "qassimz-mogrt-maker": {
      prefix: "MOGRT",
      suffix: "Maker",
      color: "#F97316",
      taglineEn: "Essential Graphics rig builder & exporter for AE",
      blurbEn: "Bind responsive properties, build clean controls, and export .mogrt packages fast.",
    },
    "qassimz-export": {
      prefix: "Smart",
      suffix: "Export",
      color: "#28DB5B",
      taglineEn: "Social presets, loudness normalization & batch render",
      blurbEn: "One-click YouTube, Reels, TikTok, and ProRes mastering from Premiere & After Effects.",
    },
  };

  const UI = {
    view: "all", // all | installed | updates | desktop | adobe | hidden
    layout: localStorage.getItem("qhub_layout") || "grid", // grid | table
    sort: localStorage.getItem("qhub_sort") || "default",
    lang: localStorage.getItem("qhub_lang") || "en",
    themePref: localStorage.getItem("qhub_theme") || "dark", // dark | light | system
    query: "",
    selectedId: null,
    settingsOpen: false,
    bellOpen: false,
    sidebarExpanded: false,
    isMaximized: false,
    theaterTaskId: null,
    theaterMinimized: false,
    theaterTerminalTask: null, // Holds last completed/errored task shown in theater
    bannerDismissed: false,
    pinned: JSON.parse(localStorage.getItem("qhub_pinned") || "[]"),
    hiddenApps: new Set(JSON.parse(localStorage.getItem("qhub_hidden") || "[]")),
    state: null,
    pollTimer: null,
    searchTimer: null,
  };

  const I18N = {
    en: {
      hubSubtitle: "QASSIMZ Hub",
      bootInit: "Initializing QASSIMZ Suite…",
      bootChecking: "Checking installed apps…",
      bootReady: "Ready",
      searchPlaceholder: "Search QASSIMZ apps…",
      navAll: "All Apps",
      navInstalled: "Installed",
      navUpdates: "Updates",
      navHidden: "Hidden",
      sbCategories: "CATEGORIES",
      navDesktop: "Desktop Apps",
      navAdobe: "Adobe CEP",
      sbResources: "RESOURCES",
      checkUpdates: "Check for Updates",
      githubReleases: "GitHub Releases",
      cepReady: "Adobe CEP Ready",
      cepEnable: "Enable Adobe CEP",
      installedSummary: (i, t) => `${i} / ${t} installed`,
      quitShort: "Quit",
      sort: "Sort",
      sortDefault: "Suite Order",
      sortNameAsc: "Name (A–Z)",
      sortNameDesc: "Name (Z–A)",
      sortStatus: "Status",
      sortSize: "Download Size",
      updateAll: (n) => (n === 1 ? "Update 1 App" : `Update All (${n})`),
      updatePill: "UPDATE",
      hubUpdateAvail: (v) => `QASSIMZ Hub ${v} is available.`,
      whatsNewLink: "What's New ↗",
      updateAndRestart: "Update & Restart",
      showInstaller: "Show Installer",
      secPinned: "Pinned",
      secInstalled: "Installed",
      secAvailable: "Available in Suite",
      catDesktop: "Desktop",
      catAdobe: "CEP",
      updAvail: "Update",
      installedTag: "Installed",
      installedVer: (v) => `Installed · v${v}`,
      open: "Open",
      update: "Update",
      install: "Install",
      reinstall: "Reinstall",
      cancel: "Cancel",
      retry: "Retry",
      done: "Done",
      close: "Close",
      launch: "Launch",
      downloading: "Downloading",
      installing: "Installing…",
      emptyApps: "No matching applications found.",
      emptyInstalled: "No QASSIMZ apps are installed yet.",
      emptyUpdates: "All installed apps are up to date.",
      clearFilters: "Clear Filters",
      // Details
      overview: "Overview",
      whatsNew: (v) => `What's New in v${v}`,
      keyFeatures: "Key Features",
      releaseFacts: "Release Facts",
      latestVersion: "Latest Version",
      installedLabel: "Installed",
      notInstalled: "Not installed",
      downloadSize: "Download Size",
      releasedLabel: "Released",
      interactiveInstaller: "Interactive Installer",
      openFolder: "Open Folder",
      uninstall: "Uninstall",
      github: "GitHub ↗",
      releases: "Releases ↗",
      portableZip: "Portable ZIP ↗",
      // Settings
      settings: "Settings",
      appearanceLang: "Appearance & Language",
      themeTitle: "Appearance Theme",
      themeSub: "Choose Spectrum 2 Dark, Light, or System",
      themeLight: "Light",
      themeDark: "Dark",
      themeSystem: "System",
      langTitle: "Interface Language",
      langSub: "Switch instantly between English and Arabic",
      autoUpdates: "Automatic Updates",
      autoCheckTitle: "Check for Updates Automatically",
      autoCheckSub: "Sync releases on startup and every 4 hours",
      autoAppsTitle: "Auto-Update Installed Apps",
      autoAppsSub: "Download and install app updates automatically",
      autoHubTitle: "Auto-Update QASSIMZ Hub",
      autoHubSub: "Keep the launcher itself updated automatically",
      installWin: "Installation & Windows",
      silentTitle: "One-Click Silent Install",
      silentSub: "Install apps directly with QASSIMZ Installer",
      trayTitle: "Keep Running in System Tray",
      traySub: "Minimize to tray when closing the window",
      startupTitle: "Launch at Windows Sign-In",
      startupSub: "Start QASSIMZ Hub in background at login",
      maintenance: "Maintenance & Adobe CEP",
      cacheInfo: (sz, pr, ae) =>
        `Cached downloads: ${sz} · Premiere: ${pr ? "Detected" : "—"} · After Effects: ${ae ? "Detected" : "—"}`,
      checkHubUpdate: "Check Hub Update",
      cacheFolder: "Cache Folder",
      clearCache: "Clear Cache",
      quitHub: "Quit QASSIMZ Hub",
      // Bell
      announcements: "Notifications & Transfers",
      noAnnouncements: "All QASSIMZ apps and services are ready.",
      updateAvailSize: (sz) => `Update available (${sz})`,
      // Context menu
      menuDetails: "App Details & Notes",
      menuPin: "Pin to Top",
      menuUnpin: "Unpin",
      menuOpen: (n) => `Open ${n}`,
      menuWizard: "Install with Wizard",
      menuReinstall: "Reinstall / Wizard",
      menuFolder: "Open Install Folder",
      menuGithub: "GitHub Repository",
      menuReleases: "Release Page",
      menuPortable: "Download Portable ZIP",
      menuHide: "Hide App",
      menuUnhide: "Unhide App",
      menuUninstall: "Uninstall",
      // Install theater
      installerTitle: "QASSIMZ Installer",
      stepDl: "01 Download",
      stepVerify: "02 Verify SHA-256",
      stepInst: "03 Install",
      continueBg: "Continue in Background",
      completeTitle: "Installation Complete",
      completeSub: "Ready to launch from QASSIMZ Hub.",
      errorTitle: "Installation Failed",
      connecting: "Connecting to official GitHub release server…",
      preparing: "Preparing package…",
      // Toasts
      toastSettingsSaved: "Settings saved",
      toastCatalogSynced: "Checked GitHub releases — catalog is up to date.",
      toastCepEnabled: "Enabled Adobe CEP PlayerDebugMode (CSXS 9–16)",
      toastCacheCleared: "Cleared installer cache",
      toastLaunching: "Launching application…",
      toastHubUpToDate: "QASSIMZ Hub is already up to date.",
      toastQueuedUpdates: (n) => `Queued ${n} update(s)`,
      toastUninstallStarted: (n) => `Started uninstaller for ${n}`,
      // Window tooltips
      winMin: "Minimize",
      winMax: "Maximize",
      winRestore: "Restore",
      winClose: "Close",
      moreActions: "More actions",
      prev: "Previous",
      next: "Next",
    },
    ar: {
      hubSubtitle: "مركز تطبيقات قَاسِمز",
      bootInit: "جارٍ تهيئة منظومة قَاسِمز…",
      bootChecking: "جارٍ فحص التطبيقات المثبّتة…",
      bootReady: "جاهز للعمل",
      searchPlaceholder: "ابحث في تطبيقات قَاسِمز…",
      navAll: "كل التطبيقات",
      navInstalled: "المثبّتة",
      navUpdates: "التحديثات",
      navHidden: "المخفية",
      sbCategories: "التصنيفات",
      navDesktop: "تطبيقات سطح المكتب",
      navAdobe: "إضافات Adobe CEP",
      sbResources: "المصادر",
      checkUpdates: "فحص التحديثات",
      githubReleases: "إصدارات GitHub",
      cepReady: "Adobe CEP جاهز",
      cepEnable: "تفعيل Adobe CEP",
      installedSummary: (i, t) => `${i} من ${t} مثبّت`,
      quitShort: "إنهاء",
      sort: "ترتيب",
      sortDefault: "ترتيب المنظومة",
      sortNameAsc: "الاسم (أ–ي)",
      sortNameDesc: "الاسم (ي–أ)",
      sortStatus: "الحالة",
      sortSize: "حجم التنزيل",
      updateAll: (n) => (n === 1 ? "تحديث تطبيق واحد" : `تحديث الكل (${n})`),
      updatePill: "تحديث",
      hubUpdateAvail: (v) => `يتوفّر الإصدار الجديد QASSIMZ Hub ${v}.`,
      whatsNewLink: "ما الجديد ↗",
      updateAndRestart: "تحديث وإعادة التشغيل",
      showInstaller: "عرض نافذة التثبيت",
      secPinned: "المثبّتة في الأعلى",
      secInstalled: "التطبيقات المثبّتة",
      secAvailable: "متاح في المنظومة",
      catDesktop: "سطح المكتب",
      catAdobe: "CEP",
      updAvail: "تحديث متاح",
      installedTag: "مثبّت",
      installedVer: (v) => `مثبّت · v${v}`,
      open: "تشغيل",
      update: "تحديث",
      install: "تثبيت",
      reinstall: "إعادة تثبيت",
      cancel: "إلغاء",
      retry: "إعادة المحاولة",
      done: "تم",
      close: "إغلاق",
      launch: "تشغيل التطبيق",
      downloading: "جارٍ التنزيل",
      installing: "جارٍ التثبيت…",
      emptyApps: "لا توجد تطبيقات مطابقة للبحث.",
      emptyInstalled: "لا توجد تطبيقات مثبّتة من قَاسِمز بعد.",
      emptyUpdates: "جميع التطبيقات المثبّتة محدّثة بالكامل.",
      clearFilters: "مسح الفلاتر",
      // Details
      overview: "نظرة عامة",
      whatsNew: (v) => `ما الجديد في الإصدار v${v}`,
      keyFeatures: "الميزات الرئيسية",
      releaseFacts: "تفاصيل الإصدار",
      latestVersion: "أحدث إصدار",
      installedLabel: "المثبّت حالياً",
      notInstalled: "غير مثبّت",
      downloadSize: "حجم التنزيل",
      releasedLabel: "تاريخ النشر",
      interactiveInstaller: "معالج التثبيت التفاعلي",
      openFolder: "فتح المجلد",
      uninstall: "إلغاء التثبيت",
      github: "GitHub ↗",
      releases: "الإصدارات ↗",
      portableZip: "النسخة المحمولة ↗",
      // Settings
      settings: "الإعدادات",
      appearanceLang: "المظهر واللغة",
      themeTitle: "سمة المظهر",
      themeSub: "اختر الوضع الداكن أو الفاتح أو حسب النظام",
      themeLight: "فاتح",
      themeDark: "داكن",
      themeSystem: "النظام",
      langTitle: "لغة الواجهة",
      langSub: "التبديل الفوري بين العربية والإنجليزية",
      autoUpdates: "التحديث التلقائي",
      autoCheckTitle: "فحص التحديثات تلقائياً",
      autoCheckSub: "مزامنة الإصدارات عند التشغيل وكل 4 ساعات",
      autoAppsTitle: "تحديث التطبيقات المثبّتة تلقائياً",
      autoAppsSub: "تنزيل وتثبيت تحديثات التطبيقات تلقائياً",
      autoHubTitle: "تحديث QASSIMZ Hub تلقائياً",
      autoHubSub: "إبقاء المشغّل محدّثاً تلقائياً بأحدث إصدار",
      installWin: "التثبيت ونظام ويندوز",
      silentTitle: "التثبيت الصامت بنقرة واحدة",
      silentSub: "تثبيت التطبيقات مباشرة عبر نافذة تثبيت قَاسِمز",
      trayTitle: "الإبقاء في شريط النظام",
      traySub: "تصغير النافذة إلى شريط المهام عند الإغلاق",
      startupTitle: "التشغيل عند بدء ويندوز",
      startupSub: "تشغيل QASSIMZ Hub في الخلفية عند تسجيل الدخول",
      maintenance: "الصيانة و Adobe CEP",
      cacheInfo: (sz, pr, ae) =>
        `التنزيلات المؤقتة: ${sz} · Premiere: ${pr ? "مكتشف" : "—"} · After Effects: ${ae ? "مكتشف" : "—"}`,
      checkHubUpdate: "فحص تحديث المشغّل",
      cacheFolder: "مجلد التنزيلات",
      clearCache: "مسح الكاش",
      quitHub: "إنهاء QASSIMZ Hub",
      // Bell
      announcements: "الإشعارات والتنزيلات",
      noAnnouncements: "جميع خدمات وتطبيقات قَاسِمز جاهزة للعمل.",
      updateAvailSize: (sz) => `يتوفّر تحديث (${sz})`,
      // Context menu
      menuDetails: "التفاصيل والملاحظات",
      menuPin: "تثبيت في الأعلى",
      menuUnpin: "إلغاء التثبيت في الأعلى",
      menuOpen: (n) => `تشغيل ${n}`,
      menuWizard: "التثبيت عبر المعالج",
      menuReinstall: "إعادة التثبيت / المعالج",
      menuFolder: "فتح مجلد التثبيت",
      menuGithub: "مستودع GitHub",
      menuReleases: "صفحة الإصدارات",
      menuPortable: "تنزيل النسخة المحمولة ZIP",
      menuHide: "إخفاء التطبيق",
      menuUnhide: "إظهار التطبيق",
      menuUninstall: "إلغاء التثبيت",
      // Install theater
      installerTitle: "مثبّت QASSIMZ",
      stepDl: "01 التنزيل",
      stepVerify: "02 التحقق SHA-256",
      stepInst: "03 التثبيت",
      continueBg: "المتابعة في الخلفية",
      completeTitle: "اكتمل التثبيت بنجاح",
      completeSub: "التطبيق جاهز الآن للتشغيل من QASSIMZ Hub.",
      errorTitle: "فشل التثبيت",
      connecting: "جارٍ الاتصال بخادم إصدارات GitHub الرسمي…",
      preparing: "جارٍ تجهيز الحزمة…",
      // Toasts
      toastSettingsSaved: "تم حفظ الإعدادات",
      toastCatalogSynced: "تم فحص إصدارات GitHub — الكتالوج محدّث.",
      toastCepEnabled: "تم تفعيل وضع Adobe CEP PlayerDebugMode (CSXS 9–16)",
      toastCacheCleared: "تم مسح ذاكرة التنزيلات المؤقتة",
      toastLaunching: "جارٍ تشغيل التطبيق…",
      toastHubUpToDate: "QASSIMZ Hub محدّث بالفعل إلى آخر إصدار.",
      toastQueuedUpdates: (n) => `تمت إضافة ${n} تحديث(ات) إلى قائمة الانتظار`,
      toastUninstallStarted: (n) => `تم تشغيل معالج إلغاء التثبيت لـ ${n}`,
      // Window tooltips
      winMin: "تصغير",
      winMax: "تكبير",
      winRestore: "استعادة",
      winClose: "إغلاق",
      moreActions: "خيارات إضافية",
      prev: "السابق",
      next: "التالي",
    },
  };

  function tr() {
    return I18N[UI.lang] || I18N.en;
  }

  function isDarkActive() {
    if (UI.themePref === "dark") return true;
    if (UI.themePref === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function syncWindowMaxIcon() {
    const maxIco = $("#ico-win-maximize");
    const resIco = $("#ico-win-restore");
    const maxBtn = $("#btn-win-max");
    document.documentElement.classList.toggle("is-maximized", UI.isMaximized);
    if (maxIco && resIco) {
      maxIco.toggleAttribute("hidden", UI.isMaximized);
      resIco.toggleAttribute("hidden", !UI.isMaximized);
    }
    if (maxBtn) {
      const lbl = UI.isMaximized ? tr().winRestore : tr().winMax;
      maxBtn.title = lbl;
      maxBtn.setAttribute("aria-label", lbl);
    }
  }

  function syncSortDropdown() {
    const sortSel = $("#q-sort");
    const curLbl = $("#sort-current-label");
    const menu = $("#sort-menu");
    const wrap = $("#sort-wrap");
    const trigger = $("#sort-trigger");
    if (!sortSel) return;
    sortSel.value = UI.sort;
    const opts = Array.from(sortSel.options);
    const activeOpt = opts.find((o) => o.value === UI.sort) || opts[0];
    if (curLbl && activeOpt) curLbl.textContent = activeOpt.textContent;
    if (!menu) return;
    menu.innerHTML = opts
      .map(
        (o) => `
          <button type="button" class="cc-sort-opt ${o.value === UI.sort ? "active" : ""}" role="option" aria-selected="${o.value === UI.sort ? "true" : "false"}" data-sort-val="${esc(o.value)}">
            <span>${esc(o.textContent)}</span>
            <span class="cc-sort-check">✓</span>
          </button>`
      )
      .join("");
    $$("[data-sort-val]", menu).forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        UI.sort = btn.dataset.sortVal;
        localStorage.setItem("qhub_sort", UI.sort);
        sortSel.value = UI.sort;
        menu.hidden = true;
        if (wrap) wrap.classList.remove("open");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
        syncSortDropdown();
        render();
      };
    });
  }

  function applyThemeAndLang() {
    const dark = isDarkActive();
    const t = tr();
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = UI.lang;
    document.documentElement.dir = UI.lang === "ar" ? "rtl" : "ltr";

    const moon = $("#ico-theme-moon");
    const sun = $("#ico-theme-sun");
    if (moon && sun) {
      moon.toggleAttribute("hidden", !dark);
      sun.toggleAttribute("hidden", dark);
    }

    $("#btn-lang").textContent = UI.lang === "ar" ? "EN" : "AR";
    $("#q-search").placeholder = t.searchPlaceholder;
    $("#intro-subtitle").textContent = t.hubSubtitle;

    // Sidebar labels
    $("#lbl-nav-all").textContent = t.navAll;
    $("#lbl-nav-installed").textContent = t.navInstalled;
    $("#lbl-nav-updates").textContent = t.navUpdates;
    $("#lbl-nav-hidden").textContent = t.navHidden;
    $("#lbl-sb-categories").textContent = t.sbCategories;
    $("#lbl-nav-desktop").textContent = t.navDesktop;
    $("#lbl-nav-adobe").textContent = t.navAdobe;
    $("#lbl-sb-resources").textContent = t.sbResources;
    $("#lbl-check-updates").textContent = t.checkUpdates;
    $("#lbl-github-releases").textContent = t.githubReleases;
    $("#lbl-sidebar-quit").textContent = t.quitShort;

    // Toolbar sort labels + custom animated dropdown sync
    $("#lbl-sort").textContent = t.sort;
    const sortSel = $("#q-sort");
    if (sortSel && sortSel.options.length >= 5) {
      sortSel.options[0].textContent = t.sortDefault;
      sortSel.options[1].textContent = t.sortNameAsc;
      sortSel.options[2].textContent = t.sortNameDesc;
      sortSel.options[3].textContent = t.sortStatus;
      sortSel.options[4].textContent = t.sortSize;
    }
    syncSortDropdown();

    // Strip labels
    $("#btn-open-theater").textContent = t.showInstaller;

    // Theater static localized labels
    $("#th-step-dl .step-txt").textContent = t.stepDl;
    $("#th-step-verify .step-txt").textContent = t.stepVerify;
    $("#th-step-inst .step-txt").textContent = t.stepInst;
    $("#btn-th-bg").textContent = t.continueBg;
    $("#btn-th-cancel").textContent = t.cancel;
    $("#btn-th-launch").textContent = t.launch;
    $("#btn-th-done").textContent = t.done;
    $("#btn-th-retry").textContent = t.retry;
    $("#th-complete-title").textContent = t.completeTitle;
    $("#th-complete-sub").textContent = t.completeSub;
    $("#th-error-title").textContent = t.errorTitle;

    // Window caption tooltips
    $("#btn-win-min").title = t.winMin;
    $("#btn-win-close").title = t.winClose;
    syncWindowMaxIcon();
  }

  // Launch / Splash / Welcome Screen synchronized with reloadState()
  function startSplashSequence(readyPromise, replay = false) {
    const intro = $("#brand-intro");
    const fill = $("#intro-progress-fill");
    const status = $("#intro-status");
    const wrap = $("#intro-logo-wrap");
    if (!intro) return;

    const t = tr();
    intro.hidden = false;
    intro.classList.remove("fading");

    if (replay && wrap) {
      const clone = wrap.innerHTML;
      wrap.innerHTML = clone;
    }

    if (status) status.textContent = t.bootInit;
    if (fill) fill.style.width = "24%";

    const stepTimer = setTimeout(() => {
      if (status) status.textContent = tr().bootChecking;
      if (fill) fill.style.width = "68%";
    }, 420);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(stepTimer);
      clearTimeout(maxTimer);
      if (status) status.textContent = tr().bootReady;
      if (fill) fill.style.width = "100%";
      api("win_reveal_main").catch(() => {});
      const shell = $(".cc-shell");
      setTimeout(() => {
        intro.classList.add("fading");
        if (shell) {
          shell.classList.add("is-opening");
          setTimeout(() => shell.classList.remove("is-opening"), 260);
        }
        setTimeout(() => {
          intro.hidden = true;
          intro.classList.remove("fading");
          triggerHeaderLogoWave();
        }, 280);
      }, 140);
    };

    intro.onclick = dismiss;

    const minDelay = new Promise((r) => setTimeout(r, replay ? 950 : 1050));
    const safeReady = Promise.resolve(readyPromise).catch(() => {});
    const maxTimer = setTimeout(dismiss, 2500);

    Promise.all([minDelay, safeReady]).then(dismiss);
  }

  function triggerHeaderLogoWave() {
    const btn = $("#btn-replay-logo");
    if (!btn) return;
    btn.classList.remove("wave");
    void btn.offsetWidth;
    btn.classList.add("wave");
    setTimeout(() => btn.classList.remove("wave"), 700);
  }

  async function api(method, payload = {}) {
    const res = await fetch(`api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Unexpected error");
    return json.data;
  }

  function toast(msg, kind = "info") {
    const box = $("#toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `cc-toast ${kind === "error" ? "error" : ""}`;
    el.innerHTML = `
      <div class="toast-top">
        <span class="toast-brand"><span class="toast-dot"></span>QASSIMZ Hub</span>
        <button class="cc-icon-btn sm" aria-label="Dismiss">✕</button>
      </div>
      <div class="toast-body"></div>
    `;
    $(".toast-body", el).textContent = msg;
    $("button", el).onclick = () => el.remove();
    box.appendChild(el);
    setTimeout(() => el.remove(), 4400);
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function humanBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return UI.lang === "ar" ? "تنزيل مباشر" : "Direct";
    const mb = 1024 * 1024;
    if (n >= 1024 * mb) return `${(n / (1024 * mb)).toFixed(1)} GB`;
    if (n >= mb) return `${Math.round(n / mb)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(UI.lang === "ar" ? "ar-EG" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (_) {
      return "—";
    }
  }

  function isPinned(id) {
    return UI.pinned.includes(id);
  }

  function togglePin(id) {
    if (isPinned(id)) {
      UI.pinned = UI.pinned.filter((x) => x !== id);
    } else {
      UI.pinned.push(id);
    }
    localStorage.setItem("qhub_pinned", JSON.stringify(UI.pinned));
    render();
  }

  function toggleHide(id) {
    if (UI.hiddenApps.has(id)) {
      UI.hiddenApps.delete(id);
      if (UI.hiddenApps.size === 0 && UI.view === "hidden") UI.view = "all";
    } else {
      UI.hiddenApps.add(id);
    }
    localStorage.setItem("qhub_hidden", JSON.stringify(Array.from(UI.hiddenApps)));
    render();
  }

  function taskMap() {
    const map = new Map();
    for (const tk of UI.state?.tasks || []) map.set(tk.id, tk);
    return map;
  }

  function activeTasks() {
    return (UI.state?.tasks || []).filter((tk) =>
      ["queued", "downloading", "installing"].includes(tk.status)
    );
  }

  function appMeta(it) {
    return (
      APP_META[it.id] || {
        prefix: it.name,
        suffix: "",
        color: it.accent || "#3B63FB",
        taglineEn: (it.hosts || []).join(" · "),
        blurbEn: it.tagline_ar || "",
      }
    );
  }

  function visibleItems() {
    const items = UI.state?.items || [];
    const q = UI.query.trim().toLowerCase();

    const filtered = items.filter((it) => {
      if (UI.view === "hidden") return UI.hiddenApps.has(it.id);
      if (UI.hiddenApps.has(it.id)) return false;
      if (UI.view === "installed" && !it.state?.installed) return false;
      if (UI.view === "updates" && !it.state?.has_update) return false;
      if (UI.view === "desktop" && it.category !== "desktop") return false;
      if (UI.view === "adobe" && it.category !== "adobe") return false;
      if (q) {
        const m = appMeta(it);
        const hay = `${it.name} ${it.name_ar} ${it.code} ${m.taglineEn} ${m.blurbEn} ${it.tagline_ar} ${(it.hosts || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const pa = UI.pinned.indexOf(a.id);
      const pb = UI.pinned.indexOf(b.id);
      if (pa !== -1 && pb !== -1) return pa - pb;
      if (pa !== -1) return -1;
      if (pb !== -1) return 1;

      if (UI.sort === "name-asc") return a.name.localeCompare(b.name);
      if (UI.sort === "name-desc") return b.name.localeCompare(a.name);
      if (UI.sort === "size") return (Number(b.setup_size) || 0) - (Number(a.setup_size) || 0);
      if (UI.sort === "status" || UI.sort === "default") {
        const rank = (x) => (x.state?.has_update ? 2 : x.state?.installed ? 1 : 0);
        const diff = rank(b) - rank(a);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  }

  function currentViewTitle() {
    const t = tr();
    if (UI.view === "installed") return t.navInstalled;
    if (UI.view === "updates") return t.navUpdates;
    if (UI.view === "desktop") return t.navDesktop;
    if (UI.view === "adobe") return t.navAdobe;
    if (UI.view === "hidden") return t.navHidden;
    return t.navAll;
  }

  function updateChrome(listCount = 0) {
    const st = UI.state;
    if (!st) return;

    applyThemeAndLang();
    const t = tr();

    // Sidebar counts & active state
    $("#cnt-all").textContent = String(st.counts.total);
    $("#cnt-installed").textContent = String(st.counts.installed);
    const updCntEl = $("#cnt-updates");
    updCntEl.textContent = String(st.counts.updates);
    updCntEl.classList.toggle("has-updates", st.counts.updates > 0);
    $("#cnt-desktop").textContent = String(st.counts.desktop);
    $("#cnt-adobe").textContent = String(st.counts.adobe);

    const navHidden = $("#nav-hidden");
    if (UI.hiddenApps.size > 0) {
      navHidden.hidden = false;
      $("#cnt-hidden").textContent = String(UI.hiddenApps.size);
    } else {
      navHidden.hidden = true;
    }

    $$(".cc-sidebar .sb-item[data-view]").forEach((b) => {
      const isAct = b.dataset.view === UI.view;
      b.classList.toggle("active", isAct);
      b.setAttribute("aria-selected", isAct ? "true" : "false");
    });

    // View heading & count
    $("#view-title").textContent = currentViewTitle();
    $("#view-count").textContent = String(listCount);

    // Search clear button
    $("#btn-search-clear").hidden = !UI.query;

    // Layout segmented toggle
    $$(".cc-segmented .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.layout === UI.layout);
    });
    $("#q-sort").value = UI.sort;

    // Activity/Downloads button & Bell badge (always accessible in header like Adobe CC)
    const live = activeTasks();
    const actBtn = $("#btn-activity");
    const actBadge = $("#activity-badge");
    if (actBtn) actBtn.hidden = false;
    if (actBadge) {
      if (live.length > 0) {
        actBadge.hidden = false;
        actBadge.textContent = String(live.length);
      } else {
        actBadge.hidden = true;
      }
    }
    if (UI.activityOpen) renderActivityPopup();

    const attention = st.counts.updates + live.length + (st.hub_has_update ? 1 : 0);
    const bellBadge = $("#bell-badge");
    if (attention > 0) {
      bellBadge.hidden = false;
      bellBadge.textContent = attention > 9 ? "9+" : String(attention);
    } else {
      bellBadge.hidden = true;
    }

    // Update All pill
    const updAllBtn = $("#btn-update-all");
    if (st.counts.updates > 0) {
      updAllBtn.hidden = false;
      $("#lbl-update-all").textContent = t.updateAll(st.counts.updates);
    } else {
      updAllBtn.hidden = true;
    }

    // Sidebar footer status & dynamic Hub version
    const ad = st.adobe || {};
    $("#cep-dot").classList.toggle("warn", !ad.cep_debug_ready);
    $("#lbl-cep").textContent = ad.cep_debug_ready ? t.cepReady : t.cepEnable;
    $("#sidebar-installed-summary").textContent = t.installedSummary(st.counts.installed, st.counts.total);
    $("#sidebar-hub-version").textContent = `v${st.hub_version || "1.3.0"}`;

    updateInstallTheater(live);
    renderUpdateAlertCard(st, live);
    if (UI.bellOpen) renderBellPopup();
  }

  // Adobe CC Top-Header Activity & Updates Dropdown Popover
  function renderActivityPopup() {
    const pop = $("#activity-popup");
    if (!pop) return;
    if (!UI.activityOpen || !UI.state) {
      pop.hidden = true;
      return;
    }
    pop.hidden = false;
    const isAr = UI.lang === "ar";
    const tasks = UI.state.tasks || [];
    const title = isAr ? "متابعة التحديثات والتنزيلات" : "Updates & Downloads";
    const openWinLbl = isAr ? "فتح في نافذة مستقلة" : "Open Window";
    const clearLbl = isAr ? "مسح المكتمل" : "Clear Done";
    const emptyLbl = isAr ? "لا توجد تحديثات أو تنزيلات جارية حالياً." : "No active updates or downloads right now.";

    const live = activeTasks();
    const hasDone = tasks.some((x) => ["completed", "error", "cancelled"].includes(x.status));

    const itemsHTML = tasks.length
      ? tasks
          .map((tk) => {
            const ico = tk.id === "qassimz-hub" ? "./logo.svg" : `./icons/${esc(tk.id)}.svg`;
            const isBusy = ["queued", "downloading", "installing"].includes(tk.status);
            const speed = tk.speed_bps > 0 ? `${humanBytes(tk.speed_bps)}/s` : "";
            const sub = isBusy
              ? [`${tk.progress}%`, speed].filter(Boolean).join(" · ")
              : tk.status === "completed"
              ? (isAr ? "اكتمل بنجاح ✓" : "Completed ✓")
              : tk.status === "cancelled"
              ? (isAr ? "تم الإلغاء" : "Cancelled")
              : (tk.error || (isAr ? "فشل" : "Failed"));
            return `
              <div class="act-item">
                <div class="act-row">
                  <img class="act-ico" src="${ico}" alt="" />
                  <div class="act-info">
                    <div class="act-name">${esc(tk.name)} <span style="opacity:.65;font-weight:500;">v${esc(tk.version)}</span></div>
                    <div class="act-sub">${esc(sub)}</div>
                  </div>
                  ${
                    isBusy
                      ? `<button class="cc-icon-btn sm" data-act-open="${esc(tk.id)}" title="${esc(openWinLbl)}">↗</button>
                         <button class="cc-icon-btn sm" data-act-cancel="${esc(tk.id)}" title="${esc(tr().cancel)}">✕</button>`
                      : ""
                  }
                </div>
                ${isBusy ? `<div class="act-track"><div class="act-fill" style="width:${tk.progress}%"></div></div>` : ""}
              </div>`;
          })
          .join("")
      : `<div class="act-empty">${esc(emptyLbl)}</div>`;

    pop.innerHTML = `
      <div class="act-head">
        <strong>${esc(title)}</strong>
        <div style="display:flex;gap:6px;">
          ${live.length ? `<button class="cc-link-btn" id="act-open-main">${esc(openWinLbl)}</button>` : ""}
          ${hasDone ? `<button class="cc-link-btn" id="act-clear-done">${esc(clearLbl)}</button>` : ""}
        </div>
      </div>
      <div class="act-list">${itemsHTML}</div>
    `;

    const openMain = $("#act-open-main", pop);
    if (openMain) {
      openMain.onclick = () => {
        UI.activityOpen = false;
        pop.hidden = true;
        UI.theaterMinimized = false;
        updateInstallTheater(activeTasks());
      };
    }
    const clearBtn = $("#act-clear-done", pop);
    if (clearBtn) {
      clearBtn.onclick = async () => {
        await api("clear_finished_tasks").catch(() => {});
        await reloadState();
      };
    }
    $$("[data-act-open]", pop).forEach((b) => {
      b.onclick = () => {
        UI.theaterTaskId = b.dataset.actOpen;
        UI.activityOpen = false;
        pop.hidden = true;
        UI.theaterMinimized = false;
        updateInstallTheater(activeTasks());
      };
    });
    $$("[data-act-cancel]", pop).forEach((b) => {
      b.onclick = async () => {
        await api("cancel_task", { id: b.dataset.actCancel }).catch(() => {});
        await reloadState();
      };
    });
  }

  // Animated Update Available Confirmation Card (Hub or Installed Apps)
  function renderUpdateAlertCard(st, live) {
    const card = $("#update-alert-card");
    if (!card || !st) return;

    // Hide while an installation is already actively open in theater
    if (live.length > 0 && !UI.theaterMinimized) {
      card.hidden = true;
      return;
    }

    const isAr = UI.lang === "ar";
    const updApps = (st.items || []).filter((x) => x.state?.has_update);
    const hasHubUpd = Boolean(st.hub_has_update);

    if (!hasHubUpd && updApps.length === 0) {
      card.hidden = true;
      return;
    }

    const key = hasHubUpd
      ? `hub:${st.hub_remote_version}`
      : `apps:${updApps.map((x) => `${x.id}@${x.version}`).join(",")}`;

    if (UI.dismissedUpdateKey === key) {
      card.hidden = true;
      return;
    }

    if (card.dataset.alertKey === key && !card.hidden) {
      return;
    }

    card.dataset.alertKey = key;
    card.classList.remove("is-leaving");
    card.hidden = false;

    const iconSrc = hasHubUpd
      ? "./logo.svg"
      : `./icons/${esc(updApps[0].id)}.svg`;
    const kicker = isAr ? "تحديث جديد متوفر الآن" : "New Update Available";
    const title = hasHubUpd
      ? (isAr ? `QASSIMZ Hub v${st.hub_remote_version}` : `QASSIMZ Hub v${st.hub_remote_version}`)
      : updApps.length === 1
      ? `${updApps[0].name} v${updApps[0].version}`
      : (isAr ? `تحديث متوفر لـ ${updApps.length} تطبيقات` : `${updApps.length} App Updates Ready`);
    const sub = hasHubUpd
      ? (isAr ? "تحديث ذكي سريع مع إعادة تشغيل تلقائية" : "Fast smart delta update with automatic restart")
      : (isAr ? "ينزّل الملفات المتغيرة فقط بسرعة فائقة" : "Downloads only changed files via Smart Delta");
    const confirmLbl = isAr ? "تأكيد التحديث والتنزيل" : "Confirm & Update";
    const laterLbl = isAr ? "لاحقاً" : "Later";

    card.innerHTML = `
      <div class="ua-top">
        <img class="ua-icon" src="${iconSrc}" alt="" />
        <div class="ua-meta">
          <div class="ua-kicker"><span class="ua-pulse"></span><span>${esc(kicker)}</span></div>
          <div class="ua-title">${esc(title)}</div>
          <div class="ua-sub">${esc(sub)}</div>
        </div>
      </div>
      <div class="ua-actions">
        <button class="cc-btn secondary sm" id="ua-later">${esc(laterLbl)}</button>
        <button class="cc-btn accent sm" id="ua-confirm">${esc(confirmLbl)}</button>
      </div>
    `;

    const dismiss = () => {
      UI.dismissedUpdateKey = key;
      card.classList.add("is-leaving");
      setTimeout(() => {
        card.classList.remove("is-leaving");
        card.hidden = true;
      }, 190);
    };

    const laterBtn = $("#ua-later", card);
    if (laterBtn) laterBtn.onclick = dismiss;

    const confirmBtn = $("#ua-confirm", card);
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        dismiss();
        if (hasHubUpd) {
          triggerHubSelfUpdate();
        } else if (updApps.length === 1) {
          triggerInstall(updApps[0].id, true);
        } else {
          try {
            const list = await api("update_all");
            if (list && list.length) {
              toast(tr().toastQueuedUpdates(list.length));
              UI.theaterMinimized = false;
              await reloadState();
            }
          } catch (e) {
            toast(e.message, "error");
          }
        }
      };
    }
  }

  // Adobe CC-Style In-App Installer Modal (#install-theater) + Minimized Strip
  function updateInstallTheater(live) {
    const theater = $("#install-theater");
    const strip = $("#transfer-strip");
    const t = tr();

    // If a task just reached completed/error while theater was open, display result state
    const terminal = !live.length ? UI.theaterTerminalTask : null;

    if (!live.length && !terminal) {
      theater.hidden = true;
      strip.hidden = true;
      UI.theaterMinimized = false;
      return;
    }

    const cur = live.length
      ? live.find((x) => x.id === UI.theaterTaskId) || live[0]
      : terminal;
    UI.theaterTaskId = cur.id;

    const isDelta = cur.update_mode === "delta";
    const isFallback = cur.update_mode === "fallback";
    const isAr = UI.lang === "ar";
    const speedTxt = cur.speed_bps > 0 ? `${humanBytes(cur.speed_bps)}/s` : "";
    const etaTxt = cur.eta_sec > 0 ? (isAr ? `متبقي ~${cur.eta_sec} ث` : `~${cur.eta_sec}s left`) : "";
    const sizeTxt = cur.total > 0 ? `${humanBytes(cur.downloaded)} / ${humanBytes(cur.total)}` : "";
    const chunksTxt =
      isDelta && cur.delta_chunks_total > 0
        ? (isAr
            ? `الأجزاء ${cur.delta_chunks_done}/${cur.delta_chunks_total}`
            : `Chunks ${cur.delta_chunks_done}/${cur.delta_chunks_total}`)
        : "";
    const savedPctVal = Number(cur.delta_saved_pct) || 0;
    const savedBytesVal = Number(cur.delta_saved_bytes) || 0;
    const savedTxt =
      isDelta && (savedBytesVal > 0 || savedPctVal > 0)
        ? (isAr
            ? `توفير ${savedPctVal.toFixed(0)}% (${humanBytes(savedBytesVal)})`
            : `Saved ${savedPctVal.toFixed(0)}% (${humanBytes(savedBytesVal)})`)
        : "";
    const tele = [sizeTxt, speedTxt, etaTxt].filter(Boolean).join(" · ") || cur.message_ar || t.preparing;

    if (live.length && UI.theaterMinimized) {
      theater.hidden = true;
      strip.hidden = false;
      const modePrefix = isDelta ? (isAr ? "تفاضلي · " : "Delta · ") : "";
      $("#strip-title").textContent = `${modePrefix}${cur.name} · ${cur.progress}%`;
      $("#strip-fill").style.width = `${cur.progress}%`;
      $("#strip-meta").textContent = [tele, savedTxt].filter(Boolean).join(" · ");
      return;
    }

    strip.hidden = true;
    theater.hidden = false;

    $("#th-phase-badge").textContent = t.installerTitle;
    $("#th-app-icon").src = cur.id === "qassimz-hub" ? "./logo.svg" : `./icons/${cur.id}.svg`;
    $("#th-app-name").textContent = cur.name;
    $("#th-app-ver").textContent = `v${cur.version}`;
    $("#th-status-msg").textContent = cur.message_ar || t.connecting;

    // Clean Adobe Creative Cloud mode badge (no raw internal error codes)
    const badgeEl = $("#th-delta-badge");
    if (badgeEl) {
      badgeEl.classList.remove("mode-delta", "mode-fallback");
      if (isDelta) {
        badgeEl.hidden = false;
        badgeEl.classList.add("mode-delta");
        badgeEl.textContent = isAr ? "تحديث ذكي سريع" : "Smart Delta Update";
      } else if (isFallback) {
        badgeEl.hidden = false;
        badgeEl.classList.add("mode-fallback");
        badgeEl.textContent = isAr ? "حزمة التثبيت الكاملة" : "Full Package";
      } else {
        badgeEl.hidden = true;
      }
    }

    const stg = cur.stage || "";
    const isDone = cur.status === "completed" || stg === "completed";
    const isErr = cur.status === "error" || stg === "error";
    const isVerify =
      !isDone &&
      !isErr &&
      (stg === "verifying" || (cur.status !== "installing" && cur.progress >= 98));
    const isInst =
      !isDone &&
      !isErr &&
      !isVerify &&
      (stg === "applying" || stg === "installing" || cur.status === "installing");

    $("#th-step-dl").classList.toggle("active", !isInst && !isVerify && !isDone && !isErr);
    $("#th-step-dl").classList.toggle("done", isVerify || isInst || isDone);

    $("#th-step-verify").classList.toggle("active", isVerify);
    $("#th-step-verify").classList.toggle("done", isInst || isDone);

    $("#th-step-inst").classList.toggle("active", isInst);
    $("#th-step-inst").classList.toggle("done", isDone);

    $("#th-progress-block").hidden = isDone || isErr;
    $("#th-complete-box").hidden = !isDone;
    $("#th-error-box").hidden = !isErr;

    const savedEl = $("#th-delta-saved");
    if (!isDone && !isErr) {
      $("#th-pct").textContent = `${cur.progress}%`;
      $("#th-fill").style.width = `${cur.progress}%`;
      $("#th-telemetry").textContent = tele;
      if (savedEl) {
        if (savedTxt) {
          savedEl.hidden = false;
          savedEl.textContent = savedTxt;
        } else {
          savedEl.hidden = true;
        }
      }
    } else if (isDone) {
      const compSub = $("#th-complete-sub");
      if (compSub) {
        compSub.textContent = savedTxt ? `${t.completeSub} · ${savedTxt}` : t.completeSub;
      }
    } else if (isErr) {
      $("#th-error-sub").textContent = cur.message_ar || "";
    }

    // Footer buttons by state
    const canCancel = ["queued", "downloading"].includes(cur.status);
    $("#btn-th-bg").hidden = isDone || isErr;
    $("#btn-th-cancel").hidden = !canCancel;
    $("#btn-th-launch").hidden = !isDone || cur.id === "qassimz-hub";
    $("#btn-th-done").hidden = !isDone && !isErr;
    $("#btn-th-retry").hidden = !isErr;

    $("#btn-th-cancel").onclick = async () => {
      await api("cancel_task", { id: cur.id });
      UI.theaterTerminalTask = null;
      await reloadState();
    };
    $("#btn-th-launch").onclick = () => {
      UI.theaterTerminalTask = null;
      theater.hidden = true;
      triggerLaunch(cur.id);
    };
    $("#btn-th-done").onclick = () => {
      UI.theaterTerminalTask = null;
      theater.hidden = true;
    };
    $("#btn-th-retry").onclick = () => {
      UI.theaterTerminalTask = null;
      triggerInstall(cur.id, true);
    };
  }

  // Disciplined Spectrum 2 App Card (Grid View)
  function cardHTML(it, tmap, idx = 0) {
    const st = it.state || {};
    const m = appMeta(it);
    const t = tr();
    const task = tmap.get(it.id);
    const isBusy = task && ["queued", "downloading", "installing"].includes(task.status);
    const installed = Boolean(st.installed);
    const catLabel = it.category === "adobe" ? t.catAdobe : t.catDesktop;
    const desc = UI.lang === "ar" ? it.tagline_ar || it.description_ar || m.blurbEn : m.blurbEn;

    let statusTag = "";
    if (st.has_update) {
      statusTag = `<span class="card-status-tag notice">${esc(t.updAvail)}</span>`;
    } else if (installed) {
      statusTag = `<span class="card-status-tag positive">${esc(t.installedTag)}</span>`;
    }

    let footHTML = "";
    if (isBusy) {
      const cap = task.status === "installing" ? t.installing : t.downloading;
      const canCancel = ["queued", "downloading"].includes(task.status);
      footHTML = `
        <div class="card-progress-row" data-prog-card="${esc(it.id)}">
          <div class="card-progress-body">
            <div class="card-progress-head">
              <span class="cp-caption">${esc(cap)}</span>
              <span class="cp-pct">${task.progress}%</span>
            </div>
            <div class="cp-track"><div class="cp-fill" style="width:${task.progress}%"></div></div>
          </div>
          ${
            canCancel
              ? `<button class="cc-icon-btn sm" data-act="cancel" data-id="${esc(it.id)}" title="${esc(t.cancel)}" aria-label="${esc(t.cancel)}">
                   <svg viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg>
                 </button>`
              : ""
          }
        </div>
      `;
    } else {
      const metaText = installed && !st.has_update
        ? t.installedVer(st.installed_version || it.version)
        : humanBytes(it.setup_size);
      const ctaBtn = st.has_update
        ? `<button class="cc-btn accent" data-act="install" data-id="${esc(it.id)}">${esc(t.update)}</button>`
        : installed
        ? `<button class="cc-btn secondary" data-act="launch" data-id="${esc(it.id)}">${esc(t.open)}</button>`
        : `<button class="cc-btn accent" data-act="install" data-id="${esc(it.id)}">${esc(t.install)}</button>`;

      footHTML = `
        <span class="card-foot-meta ${installed && !st.has_update ? "installed-meta" : ""}">${esc(metaText)}</span>
        <div class="card-foot-cta">${ctaBtn}</div>
      `;
    }

    return `
      <article class="craft-card ${installed ? "installed" : "uninstalled"}"
               style="--app-color:${esc(m.color)};--card-delay:${Math.min(idx * 24, 220)}ms;"
               tabindex="0"
               data-card-id="${esc(it.id)}">
        <div>
          <div class="card-row-top">
            <img class="card-icon" src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)}" decoding="async" />
            <div class="card-title-col">
              <div class="card-title-line">
                <span class="card-name">${esc(it.name)}</span>
              </div>
              <div class="card-meta-pills">
                <span class="card-ver-pill">v${esc(st.installed_version || it.version)}</span>
                <span class="card-cat-tag">${esc(catLabel)}</span>
                ${statusTag}
              </div>
            </div>
            <button class="cc-icon-btn" data-act="menu" data-id="${esc(it.id)}" title="${esc(t.moreActions)}" aria-label="${esc(t.moreActions)}">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <circle cx="3.2" cy="8" r="1.35"/>
                <circle cx="8" cy="8" r="1.35"/>
                <circle cx="12.8" cy="8" r="1.35"/>
              </svg>
            </button>
          </div>
          <p class="card-desc">${esc(desc)}</p>
        </div>

        <div class="card-row-foot">${footHTML}</div>
      </article>
    `;
  }

  function renderEmptyState() {
    const t = tr();
    let msg = t.emptyApps;
    if (!UI.query && UI.view === "installed") msg = t.emptyInstalled;
    else if (!UI.query && UI.view === "updates") msg = t.emptyUpdates;

    const showReset = Boolean(UI.query || UI.view !== "all");
    return `
      <div class="empty-box">
        <p>${esc(msg)}</p>
        ${showReset ? `<button class="cc-btn secondary sm" id="btn-clear-filters">${esc(t.clearFilters)}</button>` : ""}
      </div>
    `;
  }

  function renderGridView(list, tmap) {
    const ws = $("#workspace");
    if (!list.length) {
      ws.innerHTML = renderEmptyState();
      const clr = $("#btn-clear-filters", ws);
      if (clr) {
        clr.onclick = () => {
          UI.query = "";
          UI.view = "all";
          $("#q-search").value = "";
          render();
        };
      }
      return;
    }

    const t = tr();
    if (UI.view === "all" && !UI.query.trim() && UI.sort === "default") {
      const pinnedList = list.filter((x) => isPinned(x.id));
      const rest = list.filter((x) => !isPinned(x.id));
      const installedList = rest.filter((x) => x.state?.installed);
      const availableList = rest.filter((x) => !x.state?.installed);

      let html = "";
      if (pinnedList.length) {
        html += `
          <section class="cc-section">
            <h2 class="cc-section-head">${esc(t.secPinned)}</h2>
            <div class="cc-grid">${pinnedList.map((it, i) => cardHTML(it, tmap, i)).join("")}</div>
          </section>
        `;
      }
      if (installedList.length) {
        html += `
          <section class="cc-section">
            <h2 class="cc-section-head">${esc(t.secInstalled)}</h2>
            <div class="cc-grid">${installedList.map((it, i) => cardHTML(it, tmap, i)).join("")}</div>
          </section>
        `;
      }
      if (availableList.length) {
        html += `
          <section class="cc-section">
            ${installedList.length || pinnedList.length ? `<h2 class="cc-section-head">${esc(t.secAvailable)}</h2>` : ""}
            <div class="cc-grid">${availableList.map((it, i) => cardHTML(it, tmap, i)).join("")}</div>
          </section>
        `;
      }
      ws.innerHTML = html;
    } else {
      ws.innerHTML = `
        <section class="cc-section">
          <div class="cc-grid">${list.map((it, i) => cardHTML(it, tmap, i)).join("")}</div>
        </section>
      `;
    }
  }

  // Clean Horizontal 64px List View
  function renderListView(list, tmap) {
    const ws = $("#workspace");
    if (!list.length) {
      ws.innerHTML = renderEmptyState();
      const clr = $("#btn-clear-filters", ws);
      if (clr) {
        clr.onclick = () => {
          UI.query = "";
          UI.view = "all";
          $("#q-search").value = "";
          render();
        };
      }
      return;
    }

    const t = tr();
    const rows = list
      .map((it) => {
        const st = it.state || {};
        const m = appMeta(it);
        const task = tmap.get(it.id);
        const isBusy = task && ["queued", "downloading", "installing"].includes(task.status);
        const installed = Boolean(st.installed);
        const desc = UI.lang === "ar" ? it.tagline_ar || m.blurbEn : m.blurbEn;

        const ctaBtn = isBusy
          ? `<span class="cp-pct">${task.progress}%</span>`
          : st.has_update
          ? `<button class="cc-btn accent sm" data-act="install" data-id="${esc(it.id)}">${esc(t.update)}</button>`
          : installed
          ? `<button class="cc-btn secondary sm" data-act="launch" data-id="${esc(it.id)}">${esc(t.open)}</button>`
          : `<button class="cc-btn accent sm" data-act="install" data-id="${esc(it.id)}">${esc(t.install)}</button>`;

        return `
          <div class="app-list-row" data-card-id="${esc(it.id)}" tabindex="0">
            <div class="list-app-cell">
              <img class="list-icon" src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)}" />
              <div class="list-app-text">
                <div class="list-app-name">${esc(it.name)}</div>
                <div class="list-app-desc">${esc(desc)}</div>
              </div>
            </div>
            <div class="list-meta-cell">v${esc(st.installed_version || it.version)}</div>
            <div class="list-meta-cell">${esc(humanBytes(it.setup_size))}</div>
            <div class="list-actions-cell">
              ${ctaBtn}
              <button class="cc-icon-btn" data-act="menu" data-id="${esc(it.id)}" title="${esc(t.moreActions)}" aria-label="${esc(t.moreActions)}">
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="3.2" cy="8" r="1.35"/>
                  <circle cx="8" cy="8" r="1.35"/>
                  <circle cx="12.8" cy="8" r="1.35"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    ws.innerHTML = `<div class="cc-list">${rows}</div>`;
  }

  // Close standalone App Detail Page with smooth exit animation
  function closeDetailsPage() {
    const backdrop = $("#detail-backdrop");
    if (!backdrop || backdrop.hidden) {
      UI.selectedId = null;
      return;
    }
    backdrop.classList.add("is-leaving");
    setTimeout(() => {
      backdrop.classList.remove("is-leaving");
      UI.selectedId = null;
      backdrop.hidden = true;
    }, 185);
  }

  // Standalone Full-Page App Store / Creative Cloud Detail Page (100% Localized EN & AR)
  function renderDetailsSheet() {
    const backdrop = $("#detail-backdrop");
    const sheet = $("#detail-drawer");
    if (!UI.selectedId || !UI.state) {
      backdrop.hidden = true;
      return;
    }
    const items = visibleItems();
    const allItems = UI.state.items || [];
    const it = allItems.find((x) => x.id === UI.selectedId);
    if (!it) {
      backdrop.hidden = true;
      return;
    }

    backdrop.classList.remove("is-leaving");
    backdrop.hidden = false;
    const st = it.state || {};
    const m = appMeta(it);
    const t = tr();
    const isAr = UI.lang === "ar";
    const navPool = items.length ? items : allItems;
    const idx = navPool.findIndex((x) => x.id === it.id);
    const prevId = navPool.length > 1 ? navPool[(idx - 1 + navPool.length) % navPool.length].id : null;
    const nextId = navPool.length > 1 ? navPool[(idx + 1) % navPool.length].id : null;

    const repoUrl = `https://github.com/${it.repo || "ahmedqassimtv-commits/qassimz-hub"}`;
    const releasesUrl = `${repoUrl}/releases`;
    const updatedStr = fmtDate(UI.state.updated_at);
    const catLabel = it.category === "adobe" ? t.catAdobe : t.catDesktop;
    const hostsTxt = (it.hosts || []).join(" · ");

    const primaryBtn = st.has_update
      ? `<button class="cc-btn accent" id="dt-install">${esc(t.update)} v${esc(it.version)}</button>
         <button class="cc-btn secondary" id="dt-launch">${esc(t.open)}</button>`
      : st.installed
      ? `<button class="cc-btn accent" id="dt-launch">${esc(t.open)}</button>
         <button class="cc-btn secondary" id="dt-reinstall">${esc(t.reinstall)}</button>`
      : `<button class="cc-btn accent" id="dt-install">${esc(t.install)} v${esc(it.version)}</button>
         <button class="cc-btn secondary" id="dt-wizard">${esc(t.interactiveInstaller)}</button>`;

    const overviewText = isAr ? (it.description_ar || it.tagline_ar) : (m.blurbEn || it.tagline_ar);
    const subTitleText = isAr ? (it.name_ar || it.tagline_ar) : m.taglineEn;
    const backLabel = isAr ? "← العودة لكل التطبيقات" : "← Back to All Apps";
    const previewCaption = isAr
      ? `معاينة حقيقية من داخل ${it.name} · v${it.version}`
      : `Live Interface Preview · ${it.name} v${it.version}`;
    const featuresList = isAr
      ? (it.features_ar || [])
      : [
          m.taglineEn,
          hostsTxt ? `Compatible with ${hostsTxt}` : "Native Windows 10/11 Desktop Experience",
          "Supports Smart Delta Updates (HTTP Range) via QASSIMZ Hub",
          "Offline Google Sans Typography & Full Arabic RTL / English Support",
        ].filter(Boolean);

    sheet.innerHTML = `
      <div class="app-page-bar">
        <button class="app-page-back" id="dt-back">${esc(backLabel)}</button>
        <div class="dialog-head-actions">
          ${prevId ? `<button class="cc-icon-btn" id="dt-prev" title="${esc(t.prev)}">‹</button>` : ""}
          ${nextId ? `<button class="cc-icon-btn" id="dt-next" title="${esc(t.next)}">›</button>` : ""}
          <button class="cc-icon-btn" id="dt-close" title="${esc(t.close)}">✕</button>
        </div>
      </div>

      <div class="app-page-scroll">
        <div class="app-page-inner">
          <div class="app-page-hero">
            <div class="app-page-hero-left">
              <img class="app-page-icon" src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)}" />
              <div style="min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <h2 class="dialog-title" id="drawer-title" style="margin:0;">${esc(it.name)}</h2>
                  <span class="card-ver-pill">v${esc(it.version)}</span>
                  <span class="card-cat-tag">${esc(catLabel)}</span>
                  ${st.installed ? `<span class="card-status-tag positive">${esc(t.installedTag)}</span>` : ""}
                </div>
                <p class="dialog-sub" style="margin:6px 0 0;">${esc(subTitleText)}</p>
                <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
                  <button class="cc-link-btn" data-ext-url="${esc(repoUrl)}">${esc(t.github)}</button>
                  <button class="cc-link-btn" data-ext-url="${esc(releasesUrl)}">${esc(t.releases)}</button>
                  ${it.portable_url ? `<button class="cc-link-btn" data-ext-url="${esc(it.portable_url)}">${esc(t.portableZip)}</button>` : ""}
                  ${st.install_dir ? `<button class="cc-link-btn" id="dt-folder">${esc(t.openFolder)}</button>` : ""}
                  ${st.installed && st.uninstall_cmd ? `<button class="cc-link-btn" id="dt-uninstall" style="color:var(--danger,#E34850);">${esc(t.uninstall)}</button>` : ""}
                </div>
              </div>
            </div>
            <div class="app-page-cta">
              ${primaryBtn}
            </div>
          </div>

          <div class="app-preview-stage" id="dt-preview-stage">
            <img class="app-preview-img" src="./previews/${esc(it.id)}.jpg" alt="${esc(it.name)} Preview" onerror="this.parentElement.hidden=true" />
            <div class="app-preview-caption">
              <span>${esc(previewCaption)}</span>
              <span>${esc(humanBytes(it.setup_size))}</span>
            </div>
          </div>

          <div class="dialog-cols">
            <div>
              <h3 class="dialog-section-label">${esc(t.overview)}</h3>
              <div class="dialog-panel">
                <p style="margin:0;font-size:13.5px;line-height:1.7;color:var(--text-primary);">${esc(overviewText)}</p>
              </div>
              ${
                it.release_notes_ar
                  ? `<h3 class="dialog-section-label" style="margin-top:16px;">${esc(t.whatsNew(it.version))}</h3>
                     <div class="dialog-panel" dir="rtl">
                       <p style="margin:0;font-size:13px;line-height:1.65;color:var(--text-secondary);">${esc(it.release_notes_ar)}</p>
                     </div>`
                  : ""
              }
            </div>

            <div>
              <h3 class="dialog-section-label">${esc(t.keyFeatures)}</h3>
              <div class="dialog-panel" dir="${isAr ? "rtl" : "ltr"}">
                ${featuresList.map((f) => `<div class="feature-item">✓ ${esc(f)}</div>`).join("")}
              </div>
            </div>
          </div>

          <div>
            <h3 class="dialog-section-label">${esc(t.releaseFacts)}</h3>
            <div class="facts-grid">
              <div class="fact-box"><span>${esc(t.latestVersion)}</span><strong>v${esc(it.version)}</strong></div>
              <div class="fact-box"><span>${esc(t.installedLabel)}</span><strong>${st.installed ? `v${esc(st.installed_version || it.version)}` : esc(t.notInstalled)}</strong></div>
              <div class="fact-box"><span>${esc(t.downloadSize)}</span><strong>${esc(humanBytes(it.setup_size))}</strong></div>
              <div class="fact-box"><span>${esc(t.releasedLabel)}</span><strong>${esc(updatedStr)}</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const on = (sel, fn) => {
      const el = $(sel, sheet);
      if (el) el.onclick = fn;
    };
    on("#dt-back", closeDetailsPage);
    on("#dt-close", closeDetailsPage);
    on("#dt-prev", () => { UI.selectedId = prevId; renderDetailsSheet(); });
    on("#dt-next", () => { UI.selectedId = nextId; renderDetailsSheet(); });
    on("#dt-install", () => { UI.selectedId = null; backdrop.hidden = true; triggerInstall(it.id, true); });
    on("#dt-wizard", () => { UI.selectedId = null; backdrop.hidden = true; triggerInstall(it.id, false); });
    on("#dt-reinstall", () => { UI.selectedId = null; backdrop.hidden = true; triggerInstall(it.id, false); });
    on("#dt-launch", () => triggerLaunch(it.id));
    on("#dt-folder", () => api("open_folder", { path: st.install_dir }));
    on("#dt-uninstall", async () => {
      try {
        await api("uninstall", { id: it.id });
        toast(tr().toastUninstallStarted(it.name));
        closeDetailsPage();
      } catch (e) {
        toast(e.message, "error");
      }
    });
    $$("[data-ext-url]", sheet).forEach((b) => {
      b.onclick = () => api("open_url", { url: b.dataset.extUrl });
    });
  }

  // Settings Dialog (100% Localized EN & AR, Real win_quit)
  function renderSettingsSheet() {
    const backdrop = $("#settings-backdrop");
    const sheet = $("#settings-sheet");
    if (!UI.settingsOpen || !UI.state) {
      backdrop.hidden = true;
      return;
    }
    backdrop.hidden = false;
    const st = UI.state;
    const cfg = st.settings || {};
    const t = tr();
    const cacheSize = st.cache_size_bytes > 0 ? humanBytes(st.cache_size_bytes) : "0 KB";
    const hubVer = st.hub_version || "1.3.0";

    sheet.innerHTML = `
      <div class="dialog-head">
        <div class="dialog-head-left">
          <img class="dialog-app-icon" src="./logo.svg" alt="QASSIMZ Hub" />
          <div>
            <h2 class="dialog-title" id="settings-title">${esc(t.settings)}</h2>
            <p class="dialog-sub">QASSIMZ Hub v${esc(hubVer)}</p>
          </div>
        </div>
        <button class="cc-icon-btn" id="st-close" title="${esc(t.close)}">✕</button>
      </div>

      <div class="dialog-body">
        <div class="dialog-cols">
          <div>
            <h3 class="dialog-section-label">${esc(t.appearanceLang)}</h3>
            <div class="dialog-panel">
              <div class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.themeTitle)}</strong>
                  <span>${esc(t.themeSub)}</span>
                </div>
                <div class="set-seg">
                  <button class="set-seg-btn ${UI.themePref === "light" ? "active" : ""}" data-theme-pick="light">${esc(t.themeLight)}</button>
                  <button class="set-seg-btn ${UI.themePref === "dark" ? "active" : ""}" data-theme-pick="dark">${esc(t.themeDark)}</button>
                  <button class="set-seg-btn ${UI.themePref === "system" ? "active" : ""}" data-theme-pick="system">${esc(t.themeSystem)}</button>
                </div>
              </div>
              <div class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.langTitle)}</strong>
                  <span>${esc(t.langSub)}</span>
                </div>
                <div class="set-seg">
                  <button class="set-seg-btn ${UI.lang === "en" ? "active" : ""}" data-lang-pick="en">English</button>
                  <button class="set-seg-btn ${UI.lang === "ar" ? "active" : ""}" data-lang-pick="ar">العربية</button>
                </div>
              </div>
            </div>

            <h3 class="dialog-section-label">${esc(t.autoUpdates)}</h3>
            <div class="dialog-panel">
              <label class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.autoCheckTitle)}</strong>
                  <span>${esc(t.autoCheckSub)}</span>
                </div>
                <input type="checkbox" class="cc-switch" data-setting="auto_check_updates" ${cfg.auto_check_updates ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.autoAppsTitle)}</strong>
                  <span>${esc(t.autoAppsSub)}</span>
                </div>
                <input type="checkbox" class="cc-switch" data-setting="auto_update_apps" ${cfg.auto_update_apps !== false ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.autoHubTitle)}</strong>
                  <span>${esc(t.autoHubSub)}</span>
                </div>
                <input type="checkbox" class="cc-switch" data-setting="auto_update_hub" ${cfg.auto_update_hub ? "checked" : ""} />
              </label>
            </div>
          </div>

          <div>
            <h3 class="dialog-section-label">${esc(t.installWin)}</h3>
            <div class="dialog-panel">
              <label class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.silentTitle)}</strong>
                  <span>${esc(t.silentSub)}</span>
                </div>
                <input type="checkbox" class="cc-switch" data-setting="silent_install" ${cfg.silent_install ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.trayTitle)}</strong>
                  <span>${esc(t.traySub)}</span>
                </div>
                <input type="checkbox" class="cc-switch" data-setting="minimize_to_tray" ${cfg.minimize_to_tray ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>${esc(t.startupTitle)}</strong>
                  <span>${esc(t.startupSub)}</span>
                </div>
                <input type="checkbox" class="cc-switch" data-setting="start_with_windows" ${cfg.start_with_windows ? "checked" : ""} />
              </label>
            </div>

            <h3 class="dialog-section-label">${esc(t.maintenance)}</h3>
            <div class="dialog-panel">
              <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 12px;">
                ${esc(t.cacheInfo(cacheSize, st.adobe?.premiere_installed, st.adobe?.aftereffects_installed))}
              </p>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                <button class="cc-btn accent sm" id="st-self-update">${esc(t.checkHubUpdate)}</button>
                <button class="cc-btn secondary sm" id="st-fix-cep">${esc(t.cepEnable)}</button>
                <button class="cc-btn secondary sm" id="st-open-cache">${esc(t.cacheFolder)}</button>
                <button class="cc-btn danger sm" id="st-clear-cache">${esc(t.clearCache)}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-foot">
        <button class="cc-btn danger" id="st-quit">${esc(t.quitHub)}</button>
        <button class="cc-btn accent" id="st-done">${esc(t.done)}</button>
      </div>
    `;

    const close = () => {
      UI.settingsOpen = false;
      renderSettingsSheet();
    };
    $("#st-close", sheet).onclick = close;
    $("#st-done", sheet).onclick = close;
    $("#st-quit", sheet).onclick = () => api("win_quit").catch(() => {});

    $$("[data-theme-pick]", sheet).forEach((b) => {
      b.onclick = () => {
        UI.themePref = b.dataset.themePick;
        localStorage.setItem("qhub_theme", UI.themePref);
        render();
        renderSettingsSheet();
      };
    });

    $$("[data-lang-pick]", sheet).forEach((b) => {
      b.onclick = () => {
        UI.lang = b.dataset.langPick;
        localStorage.setItem("qhub_lang", UI.lang);
        render();
        renderSettingsSheet();
      };
    });

    $$("input[data-setting]", sheet).forEach((chk) => {
      chk.onchange = async () => {
        try {
          const updated = await api("save_settings", { values: { [chk.dataset.setting]: chk.checked } });
          UI.state.settings = updated;
          toast(tr().toastSettingsSaved);
        } catch (e) {
          toast(e.message, "error");
        }
      };
    });

    $("#st-self-update", sheet).onclick = () => {
      close();
      triggerHubSelfUpdate();
    };
    $("#st-open-cache", sheet).onclick = () => api("open_cache_dir");
    $("#st-clear-cache", sheet).onclick = async () => {
      UI.state = await api("clear_cache");
      render();
      renderSettingsSheet();
      toast(tr().toastCacheCleared);
    };
    $("#st-fix-cep", sheet).onclick = async () => {
      await api("fix_cep");
      await reloadState();
      renderSettingsSheet();
      toast(tr().toastCepEnabled);
    };
  }

  // Notifications Bell Popup (100% Localized)
  function renderBellPopup() {
    const pop = $("#bell-popup");
    if (!UI.bellOpen || !UI.state) {
      pop.hidden = true;
      return;
    }
    pop.hidden = false;
    const t = tr();
    const tasks = UI.state.tasks || [];
    const updates = (UI.state.items || []).filter((x) => x.state?.has_update);

    let rows = "";
    for (const tk of tasks) {
      rows += `
        <div class="bell-row">
          <div class="bell-row-top">
            <span>${esc(tk.name)} v${esc(tk.version)}</span>
            <span style="font-family:var(--font-code);">${tk.progress}%</span>
          </div>
          <div class="bell-row-sub">${esc(tk.message_ar)}</div>
        </div>
      `;
    }
    for (const up of updates) {
      rows += `
        <div class="bell-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <div class="bell-row-top">${esc(up.name)} v${esc(up.version)}</div>
            <div class="bell-row-sub">${esc(t.updateAvailSize(humanBytes(up.setup_size)))}</div>
          </div>
          <button class="cc-btn accent sm" data-bell-upd="${esc(up.id)}">${esc(t.update)}</button>
        </div>
      `;
    }

    pop.innerHTML = `
      <div class="bell-header">${esc(t.announcements)}</div>
      ${rows || `<p class="bell-empty">${esc(t.noAnnouncements)}</p>`}
    `;

    $$("[data-bell-upd]", pop).forEach((b) => {
      b.onclick = () => {
        UI.bellOpen = false;
        pop.hidden = true;
        triggerInstall(b.dataset.bellUpd, true);
      };
    });
  }

  // Context ••• Menu (100% Localized EN & AR)
  function openCardMenu(appId, anchorEl) {
    const menu = $("#card-more-menu");
    const it = (UI.state?.items || []).find((x) => x.id === appId);
    if (!it) return;
    const st = it.state || {};
    const t = tr();
    const repoUrl = `https://github.com/${it.repo || "ahmedqassimtv-commits/qassimz-hub"}`;
    const hidden = UI.hiddenApps.has(it.id);
    const pinned = isPinned(it.id);

    menu.innerHTML = `
      <button class="menu-item" data-m="details"><span>${esc(t.menuDetails)}</span><span>↵</span></button>
      <button class="menu-item" data-m="pin"><span>${esc(pinned ? t.menuUnpin : t.menuPin)}</span></button>
      ${st.installed ? `<button class="menu-item" data-m="launch"><span>${esc(t.menuOpen(it.name))}</span></button>` : ""}
      <button class="menu-item" data-m="wizard"><span>${esc(st.installed ? t.menuReinstall : t.menuWizard)}</span></button>
      ${st.install_dir ? `<button class="menu-item" data-m="folder"><span>${esc(t.menuFolder)}</span></button>` : ""}
      <div class="menu-sep"></div>
      <button class="menu-item" data-m="github"><span>${esc(t.menuGithub)}</span><span>↗</span></button>
      <button class="menu-item" data-m="releases"><span>${esc(t.menuReleases)}</span><span>↗</span></button>
      ${it.portable_url ? `<button class="menu-item" data-m="portable"><span>${esc(t.menuPortable)}</span><span>↗</span></button>` : ""}
      <div class="menu-sep"></div>
      <button class="menu-item" data-m="hide"><span>${esc(hidden ? t.menuUnhide : t.menuHide)}</span></button>
      ${st.installed && st.uninstall_cmd ? `<button class="menu-item danger" data-m="uninstall"><span>${esc(t.menuUninstall)}</span></button>` : ""}
    `;

    menu.hidden = false;
    const r = anchorEl.getBoundingClientRect();
    const mw = menu.offsetWidth || 216;
    const mh = menu.offsetHeight || 240;
    const left = Math.min(window.innerWidth - mw - 12, Math.max(12, r.right - mw));
    const top = r.bottom + mh + 12 > window.innerHeight ? Math.max(12, r.top - mh - 4) : r.bottom + 4;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.onclick = async (ev) => {
      const btn = ev.target.closest("[data-m]");
      if (!btn) return;
      menu.hidden = true;
      const act = btn.dataset.m;
      if (act === "details") { UI.selectedId = it.id; renderDetailsSheet(); }
      else if (act === "pin") togglePin(it.id);
      else if (act === "launch") triggerLaunch(it.id);
      else if (act === "wizard") triggerInstall(it.id, false);
      else if (act === "folder") api("open_folder", { path: st.install_dir });
      else if (act === "github") api("open_url", { url: repoUrl });
      else if (act === "releases") api("open_url", { url: `${repoUrl}/releases` });
      else if (act === "portable") api("open_url", { url: it.portable_url });
      else if (act === "hide") toggleHide(it.id);
      else if (act === "uninstall") {
        try {
          await api("uninstall", { id: it.id });
          toast(tr().toastUninstallStarted(it.name));
        } catch (e) {
          toast(e.message, "error");
        }
      }
    };
  }

  function render() {
    if (!UI.state) return;
    const list = visibleItems();
    const tmap = taskMap();
    updateChrome(list.length);
    if (UI.layout === "table") renderListView(list, tmap);
    else renderGridView(list, tmap);
    renderDetailsSheet();
    manageTaskPolling();
  }

  function patchProgressInPlace() {
    const live = activeTasks();
    updateInstallTheater(live);
    const ws = $("#workspace");
    const t = tr();
    for (const tk of UI.state?.tasks || []) {
      const box = $(`[data-prog-card="${tk.id}"]`, ws);
      if (box) {
        const cap = $(".cp-caption", box);
        const pct = $(".cp-pct", box);
        const fill = $(".cp-fill", box);
        if (cap) cap.textContent = tk.status === "installing" ? t.installing : t.downloading;
        if (pct) pct.textContent = `${tk.progress}%`;
        if (fill) fill.style.width = `${tk.progress}%`;
      }
    }
  }

  async function reloadState() {
    UI.state = await api("state");
    render();
  }

  window.__qhubOnCatalogSynced = async () => {
    try { await reloadState(); } catch (_) {}
  };

  function manageTaskPolling() {
    const hasActive = activeTasks().length > 0;
    if (hasActive && !UI.pollTimer) {
      let busy = false;
      UI.pollTimer = setInterval(async () => {
        if (busy || document.hidden) return;
        busy = true;
        try {
          const prevTasks = UI.state.tasks || [];
          const prevActive = activeTasks().length;
          const tasks = await api("tasks");
          UI.state.tasks = tasks;

          for (const tk of tasks) {
            const old = prevTasks.find((x) => x.id === tk.id);
            if (old && old.status !== tk.status) {
              if (tk.status === "completed") {
                toast(`${tk.name} v${tk.version} — ${tk.message_ar}`);
                if (!UI.theaterMinimized && UI.theaterTaskId === tk.id) {
                  UI.theaterTerminalTask = tk;
                }
              } else if (tk.status === "error") {
                toast(`${tk.name}: ${tk.message_ar}`, "error");
                if (!UI.theaterMinimized && UI.theaterTaskId === tk.id) {
                  UI.theaterTerminalTask = tk;
                }
              }
            }
          }

          const nowActive = activeTasks().length;
          if (prevActive > 0 && nowActive === 0) {
            UI.state = await api("state");
            render();
          } else {
            updateChrome(visibleItems().length);
            patchProgressInPlace();
          }
        } catch (_) {
        } finally {
          busy = false;
        }
      }, 450);
    } else if (!hasActive && UI.pollTimer) {
      clearInterval(UI.pollTimer);
      UI.pollTimer = null;
    }
  }

  async function triggerInstall(id, silentOverride = null) {
    try {
      UI.theaterMinimized = false;
      UI.theaterTerminalTask = null;
      UI.theaterTaskId = id;
      const payload = { id };
      if (silentOverride !== null) payload.silent = silentOverride;
      const tk = await api("install", payload);
      UI.state.tasks = [tk, ...(UI.state.tasks || []).filter((x) => x.id !== id)];
      render();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function triggerLaunch(id, subIdx = null) {
    try {
      const payload = { id };
      if (subIdx !== null) payload.sub_idx = subIdx;
      const res = await api("launch", payload);
      toast(typeof res === "string" && res ? res : tr().toastLaunching);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function triggerHubSelfUpdate() {
    try {
      UI.theaterMinimized = false;
      UI.theaterTerminalTask = null;
      UI.theaterTaskId = "qassimz-hub";
      const res = await api("install_hub_update");
      if (res && res.up_to_date) {
        toast(tr().toastHubUpToDate);
      } else {
        await reloadState();
      }
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function animateWindowClose(endpoint) {
    const shell = $(".cc-shell");
    if (shell) {
      shell.classList.remove("is-opening", "win-morph");
      shell.classList.add("is-closing");
    }
    setTimeout(() => {
      api(endpoint).catch(() => {});
      if (endpoint === "win_close" && shell) {
        setTimeout(() => shell.classList.remove("is-closing"), 320);
      }
    }, 170);
  }

  async function toggleMaximizeWindow() {
    const shell = $(".cc-shell");
    try {
      const res = await api("win_toggle_maximize");
      if (res && typeof res.maximized === "boolean") {
        UI.isMaximized = res.maximized;
      } else {
        UI.isMaximized = !UI.isMaximized;
      }
      syncWindowMaxIcon();
      if (shell) {
        shell.classList.remove("win-morph");
        void shell.offsetWidth;
        shell.classList.add("win-morph");
        setTimeout(() => shell.classList.remove("win-morph"), 260);
      }
    } catch (_) {}
  }

  function animateWindowMinimize() {
    const shell = $(".cc-shell");
    if (shell) {
      shell.classList.remove("is-opening", "win-morph");
      shell.classList.add("is-minimizing");
    }
    setTimeout(() => {
      api("win_minimize").catch(() => {});
      if (shell) {
        setTimeout(() => shell.classList.remove("is-minimizing"), 320);
      }
    }, 165);
  }

  function bindEvents() {
    // Clicking header brand logo returns cleanly to Home (All Apps) + plays subtle logo wave (never replays loading splash)
    $("#btn-replay-logo").onclick = () => {
      if (UI.selectedId) closeDetailsPage();
      UI.view = "all";
      UI.query = "";
      const searchEl = $("#q-search");
      if (searchEl) searchEl.value = "";
      UI.activityOpen = false;
      UI.bellOpen = false;
      const ap = $("#activity-popup");
      const bp = $("#bell-popup");
      if (ap) ap.hidden = true;
      if (bp) bp.hidden = true;
      render();
      const scroll = $("#page-scroll");
      if (scroll) scroll.scrollTo({ top: 0, behavior: "smooth" });
      triggerHeaderLogoWave();
    };

    // Smooth entrance when restored from taskbar
    window.addEventListener("focus", () => {
      const shell = $(".cc-shell");
      if (shell && shell.classList.contains("is-minimizing")) {
        shell.classList.remove("is-minimizing");
        shell.classList.add("is-opening");
        setTimeout(() => shell.classList.remove("is-opening"), 240);
      }
    });

    // Responsive sidebar drawer toggle
    $("#btn-sidebar-toggle").onclick = (e) => {
      e.stopPropagation();
      UI.sidebarExpanded = !UI.sidebarExpanded;
      $("#app-sidebar").classList.toggle("expanded", UI.sidebarExpanded);
    };

    // Language & Theme toggles
    $("#btn-lang").onclick = () => {
      UI.lang = UI.lang === "ar" ? "en" : "ar";
      localStorage.setItem("qhub_lang", UI.lang);
      render();
    };
    $("#btn-theme-toggle").onclick = () => {
      UI.themePref = isDarkActive() ? "light" : "dark";
      localStorage.setItem("qhub_theme", UI.themePref);
      render();
    };

    // Activity button toggles Adobe CC top-header Updates & Downloads dropdown
    $("#btn-activity").onclick = (e) => {
      e.stopPropagation();
      UI.activityOpen = !UI.activityOpen;
      UI.bellOpen = false;
      $("#bell-popup").hidden = true;
      renderActivityPopup();
    };
    document.addEventListener("click", (e) => {
      const pop = $("#activity-popup");
      if (UI.activityOpen && pop && !pop.contains(e.target) && !e.target.closest("#btn-activity")) {
        UI.activityOpen = false;
        pop.hidden = true;
      }
    });

    // Frameless Windows 11 Caption Controls (with smooth minimize, close & maximize/restore morph)
    $("#btn-win-min").onclick = () => animateWindowMinimize();
    $("#btn-win-max").onclick = () => toggleMaximizeWindow();
    $("#btn-win-close").onclick = () => animateWindowClose("win_close");
    $("#app-titlebar").ondblclick = (e) => {
      if (!e.target.closest(".no-drag")) toggleMaximizeWindow();
    };

    // Sidebar Exit/Quit button (genuine termination with smooth close animation)
    $("#btn-sidebar-quit").onclick = () => animateWindowClose("win_quit");

    // Sidebar Navigation items
    $$(".cc-sidebar .sb-item[data-view]").forEach((b) => {
      b.onclick = () => {
        UI.view = b.dataset.view;
        UI.sidebarExpanded = false;
        $("#app-sidebar").classList.remove("expanded");
        render();
      };
    });

    // Layout Segmented Toggle
    $$(".cc-segmented .seg-btn").forEach((b) => {
      b.onclick = () => {
        UI.layout = b.dataset.layout;
        localStorage.setItem("qhub_layout", UI.layout);
        render();
      };
    });

    $("#q-sort").onchange = (e) => {
      UI.sort = e.target.value;
      localStorage.setItem("qhub_sort", UI.sort);
      syncSortDropdown();
      render();
    };

    const sortWrap = $("#sort-wrap");
    const sortTrigger = $("#sort-trigger");
    const sortMenu = $("#sort-menu");
    if (sortTrigger && sortMenu && sortWrap) {
      sortTrigger.onclick = (e) => {
        e.stopPropagation();
        const willOpen = sortMenu.hidden;
        if (willOpen) syncSortDropdown();
        sortMenu.hidden = !willOpen;
        sortWrap.classList.toggle("open", willOpen);
        sortTrigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
      };
      document.addEventListener("click", (e) => {
        if (!sortMenu.hidden && !sortWrap.contains(e.target)) {
          sortMenu.hidden = true;
          sortWrap.classList.remove("open");
          sortTrigger.setAttribute("aria-expanded", "false");
        }
      });
    }

    // Cursor-tracking brand-colored spotlight on app cards
    const wsEl = $("#workspace");
    if (wsEl) {
      wsEl.addEventListener("pointermove", (e) => {
        const card = e.target.closest(".craft-card");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${Math.round(e.clientX - rect.left)}px`);
        card.style.setProperty("--my", `${Math.round(e.clientY - rect.top)}px`);
      });
    }

    $("#q-search").oninput = (e) => {
      clearTimeout(UI.searchTimer);
      UI.searchTimer = setTimeout(() => {
        UI.query = e.target.value;
        render();
      }, 60);
    };

    $("#btn-search-clear").onclick = () => {
      UI.query = "";
      $("#q-search").value = "";
      $("#q-search").focus();
      render();
    };

    $("#btn-refresh").onclick = async () => {
      const btn = $("#btn-refresh");
      btn.classList.add("spinning");
      try {
        UI.state = await api("refresh_catalog");
        render();
        toast(tr().toastCatalogSynced);
      } catch (e) {
        toast(e.message, "error");
      } finally {
        btn.classList.remove("spinning");
      }
    };

    $("#btn-update-all").onclick = async () => {
      try {
        UI.theaterMinimized = false;
        UI.theaterTerminalTask = null;
        const started = await api("update_all");
        toast(tr().toastQueuedUpdates(started.length));
        await reloadState();
      } catch (e) {
        toast(e.message, "error");
      }
    };

    // Header Bell & Settings
    $("#btn-bell").onclick = (e) => {
      e.stopPropagation();
      UI.bellOpen = !UI.bellOpen;
      renderBellPopup();
    };

    $("#btn-settings-top").onclick = () => {
      UI.settingsOpen = true;
      renderSettingsSheet();
    };

    // Theater chrome controls
    const minimizeTheater = () => {
      if (activeTasks().length > 0) {
        UI.theaterMinimized = true;
        updateInstallTheater(activeTasks());
      } else {
        UI.theaterTerminalTask = null;
        $("#install-theater").hidden = true;
      }
    };
    $("#btn-min-theater").onclick = minimizeTheater;
    $("#btn-th-bg").onclick = minimizeTheater;
    $("#btn-th-close").onclick = minimizeTheater;
    $("#btn-open-theater").onclick = () => {
      UI.theaterMinimized = false;
      updateInstallTheater(activeTasks());
    };

    // Sidebar Footer CEP & External Links
    $("#btn-fix-cep").onclick = async () => {
      await api("fix_cep");
      await reloadState();
      toast(tr().toastCepEnabled);
    };
    $$("[data-open-url]").forEach((b) => {
      b.onclick = () => api("open_url", { url: b.dataset.openUrl });
    });

    // Delegated Card & List Row clicks
    $("#workspace").onclick = async (ev) => {
      const actBtn = ev.target.closest("[data-act]");
      if (actBtn) {
        ev.stopPropagation();
        const act = actBtn.dataset.act;
        const id = actBtn.dataset.id;
        if (act === "install") triggerInstall(id, true);
        else if (act === "launch") triggerLaunch(id);
        else if (act === "menu") openCardMenu(id, actBtn);
        else if (act === "cancel") {
          await api("cancel_task", { id });
          await reloadState();
        }
        return;
      }

      const card = ev.target.closest("[data-card-id]");
      if (card) {
        UI.selectedId = card.dataset.cardId;
        renderDetailsSheet();
      }
    };

    // Scrim click-outside close
    $("#detail-backdrop").onclick = (e) => {
      if (e.target.id === "detail-backdrop") {
        UI.selectedId = null;
        renderDetailsSheet();
      }
    };
    $("#settings-backdrop").onclick = (e) => {
      if (e.target.id === "settings-backdrop") {
        UI.settingsOpen = false;
        renderSettingsSheet();
      }
    };

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#card-more-menu") && !e.target.closest('[data-act="menu"]')) {
        $("#card-more-menu").hidden = true;
      }
      if (!e.target.closest(".bell-anchor")) {
        UI.bellOpen = false;
        $("#bell-popup").hidden = true;
      }
      if (UI.sidebarExpanded && !e.target.closest("#app-sidebar") && !e.target.closest("#btn-sidebar-toggle")) {
        UI.sidebarExpanded = false;
        $("#app-sidebar").classList.remove("expanded");
      }
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        $("#card-more-menu").hidden = true;
        if (UI.bellOpen) { UI.bellOpen = false; $("#bell-popup").hidden = true; return; }
        if (UI.settingsOpen) { UI.settingsOpen = false; renderSettingsSheet(); return; }
        if (UI.selectedId) { UI.selectedId = null; renderDetailsSheet(); return; }
        if (!$("#install-theater").hidden) { minimizeTheater(); return; }
      }
      if (UI.selectedId && !UI.settingsOpen) {
        if (e.code === "ArrowLeft") { const p = $("#dt-prev"); if (p) p.click(); }
        if (e.code === "ArrowRight") { const n = $("#dt-next"); if (n) n.click(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyF") {
        e.preventDefault();
        $("#q-search").focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyR") {
        e.preventDefault();
        $("#btn-refresh").click();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "Comma") {
        e.preventDefault();
        UI.settingsOpen = !UI.settingsOpen;
        renderSettingsSheet();
      }
    });
  }

  async function boot() {
    applyThemeAndLang();
    bindEvents();
    const statePromise = reloadState().catch((e) => {
      toast(e.message, "error");
    });
    startSplashSequence(statePromise, false);
  }

  boot();
})();
