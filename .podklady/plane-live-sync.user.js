// ==UserScript==
// @name         Plane Live Sync
// @namespace    plane-live-sync
// @version      1.2
// @description  Automatická detekce změn v Plane – zobrazí notifikaci nebo provede auto-refresh při změnách od ostatních uživatelů
// @match        https://plane.yourdomain.com/*
// @icon         https://plane.so/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PLANE LIVE SYNC – Tampermonkey Userscript                  ║
 * ║                                                              ║
 * ║  Tento skript periodicky kontroluje Plane API a pokud        ║
 * ║  detekuje změny od jiného uživatele, buď zobrazí             ║
 * ║  notifikační banner, nebo automaticky obnoví stránku.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * INSTALACE:
 * 1. Nainstalujte si Tampermonkey (Chrome/Edge/Firefox)
 * 2. Vytvořte nový userscript a vložte tento kód
 * 3. Změňte @match URL na vaši Plane doménu
 * 4. V CONFIG sekci nastavte PLANE_BASE_URL
 * 5. Uložte a hotovo – skript začne automaticky fungovat
 */

(function () {
  "use strict";

  // ═══════════════════════════════════════
  // CONFIG – Upravte dle vaší instalace
  // ═══════════════════════════════════════
  const CONFIG = {
    // Interval kontroly v milisekundách (10s = 10000)
    POLL_INTERVAL_MS: 10000,

    // Režim aktualizace:
    //   "banner"  – zobrazí banner "Nové změny" s tlačítkem pro refresh
    //   "auto"    – automaticky provede soft-reload dat (doporučeno pro board/kanban)
    //   "stealth" – tiché auto-obnovení bez jakéhokoliv UI
    MODE: "banner",

    // Počet posledních issues ke kontrole (čím méně, tím méně zatěžuje API)
    CHECK_COUNT: 20,

    // Zvuk při detekci změny (jen pro "banner" mód)
    PLAY_SOUND: true,

    // Debug mód – loguje do konzole
    DEBUG: false,

    // Barvy banneru
    BANNER_BG: "linear-gradient(135deg, #3b82f6, #6366f1)",
    BANNER_TEXT: "#ffffff",
  };

  // ═══════════════════════════════════════
  // STAV
  // ═══════════════════════════════════════
  let lastFingerprint = null;
  let pollTimer = null;
  let bannerElement = null;
  let isPolling = false;
  let consecutiveErrors = 0;
  let currentContext = null;
  let pauseUntil = 0; // timestamp – po vlastní akci krátce pausnout polling

  // ═══════════════════════════════════════
  // UTILITA – Debug log
  // ═══════════════════════════════════════
  function log(...args) {
    if (CONFIG.DEBUG) {
      console.log(
        "%c[Plane Live Sync]",
        "color: #6366f1; font-weight: bold;",
        ...args
      );
    }
  }

  // ═══════════════════════════════════════
  // DETEKCE KONTEXTU Z URL
  // ═══════════════════════════════════════
  function getPageContext() {
    const path = window.location.pathname;

    // /{workspace}/projects/{projectId}/issues/...
    const projectMatch = path.match(
      /^\/([^/]+)\/projects\/([^/]+)\/(issues|cycles|modules|views|pages)/
    );
    if (projectMatch) {
      return {
        type: "project",
        workspace: projectMatch[1],
        project: projectMatch[2],
        section: projectMatch[3],
      };
    }

    // /{workspace}/my-issues/...  (workspace-level view)
    const workspaceMatch = path.match(
      /^\/([^/]+)\/(my-issues|all-issues|active-cycles)/
    );
    if (workspaceMatch) {
      return {
        type: "workspace",
        workspace: workspaceMatch[1],
        section: workspaceMatch[2],
      };
    }

    return null;
  }

  // ═══════════════════════════════════════
  // API VOLÁNÍ
  // ═══════════════════════════════════════
  async function fetchIssuesFingerprint(ctx) {
    let url;

    if (ctx.type === "project") {
      // Projekt-level: fetchneme posledních N issues seřazených podle updated_at
      url = `/api/workspaces/${ctx.workspace}/projects/${ctx.project}/issues/?order_by=-updated_at&per_page=${CONFIG.CHECK_COUNT}&cursor=0:0:0`;
    } else if (ctx.type === "workspace") {
      // Workspace-level
      url = `/api/workspaces/${ctx.workspace}/issues/?order_by=-updated_at&per_page=${CONFIG.CHECK_COUNT}`;
    } else {
      return null;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Vytvoříme fingerprint z issue IDs + updated_at timestamps
      let issues = [];

      if (data.results && Array.isArray(data.results)) {
        // Paginated response
        issues = data.results;
      } else if (Array.isArray(data)) {
        issues = data;
      } else if (data.results && typeof data.results === "object") {
        // Grouped response (kanban apod.) – flatten
        Object.values(data.results).forEach((group) => {
          if (Array.isArray(group)) {
            issues.push(...group);
          }
        });
      }

      // Vytvoříme kompaktní fingerprint
      const fingerprint = issues
        .map((issue) => {
          const id = issue.id || "";
          const updated = issue.updated_at || "";
          const state = issue.state || "";
          const assignees = (issue.assignee_ids || issue.assignees || []).join(
            ","
          );
          const priority = issue.priority || "";
          const name = issue.name || "";
          return `${id}|${updated}|${state}|${assignees}|${priority}|${name}`;
        })
        .sort()
        .join("\n");

      consecutiveErrors = 0;
      return fingerprint;
    } catch (err) {
      consecutiveErrors++;
      log("Chyba při fetch:", err.message);

      // Pokud je příliš chyb po sobě, zpomalíme polling
      if (consecutiveErrors >= 5) {
        log("Příliš mnoho chyb, pauzuji na 60s");
        pauseUntil = Date.now() + 60000;
      }

      return null;
    }
  }

  // ═══════════════════════════════════════
  // ZVUK NOTIFIKACE
  // ═══════════════════════════════════════
  function playNotificationSound() {
    if (!CONFIG.PLAY_SOUND) return;
    try {
      const audioCtx = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Příjemný notification "ding"
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + 0.5
      );

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio context nemusí být dostupný
    }
  }

  // ═══════════════════════════════════════
  // UI – BANNER NOTIFIKACE
  // ═══════════════════════════════════════
  function showBanner() {
    if (bannerElement) return; // Už je zobrazen

    bannerElement = document.createElement("div");
    bannerElement.id = "plane-live-sync-banner";
    bannerElement.innerHTML = `
      <div style="
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%) translateY(-100px);
        z-index: 99999;
        background: ${CONFIG.BANNER_BG};
        color: ${CONFIG.BANNER_TEXT};
        padding: 10px 20px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 8px 32px rgba(99, 102, 241, 0.4), 0 2px 8px rgba(0,0,0,0.1);
        animation: plsBannerSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        backdrop-filter: blur(10px);
        cursor: default;
        user-select: none;
      " id="plane-live-sync-banner-inner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>Nové změny k dispozici</span>
        <button id="plane-live-sync-refresh" style="
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 4px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s;
          font-family: inherit;
        ">⟳ Obnovit</button>
        <button id="plane-live-sync-dismiss" style="
          background: none;
          border: none;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          font-size: 18px;
          padding: 0 4px;
          line-height: 1;
          transition: color 0.2s;
        ">✕</button>
      </div>
    `;

    // Přidáme CSS animaci
    const style = document.createElement("style");
    style.textContent = `
      @keyframes plsBannerSlideIn {
        from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
        to   { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      @keyframes plsBannerSlideOut {
        from { transform: translateX(-50%) translateY(0); opacity: 1; }
        to   { transform: translateX(-50%) translateY(-100px); opacity: 0; }
      }
      #plane-live-sync-refresh:hover {
        background: rgba(255,255,255,0.35) !important;
      }
      #plane-live-sync-dismiss:hover {
        color: rgba(255,255,255,1) !important;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(bannerElement);

    // Event listenery
    document
      .getElementById("plane-live-sync-refresh")
      .addEventListener("click", () => {
        hideBanner();
        doSoftReload();
      });

    document
      .getElementById("plane-live-sync-dismiss")
      .addEventListener("click", () => {
        hideBanner();
      });

    playNotificationSound();
  }

  function hideBanner() {
    if (!bannerElement) return;
    const inner = document.getElementById("plane-live-sync-banner-inner");
    if (inner) {
      inner.style.animation =
        "plsBannerSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
      setTimeout(() => {
        bannerElement?.remove();
        bannerElement = null;
      }, 300);
    } else {
      bannerElement.remove();
      bannerElement = null;
    }
  }

  // ═══════════════════════════════════════
  // STATUS INDICATOR (malá tečka)
  // ═══════════════════════════════════════
  let statusDot = null;

  function createStatusIndicator() {
    if (statusDot) return;

    statusDot = document.createElement("div");
    statusDot.id = "plane-live-sync-status";
    statusDot.title = "Plane Live Sync – aktivní";
    statusDot.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      z-index: 99998;
      opacity: 0.6;
      transition: all 0.3s;
      cursor: help;
      box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
    `;

    statusDot.addEventListener("mouseenter", () => {
      statusDot.style.opacity = "1";
      statusDot.style.transform = "scale(1.5)";
      statusDot.title = `Plane Live Sync\nMód: ${CONFIG.MODE}\nInterval: ${CONFIG.POLL_INTERVAL_MS / 1000}s\nKontext: ${currentContext ? `${currentContext.workspace}/${currentContext.project || currentContext.section}` : "žádný"}`;
    });

    statusDot.addEventListener("mouseleave", () => {
      statusDot.style.opacity = "0.6";
      statusDot.style.transform = "scale(1)";
    });

    document.body.appendChild(statusDot);
  }

  function updateStatusDot(state) {
    if (!statusDot) return;
    switch (state) {
      case "active":
        statusDot.style.background = "#22c55e";
        statusDot.style.boxShadow = "0 0 4px rgba(34, 197, 94, 0.4)";
        break;
      case "checking":
        statusDot.style.background = "#eab308";
        statusDot.style.boxShadow = "0 0 4px rgba(234, 179, 8, 0.4)";
        break;
      case "error":
        statusDot.style.background = "#ef4444";
        statusDot.style.boxShadow = "0 0 4px rgba(239, 68, 68, 0.4)";
        break;
      case "paused":
        statusDot.style.background = "#6b7280";
        statusDot.style.boxShadow = "none";
        break;
    }
  }

  // ═══════════════════════════════════════
  // SOFT RELOAD – obnoví data bez full-refresh
  // ═══════════════════════════════════════
  function doSoftReload() {
    log("Provádím soft-reload...");

    // Pokus #1: Next.js router refresh (interní)
    // Plane používá Next.js, takže zkusíme jejich interní router
    try {
      // Trigger navigace na stejnou URL – Next.js provede data refetch
      const currentUrl = window.location.href;

      // Metoda A: History API + popstate event
      window.history.replaceState(null, "", currentUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));

      // Metoda B: Klik na aktivní navigační prvek
      // Najdeme aktuální sidebar link a klikneme na něj
      const currentPath = window.location.pathname;
      const sidebarLinks = document.querySelectorAll(
        `a[href="${currentPath}"], a[href="${currentPath}/"]`
      );
      if (sidebarLinks.length > 0) {
        log("Klikám na sidebar link pro refresh");
        sidebarLinks[0].click();
        return;
      }
    } catch (e) {
      log("Next.js router refresh selhal:", e);
    }

    // Pokus #2: Fallback – plný page reload
    log("Fallback: plný reload");
    window.location.reload();
  }

  // ═══════════════════════════════════════
  // DETEKCE VLASTNÍCH AKCÍ
  // Pokud sami provedeme fetch/mutaci, krátce pausneme polling,
  // aby nedošlo k falešné detekci vlastní změny
  // ═══════════════════════════════════════
  function interceptFetchForOwnActions() {
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const method = args[1]?.method || "GET";

      // Pokud děláme POST/PATCH/PUT/DELETE na issues endpoint, pausneme
      if (
        ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase()) &&
        url.includes("/api/workspaces/") &&
        (url.includes("/issues") || url.includes("/work-items"))
      ) {
        log(`Detekována vlastní akce: ${method} ${url}`);
        pauseUntil = Date.now() + 5000; // 5s pauza po vlastní akci
      }

      return originalFetch.apply(this, args);
    };
  }

  // ═══════════════════════════════════════
  // HLAVNÍ POLLING LOOP
  // ═══════════════════════════════════════
  async function pollForChanges() {
    if (isPolling) return;

    // Kontrola pauzy
    if (Date.now() < pauseUntil) {
      log("Polling je pausnutý");
      updateStatusDot("paused");
      return;
    }

    // Kontrola kontextu – jsme na stránce s issues?
    const ctx = getPageContext();
    if (!ctx) {
      log("Nejsme na stránce s issues, přeskakuji polling");
      updateStatusDot("paused");
      lastFingerprint = null;
      currentContext = null;
      return;
    }

    // Pokud se změnil kontext (navigace na jiný projekt), reset fingerprint
    const ctxKey = JSON.stringify(ctx);
    if (JSON.stringify(currentContext) !== ctxKey) {
      log("Kontext se změnil, resetuji fingerprint");
      lastFingerprint = null;
      currentContext = ctx;
      hideBanner();
    }

    isPolling = true;
    updateStatusDot("checking");

    try {
      const fingerprint = await fetchIssuesFingerprint(ctx);

      if (fingerprint === null) {
        updateStatusDot("error");
        isPolling = false;
        return;
      }

      if (lastFingerprint === null) {
        // První načtení – uložíme jako baseline
        lastFingerprint = fingerprint;
        log("Baseline fingerprint uložen");
        updateStatusDot("active");
        isPolling = false;
        return;
      }

      if (fingerprint !== lastFingerprint) {
        log("🔄 Detekována změna!");
        lastFingerprint = fingerprint;

        switch (CONFIG.MODE) {
          case "banner":
            showBanner();
            break;

          case "auto":
            // Zobrazíme krátký flash indikátor
            showFlashIndicator();
            doSoftReload();
            break;

          case "stealth":
            doSoftReload();
            break;
        }
      } else {
        log("Žádné změny");
      }

      updateStatusDot("active");
    } catch (err) {
      log("Chyba v poll loop:", err);
      updateStatusDot("error");
    }

    isPolling = false;
  }

  // ═══════════════════════════════════════
  // FLASH INDIKÁTOR (pro auto mód)
  // ═══════════════════════════════════════
  function showFlashIndicator() {
    const flash = document.createElement("div");
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
      z-index: 99999;
      animation: plsFlash 1s ease-out forwards;
    `;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes plsFlash {
        0%   { transform: scaleX(0); transform-origin: left; opacity: 1; }
        50%  { transform: scaleX(1); transform-origin: left; opacity: 1; }
        100% { transform: scaleX(1); transform-origin: left; opacity: 0; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(flash);

    setTimeout(() => {
      flash.remove();
      style.remove();
    }, 1200);
  }

  // ═══════════════════════════════════════
  // URL CHANGE DETECTION
  // Plane je SPA (Next.js), takže sledujeme navigaci
  // ═══════════════════════════════════════
  function watchUrlChanges() {
    let lastUrl = window.location.href;

    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log("URL se změnila:", lastUrl);
        // Reset – nový kontext
        lastFingerprint = null;
        hideBanner();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Také sledujeme pushState/replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log("pushState navigace:", lastUrl);
        lastFingerprint = null;
        hideBanner();
      }
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log("replaceState navigace:", lastUrl);
        lastFingerprint = null;
        hideBanner();
      }
    };
  }

  // ═══════════════════════════════════════
  // VISIBILITY API – pauzujeme když je tab neaktivní
  // ═══════════════════════════════════════
  function watchVisibility() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        log("Tab neaktivní, pauzuji polling");
        stopPolling();
      } else {
        log("Tab aktivní, spouštím polling");
        // Okamžitá kontrola + restart
        lastFingerprint = null; // Force re-check
        startPolling();
      }
    });
  }

  // ═══════════════════════════════════════
  // START / STOP
  // ═══════════════════════════════════════
  function startPolling() {
    if (pollTimer) return;
    log(`Spouštím polling (interval: ${CONFIG.POLL_INTERVAL_MS}ms)`);
    pollForChanges(); // okamžitá první kontrola
    pollTimer = setInterval(pollForChanges, CONFIG.POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      log("Polling zastaven");
    }
  }

  // ═══════════════════════════════════════
  // INICIALIZACE
  // ═══════════════════════════════════════
  function init() {
    log("Inicializace Plane Live Sync v1.2");
    log(`Mód: ${CONFIG.MODE}, Interval: ${CONFIG.POLL_INTERVAL_MS}ms`);

    createStatusIndicator();
    interceptFetchForOwnActions();
    watchUrlChanges();
    watchVisibility();

    // Počkáme 3s, než se stránka kompletně načte
    setTimeout(() => {
      startPolling();
    }, 3000);
  }

  // ═══════════════════════════════════════
  // SPUŠTĚNÍ
  // ═══════════════════════════════════════
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
