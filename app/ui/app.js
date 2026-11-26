/* QASSIMZ Hub v1.1.0 — Liquid Glass Zero-Thrash Frontend Controller */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const UI = {
    view: "all",
    filter: "all",
    query: "",
    selectedId: null,
    state: null,
    pollTimer: null,
    searchTimer: null,
    renderedView: null,
    renderedDrawerSig: "",
  };

  // Restore preferred Liquid Glass environment (Dark vs Daylight)
  if (localStorage.getItem("qhub_glass_theme") === "light") {
    document.body.classList.add("light-glass");
  }

  async function api(method, payload = {}) {
    const res = await fetch(`api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "حدث خطأ غير متوقّع");
    return json.data;
  }

  function toast(msg, kind = "info") {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = `toast ${kind === "error" ? "error" : ""}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return "";
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function taskMap() {
    const map = new Map();
    for (const t of UI.state?.tasks || []) map.set(t.id, t);
    return map;
  }

  function activeTasks() {
    return (UI.state?.tasks || []).filter((t) =>
      ["queued", "downloading", "installing"].includes(t.status)
    );
  }

  function itemMatches(it) {
    if (UI.view === "desktop" && it.category !== "desktop") return false;
    if (UI.view === "adobe" && it.category !== "adobe") return false;
    if (UI.view === "installed" && !it.state?.installed) return false;
    if (UI.filter === "installed" && !it.state?.installed) return false;
    if (UI.filter === "not-installed" && it.state?.installed) return false;

    const q = UI.query.trim().toLowerCase();
    if (q) {
      const hay = `${it.name} ${it.name_ar} ${it.code} ${it.tagline_ar} ${it.badge_ar} ${(it.hosts || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function updateChrome() {
    const st = UI.state;
    if (!st) return;

    $("#hub-ver").textContent = `v${st.hub_version || "1.1.0"}`;
    $("#cnt-all").textContent = st.counts.total;
    $("#cnt-desktop").textContent = st.counts.desktop;
    $("#cnt-adobe").textContent = st.counts.adobe;
    $("#cnt-installed").textContent = st.counts.installed;

    const live = activeTasks();
    const updBadge = $("#cnt-updates");
    const totalAttention = st.counts.updates + live.length;
    updBadge.textContent = totalAttention;
    updBadge.classList.toggle("warn", st.counts.updates > 0 || live.length > 0);

    const hubUpdBtn = $("#btn-hub-self-update");
    if (hubUpdBtn) {
      if (st.hub_has_update) {
        hubUpdBtn.hidden = false;
        $("#lbl-hub-update").textContent = `تحديث Hub v${st.hub_remote_version}`;
      } else {
        hubUpdBtn.hidden = true;
      }
    }

    const updAllBtn = $("#btn-update-all");
    if (st.counts.updates > 0) {
      updAllBtn.hidden = false;
      $("#lbl-update-all").textContent = `تحديث الكل (${st.counts.updates})`;
    } else {
      updAllBtn.hidden = true;
    }

    const ad = st.adobe || {};
    const dot = $("#cep-dot");
    dot.classList.toggle("warn", !ad.cep_debug_ready);
    dot.title = ad.cep_debug_ready ? "وضع إضافات Adobe CEP مفعّل" : "يحتاج تفعيل PlayerDebugMode";
    $("#btn-launch-pr").disabled = !ad.premiere_installed;
    $("#btn-launch-ae").disabled = !ad.aftereffects_installed;

    updateTransferStrip(live);

    $$("#main-nav .nav-pill").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === UI.view);
    });
    $$("#status-filter .seg-pill").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === UI.filter);
    });
    $("#status-filter").style.visibility = ["updates", "settings"].includes(UI.view)
      ? "hidden"
      : "visible";
  }

  function updateTransferStrip(live) {
    const strip = $("#transfer-strip");
    if (live.length > 0 && UI.view !== "updates") {
      const cur = live[0];
      strip.hidden = false;
      $("#strip-title").textContent =
        cur.status === "installing"
          ? `جارٍ تثبيت ${cur.name}...`
          : `جارٍ تحميل ${cur.name} (${cur.progress}%)`;
      $("#strip-fill").style.width = `${cur.progress}%`;
      const speedTxt = cur.speed_bps > 0 ? `${fmtBytes(cur.speed_bps)}/s` : "";
      const sizeTxt = cur.total > 0 ? `${fmtBytes(cur.downloaded)} / ${fmtBytes(cur.total)}` : "";
      $("#strip-meta").textContent = [sizeTxt, speedTxt].filter(Boolean).join(" · ");
    } else {
      strip.hidden = true;
    }
  }

  function cardFooterHTML(it, task) {
    const st = it.state || {};
    const isBusy = task && ["queued", "downloading", "installing"].includes(task.status);

    if (isBusy) {
      return `<div class="card-progress" data-progress-for="${esc(it.id)}">
         <div class="card-progress-row">
           <span class="prog-msg">${esc(task.message_ar)}</span>
           <div style="display:flex;align-items:center;gap:8px;">
             <span class="prog-pct" style="direction:ltr">${task.progress}%</span>
             <button class="btn-glass btn-sm" style="height:24px;padding:0 10px;font-size:11px;" data-act="cancel" data-id="${esc(it.id)}">إلغاء</button>
           </div>
         </div>
         <div class="progress-track" style="max-width:none;height:5px;"><div class="progress-fill" style="width:${task.progress}%"></div></div>
       </div>`;
    }

    let actionBtn = "";
    if (st.has_update) {
      actionBtn = `<button class="btn-glass-warn btn-sm" data-act="install" data-id="${esc(it.id)}">تحديث</button>`;
    } else if (st.installed) {
      const lbl = it.category === "adobe" ? "فتح في Adobe" : "تشغيل";
      actionBtn = `<button class="btn-glass-success btn-sm" data-act="launch" data-id="${esc(it.id)}">${lbl}</button>`;
    } else {
      const sizeHint = it.setup_size > 0 ? ` · ${fmtBytes(it.setup_size)}` : "";
      actionBtn = `<button class="btn-glass-primary btn-sm" data-act="install" data-id="${esc(it.id)}">تثبيت${sizeHint}</button>`;
    }

    return `<div class="card-foot">
       <div class="host-tags">
         ${(it.hosts || []).map((h) => `<span class="host-tag">${esc(h)}</span>`).join("")}
       </div>
       <div class="card-actions">
         ${actionBtn}
         <button class="btn-glass btn-round" data-act="details" data-id="${esc(it.id)}" title="التفاصيل والخيارات">⋯</button>
       </div>
     </div>`;
  }

  function cardHTML(it, tmap) {
    const st = it.state || {};
    const task = tmap.get(it.id);

    let pill = `<span class="status-pill available">v${esc(it.version)}</span>`;
    if (st.has_update) {
      pill = `<span class="status-pill update">تحديث v${esc(it.version)}</span>`;
    } else if (st.installed) {
      pill = `<span class="status-pill installed">مثبّت · v${esc(st.installed_version || it.version)}</span>`;
    }

    return `
      <article class="app-card" tabindex="0" data-card-id="${esc(it.id)}" data-cat="${esc(it.category)}" style="--card-tint:${esc(it.accent)}36">
        <div class="card-top">
          <div class="card-id-wrap">
            <img class="card-icon" src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)}" decoding="async" />
            <div class="card-titles">
              <span class="card-name-en">${esc(it.name)}</span>
              <span class="card-name-ar">${esc(it.name_ar)}</span>
            </div>
          </div>
          ${pill}
        </div>
        <p class="card-desc">${esc(it.tagline_ar)}</p>
        <div class="card-foot-slot" data-foot-for="${esc(it.id)}">${cardFooterHTML(it, task)}</div>
      </article>
    `;
  }

  function renderCatalogView(forceRebuild = false) {
    const ws = $("#workspace");
    const st = UI.state;
    const tmap = taskMap();
    const allItems = st.items || [];

    if (!forceRebuild && UI.renderedView === "catalog" && $("#catalog-root", ws)) {
      applyCatalogFilterInPlace();
      return;
    }

    const desk = allItems.filter((x) => x.category === "desktop");
    const adobe = allItems.filter((x) => x.category === "adobe");
    const showcaseIds = ["qassimz-studio", "qassimz-vox-fx", "qassimz-music", "qassimz-producer", "qdm", "qassimz-captions"];
    const showcaseItems = showcaseIds
      .map((id) => allItems.find((x) => x.id === id))
      .filter(Boolean);

    const hubBannerUpdate = st.hub_has_update
      ? `<button class="btn-glass-warn btn-sm" id="btn-self-update">تحديث Hub إلى v${esc(st.hub_remote_version)}</button>`
      : "";

    ws.innerHTML = `
      <div id="catalog-root" style="display:flex;flex-direction:column;gap:20px;">
        <section class="liquid-hero" id="studio-strip">
          <div class="hero-left">
            <h1>منظومة قَاسِمز الإبداعية</h1>
            <p>تصفّح وثبّت وشغّل وحدّث جميع تطبيقات سطح المكتب وإضافات Adobe Premiere Pro و After Effects الرسمية بنقرة واحدة وبدون تسجيل دخول.</p>
            <div class="hero-pills">
              <span class="metric-glass-pill"><strong>${st.counts.total}</strong> أداة رسمية</span>
              <span class="metric-glass-pill ok"><strong>${st.counts.installed}</strong> مثبّتة على جهازك</span>
              <span class="metric-glass-pill ${st.counts.updates ? "warn" : ""}"><strong>${st.counts.updates}</strong> تحديثات متاحة</span>
              ${hubBannerUpdate}
            </div>
          </div>
          <div class="hero-showcase" aria-label="وصول سريع للأدوات البارزة">
            ${showcaseItems
              .map(
                (it) =>
                  `<img src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)}" title="${esc(it.name)}" data-card-id="${esc(it.id)}" decoding="async" />`
              )
              .join("")}
          </div>
        </section>

        <div class="section-block" id="sec-desktop">
          <div class="section-head">
            <h2>تطبيقات سطح المكتب المستقلة</h2>
            <span class="section-sub" id="sec-desktop-count">${desk.length} تطبيقات لنظام Windows 10/11</span>
          </div>
          <div class="cards-grid">${desk.map((it) => cardHTML(it, tmap)).join("")}</div>
        </div>

        <div class="section-block" id="sec-adobe">
          <div class="section-head">
            <h2>إضافات Adobe الاحترافية</h2>
            <span class="section-sub" id="sec-adobe-count">Premiere Pro & After Effects · ${adobe.length} إضافات</span>
          </div>
          <div class="cards-grid">${adobe.map((it) => cardHTML(it, tmap)).join("")}</div>
        </div>

        <div class="empty-state" id="catalog-empty" hidden>
          <strong>لا توجد عناصر مطابقة حالياً</strong>
          <span>جرّب تغيير كلمات البحث أو فلتر الحالة من الشريط السفلي.</span>
        </div>
      </div>
    `;

    UI.renderedView = "catalog";

    const selfUpd = $("#btn-self-update", ws);
    if (selfUpd) {
      selfUpd.onclick = async () => {
        toast("جارٍ تنزيل تحديث QASSIMZ Hub...");
        try {
          await api("install_hub_update");
        } catch (e) {
          toast(e.message, "error");
        }
      };
    }

    applyCatalogFilterInPlace();
  }

  function applyCatalogFilterInPlace() {
    const ws = $("#workspace");
    const root = $("#catalog-root", ws);
    if (!root || !UI.state) return;

    const byId = new Map((UI.state.items || []).map((x) => [x.id, x]));
    let deskVisible = 0;
    let adobeVisible = 0;

    $$(".app-card", root).forEach((card) => {
      const it = byId.get(card.dataset.cardId);
      const show = it ? itemMatches(it) : false;
      card.hidden = !show;
      if (show) {
        if (it.category === "desktop") deskVisible++;
        else adobeVisible++;
      }
    });

    const strip = $("#studio-strip", root);
    if (strip) {
      strip.hidden = !(UI.view === "all" && !UI.query.trim() && UI.filter === "all");
    }

    const secDesk = $("#sec-desktop", root);
    const secAdobe = $("#sec-adobe", root);
    if (secDesk) {
      secDesk.hidden = deskVisible === 0;
      const lbl = $("#sec-desktop-count", root);
      if (lbl) lbl.textContent = `${deskVisible} تطبيقات لنظام Windows 10/11`;
    }
    if (secAdobe) {
      secAdobe.hidden = adobeVisible === 0;
      const lbl = $("#sec-adobe-count", root);
      if (lbl) lbl.textContent = `Premiere Pro & After Effects · ${adobeVisible} إضافات`;
    }

    const empty = $("#catalog-empty", root);
    if (empty) empty.hidden = deskVisible + adobeVisible > 0;
  }

  function patchActiveProgressInPlace() {
    const live = activeTasks();
    updateTransferStrip(live);

    const tmap = taskMap();
    const ws = $("#workspace");

    if (UI.renderedView === "catalog") {
      for (const it of UI.state?.items || []) {
        const slot = $(`[data-foot-for="${it.id}"]`, ws);
        if (!slot) continue;
        const task = tmap.get(it.id);
        const isBusy = task && ["queued", "downloading", "installing"].includes(task.status);
        const progEl = slot.querySelector(".card-progress");
        if (isBusy && progEl) {
          const msg = progEl.querySelector(".prog-msg");
          const pct = progEl.querySelector(".prog-pct");
          const fill = progEl.querySelector(".progress-fill");
          if (msg) msg.textContent = task.message_ar;
          if (pct) pct.textContent = `${task.progress}%`;
          if (fill) fill.style.width = `${task.progress}%`;
        } else if (isBusy !== Boolean(progEl)) {
          slot.innerHTML = cardFooterHTML(it, task);
        }
      }
    } else if (UI.renderedView === "updates") {
      for (const t of UI.state?.tasks || []) {
        const row = $(`[data-task-row="${t.id}"]`, ws);
        if (!row) {
          renderUpdatesView();
          return;
        }
        const speed = t.speed_bps > 0 ? `${fmtBytes(t.speed_bps)}/s` : "";
        const bytes = t.total > 0 ? `${fmtBytes(t.downloaded)} / ${fmtBytes(t.total)}` : "";
        const meta = row.querySelector(".task-meta");
        const fill = row.querySelector(".progress-fill");
        const msg = row.querySelector(".task-msg");
        if (meta) meta.textContent = [bytes, speed, `${t.progress}%`].filter(Boolean).join(" · ");
        if (fill) fill.style.width = `${t.progress}%`;
        if (msg) {
          msg.textContent = t.message_ar;
          msg.style.color = t.status === "error" ? "#FDA4AF" : "var(--text-2)";
        }
      }
    }
  }

  function renderUpdatesView() {
    const ws = $("#workspace");
    const st = UI.state;
    const tasks = st.tasks || [];
    const outdated = (st.items || []).filter((x) => x.state?.has_update);
    const tmap = taskMap();

    ws.innerHTML = `
      <div class="section-block">
        <div class="section-head">
          <h2>طابور التنزيلات والتثبيت</h2>
          ${
            tasks.some((t) => ["completed", "error", "cancelled"].includes(t.status))
              ? `<button class="btn-glass btn-sm" id="btn-clear-tasks">مسح المكتملة</button>`
              : ""
          }
        </div>
        ${
          tasks.length
            ? `<div class="list-panel">
                 ${tasks
                   .map((t) => {
                     const speed = t.speed_bps > 0 ? `${fmtBytes(t.speed_bps)}/s` : "";
                     const bytes = t.total > 0 ? `${fmtBytes(t.downloaded)} / ${fmtBytes(t.total)}` : "";
                     const canCancel = ["queued", "downloading"].includes(t.status);
                     return `
                       <div class="task-row" data-task-row="${esc(t.id)}">
                         <img src="./icons/${esc(t.id)}.svg" alt="${esc(t.name)}" decoding="async" />
                         <div class="task-main">
                           <div class="task-top">
                             <strong>${esc(t.name)} <span style="color:var(--text-2);font-weight:500;">v${esc(t.version)}</span></strong>
                             <span class="task-meta">${esc([bytes, speed, `${t.progress}%`].filter(Boolean).join(" · "))}</span>
                           </div>
                           <div class="progress-track" style="max-width:none;height:6px;"><div class="progress-fill" style="width:${t.progress}%"></div></div>
                           <span class="task-msg" style="font-size:12px;color:${t.status === "error" ? "#FDA4AF" : "var(--text-2)"}">${esc(t.message_ar)}</span>
                         </div>
                         ${
                           canCancel
                             ? `<button class="btn-glass-danger btn-sm" data-act="cancel" data-id="${esc(t.id)}">إلغاء</button>`
                             : ""
                         }
                       </div>
                     `;
                   })
                   .join("")}
               </div>`
            : `<div class="empty-state">
                 <strong>لا توجد تنزيلات جارية حالياً</strong>
                 <span>اختر أي تطبيق أو إضافة من المكتبة لتثبيتها بضغطة زر واحدة.</span>
               </div>`
        }
      </div>

      <div class="section-block">
        <div class="section-head">
          <h2>التحديثات المتاحة</h2>
          <span class="section-sub">${outdated.length} تحديث</span>
        </div>
        ${
          outdated.length
            ? `<div class="cards-grid">${outdated.map((it) => cardHTML(it, tmap)).join("")}</div>`
            : `<div class="empty-state">
                 <strong>جميع برامجك المثبّتة محدّثة لآخر إصدار ✓</strong>
                 <span>يقوم QASSIMZ Hub بفحص الإصدارات الجديدة تلقائياً من المستودع العام.</span>
               </div>`
        }
      </div>
    `;

    UI.renderedView = "updates";
    const clr = $("#btn-clear-tasks", ws);
    if (clr) {
      clr.onclick = async () => {
        await api("clear_tasks");
        await reloadState(true);
      };
    }
  }

  function renderSettingsView() {
    const ws = $("#workspace");
    const st = UI.state;
    const cfg = st.settings || {};
    const cacheSize = fmtBytes(st.cache_size_bytes) || "0 KB";

    ws.innerHTML = `
      <div class="section-block">
        <div class="section-head">
          <h2>إعدادات QASSIMZ Hub</h2>
          <span class="section-sub">تخصيص أسلوب التثبيت والتشغيل التلقائي</span>
        </div>

        <div class="settings-grid">
          <div class="setting-card">
            <h3>التثبيت والتحديثات</h3>

            <div class="toggle-row">
              <div class="toggle-text">
                <strong>التثبيت الصامت السريع (One-Click Silent Install)</strong>
                <span>تثبيت وتحديث التطبيقات والإضافات تلقائياً بدون نوافذ المعالج التقليدية.</span>
              </div>
              <label class="switch">
                <input type="checkbox" data-setting="silent_install" ${cfg.silent_install ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-row">
              <div class="toggle-text">
                <strong>فحص التحديثات تلقائياً عند التشغيل</strong>
                <span>مزامنة أحدث الكتالوج والإصدارات من مستودع qassimz-hub العام.</span>
              </div>
              <label class="switch">
                <input type="checkbox" data-setting="auto_check_updates" ${cfg.auto_check_updates ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-row">
              <div class="toggle-text">
                <strong>التحديث التلقائي للبرامج المثبّتة في الخلفية</strong>
                <span>تنزيل وتثبيت التحديثات الجديدة لبرامجك المثبّتة تلقائياً عبر QASSIMZ Hub.</span>
              </div>
              <label class="switch">
                <input type="checkbox" data-setting="auto_update_apps" ${cfg.auto_update_apps !== false ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-row">
              <div class="toggle-text">
                <strong>التحديث التلقائي لـ QASSIMZ Hub نفسه</strong>
                <span>تنزيل أحدث إصدار من اللانشر وتطبيقه مع إعادة التشغيل تلقائياً.</span>
              </div>
              <label class="switch">
                <input type="checkbox" data-setting="auto_update_hub" ${cfg.auto_update_hub ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-card">
            <h3>النظام والخلفية</h3>

            <div class="toggle-row">
              <div class="toggle-text">
                <strong>التصغير إلى شريط المهام (System Tray) عند الإغلاق</strong>
                <span>إبقاء QASSIMZ Hub جاهزاً في الخلفية لمتابعة التحميلات والتحديثات.</span>
              </div>
              <label class="switch">
                <input type="checkbox" data-setting="minimize_to_tray" ${cfg.minimize_to_tray ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-row">
              <div class="toggle-text">
                <strong>التشغيل التلقائي مع بداية Windows</strong>
                <span>بدء المركز مصغّراً في الخلفية عند تسجيل الدخول إلى الويندوز.</span>
              </div>
              <label class="switch">
                <input type="checkbox" data-setting="start_with_windows" ${cfg.start_with_windows ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-card">
            <h3>تحديث الأداة والتخزين المؤقت وبيئة Adobe</h3>
            <p style="font-size:12.5px;color:var(--text-2);">
              الإصدار الحالي لـ QASSIMZ Hub: <strong style="color:var(--text-1);direction:ltr;display:inline-block;">v${esc(st.hub_version || "1.1.0")}</strong>
              · حجم الملفات المؤقتة: <strong style="color:var(--text-1);direction:ltr;display:inline-block;">${esc(cacheSize)}</strong>
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">
              <button class="btn-glass-primary btn-sm" id="set-self-update">${st.hub_has_update ? `تحديث Hub إلى v${esc(st.hub_remote_version)}` : "فحص وتحديث QASSIMZ Hub الآن"}</button>
              <button class="btn-glass btn-sm" id="set-open-cache">فتح مجلد التحميلات</button>
              <button class="btn-glass-danger btn-sm" id="set-clear-cache">تفريغ الملفات المؤقتة</button>
              <button class="btn-glass btn-sm" id="set-fix-cep">إصلاح PlayerDebugMode لـ Adobe</button>
            </div>
          </div>
        </div>
      </div>
    `;

    UI.renderedView = "settings";

    $$("input[data-setting]", ws).forEach((chk) => {
      chk.onchange = async () => {
        try {
          const updated = await api("save_settings", { [chk.dataset.setting]: chk.checked });
          UI.state.settings = updated;
          toast("تم حفظ الإعدادات");
        } catch (e) {
          toast(e.message, "error");
        }
      };
    });

    $("#set-self-update", ws).onclick = () => triggerHubSelfUpdate();
    $("#set-open-cache", ws).onclick = () => api("open_cache_dir");
    $("#set-clear-cache", ws).onclick = async () => {
      UI.state = await api("clear_cache");
      render(true);
      toast("تم تنظيف مجلد التنزيلات المؤقتة");
    };
    $("#set-fix-cep", ws).onclick = async () => {
      await api("fix_cep");
      await reloadState(true);
      toast("تم تفعيل PlayerDebugMode لإصدارات CSXS 9–16 بنجاح");
    };
  }

  function renderDrawer(force = false) {
    const backdrop = $("#detail-backdrop");
    if (!UI.selectedId || !UI.state) {
      backdrop.hidden = true;
      UI.renderedDrawerSig = "";
      return;
    }
    const it = (UI.state.items || []).find((x) => x.id === UI.selectedId);
    if (!it) {
      backdrop.hidden = true;
      UI.renderedDrawerSig = "";
      return;
    }

    const st = it.state || {};
    const sig = `${it.id}|${st.installed}|${st.has_update}|${st.installed_version}|${st.ai_ready}|${it.version}`;
    if (!force && !backdrop.hidden && UI.renderedDrawerSig === sig) {
      return;
    }
    UI.renderedDrawerSig = sig;
    backdrop.hidden = false;

    const drawer = $("#detail-drawer");
    drawer.style.setProperty("--drawer-accent", it.accent || "#38BDF8");
    drawer.style.setProperty("--drawer-tint", `${it.accent || "#38BDF8"}38`);

    $("#drawer-icon").src = `./icons/${it.id}.svg`;
    $("#drawer-title").textContent = it.name;
    $("#drawer-name-ar").textContent = it.name_ar;

    const badge = $("#drawer-badge");
    badge.className = "status-pill " + (st.has_update ? "update" : st.installed ? "installed" : "available");
    badge.textContent = st.has_update
      ? `تحديث متاح: v${it.version} (المثبّت v${st.installed_version})`
      : st.installed
      ? `مثبّت · v${st.installed_version || it.version}`
      : `الإصدار الأحدث · v${it.version}`;

    const aiSection = st.ai_applicable
      ? `<div class="drawer-section">
           <h4>حالة محرّك الذكاء الاصطناعي المحلي</h4>
           <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);padding:10px 12px;border-radius:12px;gap:10px;">
             <span style="font-size:12.5px;color:${st.ai_ready ? "#6EE7B7" : "#FCD34D"}">
               ${st.ai_ready ? "✓ البيئة والنماذج جاهزة" : "⚠ يحتاج تشغيل أداة التجهيز لمرة واحدة بعد التثبيت"}
             </span>
             ${st.ai_setup_script ? `<button class="btn-glass btn-sm" id="dr-ai-setup">تشغيل التجهيز</button>` : ""}
           </div>
         </div>`
      : "";

    const subAppsHTML = (st.sub_apps || []).length
      ? `<div class="drawer-section">
           <h4>أدوات فرعية سريعة</h4>
           <div style="display:flex;flex-wrap:wrap;gap:8px;">
             ${st.sub_apps.map((sa, idx) => `<button class="btn-glass btn-sm" data-sub-idx="${idx}">${esc(sa.label_ar)}</button>`).join("")}
           </div>
         </div>`
      : "";

    const extraAssetsHTML = (it.extra_assets || []).length
      ? `<div class="drawer-section">
           <h4>ملحقات إضافية للتحميل</h4>
           <div style="display:flex;flex-wrap:wrap;gap:8px;">
             ${it.extra_assets.map((ea) => `<button class="btn-glass btn-sm" data-ext-url="${esc(ea.url)}">${esc(ea.label_ar)}</button>`).join("")}
           </div>
         </div>`
      : "";

    const catLabel = it.category === "adobe" ? "إضافة Adobe CEP" : "تطبيق سطح مكتب";

    $("#drawer-body").innerHTML = `
      <div class="drawer-section">
        <h4>نبذة عن البرنامج</h4>
        <p style="font-size:13.5px;color:var(--text-1);line-height:1.68;">${esc(it.description_ar)}</p>
      </div>

      <div class="drawer-section">
        <h4>أبرز المميزات</h4>
        <ul class="feature-list">
          ${(it.features_ar || []).map((f) => `<li><span>${esc(f)}</span></li>`).join("")}
        </ul>
      </div>

      <div class="meta-grid">
        <div class="meta-cell">
          <span>الإصدار الرسمي</span>
          <strong>v${esc(it.version)}</strong>
        </div>
        <div class="meta-cell">
          <span>حجم الحزمة</span>
          <strong style="direction:${it.setup_size ? "ltr" : "rtl"}">${esc(fmtBytes(it.setup_size) || "متاح عبر GitHub")}</strong>
        </div>
        <div class="meta-cell">
          <span>البيئة المستهدفة</span>
          <strong>${esc((it.hosts || []).join(", "))}</strong>
        </div>
        <div class="meta-cell">
          <span>الفئة</span>
          <strong style="direction:rtl;color:${esc(it.accent)}">${esc(catLabel)}</strong>
        </div>
      </div>

      ${aiSection}
      ${subAppsHTML}
      ${extraAssetsHTML}

      ${
        it.release_notes_ar
          ? `<div class="drawer-section">
               <h4>الجديد في هذا الإصدار</h4>
               <p style="font-size:12.5px;color:var(--text-2);background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);padding:11px 13px;border-radius:12px;line-height:1.6;">
                 ${esc(it.release_notes_ar)}
               </p>
             </div>`
          : ""
      }
    `;

    const foot = $("#drawer-foot");
    const buttons = [];
    if (st.has_update) {
      buttons.push(`<button class="btn-glass-warn" id="dr-install-silent">تحديث الآن (v${esc(it.version)})</button>`);
    } else if (st.installed) {
      const lbl = it.category === "adobe" ? "فتح في برنامج Adobe" : "تشغيل البرنامج";
      buttons.push(`<button class="btn-glass-primary" id="dr-launch">${lbl}</button>`);
      buttons.push(`<button class="btn-glass" id="dr-reinstall">إعادة تثبيت / إصلاح</button>`);
    } else {
      buttons.push(`<button class="btn-glass-primary" id="dr-install-silent">تثبيت سريع</button>`);
      buttons.push(`<button class="btn-glass" id="dr-install-wizard">معالج التثبيت التقليدي</button>`);
    }

    if (st.install_dir) {
      buttons.push(`<button class="btn-glass" id="dr-open-dir">فتح مجلد التثبيت</button>`);
    }
    if (it.portable_url) {
      buttons.push(`<button class="btn-glass" id="dr-portable">نسخة محمولة</button>`);
    }
    if (st.installed && st.uninstall_cmd) {
      buttons.push(`<button class="btn-glass-danger" id="dr-uninstall">إلغاء التثبيت</button>`);
    }

    foot.innerHTML = buttons.join("");

    const bind = (sel, fn) => {
      const el = $(sel, drawer);
      if (el) el.onclick = fn;
    };

    bind("#dr-install-silent", () => triggerInstall(it.id, true));
    bind("#dr-install-wizard", () => triggerInstall(it.id, false));
    bind("#dr-reinstall", () => triggerInstall(it.id, false));
    bind("#dr-launch", () => triggerLaunch(it.id));
    bind("#dr-open-dir", () => api("open_folder", { path: st.install_dir }));
    bind("#dr-portable", () => api("open_url", { url: it.portable_url }));
    bind("#dr-ai-setup", async () => {
      try {
        await api("run_ai_setup", { id: it.id });
        toast("تم فتح نافذة تجهيز الذكاء الاصطناعي");
      } catch (e) {
        toast(e.message, "error");
      }
    });
    bind("#dr-uninstall", async () => {
      try {
        await api("uninstall", { id: it.id });
        toast("تم تشغيل معالج إلغاء التثبيت");
        UI.selectedId = null;
        renderDrawer();
      } catch (e) {
        toast(e.message, "error");
      }
    });

    $$("[data-sub-idx]", drawer).forEach((b) => {
      b.onclick = () => triggerLaunch(it.id, Number(b.dataset.subIdx));
    });
    $$("[data-ext-url]", drawer).forEach((b) => {
      b.onclick = () => api("open_url", { url: b.dataset.extUrl });
    });
  }

  function render(forceRebuild = false) {
    if (!UI.state) return;
    updateChrome();
    if (UI.view === "updates") {
      renderUpdatesView();
    } else if (UI.view === "settings") {
      renderSettingsView();
    } else {
      renderCatalogView(forceRebuild);
    }
    renderDrawer(forceRebuild);
    manageTaskPolling();
  }

  async function reloadState(forceRebuild = false) {
    UI.state = await api("state");
    render(forceRebuild);
  }

  window.__qhubOnCatalogSynced = async () => {
    try {
      await reloadState(true);
    } catch (_) {}
  };

  function manageTaskPolling() {
    const hasActive = activeTasks().length > 0;
    if (hasActive && !UI.pollTimer) {
      let busy = false;
      UI.pollTimer = setInterval(async () => {
        if (busy || document.hidden) return;
        busy = true;
        try {
          const prevActive = activeTasks().length;
          const tasks = await api("tasks");
          UI.state.tasks = tasks;
          const nowActive = activeTasks().length;
          if (prevActive > 0 && nowActive === 0) {
            UI.state = await api("state");
            render(true);
          } else {
            updateChrome();
            patchActiveProgressInPlace();
          }
        } catch (_) {
        } finally {
          busy = false;
        }
      }, 550);
    } else if (!hasActive && UI.pollTimer) {
      clearInterval(UI.pollTimer);
      UI.pollTimer = null;
    }
  }

  async function triggerHubSelfUpdate() {
    try {
      UI.state = await api("refresh_catalog");
      render(true);
      if (!UI.state.hub_has_update) {
        toast(`أنت بالفعل على أحدث إصدار من QASSIMZ Hub (v${UI.state.hub_version})`);
        return;
      }
      await api("install_hub_update");
      toast(`بدأ تحميل تحديث QASSIMZ Hub (v${UI.state.hub_remote_version}) — سيتم إعادة التشغيل تلقائياً`);
      await reloadState(false);
      patchActiveProgressInPlace();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function triggerInstall(id, silent = null) {
    try {
      await api("install", { id, silent });
      toast("تمت إضافة البرنامج إلى طابور التنزيل والتثبيت");
      await reloadState(false);
      patchActiveProgressInPlace();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function triggerLaunch(id, subIdx = null) {
    try {
      await api("launch", { id, sub_idx: subIdx });
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // Delegated click handler on workspace
  $("#workspace").addEventListener("click", async (e) => {
    const actBtn = e.target.closest("[data-act]");
    if (actBtn) {
      e.stopPropagation();
      const id = actBtn.dataset.id;
      const act = actBtn.dataset.act;
      if (act === "install") return triggerInstall(id);
      if (act === "launch") return triggerLaunch(id);
      if (act === "cancel") {
        await api("cancel_task", { id });
        return reloadState(true);
      }
      if (act === "details") {
        UI.selectedId = id;
        return renderDrawer(true);
      }
    }

    const card = e.target.closest("[data-card-id]");
    if (card) {
      UI.selectedId = card.dataset.cardId;
      renderDrawer(true);
    }
  });

  // Top Floating Nav & Bottom Filter Bindings
  $$("#main-nav .nav-pill").forEach((btn) => {
    btn.onclick = () => {
      UI.view = btn.dataset.view;
      render(false);
    };
  });

  $$("#status-filter .seg-pill").forEach((btn) => {
    btn.onclick = () => {
      UI.filter = btn.dataset.filter;
      render(false);
    };
  });

  $("#btn-theme").onclick = () => {
    const isLight = document.body.classList.toggle("light-glass");
    localStorage.setItem("qhub_glass_theme", isLight ? "light" : "dark");
  };

  $("#q-search").addEventListener("input", (e) => {
    UI.query = e.target.value;
    clearTimeout(UI.searchTimer);
    UI.searchTimer = setTimeout(() => {
      if (["updates", "settings"].includes(UI.view)) {
        UI.view = "all";
        render(false);
      } else {
        applyCatalogFilterInPlace();
      }
    }, 45);
  });

  $("#btn-refresh").onclick = async () => {
    const btn = $("#btn-refresh");
    btn.disabled = true;
    try {
      UI.state = await api("refresh_catalog");
      render(true);
      toast("تم تحديث الدليل وفحص البرامج المثبّتة");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      btn.disabled = false;
    }
  };

  const hubSelfUpdBtn = $("#btn-hub-self-update");
  if (hubSelfUpdBtn) hubSelfUpdBtn.onclick = () => triggerHubSelfUpdate();

  $("#btn-update-all").onclick = async () => {
    try {
      const list = await api("update_all");
      toast(`بدأ تحديث ${list.length} برامج في الخلفية`);
      await reloadState(false);
      patchActiveProgressInPlace();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  $("#btn-view-transfers").onclick = () => {
    UI.view = "updates";
    render(false);
  };

  $("#btn-launch-pr").onclick = async () => {
    try {
      await api("launch_adobe", { host: "premiere" });
    } catch (e) {
      toast(e.message, "error");
    }
  };

  $("#btn-launch-ae").onclick = async () => {
    try {
      await api("launch_adobe", { host: "aftereffects" });
    } catch (e) {
      toast(e.message, "error");
    }
  };

  $("#btn-fix-cep").onclick = async () => {
    try {
      await api("fix_cep");
      await reloadState(true);
      toast("تم تفعيل إضافات Adobe CEP (CSXS 9–16)");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  $("#btn-open-github").onclick = () => {
    api("open_url", { url: UI.state?.hub_repo_url || "https://github.com/ahmedqassimtv-commits/qassimz-hub" });
  };

  // Integrated Frameless Window Controls
  $("#btn-win-min").onclick = () => api("win_minimize").catch(() => {});
  $("#btn-win-max").onclick = () => api("win_toggle_maximize").catch(() => {});
  $("#btn-win-close").onclick = () => api("win_close").catch(() => {});
  $("#app-titlebar").addEventListener("dblclick", (e) => {
    if (e.target.closest(".no-drag, button, input")) return;
    api("win_toggle_maximize").catch(() => {});
  });

  $("#btn-open-shortcuts").onclick = () => {
    $("#shortcuts-modal").hidden = false;
  };
  $("#btn-close-shortcuts").onclick = () => {
    $("#shortcuts-modal").hidden = true;
  };
  $("#shortcuts-modal").onclick = (e) => {
    if (e.target.id === "shortcuts-modal") $("#shortcuts-modal").hidden = true;
  };

  $("#btn-close-drawer").onclick = () => {
    UI.selectedId = null;
    renderDrawer();
  };
  $("#detail-backdrop").onclick = (e) => {
    if (e.target.id === "detail-backdrop") {
      UI.selectedId = null;
      renderDrawer();
    }
  };

  // Universal e.code Keyboard Shortcuts (Arabic + English)
  document.addEventListener("keydown", (e) => {
    const code = e.code;
    const ctrl = e.ctrlKey || e.metaKey;
    const inInput = Boolean(e.target.closest("input, textarea, select, [contenteditable]"));

    if (code === "F11") {
      e.preventDefault();
      api("toggle_fullscreen");
      return;
    }

    if (code === "Escape") {
      if (!$("#shortcuts-modal").hidden) {
        e.preventDefault();
        $("#shortcuts-modal").hidden = true;
        return;
      }
      if (UI.selectedId) {
        e.preventDefault();
        UI.selectedId = null;
        renderDrawer();
        return;
      }
      if (inInput) {
        if (e.target.id === "q-search" && e.target.value) {
          e.target.value = "";
          UI.query = "";
          applyCatalogFilterInPlace();
        }
        e.target.blur();
        return;
      }
    }

    if ((ctrl && (code === "KeyF" || code === "KeyK")) || (!ctrl && !inInput && code === "Slash" && !e.shiftKey)) {
      e.preventDefault();
      const s = $("#q-search");
      s.focus();
      s.select();
      return;
    }

    if ((ctrl && code === "KeyR") || code === "F5") {
      e.preventDefault();
      $("#btn-refresh").click();
      return;
    }

    if (ctrl && code === "KeyU") {
      e.preventDefault();
      if (!$("#btn-update-all").hidden) $("#btn-update-all").click();
      return;
    }

    if (ctrl && code === "Comma") {
      e.preventDefault();
      UI.view = "settings";
      render(false);
      return;
    }

    if (inInput) return;

    if (e.shiftKey && code === "Slash") {
      e.preventDefault();
      $("#shortcuts-modal").hidden = !$("#shortcuts-modal").hidden;
      return;
    }

    const viewByDigit = {
      Digit1: "all",
      Digit2: "desktop",
      Digit3: "adobe",
      Digit4: "installed",
      Digit5: "updates",
      Digit6: "settings",
    };
    if (!ctrl && viewByDigit[code]) {
      e.preventDefault();
      UI.view = viewByDigit[code];
      render(false);
      return;
    }

    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(code)) {
      const cards = $$(".app-card:not([hidden])", $("#workspace"));
      if (!cards.length) return;
      const idx = cards.indexOf(document.activeElement);
      let next = 0;
      if (idx === -1) {
        next = 0;
      } else if (code === "ArrowLeft" || code === "ArrowDown") {
        next = (idx + 1) % cards.length;
      } else {
        next = (idx - 1 + cards.length) % cards.length;
      }
      e.preventDefault();
      cards[next].focus();
      return;
    }

    if (code === "Enter" && document.activeElement?.matches?.(".app-card")) {
      e.preventDefault();
      UI.selectedId = document.activeElement.dataset.cardId;
      renderDrawer(true);
    }
  });

  reloadState(true).catch((err) => {
    $("#workspace").innerHTML = `<div class="empty-state"><strong>تعذّر الاتصال بالخادم المحلي</strong><span>${esc(err.message)}</span></div>`;
  });
})();
