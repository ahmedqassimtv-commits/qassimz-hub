/**
 * QASSIMZ Hub — Silent Background Auto-Update & Release Pill Controller (v1.6.3)
 * Inspired by Apple, Linear, Raycast, and Adobe Creative Cloud Desktop.
 *
 * Responsibilities:
 * 1. Silent automatic startup check (3s after launch), 30-min interval polling, and window focus re-check.
 * 2. Silent failure handling (console.debug only — never spams 404/network error toasts).
 * 3. Strict separation between `qassimz-hub` self-update and sub-app updates.
 * 4. Minimalist glassmorphic sidebar Update Pill (`#hub-update-pill`) with 3 human-friendly stages.
 */
(() => {
  "use strict";

  const UPDATER_CONFIG = {
    startupDelayMs: 3000,         // Check silently 3 seconds after launch
    pollIntervalMs: 30 * 60 * 1000, // Quiet background re-check every 30 minutes
    focusCooldownMs: 60 * 1000,   // Prevent rapid re-checks when alt-tabbing
  };

  let lastCheckTs = 0;
  let checking = false;
  let pollHandle = null;
  let dismissedVersion = "";

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function getBridge() {
    return window.__qhubUpdaterBridge || null;
  }

  /**
   * Perform a completely silent background check.
   * Never shows red toasts or technical 404 errors to the user.
   */
  async function checkSilently(reason = "auto") {
    const bridge = getBridge();
    if (!bridge || checking) return null;

    const now = Date.now();
    if (reason === "focus" && now - lastCheckTs < UPDATER_CONFIG.focusCooldownMs) {
      return null;
    }

    checking = true;
    lastCheckTs = now;
    try {
      const state = await bridge.refreshCatalogSilently();
      if (state) renderUpdatePill(state);
      return state;
    } catch (err) {
      console.debug("[QHub Updater] Background check skipped:", err?.message || err);
      return null;
    } finally {
      checking = false;
    }
  }

  /**
   * Map raw task/cc_updater state to 3 clean, human-friendly progress stages.
   */
  function resolveStageCopy(task, cc, isAr) {
    if (cc && cc.phase === "staged_ready") {
      return {
        stage: 3,
        pct: 100,
        label: isAr ? "تم التحديث بنجاح — أعد التشغيل" : "Update ready — Restart",
        readyToRestart: true,
      };
    }
    if (cc && cc.phase === "applied") {
      return {
        stage: 3,
        pct: 100,
        label: isAr ? "التطبيق محدّث لأحدث إصدار" : "Up to date",
        readyToRestart: false,
      };
    }
    if (task) {
      const pct = Math.max(2, Math.min(100, Number(task.progress || 0)));
      const st = String(task.stage || task.status || "");
      if (task.status === "completed" || st === "completed") {
        return {
          stage: 3,
          pct: 100,
          label: isAr ? "تم التحديث بنجاح — أعد التشغيل" : "Update ready — Restarting…",
          readyToRestart: false,
        };
      }
      if (st === "verifying" || st === "applying" || task.status === "installing" || pct >= 82) {
        return {
          stage: 2,
          pct,
          label: isAr ? "جارٍ التحقق والتجهيز..." : "Verifying & preparing…",
          readyToRestart: false,
        };
      }
      return {
        stage: 1,
        pct,
        label: isAr ? "جارٍ تنزيل التحديث..." : "Downloading update…",
        readyToRestart: false,
      };
    }
    if (cc && (cc.phase === "downloading" || cc.phase === "extracting")) {
      const pct = Math.max(2, Math.min(99, Number(cc.progress || 0)));
      const isVerify = cc.phase === "extracting" || pct >= 82;
      return {
        stage: isVerify ? 2 : 1,
        pct,
        label: isVerify
          ? (isAr ? "جارٍ التحقق والتجهيز..." : "Verifying & preparing…")
          : (isAr ? "جارٍ تنزيل التحديث..." : "Downloading update…"),
        readyToRestart: false,
      };
    }
    return null;
  }

  /**
   * Render the minimalist Apple/Linear-style glassmorphic sidebar Update Pill (#hub-update-pill).
   */
  function renderUpdatePill(state) {
    const host = document.getElementById("hub-update-pill");
    const bridge = getBridge();
    if (!host || !state || !bridge) return;

    const isAr = bridge.getLang() === "ar";
    const tasks = state.tasks || [];
    const hubTask = tasks.find(
      (t) => t.id === "qassimz-hub" && ["queued", "downloading", "installing", "completed"].includes(t.status)
    );
    const cc = state.cc_updater || {};
    const stageInfo = resolveStageCopy(hubTask, cc, isAr);

    // 1. Active download / verification / ready-to-restart progress state
    if (stageInfo && (hubTask || cc.phase === "downloading" || cc.phase === "extracting" || cc.phase === "staged_ready")) {
      host.hidden = false;
      host.className = `sb-update-pill is-progress ${stageInfo.readyToRestart ? "is-ready" : ""}`;
      host.innerHTML = `
        <div class="sup-row">
          <span class="sup-dot ${stageInfo.stage === 3 ? "done" : "live"}"></span>
          <span class="sup-text">${esc(stageInfo.label)}</span>
          ${stageInfo.readyToRestart
            ? `<button class="sup-cta" id="btn-sup-restart">${isAr ? "إعادة التشغيل" : "Restart"}</button>`
            : `<span class="sup-pct">${stageInfo.pct}%</span>`}
        </div>
        <div class="sup-track"><div class="sup-fill" style="transform:scaleX(${(stageInfo.pct / 100).toFixed(3)})"></div></div>
      `;
      const restartBtn = host.querySelector("#btn-sup-restart");
      if (restartBtn) {
        restartBtn.onclick = () => bridge.applyStagedUpdate();
      }
      return;
    }

    // 2. Valid Hub update available (and not dismissed for this version)
    const hasHubUpd = Boolean(state.hub_has_update);
    const remoteVer = String(state.hub_remote_version || "");
    if (hasHubUpd && remoteVer && dismissedVersion !== remoteVer) {
      host.hidden = false;
      host.className = "sb-update-pill";
      const label = isAr ? `تحديث جديد متاح v${remoteVer}` : `Update available v${remoteVer}`;
      const btnLbl = isAr ? "تحديث الآن" : "Update Now";
      host.innerHTML = `
        <div class="sup-row">
          <span class="sup-dot live"></span>
          <span class="sup-text">${esc(label)}</span>
        </div>
        <div class="sup-actions">
          <button class="sup-cta" id="btn-sup-now">${esc(btnLbl)}</button>
          <button class="sup-dismiss" id="btn-sup-dismiss" aria-label="${isAr ? "إخفاء" : "Dismiss"}">✕</button>
        </div>
      `;
      const nowBtn = host.querySelector("#btn-sup-now");
      const disBtn = host.querySelector("#btn-sup-dismiss");
      if (nowBtn) {
        nowBtn.onclick = async () => {
          nowBtn.disabled = true;
          try {
            await bridge.startHubSelfUpdate();
          } catch (_) {
            bridge.showFriendlyError(
              isAr ? "تعذّر إكمال التحديث حالياً، سنحاول لاحقاً." : "Couldn't complete the update right now. We'll try again later."
            );
            nowBtn.disabled = false;
          }
        };
      }
      if (disBtn) {
        disBtn.onclick = () => {
          dismissedVersion = remoteVer;
          host.hidden = true;
        };
      }
      return;
    }

    // 3. Otherwise keep the pill cleanly hidden (zero visual noise)
    host.hidden = true;
  }

  function startScheduler() {
    // 1. Silent automatic check 3 seconds after launch
    setTimeout(() => checkSilently("startup"), UPDATER_CONFIG.startupDelayMs);

    // 2. Quiet interval polling every 30 minutes
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = setInterval(() => {
      if (document.visibilityState === "visible") {
        checkSilently("interval");
      }
    }, UPDATER_CONFIG.pollIntervalMs);

    // 3. Quiet re-check when app window regains focus (with 60s cooldown)
    window.addEventListener("focus", () => checkSilently("focus"), { passive: true });
  }

  window.QHubUpdater = {
    config: UPDATER_CONFIG,
    checkSilently,
    renderUpdatePill,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startScheduler, { once: true });
  } else {
    startScheduler();
  }
})();
