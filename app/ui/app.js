/* QASSIMZ Hub — Frontend Controller (Universal e.code Keyboard Shortcuts + Live State) */
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
  };

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
    setTimeout(() => el.remove(), 3800);
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
    for (const t of UI.state?.tasks || []) {
      map.set(t.id, t);
    }
    return map;
  }

  function activeTasks() {
    return (UI.state?.tasks || []).filter((t) =>
      ["queued", "downloading", "installing"].includes(t.status)
    );
  }

  function filteredItems() {
    const all = UI.state?.items || [];
    const q = UI.query.trim().toLowerCase();
    return all.filter((it) => {
      if (UI.view === "desktop" && it.category !== "desktop") return false;
      if (UI.view === "adobe" && it.category !== "adobe") return false;
      if (UI.view === "installed" && !it.state?.installed) return false;

      if (UI.filter === "installed" && !it.state?.installed) return false;
      if (UI.filter === "not-installed" && it.state?.installed) return false;

      if (q) {
        const hay = `${it.name} ${it.name_ar} ${it.code} ${it.tagline_ar} ${it.badge_ar} ${(it.hosts || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function updateChrome() {
    const st = UI.state;
    if (!st) return;

    $("#hub-ver").textContent = `v${st.hub_version || "1.0.0"}`;
    $("#cnt-all").textContent = st.counts.total;
    $("#cnt-desktop").textContent = st.counts.desktop;
    $("#cnt-adobe").textContent = st.counts.adobe;
    $("#cnt-installed").textContent = st.counts.installed;

    const activeCount = activeTasks().length;
    const updBadge = $("#cnt-updates");
    const totalAttention = st.counts.updates + activeCount;
    updBadge.textContent = totalAttention;
    updBadge.classList.toggle("warn", st.counts.updates > 0 || activeCount > 0);

    const updAllBtn = $("#btn-update-all");
    if (st.counts.updates > 0) {
      updAllBtn.hidden = false;
      $("#lbl-update-all").textContent = `تحديث الكل (${st.counts.updates})`;
    } else {
      updAllBtn.hidden = true;
    }

    // Adobe CEP box
    const ad = st.adobe || {};
    const dot = $("#cep-dot");
    dot.classList.toggle("warn", !ad.cep_debug_ready);
    dot.title = ad.cep_debug_ready ? "وضع إضافات Adobe CEP مفعّل" : "يحتاج تفعيل PlayerDebugMode";
    $("#btn-launch-pr").disabled = !ad.premiere_installed;
    $("#btn-launch-ae").disabled = !ad.aftereffects_installed;

    // Live Transfer Strip
    const live = activeTasks();
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

    $$("#main-nav .nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === UI.view);
    });
    $$("#status-filter .pill-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === UI.filter);
    });
    $("#status-filter").style.visibility = ["updates", "settings"].includes(UI.view)
      ? "hidden"
      : "visible";
  }

  function cardHTML(it, tmap) {
    const st = it.state || {};
    const task = tmap.get(it.id);
    const isBusy = task && ["queued", "downloading", "installing"].includes(task.status);

    let pill = `<span class="status-pill available">v${esc(it.version)}</span>`;
    if (st.has_update) {
      pill = `<span class="status-pill update">تحديث v${esc(it.version)}</span>`;
    } else if (st.installed) {
      pill = `<span class="status-pill installed">مثبّت · v${esc(st.installed_version || it.version)}</span>`;
    }

    let actionBtn = "";
    if (isBusy) {
      actionBtn = `<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${esc(it.id)}">إلغاء (${task.progress}%)</button>`;
    } else if (st.has_update) {
      actionBtn = `<button class="btn btn-warn btn-sm" data-act="install" data-id="${esc(it.id)}">تحديث</button>`;
    } else if (st.installed) {
      const lbl = it.category === "adobe" ? "فتح في Adobe" : "تشغيل";
      actionBtn = `<button class="btn btn-success btn-sm" data-act="launch" data-id="${esc(it.id)}">${lbl}</button>`;
    } else {
      const sizeHint = it.setup_size > 0 ? ` · ${fmtBytes(it.setup_size)}` : "";
      actionBtn = `<button class="btn btn-primary btn-sm" data-act="install" data-id="${esc(it.id)}">تثبيت${sizeHint}</button>`;
    }

    const progressBlock = isBusy
      ? `<div class="card-progress">
           <div class="card-progress-row">
             <span>${esc(task.message_ar)}</span>
             <span style="direction:ltr">${task.progress}%</span>
           </div>
           <div class="card-progress-track"><div class="card-progress-fill" style="width:${task.progress}%"></div></div>
         </div>`
      : `<div class="card-foot">
           <div class="host-tags">
             ${(it.hosts || []).map((h) => `<span class="host-tag">${esc(h)}</span>`).join("")}
           </div>
           <div class="card-actions">
             ${actionBtn}
             <button class="btn btn-ghost btn-icon" data-act="details" data-id="${esc(it.id)}" title="التفاصيل والخيارات">⋯</button>
           </div>
         </div>`;

    return `
      <article class="app-card" tabindex="0" data-card-id="${esc(it.id)}" style="--card-tint:${esc(it.accent)}1F">
        <div class="card-top">
          <div class="card-id-wrap">
            <img class="card-icon" src="./icons/${esc(it.id)}.svg" alt="${esc(it.name)}" loading="lazy" />
            <div class="card-titles">
              <span class="card-name-en">${esc(it.name)}</span>
              <span class="card-name-ar">${esc(it.name_ar)}</span>
            </div>
          </div>
          ${pill}
        </div>
        <p class="card-desc">${esc(it.tagline_ar)}</p>
        ${progressBlock}
      </article>
    `;
  }

  function renderCatalogView() {
    const ws = $("#workspace");
    const st = UI.state;
    const tmap = taskMap();
    const list = filteredItems();

    let html = "";

    if (UI.view === "all" && !UI.query && UI.filter === "all") {
      const hubBannerUpdate = st.hub_has_update
        ? `<button class="btn btn-warn" id="btn-self-update">تحديث QASSIMZ Hub إلى v${esc(st.hub_remote_version)}</button>`
        : "";
      html += `
        <div class="hero-banner">
          <div class="hero-copy">
            <h1>منظومة قَاسِمز الإبداعية في مكان واحد</h1>
            <p>تصفّح وثبّت وشغّل وحدّث جميع تطبيقات سطح المكتب وإضافات Adobe Premiere Pro و After Effects الرسمية مباشرةً وبدون تسجيل دخول.</p>
            ${hubBannerUpdate ? `<div style="margin-top:8px">${hubBannerUpdate}</div>` : ""}
          </div>
          <div class="hero-stats">
            <div class="stat-card">
              <div class="stat-num">${st.counts.total}</div>
              <div class="stat-lbl">إجمالي الأدوات</div>
            </div>
            <div class="stat-card">
              <div class="stat-num" style="color:var(--success)">${st.counts.installed}</div>
              <div class="stat-lbl">مثبّتة على جهازك</div>
            </div>
            <div class="stat-card">
              <div class="stat-num" style="color:${st.counts.updates ? "var(--warning)" : "var(--text-2)"}">${st.counts.updates}</div>
              <div class="stat-lbl">تحديثات متاحة</div>
            </div>
          </div>
        </div>
      `;

      const desk = list.filter((x) => x.category === "desktop");
      const adobe = list.filter((x) => x.category === "adobe");

      html += `
        <div class="section-block">
          <div class="section-head">
            <h2>تطبيقات سطح المكتب المستقلة</h2>
            <span class="section-sub">${desk.length} تطبيقات لنظام Windows 10/11</span>
          </div>
          <div class="cards-grid">${desk.map((it) => cardHTML(it, tmap)).join("")}</div>
        </div>
        <div class="section-block">
          <div class="section-head">
            <h2>إضافات ومحرّكات Adobe الاحترافية</h2>
            <span class="section-sub">Premiere Pro & After Effects</span>
          </div>
          <div class="cards-grid">${adobe.map((it) => cardHTML(it, tmap)).join("")}</div>
        </div>
      `;
    } else {
      const titles = {
        all: "نتائج البحث والتصفية",
        desktop: "تطبيقات سطح المكتب المستقلة",
        adobe: "إضافات Adobe Premiere Pro & After Effects",
        installed: "التطبيقات والإضافات المثبّتة على جهازك",
      };
      html += `
        <div class="section-block">
          <div class="section-head">
            <h2>${titles[UI.view] || "المكتبة"}</h2>
            <span class="section-sub">${list.length} عنصر</span>
          </div>
          ${
            list.length
              ? `<div class="cards-grid">${list.map((it) => cardHTML(it, tmap)).join("")}</div>`
              : `<div class="empty-state">
                   <strong>لا توجد عناصر مطابقة حالياً</strong>
                   <span>جرّب تغيير كلمات البحث أو فلتر الحالة من الشريط العلوي.</span>
                 </div>`
          }
        </div>
      `;
    }

    ws.innerHTML = html;
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
  }

  function renderUpdatesView() {
    const ws = $("#workspace");
    const st = UI.state;
    const tasks = st.tasks || [];
    const outdated = (st.items || []).filter((x) => x.state?.has_update);
    const tmap = taskMap();

    let html = `
      <div class="section-block">
        <div class="section-head">
          <h2>طابور التنزيلات والتثبيت</h2>
          ${
            tasks.some((t) => ["completed", "error", "cancelled"].includes(t.status))
              ? `<button class="btn btn-ghost btn-sm" id="btn-clear-tasks">مسح المكتملة</button>`
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
                       <div class="task-row">
                         <img src="./icons/${esc(t.id)}.svg" alt="${esc(t.name)}" />
                         <div class="task-main">
                           <div class="task-top">
                             <strong>${esc(t.name)} <span style="color:var(--text-2);font-weight:500;">v${esc(t.version)}</span></strong>
                             <span class="task-meta">${esc([bytes, speed, `${t.progress}%`].filter(Boolean).join(" · "))}</span>
                           </div>
                           <div class="card-progress-track"><div class="card-progress-fill" style="width:${t.progress}%"></div></div>
                           <span style="font-size:12px;color:${t.status === "error" ? "#FDA4AF" : "var(--text-2)"}">${esc(t.message_ar)}</span>
                         </div>
                         ${
                           canCancel
                             ? `<button class="btn btn-danger btn-sm" data-act="cancel" data-id="${esc(t.id)}">إلغاء</button>`
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

    ws.innerHTML = html;
    const clr = $("#btn-clear-tasks", ws);
    if (clr) {
      clr.onclick = async () => {
        await api("clear_tasks");
        await reloadState();
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
            <h3>التخزين المؤقت وبيئة Adobe</h3>
            <p style="font-size:12.5px;color:var(--text-2);">
              حجم ملفات التثبيت المحمّلة مؤقتاً: <strong style="color:var(--text-1);direction:ltr;display:inline-block;">${esc(cacheSize)}</strong>
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">
              <button class="btn btn-ghost btn-sm" id="set-open-cache">فتح مجلد التحميلات</button>
              <button class="btn btn-danger btn-sm" id="set-clear-cache">تفريغ الملفات المؤقتة</button>
              <button class="btn btn-primary btn-sm" id="set-fix-cep">إصلاح PlayerDebugMode لـ Adobe</button>
            </div>
          </div>
        </div>
      </div>
    `;

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

    $("#set-open-cache", ws).onclick = () => api("open_cache_dir");
    $("#set-clear-cache", ws).onclick = async () => {
      UI.state = await api("clear_cache");
      render();
      toast("تم تنظيف مجلد التنزيلات المؤقتة");
    };
    $("#set-fix-cep", ws).onclick = async () => {
      await api("fix_cep");
      await reloadState();
      toast("تم تفعيل PlayerDebugMode لإصدارات CSXS 9–16 بنجاح");
    };
  }

  function renderDrawer() {
    const backdrop = $("#detail-backdrop");
    if (!UI.selectedId || !UI.state) {
      backdrop.hidden = true;
      return;
    }
    const it = (UI.state.items || []).find((x) => x.id === UI.selectedId);
    if (!it) {
      backdrop.hidden = true;
      return;
    }

    backdrop.hidden = false;
    const st = it.state || {};
    const drawer = $("#detail-drawer");
    drawer.style.setProperty("--drawer-accent", it.accent || "#38BDF8");

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
           <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-2);border:1px solid var(--line);padding:10px 12px;border-radius:8px;">
             <span style="font-size:12.5px;color:${st.ai_ready ? "#34D399" : "var(--warning)"}">
               ${st.ai_ready ? "✓ البيئة والنماذج جاهزة" : "⚠ يحتاج تشغيل أداة التجهيز لمرة واحدة بعد التثبيت"}
             </span>
             ${
               st.ai_setup_script
                 ? `<button class="btn btn-ghost btn-sm" id="dr-ai-setup">تشغيل أداة التجهيز</button>`
                 : ""
             }
           </div>
         </div>`
      : "";

    const subAppsHTML = (st.sub_apps || []).length
      ? `<div class="drawer-section">
           <h4>أدوات فرعية سريعة</h4>
           <div style="display:flex;flex-wrap:wrap;gap:8px;">
             ${st.sub_apps
               .map(
                 (sa, idx) =>
                   `<button class="btn btn-ghost btn-sm" data-sub-idx="${idx}">${esc(sa.label_ar)}</button>`
               )
               .join("")}
           </div>
         </div>`
      : "";

    const extraAssetsHTML = (it.extra_assets || []).length
      ? `<div class="drawer-section">
           <h4>ملحقات إضافية للتحميل</h4>
           <div style="display:flex;flex-wrap:wrap;gap:8px;">
             ${it.extra_assets
               .map(
                 (ea) =>
                   `<button class="btn btn-ghost btn-sm" data-ext-url="${esc(ea.url)}">${esc(ea.label_ar)}</button>`
               )
               .join("")}
           </div>
         </div>`
      : "";

    $("#drawer-body").innerHTML = `
      <div class="drawer-section">
        <h4>نبذة عن البرنامج</h4>
        <p style="font-size:13.5px;color:var(--text-1);line-height:1.65;">${esc(it.description_ar)}</p>
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
          <strong>${esc(fmtBytes(it.setup_size) || "متاح عبر GitHub")}</strong>
        </div>
        <div class="meta-cell">
          <span>البيئة المستهدفة</span>
          <strong>${esc((it.hosts || []).join(", "))}</strong>
        </div>
        <div class="meta-cell">
          <span>رمز الهوية</span>
          <strong style="color:${esc(it.accent)}">${esc(it.code)}</strong>
        </div>
      </div>

      ${aiSection}
      ${subAppsHTML}
      ${extraAssetsHTML}

      ${
        it.release_notes_ar
          ? `<div class="drawer-section">
               <h4>الجديد في هذا الإصدار</h4>
               <p style="font-size:12.5px;color:var(--text-2);background:var(--bg-2);border:1px solid var(--line);padding:10px 12px;border-radius:8px;">
                 ${esc(it.release_notes_ar)}
               </p>
             </div>`
          : ""
      }
    `;

    // Drawer footer actions
    const foot = $("#drawer-foot");
    const buttons = [];
    if (st.has_update) {
      buttons.push(`<button class="btn btn-warn" id="dr-install-silent">تحديث الآن (v${esc(it.version)})</button>`);
    } else if (st.installed) {
      const lbl = it.category === "adobe" ? "فتح في برنامج Adobe" : "تشغيل البرنامج";
      buttons.push(`<button class="btn btn-primary" id="dr-launch">${lbl}</button>`);
      buttons.push(`<button class="btn btn-ghost" id="dr-reinstall">إعادة تثبيت / إصلاح</button>`);
    } else {
      buttons.push(`<button class="btn btn-primary" id="dr-install-silent">تثبيت سريع</button>`);
      buttons.push(`<button class="btn btn-ghost" id="dr-install-wizard">معالج التثبيت التقليدي</button>`);
    }

    if (st.install_dir) {
      buttons.push(`<button class="btn btn-ghost" id="dr-open-dir">فتح مجلد التثبيت</button>`);
    }
    if (it.portable_url) {
      buttons.push(`<button class="btn btn-ghost" id="dr-portable">نسخة محمولة (Portable)</button>`);
    }
    if (st.installed && st.uninstall_cmd) {
      buttons.push(`<button class="btn btn-danger" id="dr-uninstall">إلغاء التثبيت</button>`);
    }

    foot.innerHTML = buttons.join("");

    // Bind Drawer Events
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

  function render() {
    if (!UI.state) return;
    updateChrome();
    if (UI.view === "updates") {
      renderUpdatesView();
    } else if (UI.view === "settings") {
      renderSettingsView();
    } else {
      renderCatalogView();
    }
    renderDrawer();
    manageTaskPolling();
  }

  async function reloadState() {
    UI.state = await api("state");
    render();
  }

  function manageTaskPolling() {
    const hasActive = activeTasks().length > 0;
    if (hasActive && !UI.pollTimer) {
      UI.pollTimer = setInterval(async () => {
        try {
          const tasks = await api("tasks");
          const prevActive = activeTasks().length;
          UI.state.tasks = tasks;
          const nowActive = activeTasks().length;
          if (prevActive > 0 && nowActive === 0) {
            UI.state = await api("state");
          }
          render();
        } catch (_) {}
      }, 650);
    } else if (!hasActive && UI.pollTimer) {
      clearInterval(UI.pollTimer);
      UI.pollTimer = null;
    }
  }

  async function triggerInstall(id, silent = null) {
    try {
      await api("install", { id, silent });
      toast("تمت إضافة البرنامج إلى طابور التنزيل والتثبيت");
      await reloadState();
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
        return reloadState();
      }
      if (act === "details") {
        UI.selectedId = id;
        return renderDrawer();
      }
    }

    const card = e.target.closest("[data-card-id]");
    if (card) {
      UI.selectedId = card.dataset.cardId;
      renderDrawer();
    }
  });

  // Sidebar & Topbar bindings
  $$("#main-nav .nav-btn").forEach((btn) => {
    btn.onclick = () => {
      UI.view = btn.dataset.view;
      render();
    };
  });

  $$("#status-filter .pill-btn").forEach((btn) => {
    btn.onclick = () => {
      UI.filter = btn.dataset.filter;
      render();
    };
  });

  $("#q-search").addEventListener("input", (e) => {
    UI.query = e.target.value;
    render();
  });

  $("#btn-refresh").onclick = async () => {
    const btn = $("#btn-refresh");
    btn.disabled = true;
    try {
      UI.state = await api("refresh_catalog");
      render();
      toast("تم تحديث الدليل وفحص البرامج المثبّتة");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      btn.disabled = false;
    }
  };

  $("#btn-update-all").onclick = async () => {
    try {
      const list = await api("update_all");
      toast(`بدأ تحديث ${list.length} برامج في الخلفية`);
      await reloadState();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  $("#btn-view-transfers").onclick = () => {
    UI.view = "updates";
    render();
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
      await reloadState();
      toast("تم تفعيل إضافات Adobe CEP (CSXS 9–16)");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  $("#btn-open-github").onclick = () => {
    api("open_url", { url: UI.state?.hub_repo_url || "https://github.com/ahmedqassimtv-commits/qassimz-hub" });
  };

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

  // ── Universal e.code Keyboard Shortcuts (Works on Arabic & English Layouts) ──
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
          render();
        }
        e.target.blur();
        return;
      }
    }

    // Search: Ctrl+F, Ctrl+K, or '/' outside input
    if ((ctrl && (code === "KeyF" || code === "KeyK")) || (!ctrl && !inInput && code === "Slash" && !e.shiftKey)) {
      e.preventDefault();
      const s = $("#q-search");
      s.focus();
      s.select();
      return;
    }

    // Refresh: Ctrl+R or F5
    if ((ctrl && code === "KeyR") || code === "F5") {
      e.preventDefault();
      $("#btn-refresh").click();
      return;
    }

    // Update All: Ctrl+U
    if (ctrl && code === "KeyU") {
      e.preventDefault();
      if (!$("#btn-update-all").hidden) $("#btn-update-all").click();
      return;
    }

    // Settings: Ctrl+,
    if (ctrl && code === "Comma") {
      e.preventDefault();
      UI.view = "settings";
      render();
      return;
    }

    if (inInput) return;

    // Shortcuts Help: Shift + / ('?')
    if (e.shiftKey && code === "Slash") {
      e.preventDefault();
      $("#shortcuts-modal").hidden = !$("#shortcuts-modal").hidden;
      return;
    }

    // View switching: 1..6
    const views = ["all", "desktop", "adobe", "installed", "updates", "settings"];
    if (!ctrl && !e.altKey && /^Digit[1-6]$/.test(code)) {
      const idx = Number(code.slice(5)) - 1;
      UI.view = views[idx];
      render();
      return;
    }

    // Grid Card Navigation with Arrow Keys & Enter
    const cards = $$(".app-card[data-card-id]");
    if (!cards.length || UI.selectedId) return;

    const curIdx = cards.indexOf(document.activeElement);
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(code)) {
      e.preventDefault();
      if (curIdx === -1) {
        cards[0].focus();
        return;
      }
      // RTL grid: ArrowLeft moves forward (+1), ArrowRight moves backward (-1)
      let cols = 1;
      if (cards.length > 1) {
        const y0 = cards[0].getBoundingClientRect().top;
        cols = cards.findIndex((c) => Math.abs(c.getBoundingClientRect().top - y0) > 10);
        if (cols <= 0) cols = cards.length;
      }
      let next = curIdx;
      if (code === "ArrowLeft") next = Math.min(cards.length - 1, curIdx + 1);
      if (code === "ArrowRight") next = Math.max(0, curIdx - 1);
      if (code === "ArrowDown") next = Math.min(cards.length - 1, curIdx + cols);
      if (code === "ArrowUp") next = Math.max(0, curIdx - cols);
      cards[next].focus();
      return;
    }

    if (code === "Enter" && curIdx !== -1 && !e.target.closest("button, a")) {
      e.preventDefault();
      UI.selectedId = cards[curIdx].dataset.cardId;
      renderDrawer();
    }
  });

  // Boot & Auto-Focus WebView2
  window.addEventListener("DOMContentLoaded", async () => {
    window.focus();
    try {
      await reloadState();
    } catch (e) {
      toast(e.message, "error");
    }
  });
})();
