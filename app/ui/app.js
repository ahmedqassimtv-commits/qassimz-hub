/* QASSIMZ Hub v1.2.0 — Ported from Open-Source `storytold/craft-launcher` (MIT/Apache-2.0) + Kinetic قَاسِـمز Stages */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // App Brand Palette & English Editorial Copy (`catalog.rs` + `details.rs` style)
  const APP_META = {
    "qassimz-studio": {
      prefix: "Studio",
      suffix: "Craft",
      color: "#0EA5E9",
      inkLight: "#0369A1",
      inkDark: "#7DD3FC",
      taglineEn: "Video editing, keyframes & motion compositing",
      blurbEn: "Unified timeline editing, cubic-bezier keyframe motion curves, and GPU WebAssembly effects.",
    },
    "qassimz-producer": {
      prefix: "Producer",
      suffix: "Pro",
      color: "#EF4444",
      inkLight: "#B91C1C",
      inkDark: "#FCA5A5",
      taglineEn: "YouTube production planning & AI script studio",
      blurbEn: "End-to-end episode production workbench with shot lists, hooks, and timeline planning.",
    },
    "qassimz-music": {
      prefix: "Music",
      suffix: "Studio",
      color: "#F59E0B",
      inkLight: "#B45309",
      inkDark: "#FCD34D",
      taglineEn: "Stem separation, BPM waveforms & sound library",
      blurbEn: "Organize soundtracks, separate vocals & stems locally, and drag cues straight into your NLE.",
    },
    "qdm": {
      prefix: "QDM",
      suffix: "Turbo",
      color: "#3B82F6",
      inkLight: "#1D4ED8",
      inkDark: "#93C5FD",
      taglineEn: "Multi-stream media & 4K video downloader",
      blurbEn: "High-speed segmented download manager with built-in yt-dlp + FFmpeg remuxing.",
    },
    "qassimz-thumbs": {
      prefix: "Thumbs",
      suffix: "View",
      color: "#EC4899",
      inkLight: "#BE185D",
      inkDark: "#F9A8D4",
      taglineEn: "YouTube feed simulator & A/B CTR tester",
      blurbEn: "Preview thumbnails live inside dark/light home, search, and mobile feeds before publishing.",
    },
    "qassimz-organizer": {
      prefix: "Organize",
      suffix: "Pro",
      color: "#10B981",
      inkLight: "#047857",
      inkDark: "#6EE7B7",
      taglineEn: "Production folder templates & asset sorting",
      blurbEn: "One-click project folder structures and rule-based media sorting for editors.",
    },
    "qassimz-study": {
      prefix: "Study",
      suffix: "Flow",
      color: "#14B8A6",
      inkLight: "#0F766E",
      inkDark: "#5EEAD4",
      taglineEn: "Focused deep-work & visual study companion",
      blurbEn: "Distraction-free study sessions, structured notes, and spaced review decks.",
    },
    "qassimz-vox-fx": {
      prefix: "VOX",
      suffix: "FX",
      color: "#84CC16",
      inkLight: "#4D7C0F",
      inkDark: "#BEF264",
      taglineEn: "Documentary motion & highlighter toolkit for Adobe",
      blurbEn: "Vox-style kinetic highlights, map zooms, paper boil, and camera rigs inside Premiere & AE.",
    },
    "qassimz-captions": {
      prefix: "Captions",
      suffix: "AI",
      color: "#EAB308",
      inkLight: "#A16207",
      inkDark: "#FDE047",
      taglineEn: "Offline Whisper Arabic/English word-level captions",
      blurbEn: "Generate word-by-word animated captions directly on your Premiere Pro timeline.",
    },
    "qassimz-footage": {
      prefix: "Footage",
      suffix: "AI",
      color: "#06B6D4",
      inkLight: "#0E7490",
      inkDark: "#67E8F9",
      taglineEn: "Instant B-Roll & stock media search inside Premiere",
      blurbEn: "Search, preview, and import HD/4K stock footage directly into active bins.",
    },
    "qassimz-mogrt-hub": {
      prefix: "MOGRT",
      suffix: "Hub",
      color: "#E11D48",
      inkLight: "#BE123C",
      inkDark: "#FDA4AF",
      taglineEn: "Visual Motion Graphics Template browser & previewer",
      blurbEn: "Browse, hover-preview, favorite, and drop `.mogrt` templates onto your sequence.",
    },
    "qassimz-mogrt-maker": {
      prefix: "MOGRT",
      suffix: "Maker",
      color: "#F97316",
      inkLight: "#C2410C",
      inkDark: "#FDBA74",
      taglineEn: "Essential Graphics rig builder & exporter for AE",
      blurbEn: "Bind responsive properties, build clean controls, and export `.mogrt` packages fast.",
    },
    "qassimz-export": {
      prefix: "Smart",
      suffix: "Export",
      color: "#22C55E",
      inkLight: "#15803D",
      inkDark: "#86EFAC",
      taglineEn: "Social presets, loudness normalization & batch render",
      blurbEn: "One-click YouTube, Reels, TikTok, and ProRes mastering from Premiere & After Effects.",
    },
  };

  const UI = {
    view: "all", // all | desktop | adobe | hidden
    layout: localStorage.getItem("qhub_layout") || "grid", // grid | table
    sort: localStorage.getItem("qhub_sort") || "default",
    lang: localStorage.getItem("qhub_lang") || "en",
    themePref: localStorage.getItem("qhub_theme") || "light", // light | dark | system
    query: "",
    selectedId: null,
    settingsOpen: false,
    bellOpen: false,
    menuAppId: null,
    theaterTaskId: null,
    theaterMinimized: false,
    bannerDismissed: false,
    pinned: JSON.parse(localStorage.getItem("qhub_pinned") || "[]"),
    hiddenApps: new Set(JSON.parse(localStorage.getItem("qhub_hidden") || "[]")),
    state: null,
    pollTimer: null,
    searchTimer: null,
  };

  const I18N = {
    en: {
      suite: "QASSIMZ APP SUITE",
      apps: "APPS",
      desktop: "DESKTOP",
      adobe: "ADOBE CEP",
      hiddenBtn: (n) => `HIDDEN APPS ${n}`,
      updateAll: (n) => (n === 1 ? "UPDATE 1 APP" : `UPDATE ALL (${n})`),
      sort: "SORT",
      search: "Search apps",
      pinnedSec: "PINNED",
      notInstalledSec: "NOT INSTALLED",
      updAvail: "UPDATE AVAILABLE",
      installed: "INSTALLED",
      dlSize: (s) => `Download size: ${s}`,
      lastUpdated: (d) => `Last updated: ${d}`,
      openVer: (v) => `OPEN ${v}`,
      open: "OPEN",
      update: "UPDATE",
      install: "INSTALL",
      reinstall: "REINSTALL",
      cancel: "CANCEL",
      by: "BY QASSIMZ",
      checked: "CHECKED JUST NOW · USING QASSIMZ HUB AND GITHUB",
      checking: "CHECKING FOR UPDATES…",
      colApp: "APP",
      colStatus: "STATUS",
      colVersion: "VERSION",
      colReleased: "RELEASED",
      colAuthor: "AUTHOR",
      done: "DONE",
      quit: "QUIT QASSIMZ HUB",
      settings: "Settings",
      announcements: "ANNOUNCEMENTS & TRANSFERS",
      noAnnouncements: "All QASSIMZ apps and services are ready.",
    },
    ar: {
      suite: "منظومة تطبيقات قَاسِمز",
      apps: "التطبيقات",
      desktop: "سطح المكتب",
      adobe: "إضافات ADOBE",
      hiddenBtn: (n) => `المخفية ${n}`,
      updateAll: (n) => `تحديث الكل (${n})`,
      sort: "ترتيب",
      search: "ابحث عن برنامج أو إضافة…",
      pinnedSec: "المثبّتة في الأعلى",
      notInstalledSec: "غير مثبّتة بعد",
      updAvail: "تحديث متاح",
      installed: "مثبّت",
      dlSize: (s) => `حجم التنزيل: ${s}`,
      lastUpdated: (d) => `آخر تحديث: ${d}`,
      openVer: (v) => `تشغيل ${v}`,
      open: "تشغيل",
      update: "تحديث",
      install: "تثبيت",
      reinstall: "إعادة تثبيت",
      cancel: "إلغاء",
      by: "BY QASSIMZ",
      checked: "تم الفحص الآن · متصل بمستودع QASSIMZ الرسمي على GITHUB",
      checking: "جارٍ فحص التحديثات…",
      colApp: "البرنامج",
      colStatus: "الحالة",
      colVersion: "الإصدار",
      colReleased: "تاريخ النشر",
      colAuthor: "المطوّر",
      done: "تم",
      quit: "إغلاق QASSIMZ HUB",
      settings: "الإعدادات",
      announcements: "الإشعارات والتنزيلات",
      noAnnouncements: "جميع خدمات وتطبيقات قَاسِمز جاهزة للعمل.",
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

  function applyThemeAndLang() {
    const dark = isDarkActive();
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = UI.lang;
    document.documentElement.dir = UI.lang === "ar" ? "rtl" : "ltr";

    $("#btn-lang").textContent = UI.lang === "ar" ? "EN" : "AR";
    $("#suite-label").textContent = tr().suite;
    $("#lbl-sort").textContent = tr().sort;
    $("#q-search").placeholder = tr().search;
    $("#foot-status").textContent = tr().checked;
  }

  // Signature FLIP Spatial Transition: Center Stage -> Header Brand Slot!
  function runBrandIntro(replay = false) {
    const intro = $("#brand-intro");
    const wrap = $("#intro-logo-wrap");
    const target = $("#btn-replay-logo .hdr-logo-svg");
    if (!intro || !wrap) return;

    if (replay) {
      intro.hidden = false;
      intro.classList.remove("docking");
      wrap.style.transform = "";
      wrap.style.color = "#FFFFFF";
      // Restart SVG path animations cleanly
      const clone = wrap.innerHTML;
      wrap.innerHTML = clone;
    }

    let finished = false;
    const dockToHeader = () => {
      if (finished) return;
      finished = true;

      if (target) {
        const srcRect = wrap.getBoundingClientRect();
        const dstRect = target.getBoundingClientRect();
        if (srcRect.width > 0 && dstRect.width > 0) {
          const dx = dstRect.left + dstRect.width / 2 - (srcRect.left + srcRect.width / 2);
          const dy = dstRect.top + dstRect.height / 2 - (srcRect.top + srcRect.height / 2);
          const scale = dstRect.width / srcRect.width;
          wrap.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
          wrap.style.color = isDarkActive() ? "#FFFFFF" : "#101014";
        }
      }
      intro.classList.add("docking");
      setTimeout(() => {
        intro.hidden = true;
        wrap.style.transform = "";
        triggerHeaderLogoWave();
      }, 540);
    };

    intro.onclick = dockToHeader;
    setTimeout(dockToHeader, 1450);
  }

  function triggerHeaderLogoWave() {
    const btn = $("#btn-replay-logo");
    if (!btn) return;
    btn.classList.remove("wave");
    void btn.offsetWidth;
    btn.classList.add("wave");
    setTimeout(() => btn.classList.remove("wave"), 650);
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

  // Exact ArtCraft Bottom-Right Dark Toast (`/home/antigravity/image.png`)
  function toast(msg, kind = "info") {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = `craft-toast ${kind === "error" ? "error" : ""}`;
    el.innerHTML = `
      <div class="ct-top">
        <span class="ct-brand"><span class="ct-dot"></span>QASSIMZ Hub</span>
        <button style="color:rgba(242,241,238,0.65);font-size:12px;" aria-label="Dismiss">✕</button>
      </div>
      <div class="ct-body"></div>
    `;
    $(".ct-body", el).textContent = msg;
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

  // `widgets.rs::human_bytes`
  function humanBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return "GitHub Direct";
    const mb = 1024 * 1024;
    if (n >= 1024 * mb) return `${(n / (1024 * mb)).toFixed(1)} GB`;
    if (n >= mb) return `${Math.round(n / mb)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  function fmtDate(iso) {
    if (!iso) return "Nov 26, 2026";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(UI.lang === "ar" ? "ar-EG" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (_) {
      return "Nov 26, 2026";
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
    } else {
      UI.hiddenApps.add(id);
      if (UI.hiddenApps.size === 0 && UI.view === "hidden") UI.view = "all";
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
    const m = APP_META[it.id] || {
      prefix: it.name,
      suffix: "",
      color: it.accent || "#2D81FF",
      inkLight: it.accent || "#1659C4",
      inkDark: it.accent || "#74AAFF",
      taglineEn: (it.hosts || []).join(" · "),
      blurbEn: it.tagline_ar || "",
    };
    const appInk = isDarkActive() ? m.inkDark : m.inkLight;
    return { ...m, appInk };
  }

  function visibleItems() {
    const items = UI.state?.items || [];
    const q = UI.query.trim().toLowerCase();

    const filtered = items.filter((it) => {
      if (UI.view === "hidden") return UI.hiddenApps.has(it.id);
      if (UI.hiddenApps.has(it.id)) return false;
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

  // `widgets.rs::Glyph::Pin` / `PinFilled` (Bookmark ribbon with V-notch)
  function pinSvg(pinned) {
    if (pinned) {
      return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.8 1.5h8.4v9.5L8 14.5 3.8 11z"/></svg>`;
    }
    return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"><path d="M3.8 1.5h8.4v9.5L8 14.5 3.8 11z"/></svg>`;
  }

  function updateChrome() {
    const st = UI.state;
    if (!st) return;

    applyThemeAndLang();

    $("#nav-all").innerHTML = `${esc(tr().apps)} <span class="cell-cnt">${st.counts.total}</span>`;
    $("#nav-desktop").innerHTML = `${esc(tr().desktop)} <span class="cell-cnt">${st.counts.desktop}</span>`;
    $("#nav-adobe").innerHTML = `${esc(tr().adobe)} <span class="cell-cnt">${st.counts.adobe}</span>`;

    $$("#main-nav .craft-cell").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === UI.view);
    });

    const hidBtn = $("#btn-hidden-toggle");
    if (UI.hiddenApps.size > 0) {
      hidBtn.hidden = false;
      hidBtn.textContent = tr().hiddenBtn(UI.hiddenApps.size);
      hidBtn.className = `craft-btn ${UI.view === "hidden" ? "primary" : "secondary"}`;
    } else {
      hidBtn.hidden = true;
    }

    $$(".view-cell").forEach((b) => {
      b.classList.toggle("active", b.dataset.layout === UI.layout);
    });
    $("#sort-wrap").hidden = UI.layout === "table";
    $("#q-sort").value = UI.sort;

    // Bell badge (`bell.rs::count_badge`)
    const live = activeTasks();
    const attention = st.counts.updates + live.length + (st.hub_has_update ? 1 : 0);
    const bellBadge = $("#bell-badge");
    if (attention > 0) {
      bellBadge.hidden = false;
      bellBadge.textContent = attention > 9 ? "9+" : String(attention);
    } else {
      bellBadge.hidden = true;
    }

    // Launcher Self-Update Banner (`views.rs::launcher_update_banner`)
    const banner = $("#hub-update-banner");
    if (st.hub_has_update && !UI.bannerDismissed) {
      banner.hidden = false;
      $("#ub-text").textContent =
        UI.lang === "ar"
          ? `يتوفّر الإصدار الجديد QASSIMZ Hub ${st.hub_remote_version} للتحديث المباشر.`
          : `QASSIMZ Hub ${st.hub_remote_version} is available.`;
    } else {
      banner.hidden = true;
    }

    // Update All button (`views.rs::update_all_button`)
    const updAllBtn = $("#btn-update-all");
    if (st.counts.updates > 0) {
      updAllBtn.hidden = false;
      $("#lbl-update-all").textContent = tr().updateAll(st.counts.updates);
    } else {
      updAllBtn.hidden = true;
    }

    // CEP readiness in footer
    const ad = st.adobe || {};
    $("#cep-dot").classList.toggle("warn", !ad.cep_debug_ready);
    $("#lbl-cep").textContent = ad.cep_debug_ready ? "ADOBE CEP READY" : "ENABLE ADOBE CEP";

    updateInstallTheater(live);
    if (UI.bellOpen) renderBellPopup();
  }

  // Dark Architectural قَاسِـمز Installation Stage (`#install-theater`)
  function updateInstallTheater(live) {
    const theater = $("#install-theater");
    const strip = $("#transfer-strip");

    if (!live.length) {
      theater.hidden = true;
      strip.hidden = true;
      UI.theaterMinimized = false;
      return;
    }

    const cur = live.find((x) => x.id === UI.theaterTaskId) || live[0];
    UI.theaterTaskId = cur.id;

    const speedTxt = cur.speed_bps > 0 ? `${humanBytes(cur.speed_bps)}/s` : "";
    const sizeTxt = cur.total > 0 ? `${humanBytes(cur.downloaded)} of ${humanBytes(cur.total)}` : "";
    const tele = [sizeTxt, speedTxt].filter(Boolean).join(" · ") || cur.message_ar;
    const solidAccent = cur.accent || "#2D81FF";

    if (UI.theaterMinimized) {
      theater.hidden = true;
      strip.hidden = false;
      $("#strip-title").textContent = `${cur.name} · ${cur.progress}%`;
      $("#strip-fill").style.width = `${cur.progress}%`;
      $("#strip-meta").textContent = tele;
    } else {
      strip.hidden = true;
      theater.hidden = false;
      $("#th-glow").style.setProperty("--th-accent", `${solidAccent}48`);
      $("#th-top-rule").style.setProperty("--th-solid", solidAccent);
      $("#th-app-icon").src = cur.id === "qassimz-hub" ? "./logo.svg" : `./icons/${cur.id}.svg`;
      $("#th-app-name").textContent = cur.name;
      $("#th-app-ver").textContent = `v${cur.version}`;
      $("#th-status-msg").textContent = cur.message_ar;
      $("#th-pct").textContent = `${cur.progress}%`;
      $("#th-fill").style.width = `${cur.progress}%`;
      $("#th-telemetry").textContent = tele;

      const isInst = cur.status === "installing";
      const isVerify = !isInst && cur.progress >= 98;
      $("#th-step-dl").classList.toggle("active", !isInst && !isVerify);
      $("#th-step-verify").classList.toggle("active", isVerify);
      $("#th-step-inst").classList.toggle("active", isInst);

      $("#th-phase-badge").textContent = isInst
        ? "INSTALLING VIA QASSIMZ HUB · جارٍ التثبيت"
        : "DOWNLOADING VIA QASSIMZ HUB · جارٍ التنزيل";

      $("#btn-th-cancel").hidden = !["queued", "downloading"].includes(cur.status);
      $("#btn-th-cancel").onclick = async () => {
        await api("cancel_task", { id: cur.id });
        await reloadState();
      };
    }
  }

  // `views.rs::card` & `card_parts.rs`
  function cardHTML(it, tmap, updatedStr) {
    const st = it.state || {};
    const m = appMeta(it);
    const task = tmap.get(it.id);
    const isBusy = task && ["queued", "downloading", "installing"].includes(task.status);
    const pinned = isPinned(it.id);
    const installed = Boolean(st.installed);

    // `card_parts.rs::strip_version`: "0.5.0 → 0.6.0" with only new version lit in `--app-ink`
    const verHTML = st.has_update
      ? `<span class="strip-ver">${esc(st.installed_version)} → <span class="ver-lit">${esc(it.version)}</span></span>`
      : `<span class="strip-ver"><span class="ver-lit">v${esc(st.installed_version || it.version)}</span></span>`;

    // `views.rs` line 668: Installed & up-to-date needs no cluttering badge; UpdateAvailable gets Warn badge
    let badgeRow = "";
    if (isBusy) {
      const lbl = task.status === "installing" ? "INSTALLING…" : `DOWNLOADING ${task.progress}%`;
      badgeRow = `<div class="card-badge-row"><span class="craft-badge tone-info">${esc(lbl)}</span></div>`;
    } else if (st.has_update) {
      badgeRow = `<div class="card-badge-row"><span class="craft-badge tone-warn">${esc(tr().updAvail)}</span></div>`;
    }

    const tagline = UI.lang === "ar" ? it.name_ar : m.taglineEn;
    const blurb = UI.lang === "ar" ? it.tagline_ar : m.blurbEn;
    const repoUrl = `https://github.com/${it.repo || "ahmedqassimtv-commits/qassimz-hub"}`;

    let actionsHTML = "";
    if (isBusy) {
      const speed = task.speed_bps > 0 ? ` · ${humanBytes(task.speed_bps)}/s` : "";
      const cap =
        task.status === "installing"
          ? UI.lang === "ar" ? "جارٍ التثبيت…" : "Installing…"
          : `${UI.lang === "ar" ? "جارٍ التنزيل" : "Downloading"} ${task.progress}%${speed}`;
      const canCancel = ["queued", "downloading"].includes(task.status);
      actionsHTML = `
        <div class="craft-progress-row" data-prog-card="${esc(it.id)}">
          <div class="craft-progress">
            <span class="cp-caption">${esc(cap)}</span>
            <div class="cp-track"><div class="cp-fill" style="width:${task.progress}%"></div></div>
          </div>
          ${
            canCancel
              ? `<button class="glyph-btn" data-act="cancel" data-id="${esc(it.id)}" title="${esc(tr().cancel)}">
                   <svg viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.5"><line x1="2.5" y1="2.5" x2="11.5" y2="11.5"/><line x1="11.5" y1="2.5" x2="2.5" y2="11.5"/></svg>
                 </button>`
              : ""
          }
        </div>
      `;
    } else {
      let mainControl = "";
      if (st.has_update) {
        // `widgets.rs::split_button`: Secondary `OPEN X.Y.Z` + 1px seam + Primary `UPDATE`
        mainControl = `
          <div class="split-btn">
            <button class="craft-btn secondary" data-act="launch" data-id="${esc(it.id)}">${esc(tr().openVer(st.installed_version || it.version))}</button>
            <button class="craft-btn primary" data-act="install" data-id="${esc(it.id)}">${esc(tr().update)}</button>
          </div>
        `;
      } else if (installed) {
        // `views.rs::primary_button`: `Primary::Open` uses `Kind::Secondary`
        mainControl = `<button class="craft-btn secondary main-full" data-act="launch" data-id="${esc(it.id)}">${esc(tr().openVer(st.installed_version || it.version))}</button>`;
      } else {
        mainControl = `<button class="craft-btn primary main-full" data-act="install" data-id="${esc(it.id)}">${esc(tr().install)}</button>`;
      }

      actionsHTML = `
        ${mainControl}
        <button class="glyph-btn ${pinned ? "pinned" : ""}" data-act="pin" data-id="${esc(it.id)}" title="${pinned ? "Unpin" : "Pin to top"}">
          ${pinSvg(pinned)}
        </button>
        <button class="glyph-btn" data-act="menu" data-id="${esc(it.id)}" title="More actions">⋯</button>
      `;
    }

    return `
      <article class="craft-card ${installed ? "installed" : "uninstalled"}"
               style="--app-color:${esc(m.color)};--app-ink:${esc(m.appInk)};"
               tabindex="0"
               data-card-id="${esc(it.id)}">
        <div class="card-strip">
          ${verHTML}
          <button class="hud-link" data-act="github" data-url="${esc(repoUrl)}">GITHUB ↗</button>
        </div>
        <div class="card-inner">
          <div class="card-hero-row">
            <img class="card-icon" src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)} icon" decoding="async" />
            <div class="card-titles">
              <div class="card-wordmark-row">
                <span class="craft-wordmark">${esc(m.prefix)}<span class="wm-accent">${esc(m.suffix)}</span></span>
                <span class="craft-badge tone-info">${esc(tr().by)}</span>
              </div>
              <div class="card-tagline">${esc(tagline)}</div>
            </div>
          </div>

          ${badgeRow}

          <div class="card-facts">
            ${!installed || st.has_update ? `<div class="card-size">${esc(tr().dlSize(humanBytes(it.setup_size)))}</div>` : ""}
            <p class="card-blurb">${esc(blurb)}</p>
            <div class="card-updated">${esc(tr().lastUpdated(updatedStr))}</div>
          </div>

          <div class="card-actions">${actionsHTML}</div>
        </div>
      </article>
    `;
  }

  // `views.rs::grid`
  function renderGridView(list, tmap, updatedStr) {
    const ws = $("#workspace");
    if (!list.length) {
      ws.innerHTML = `<div class="empty-box">${UI.lang === "ar" ? "لا توجد تطبيقات مطابقة للبحث." : "No matching applications found."}</div>`;
      return;
    }

    // Group exactly like `views.rs::grid`: Pinned -> Installed -> "NOT INSTALLED"
    if (UI.view !== "hidden" && !UI.query.trim() && UI.sort === "default") {
      const pinnedList = list.filter((x) => isPinned(x.id));
      const rest = list.filter((x) => !isPinned(x.id));
      const installedList = rest.filter((x) => x.state?.installed);
      const uninstalledList = rest.filter((x) => !x.state?.installed);

      let html = "";
      if (pinnedList.length) {
        html += `
          <section class="craft-section">
            <div class="hud-label faint section-heading">${esc(tr().pinnedSec)}</div>
            <div class="craft-grid">${pinnedList.map((it) => cardHTML(it, tmap, updatedStr)).join("")}</div>
          </section>
        `;
      }
      if (installedList.length) {
        html += `
          <section class="craft-section">
            <div class="craft-grid">${installedList.map((it) => cardHTML(it, tmap, updatedStr)).join("")}</div>
          </section>
        `;
      }
      if (uninstalledList.length) {
        html += `
          <section class="craft-section">
            ${installedList.length || pinnedList.length ? `<div class="hud-label faint section-heading">${esc(tr().notInstalledSec)}</div>` : ""}
            <div class="craft-grid">${uninstalledList.map((it) => cardHTML(it, tmap, updatedStr)).join("")}</div>
          </section>
        `;
      }
      ws.innerHTML = html;
    } else {
      ws.innerHTML = `
        <section class="craft-section">
          <div class="craft-grid">${list.map((it) => cardHTML(it, tmap, updatedStr)).join("")}</div>
        </section>
      `;
    }
  }

  // `views.rs::table` (6-Column Sortable Hairline Table)
  function renderTableView(list, tmap, updatedStr) {
    const ws = $("#workspace");
    if (!list.length) {
      ws.innerHTML = `<div class="empty-box">${UI.lang === "ar" ? "لا توجد تطبيقات مطابقة للبحث." : "No matching applications found."}</div>`;
      return;
    }

    const nameArrow = UI.sort === "name-asc" ? " ▲" : UI.sort === "name-desc" ? " ▼" : "";
    const statusArrow = UI.sort === "status" ? " ▼" : "";

    const rowsHTML = list
      .map((it) => {
        const st = it.state || {};
        const m = appMeta(it);
        const task = tmap.get(it.id);
        const isBusy = task && ["queued", "downloading", "installing"].includes(task.status);
        const pinned = isPinned(it.id);

        let statusBadge = `<span class="craft-badge tone-neutral">${UI.lang === "ar" ? "متاح" : "AVAILABLE"}</span>`;
        if (isBusy) statusBadge = `<span class="craft-badge tone-info">${task.progress}%</span>`;
        else if (st.has_update) statusBadge = `<span class="craft-badge tone-warn">${esc(tr().updAvail)}</span>`;
        else if (st.installed) statusBadge = `<span class="craft-badge tone-good">${esc(tr().installed)}</span>`;

        const verCell = st.has_update
          ? `<span class="tbl-ver">${esc(st.installed_version)} → <span style="color:${esc(m.appInk)}">${esc(it.version)}</span></span>`
          : `<span class="tbl-ver" style="color:${st.installed ? "var(--ink)" : "var(--faint)"}">v${esc(st.installed_version || it.version)}</span>`;

        const mainBtn = st.has_update
          ? `<button class="craft-btn primary" data-act="install" data-id="${esc(it.id)}">${esc(tr().update)}</button>`
          : st.installed
          ? `<button class="craft-btn secondary" data-act="launch" data-id="${esc(it.id)}">${esc(tr().open)}</button>`
          : `<button class="craft-btn primary" data-act="install" data-id="${esc(it.id)}">${esc(tr().install)}</button>`;

        return `
          <tr data-card-id="${esc(it.id)}" style="--app-ink:${esc(m.appInk)};">
            <td>
              <div class="tbl-app-cell">
                <img class="tbl-icon" src="./icons/${esc(it.id)}.svg" alt="" style="${st.installed ? "" : "filter:grayscale(0.85) opacity(0.85);"}" />
                <div>
                  <div class="craft-wordmark" style="font-size:16.5px;">${esc(m.prefix)}<span class="wm-accent" style="color:${st.installed ? esc(m.appInk) : "var(--muted)"}">${esc(m.suffix)}</span></div>
                  <div style="font-size:12px;color:var(--muted);">${esc(UI.lang === "ar" ? it.name_ar : m.taglineEn)}</div>
                </div>
              </div>
            </td>
            <td>${statusBadge}</td>
            <td>${verCell}</td>
            <td style="font-size:12.5px;color:var(--muted);">${esc(updatedStr)}</td>
            <td style="font-size:12.5px;color:var(--muted);">QASSIMZ</td>
            <td style="width:230px;">
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
                ${mainBtn}
                <button class="glyph-btn ${pinned ? "pinned" : ""}" data-act="pin" data-id="${esc(it.id)}">${pinSvg(pinned)}</button>
                <button class="glyph-btn" data-act="menu" data-id="${esc(it.id)}">⋯</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    ws.innerHTML = `
      <div class="craft-table-frame">
        <table class="craft-table">
          <thead>
            <tr>
              <th class="sortable ${UI.sort.startsWith("name") ? "active-sort" : ""}" data-tbl-sort="name">${esc(tr().colApp)}${nameArrow}</th>
              <th class="sortable ${UI.sort === "status" ? "active-sort" : ""}" data-tbl-sort="status">${esc(tr().colStatus)}${statusArrow}</th>
              <th>${esc(tr().colVersion)}</th>
              <th>${esc(tr().colReleased)}</th>
              <th>${esc(tr().colAuthor)}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    `;

    $$("[data-tbl-sort]", ws).forEach((th) => {
      th.onclick = () => {
        const k = th.dataset.tblSort;
        if (k === "name") UI.sort = UI.sort === "name-asc" ? "name-desc" : "name-asc";
        else UI.sort = "status";
        localStorage.setItem("qhub_sort", UI.sort);
        render();
      };
    });
  }

  // Centered App Details Sheet (`details.rs::details_drawer` + `sheet.rs`)
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

    backdrop.hidden = false;
    const st = it.state || {};
    const m = appMeta(it);
    const navPool = items.length ? items : allItems;
    const idx = navPool.findIndex((x) => x.id === it.id);
    const prevId = navPool.length > 1 ? navPool[(idx - 1 + navPool.length) % navPool.length].id : null;
    const nextId = navPool.length > 1 ? navPool[(idx + 1) % navPool.length].id : null;

    const repoUrl = `https://github.com/${it.repo || "ahmedqassimtv-commits/qassimz-hub"}`;
    const releasesUrl = `${repoUrl}/releases`;
    const updatedStr = fmtDate(UI.state.updated_at);

    const primaryBtn = st.has_update
      ? `<button class="craft-btn primary" id="dt-install">UPDATE TO v${esc(it.version)}</button>
         <button class="craft-btn secondary" id="dt-launch">${esc(tr().openVer(st.installed_version || it.version))}</button>`
      : st.installed
      ? `<button class="craft-btn primary" id="dt-launch">${esc(tr().openVer(st.installed_version || it.version))}</button>
         <button class="craft-btn secondary" id="dt-reinstall">${esc(tr().reinstall)}</button>`
      : `<button class="craft-btn primary" id="dt-install">${esc(tr().install)} v${esc(it.version)}</button>
         <button class="craft-btn secondary" id="dt-wizard">INTERACTIVE INSTALLER</button>`;

    sheet.style.setProperty("--sheet-accent", m.color);
    sheet.innerHTML = `
      <div class="sheet-hero">
        <div class="sh-left">
          <img class="sh-app-icon" src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)}" />
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h2 class="sh-title" id="drawer-title">${esc(m.prefix)}<span style="color:${esc(m.appInk)}">${esc(m.suffix)}</span></h2>
              <span class="craft-badge tone-info">${esc(tr().by)}</span>
            </div>
            <p class="sh-sub">${esc(it.name)} · ${esc(it.name_ar)}</p>
            <div style="display:flex;align-items:center;gap:14px;margin-top:8px;">
              <button class="hud-link" data-ext-url="${esc(repoUrl)}">GITHUB ↗</button>
              <button class="hud-link" data-ext-url="${esc(releasesUrl)}">RELEASES ↗</button>
              ${it.portable_url ? `<button class="hud-link" data-ext-url="${esc(it.portable_url)}">PORTABLE ZIP ↗</button>` : ""}
            </div>
          </div>
        </div>
        <div class="sh-right">
          ${prevId ? `<button class="glyph-btn" id="dt-prev" title="Previous app (←)">←</button>` : ""}
          ${nextId ? `<button class="glyph-btn" id="dt-next" title="Next app (→)">→</button>` : ""}
          <button class="glyph-btn" id="dt-close" title="Close (Esc)">✕</button>
        </div>
      </div>

      <div class="sheet-body">
        <div class="sheet-cols">
          <div>
            <div class="eyebrow"><span>01 /</span> OVERVIEW</div>
            <p style="font-size:14.5px;line-height:1.65;color:var(--ink);margin-bottom:12px;">${esc(m.blurbEn)}</p>
            <p style="font-size:14px;line-height:1.7;color:var(--muted);" dir="rtl">${esc(it.description_ar || it.tagline_ar)}</p>

            ${
              it.release_notes_ar
                ? `<div style="margin-top:20px;">
                     <div class="eyebrow"><span>02 /</span> WHAT'S NEW IN v${esc(it.version)}</div>
                     <div class="hairline-box" dir="rtl"><p style="color:var(--ink);">${esc(it.release_notes_ar)}</p></div>
                   </div>`
                : ""
            }
          </div>

          <div>
            <div class="eyebrow"><span>03 /</span> KEY FEATURES</div>
            ${(it.features_ar || [])
              .map(
                (f) => `
              <div class="hairline-box" dir="rtl">
                <h4>✓ ${esc(f)}</h4>
              </div>
            `
              )
              .join("")}
          </div>
        </div>

        <div style="margin-top:22px;">
          <div class="eyebrow"><span>04 /</span> RELEASE FACTS</div>
          <div class="facts-row-4">
            <div class="fact-cell"><span>LATEST VERSION</span><strong>v${esc(it.version)}</strong></div>
            <div class="fact-cell"><span>INSTALLED</span><strong>${st.installed ? `v${esc(st.installed_version || it.version)}` : "Not installed"}</strong></div>
            <div class="fact-cell"><span>DOWNLOAD SIZE</span><strong>${esc(humanBytes(it.setup_size))}</strong></div>
            <div class="fact-cell"><span>RELEASED</span><strong>${esc(updatedStr)}</strong></div>
          </div>
        </div>
      </div>

      <div class="sheet-foot">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${primaryBtn}
          ${st.install_dir ? `<button class="craft-btn secondary" id="dt-folder">OPEN FOLDER</button>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${st.installed && st.uninstall_cmd ? `<button class="craft-btn danger" id="dt-uninstall">UNINSTALL</button>` : ""}
          <button class="craft-btn secondary" id="dt-done">${esc(tr().done)}</button>
        </div>
      </div>
    `;

    const on = (sel, fn) => {
      const el = $(sel, sheet);
      if (el) el.onclick = fn;
    };
    on("#dt-close", () => { UI.selectedId = null; renderDetailsSheet(); });
    on("#dt-done", () => { UI.selectedId = null; renderDetailsSheet(); });
    on("#dt-prev", () => { UI.selectedId = prevId; renderDetailsSheet(); });
    on("#dt-next", () => { UI.selectedId = nextId; renderDetailsSheet(); });
    on("#dt-install", () => { UI.selectedId = null; renderDetailsSheet(); triggerInstall(it.id, true); });
    on("#dt-wizard", () => { UI.selectedId = null; renderDetailsSheet(); triggerInstall(it.id, false); });
    on("#dt-reinstall", () => { UI.selectedId = null; renderDetailsSheet(); triggerInstall(it.id, false); });
    on("#dt-launch", () => triggerLaunch(it.id));
    on("#dt-folder", () => api("open_folder", { path: st.install_dir }));
    on("#dt-uninstall", async () => {
      try {
        await api("uninstall", { id: it.id });
        toast(`Started uninstaller for ${it.name}`);
        UI.selectedId = null;
        renderDetailsSheet();
      } catch (e) {
        toast(e.message, "error");
      }
    });
    $$("[data-ext-url]", sheet).forEach((b) => {
      b.onclick = () => api("open_url", { url: b.dataset.extUrl });
    });
  }

  // Centered 2-Column Settings Sheet (`settings_dialog.rs` + `sheet.rs`)
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
    const cacheSize = st.cache_size_bytes > 0 ? humanBytes(st.cache_size_bytes) : "0 KB";

    sheet.innerHTML = `
      <div class="sheet-hero" style="--sheet-accent:var(--accent);">
        <div class="sh-left">
          <img class="sh-settings-icon" src="./logo.svg" alt="QASSIMZ Hub" />
          <div>
            <h2 class="sh-title" id="settings-title">${esc(tr().settings)}</h2>
            <div class="hud-label faint" style="margin-top:4px;">QASSIMZ HUB v${esc(st.hub_version || "1.2.0")}</div>
          </div>
        </div>
        <button class="glyph-btn" id="st-close" title="Close (Esc)">✕</button>
      </div>

      <div class="sheet-body">
        <div class="settings-cols">
          <div>
            <div class="hairline-box">
              <div class="hud-label faint" style="margin-bottom:10px;">APPEARANCE &amp; LANGUAGE</div>
              <div class="set-row">
                <div class="set-row-info">
                  <strong>Appearance Theme</strong>
                  <span>ArtCraft Paper Light or Studio Dark</span>
                </div>
                <div class="craft-cells">
                  <button class="craft-cell ${UI.themePref === "light" ? "active" : ""}" data-theme-pick="light">LIGHT</button>
                  <button class="craft-cell ${UI.themePref === "dark" ? "active" : ""}" data-theme-pick="dark">DARK</button>
                  <button class="craft-cell ${UI.themePref === "system" ? "active" : ""}" data-theme-pick="system">SYSTEM</button>
                </div>
              </div>
              <div class="set-row">
                <div class="set-row-info">
                  <strong>Interface Language · لغة الواجهة</strong>
                  <span>Switch instantly between English and Arabic</span>
                </div>
                <div class="craft-cells">
                  <button class="craft-cell ${UI.lang === "en" ? "active" : ""}" data-lang-pick="en">ENGLISH</button>
                  <button class="craft-cell ${UI.lang === "ar" ? "active" : ""}" data-lang-pick="ar">العربية</button>
                </div>
              </div>
            </div>

            <div class="hairline-box">
              <div class="hud-label faint" style="margin-bottom:10px;">AUTOMATIC UPDATES · التحديث التلقائي</div>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>Check for Updates Automatically</strong>
                  <span>Sync releases on startup and every 4 hours</span>
                </div>
                <input type="checkbox" class="craft-check" data-setting="auto_check_updates" ${cfg.auto_check_updates ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>Auto-Update Installed Apps</strong>
                  <span>Download and install app updates automatically</span>
                </div>
                <input type="checkbox" class="craft-check" data-setting="auto_update_apps" ${cfg.auto_update_apps !== false ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>Auto-Update QASSIMZ Hub</strong>
                  <span>Keep the launcher itself updated automatically</span>
                </div>
                <input type="checkbox" class="craft-check" data-setting="auto_update_hub" ${cfg.auto_update_hub ? "checked" : ""} />
              </label>
            </div>
          </div>

          <div>
            <div class="hairline-box">
              <div class="hud-label faint" style="margin-bottom:10px;">INSTALLATION &amp; WINDOWS</div>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>One-Click Silent Install</strong>
                  <span>Install apps directly with animated QASSIMZ stage</span>
                </div>
                <input type="checkbox" class="craft-check" data-setting="silent_install" ${cfg.silent_install ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>Keep Running in System Tray</strong>
                  <span>Minimize to tray when closing the window</span>
                </div>
                <input type="checkbox" class="craft-check" data-setting="minimize_to_tray" ${cfg.minimize_to_tray ? "checked" : ""} />
              </label>
              <label class="set-row">
                <div class="set-row-info">
                  <strong>Launch at Windows Sign-In</strong>
                  <span>Start QASSIMZ Hub in background at login</span>
                </div>
                <input type="checkbox" class="craft-check" data-setting="start_with_windows" ${cfg.start_with_windows ? "checked" : ""} />
              </label>
            </div>

            <div class="hairline-box">
              <div class="hud-label faint" style="margin-bottom:10px;">MAINTENANCE &amp; ADOBE CEP</div>
              <p style="font-size:12.5px;color:var(--muted);margin-bottom:12px;">
                Cached downloads: <strong>${esc(cacheSize)}</strong> · Premiere: <strong>${st.adobe?.premiere_installed ? "Detected" : "—"}</strong> · After Effects: <strong>${st.adobe?.aftereffects_installed ? "Detected" : "—"}</strong>
              </p>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                <button class="craft-btn primary" id="st-self-update">CHECK HUB UPDATE</button>
                <button class="craft-btn secondary" id="st-fix-cep">ENABLE ADOBE CEP</button>
                <button class="craft-btn secondary" id="st-open-cache">CACHE FOLDER</button>
                <button class="craft-btn danger" id="st-clear-cache">CLEAR CACHE</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="sheet-foot">
        <button class="craft-btn secondary" id="st-quit">${esc(tr().quit)}</button>
        <button class="craft-btn primary" id="st-done">${esc(tr().done)}</button>
      </div>
    `;

    const close = () => {
      UI.settingsOpen = false;
      renderSettingsSheet();
    };
    $("#st-close", sheet).onclick = close;
    $("#st-done", sheet).onclick = close;
    $("#st-quit", sheet).onclick = () => api("win_close");

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
          const updated = await api("save_settings", { [chk.dataset.setting]: chk.checked });
          UI.state.settings = updated;
          toast("Settings saved · تم حفظ الإعدادات");
        } catch (e) {
          toast(e.message, "error");
        }
      };
    });

    $("#st-self-update", sheet).onclick = () => { close(); triggerHubSelfUpdate(); };
    $("#st-open-cache", sheet).onclick = () => api("open_cache_dir");
    $("#st-clear-cache", sheet).onclick = async () => {
      UI.state = await api("clear_cache");
      render();
      renderSettingsSheet();
      toast("Cleared installer cache");
    };
    $("#st-fix-cep", sheet).onclick = async () => {
      await api("fix_cep");
      await reloadState();
      renderSettingsSheet();
      toast("Enabled Adobe CEP PlayerDebugMode (CSXS 9–16)");
    };
  }

  // Bell Popup (`bell.rs`)
  function renderBellPopup() {
    const pop = $("#bell-popup");
    if (!UI.bellOpen || !UI.state) {
      pop.hidden = true;
      return;
    }
    pop.hidden = false;
    const tasks = UI.state.tasks || [];
    const updates = (UI.state.items || []).filter((x) => x.state?.has_update);

    let rows = "";
    for (const tk of tasks) {
      rows += `
        <div style="padding:10px 0;border-bottom:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;color:var(--ink-strong);">
            <span>${esc(tk.name)} v${esc(tk.version)}</span>
            <span style="font-family:var(--font-mono);">${tk.progress}%</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(tk.message_ar)}</div>
        </div>
      `;
    }
    for (const up of updates) {
      rows += `
        <div style="padding:10px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <strong style="font-size:13px;color:var(--ink-strong);">${esc(up.name)} ${esc(up.version)}</strong>
            <div style="font-size:11.5px;color:var(--muted);">Update available (${esc(humanBytes(up.setup_size))})</div>
          </div>
          <button class="craft-btn primary" style="height:28px;padding:0 10px;" data-bell-upd="${esc(up.id)}">UPDATE</button>
        </div>
      `;
    }

    pop.innerHTML = `
      <div class="hud-label" style="margin-bottom:8px;">${esc(tr().announcements)}</div>
      ${rows || `<p style="font-size:13px;color:var(--muted);padding:8px 0;">${esc(tr().noAnnouncements)}</p>`}
    `;

    $$("[data-bell-upd]", pop).forEach((b) => {
      b.onclick = () => {
        UI.bellOpen = false;
        pop.hidden = true;
        triggerInstall(b.dataset.bellUpd, true);
      };
    });
  }

  // Context `⋯` Menu (`widgets.rs::more_menu`)
  function openCardMenu(appId, anchorEl) {
    const menu = $("#card-more-menu");
    const it = (UI.state?.items || []).find((x) => x.id === appId);
    if (!it) return;
    const st = it.state || {};
    const repoUrl = `https://github.com/${it.repo || "ahmedqassimtv-commits/qassimz-hub"}`;
    const hidden = UI.hiddenApps.has(it.id);

    menu.innerHTML = `
      <button class="menu-item" data-m="details"><span>App Details &amp; Notes</span><span>↵</span></button>
      ${st.installed ? `<button class="menu-item" data-m="launch"><span>Open ${esc(it.name)}</span></button>` : ""}
      <button class="menu-item" data-m="wizard"><span>${st.installed ? "Reinstall / Wizard" : "Install with Wizard"}</span></button>
      ${st.install_dir ? `<button class="menu-item" data-m="folder"><span>Open Install Folder</span></button>` : ""}
      <div class="menu-sep"></div>
      <button class="menu-item" data-m="github"><span>GitHub Repository</span><span>↗</span></button>
      <button class="menu-item" data-m="releases"><span>Release Page</span><span>↗</span></button>
      ${it.portable_url ? `<button class="menu-item" data-m="portable"><span>Download Portable ZIP</span><span>↗</span></button>` : ""}
      <div class="menu-sep"></div>
      <button class="menu-item" data-m="hide"><span>${hidden ? "Unhide App" : "Hide App"}</span></button>
      ${st.installed && st.uninstall_cmd ? `<button class="menu-item danger" data-m="uninstall"><span>Uninstall</span></button>` : ""}
    `;

    menu.hidden = false;
    const r = anchorEl.getBoundingClientRect();
    const mw = 216;
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
      else if (act === "launch") triggerLaunch(it.id);
      else if (act === "wizard") triggerInstall(it.id, false);
      else if (act === "folder") api("open_folder", { path: st.install_dir });
      else if (act === "github") api("open_url", { url: repoUrl });
      else if (act === "releases") api("open_url", { url: `${repoUrl}/releases` });
      else if (act === "portable") api("open_url", { url: it.portable_url });
      else if (act === "hide") toggleHide(it.id);
      else if (act === "uninstall") {
        try { await api("uninstall", { id: it.id }); toast(`Started uninstaller for ${it.name}`); }
        catch (e) { toast(e.message, "error"); }
      }
    };
  }

  function render() {
    if (!UI.state) return;
    updateChrome();
    const list = visibleItems();
    const tmap = taskMap();
    const updatedStr = fmtDate(UI.state.updated_at);
    if (UI.layout === "table") renderTableView(list, tmap, updatedStr);
    else renderGridView(list, tmap, updatedStr);
    renderDetailsSheet();
    manageTaskPolling();
  }

  function patchProgressInPlace() {
    const live = activeTasks();
    updateInstallTheater(live);
    const ws = $("#workspace");
    for (const tk of UI.state?.tasks || []) {
      const box = $(`[data-prog-card="${tk.id}"]`, ws);
      if (box) {
        const cap = $(".cp-caption", box);
        const fill = $(".cp-fill", box);
        const speed = tk.speed_bps > 0 ? ` · ${humanBytes(tk.speed_bps)}/s` : "";
        if (cap) {
          cap.textContent =
            tk.status === "installing"
              ? UI.lang === "ar" ? "جارٍ التثبيت…" : "Installing…"
              : `${UI.lang === "ar" ? "جارٍ التنزيل" : "Downloading"} ${tk.progress}%${speed}`;
        }
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
              if (tk.status === "completed") toast(`${tk.name} ${tk.version} — ${tk.message_ar}`);
              else if (tk.status === "error") toast(`${tk.name}: ${tk.message_ar}`, "error");
            }
          }

          const nowActive = activeTasks().length;
          if (prevActive > 0 && nowActive === 0) {
            UI.state = await api("state");
            render();
          } else {
            updateChrome();
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
      const msg = await api("launch", payload);
      toast(msg || "Launching application…");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function triggerHubSelfUpdate() {
    try {
      UI.theaterMinimized = false;
      UI.theaterTaskId = "qassimz-hub";
      const msg = await api("self_update");
      toast(msg);
      await reloadState();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function bindEvents() {
    // Replay official قَاسِـمز intro on click
    $("#btn-replay-logo").onclick = () => runBrandIntro(true);

    $("#btn-lang").onclick = () => {
      UI.lang = UI.lang === "ar" ? "en" : "ar";
      localStorage.setItem("qhub_lang", UI.lang);
      render();
    };

    // Frameless window buttons
    $("#btn-win-min").onclick = () => api("win_minimize").catch(() => {});
    $("#btn-win-max").onclick = () => api("win_toggle_maximize").catch(() => {});
    $("#btn-win-close").onclick = () => api("win_close").catch(() => {});
    $("#app-titlebar").ondblclick = (e) => {
      if (!e.target.closest(".no-drag")) api("win_toggle_maximize").catch(() => {});
    };

    // Toolbar cells
    $$("#main-nav .craft-cell").forEach((b) => {
      b.onclick = () => {
        UI.view = b.dataset.view;
        render();
      };
    });

    $("#btn-hidden-toggle").onclick = () => {
      UI.view = UI.view === "hidden" ? "all" : "hidden";
      render();
    };

    $$(".view-cell").forEach((b) => {
      b.onclick = () => {
        UI.layout = b.dataset.layout;
        localStorage.setItem("qhub_layout", UI.layout);
        render();
      };
    });

    $("#q-sort").onchange = (e) => {
      UI.sort = e.target.value;
      localStorage.setItem("qhub_sort", UI.sort);
      render();
    };

    $("#q-search").oninput = (e) => {
      clearTimeout(UI.searchTimer);
      UI.searchTimer = setTimeout(() => {
        UI.query = e.target.value;
        render();
      }, 80);
    };

    $("#btn-refresh").onclick = async () => {
      const btn = $("#btn-refresh");
      btn.classList.add("spinning");
      $("#foot-status").textContent = tr().checking;
      try {
        UI.state = await api("refresh_catalog");
        render();
        toast(UI.lang === "ar" ? "تم تحديث الكتالوج من GitHub" : "Checked GitHub releases — catalog is up to date.");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        btn.classList.remove("spinning");
        $("#foot-status").textContent = tr().checked;
      }
    };

    $("#btn-update-all").onclick = async () => {
      try {
        UI.theaterMinimized = false;
        const started = await api("update_all");
        toast(`Queued ${started.length} updates`);
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

    // Banner
    $("#btn-hub-self-update").onclick = () => triggerHubSelfUpdate();
    $("#btn-ub-dismiss").onclick = () => { UI.bannerDismissed = true; updateChrome(); };
    $("#btn-ub-notes").onclick = () => api("open_url", { url: "https://github.com/ahmedqassimtv-commits/qassimz-hub/releases" });

    // Theater minimize/restore
    $("#btn-min-theater").onclick = () => { UI.theaterMinimized = true; updateInstallTheater(activeTasks()); };
    $("#btn-open-theater").onclick = () => { UI.theaterMinimized = false; updateInstallTheater(activeTasks()); };

    // Footer links & CEP
    $("#btn-fix-cep").onclick = async () => {
      await api("fix_cep");
      await reloadState();
      toast("Enabled Adobe CEP PlayerDebugMode (CSXS 9–16)");
    };
    $$("[data-open-url]").forEach((b) => {
      b.onclick = () => api("open_url", { url: b.dataset.openUrl });
    });

    // Delegated card/table clicks
    $("#workspace").onclick = async (ev) => {
      const actBtn = ev.target.closest("[data-act]");
      if (actBtn) {
        ev.stopPropagation();
        const act = actBtn.dataset.act;
        const id = actBtn.dataset.id;
        if (act === "install") triggerInstall(id, true);
        else if (act === "launch") triggerLaunch(id);
        else if (act === "pin") togglePin(id);
        else if (act === "menu") openCardMenu(id, actBtn);
        else if (act === "github") api("open_url", { url: actBtn.dataset.url });
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
      if (e.target.id === "detail-backdrop") { UI.selectedId = null; renderDetailsSheet(); }
    };
    $("#settings-backdrop").onclick = (e) => {
      if (e.target.id === "settings-backdrop") { UI.settingsOpen = false; renderSettingsSheet(); }
    };

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#card-more-menu") && !e.target.closest('[data-act="menu"]')) {
        $("#card-more-menu").hidden = true;
      }
      if (!e.target.closest(".bell-anchor")) {
        UI.bellOpen = false;
        $("#bell-popup").hidden = true;
      }
    });

    // Universal keyboard shortcuts (`e.code`, works identically in Arabic & English layouts)
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        $("#card-more-menu").hidden = true;
        if (UI.bellOpen) { UI.bellOpen = false; $("#bell-popup").hidden = true; return; }
        if (UI.settingsOpen) { UI.settingsOpen = false; renderSettingsSheet(); return; }
        if (UI.selectedId) { UI.selectedId = null; renderDetailsSheet(); return; }
        if (!$("#install-theater").hidden) { UI.theaterMinimized = true; updateInstallTheater(activeTasks()); return; }
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
    runBrandIntro(false);
    try {
      await reloadState();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  boot();
})();
