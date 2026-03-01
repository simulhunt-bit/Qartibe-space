"use strict";

(() => {
  const AUTH_SESSION_KEY = "qartibe_user_auth";
  const USER_PROFILE_KEY = "qartibe_user_profile";
  const AUTH_EVENT_NAME = "qs-auth-state";
  const AUTH_CONFIG_URL = "content/auth-config.json";
  const TTL_MS = 12 * 60 * 60 * 1000;
  const AUTH_MOUNT_ID = "qsAuthMount";
  const DASHBOARD_ID = "qsUserDashboard";
  const DASHBOARD_STYLE_ID = "qsUserDashboardStyles";
  const INQUIRY_GATE_ID = "qsInquirySignInGate";
  const INQUIRY_GATE_STYLE_ID = "qsInquirySignInGateStyles";
  const INQUIRY_GATE_OPEN_CLASS = "qs-inquiry-gate-open";
  const LIVE_TOAST_STYLE_ID = "qsLiveToastStyles";
  const LIVE_TOAST_ID = "qsLiveToast";
  const PENDING_INQUIRY_TOAST_KEY = "qartibe_pending_inquiry_toast";
  const LIVE_INQUIRY_BROADCAST_KEY = "qartibe_live_inquiry_event";
  const COUNTER_NAMESPACE = "qartibe-space-services";
  const COUNTER_API_BASE = "https://api.counterapi.dev/v1";
  const DASHBOARD_OPEN_CLASS = "qs-dashboard-open";
  const GOOGLE_SCRIPT_ID = "qsGoogleIdentityScript";
  let activityTrackingBound = false;
  let liveInquiryBroadcastBound = false;
  let dashboardEscapeBound = false;
  let pendingInquiryAction = null;
  let googleInitStarted = false;
  let googleReady = false;
  let openDashboardAfterGoogleAuth = false;

  const toCleanString = (value, max = 80) => String(value || "").trim().slice(0, max);
  const toSafeHttpUrl = (value) => {
    const url = toCleanString(value, 500);
    if (!url) return "";
    return /^https?:\/\//i.test(url) ? url : "";
  };

  const ensureLiveToastStyles = () => {
    if (document.getElementById(LIVE_TOAST_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = LIVE_TOAST_STYLE_ID;
    style.textContent = `
      .qs-live-toast {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 1400;
        min-width: 220px;
        max-width: min(420px, calc(100vw - 32px));
        border-radius: 12px;
        border: 1px solid #d5dbe6;
        background: #ffffff;
        color: #10243b;
        box-shadow: 0 16px 38px rgba(10, 22, 38, 0.2);
        padding: 10px 12px;
        line-height: 1.4;
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
        transition: opacity 0.22s ease, transform 0.22s ease;
      }
      .qs-live-toast[data-open="true"] {
        opacity: 1;
        transform: translateY(0);
      }
      .qs-live-toast-title {
        display: block;
        margin: 0 0 3px;
        font-size: 0.8rem;
        color: #5a6c83;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .qs-live-toast-message {
        margin: 0;
        font-size: 0.92rem;
      }
    `;
    document.head.appendChild(style);
  };

  const ensureLiveToastNode = () => {
    ensureLiveToastStyles();
    let toast = document.getElementById(LIVE_TOAST_ID);
    if (toast) return toast;
    toast = document.createElement("aside");
    toast.id = LIVE_TOAST_ID;
    toast.className = "qs-live-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    toast.innerHTML = `
      <small class="qs-live-toast-title">Live inquiry</small>
      <p class="qs-live-toast-message"></p>
    `;
    document.body.appendChild(toast);
    return toast;
  };

  const maskLiveUserName = (value) => {
    const clean = toCleanString(value, 90);
    const firstWord = clean ? String(clean).split(/\s+/)[0] : "";
    const initial = firstWord ? firstWord.charAt(0).toLowerCase() : "s";
    return `${initial}***`;
  };

  const getLiveInquiryUserMask = () => {
    const profile = readProfile();
    const source = profile.name || profile.email || "s";
    return maskLiveUserName(source);
  };

  const showLiveInquiryToast = (payload) => {
    const toast = ensureLiveToastNode();
    const messageNode = toast.querySelector(".qs-live-toast-message");
    if (!messageNode) return;
    const maskedName = toCleanString(payload?.maskedName, 15) || "s***";
    const title = toCleanString(payload?.title, 120) || "Service";
    messageNode.textContent = `${maskedName} just click and inqure "${title}".`;
    toast.dataset.open = "true";
    const existingTimer = Number(toast.dataset.timerId);
    if (Number.isFinite(existingTimer) && existingTimer > 0) {
      window.clearTimeout(existingTimer);
    }
    const timerId = window.setTimeout(() => {
      toast.dataset.open = "false";
      toast.dataset.timerId = "";
    }, 3600);
    toast.dataset.timerId = String(timerId);
  };

  const rememberPendingInquiryToast = (payload) => {
    try {
      sessionStorage.setItem(PENDING_INQUIRY_TOAST_KEY, JSON.stringify(payload || {}));
    } catch {}
  };

  const consumePendingInquiryToast = () => {
    try {
      const raw = sessionStorage.getItem(PENDING_INQUIRY_TOAST_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PENDING_INQUIRY_TOAST_KEY);
      const parsed = JSON.parse(raw);
      showLiveInquiryToast(parsed);
    } catch {
      try {
        sessionStorage.removeItem(PENDING_INQUIRY_TOAST_KEY);
      } catch {}
    }
  };

  const broadcastLiveInquiry = (payload) => {
    try {
      localStorage.setItem(
        LIVE_INQUIRY_BROADCAST_KEY,
        JSON.stringify({
          maskedName: toCleanString(payload?.maskedName, 15),
          title: toCleanString(payload?.title, 120),
          at: Date.now()
        })
      );
      localStorage.removeItem(LIVE_INQUIRY_BROADCAST_KEY);
    } catch {}
  };

  const bindLiveInquiryBroadcast = () => {
    if (liveInquiryBroadcastBound) return;
    liveInquiryBroadcastBound = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== LIVE_INQUIRY_BROADCAST_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        showLiveInquiryToast(payload);
      } catch {}
    });
  };

  const shouldRememberToastForNavigation = (link) => {
    if (!(link instanceof HTMLAnchorElement)) return false;
    const rawHref = toCleanString(link.getAttribute("href"), 400);
    if (!rawHref || rawHref.startsWith("#")) return false;
    try {
      const targetUrl = new URL(link.href, window.location.href);
      return targetUrl.origin === window.location.origin && targetUrl.pathname !== window.location.pathname;
    } catch {
      return false;
    }
  };

  const getServiceTitleFromInquireLink = (link) => {
    const fromData = toCleanString(link?.getAttribute("data-service-title"), 120);
    if (fromData) return fromData;
    const card = link?.closest("article");
    const heading = card?.querySelector("h3, h2");
    return toCleanString(heading?.textContent, 120);
  };

  const readAuthConfig = async () => {
    try {
      const response = await fetch(AUTH_CONFIG_URL, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  };

  const decodeBase64Url = (value) => {
    try {
      const normalized = String(value || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const padLen = normalized.length % 4;
      const padded = `${normalized}${padLen ? "=".repeat(4 - padLen) : ""}`;
      return atob(padded);
    } catch {
      return "";
    }
  };

  const decodeJwtPayload = (jwt) => {
    const parts = String(jwt || "").split(".");
    if (parts.length < 2) return null;
    try {
      return JSON.parse(decodeBase64Url(parts[1]));
    } catch {
      return null;
    }
  };

  const loadGoogleIdentityScript = async () => {
    if (window.google?.accounts?.id) return true;

    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
      return new Promise((resolve) => {
        existing.addEventListener("load", () => resolve(Boolean(window.google?.accounts?.id)), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
      });
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return new Promise((resolve) => {
      script.addEventListener("load", () => resolve(Boolean(window.google?.accounts?.id)), { once: true });
      script.addEventListener("error", () => resolve(false), { once: true });
    });
  };

  const readSession = () => {
    try {
      const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.expiresAt || Date.now() >= Number(parsed.expiresAt)) {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return null;
      }
      return parsed;
    } catch {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
  };

  const readProfile = () => {
    const fallback = { name: "", email: "", avatarUrl: "", location: "", number: "", lastAction: null };
    try {
      const raw = localStorage.getItem(USER_PROFILE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return fallback;
      const name = toCleanString(parsed.name, 90);
      const email = toCleanString(parsed.email, 140);
      const avatarUrl = toSafeHttpUrl(parsed.avatarUrl);
      const location = toCleanString(parsed.location, 90);
      const number = toCleanString(parsed.number, 30);
      const label = toCleanString(parsed?.lastAction?.label, 140);
      const at = Number(parsed?.lastAction?.at);
      const hasAction = Boolean(label);
      return {
        name,
        email,
        avatarUrl,
        location,
        number,
        lastAction: hasAction
          ? {
              label,
              at: Number.isFinite(at) ? at : Date.now()
            }
          : null
      };
    } catch {
      localStorage.removeItem(USER_PROFILE_KEY);
      return fallback;
    }
  };

  const writeProfile = (profile) => {
    const safe = {
      name: toCleanString(profile?.name, 90),
      email: toCleanString(profile?.email, 140),
      avatarUrl: toSafeHttpUrl(profile?.avatarUrl),
      location: toCleanString(profile?.location, 90),
      number: toCleanString(profile?.number, 30),
      lastAction: profile?.lastAction?.label
        ? {
            label: toCleanString(profile.lastAction.label, 140),
            at: Number.isFinite(Number(profile?.lastAction?.at)) ? Number(profile.lastAction.at) : Date.now()
          }
        : null
    };
    try {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(safe));
    } catch {}
  };

  const formatLastAction = (lastAction) => {
    if (!lastAction?.label) return "No recent inquiry yet.";
    const actionTime = new Date(Number(lastAction.at) || Date.now());
    if (Number.isNaN(actionTime.getTime())) return lastAction.label;
    const readableTime = actionTime.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
    return `${lastAction.label} (${readableTime})`;
  };

  const setRecentInquiry = (label) => {
    const profile = readProfile();
    profile.lastAction = {
      label: toCleanString(label || "Inquire", 140) || "Inquire",
      at: Date.now()
    };
    writeProfile(profile);
    updateDashboardContents();
    renderAuth();
  };

  const ensureInquiryGateStyles = () => {
    if (document.getElementById(INQUIRY_GATE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = INQUIRY_GATE_STYLE_ID;
    style.textContent = `
      .qs-inquiry-gate-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1350;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(12, 25, 44, 0.58);
      }
      .qs-inquiry-gate-panel {
        width: min(420px, 100%);
        border-radius: 16px;
        border: 1px solid #d7dbe3;
        background: #ffffff;
        color: #11243d;
        padding: 18px 18px 16px;
        box-shadow: 0 26px 56px rgba(10, 23, 40, 0.22);
        text-align: center;
        position: relative;
      }
      .qs-inquiry-gate-close {
        position: absolute;
        right: 10px;
        top: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        border: 1px solid #cad2de;
        background: #ffffff;
        color: #11243d;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      .qs-inquiry-gate-close:hover {
        background: #f5f8fc;
      }
      .qs-inquiry-gate-logo {
        width: 54px;
        height: 54px;
        border-radius: 999px;
        border: 1px solid #d5dce8;
        background: #eef4ff;
        object-fit: cover;
      }
      .qs-inquiry-gate-title {
        margin: 12px 0 6px;
        font-size: 1.25rem;
      }
      .qs-inquiry-gate-copy {
        margin: 0 0 14px;
        color: #4f647f;
        font-size: 0.95rem;
      }
      .qs-inquiry-gate-google {
        width: 100%;
        min-height: 42px;
        border-radius: 10px;
        border: 1px solid #cad2de;
        background: #ffffff;
        color: #11243d;
        font-weight: 600;
      }
      .qs-inquiry-gate-google:hover {
        background: #f7faff;
      }
      .qs-inquiry-gate-status {
        margin: 8px 0 0;
        min-height: 19px;
        font-size: 0.86rem;
        color: #5a6b82;
      }
      body.qs-inquiry-gate-open {
        overflow: hidden;
      }
    `;
    document.head.appendChild(style);
  };

  const ensureInquiryGate = () => {
    let backdrop = document.getElementById(INQUIRY_GATE_ID);
    if (backdrop) return backdrop;
    ensureInquiryGateStyles();
    backdrop = document.createElement("div");
    backdrop.id = INQUIRY_GATE_ID;
    backdrop.className = "qs-inquiry-gate-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="qs-inquiry-gate-panel" role="dialog" aria-modal="true" aria-labelledby="qsInquiryGateTitle">
        <button type="button" class="qs-inquiry-gate-close" data-inquiry-gate-close aria-label="Close sign-in popup">&times;</button>
        <img class="qs-inquiry-gate-logo" src="logo.png" alt="Qartibe Space logo" width="54" height="54" />
        <h2 id="qsInquiryGateTitle" class="qs-inquiry-gate-title">Qartibe Space</h2>
        <p class="qs-inquiry-gate-copy">Sign in with Google before you continue inquiry.</p>
        <button type="button" class="menu-toggle qs-inquiry-gate-google" data-inquiry-gate-google>Continue with Google</button>
        <p class="qs-inquiry-gate-status" data-inquiry-gate-status aria-live="polite"></p>
      </section>
    `;

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeInquiryGate(true);
      }
    });

    const closeBtn = backdrop.querySelector("[data-inquiry-gate-close]");
    closeBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeInquiryGate(true);
    });

    const googleBtn = backdrop.querySelector("[data-inquiry-gate-google]");
    googleBtn?.addEventListener("click", () => {
      const status = backdrop.querySelector("[data-inquiry-gate-status]");
      if (status) status.textContent = "";
      const started = requestSignInFlow({
        shouldOpenDashboard: false,
        requireGoogle: true,
        onPromptUnavailable: () => {
          const latestStatus = backdrop.querySelector("[data-inquiry-gate-status]");
          if (latestStatus) latestStatus.textContent = "Google prompt unavailable. Please try again.";
        }
      });
      if (!started && status) {
        status.textContent = "Preparing Google sign-in. Please tap again.";
        initGoogleOneTap().catch(() => {});
      }
    });

    document.body.appendChild(backdrop);
    return backdrop;
  };

  const openInquiryGate = () => {
    const backdrop = ensureInquiryGate();
    const status = backdrop.querySelector("[data-inquiry-gate-status]");
    if (status) status.textContent = "";
    backdrop.hidden = false;
    document.body.classList.add(INQUIRY_GATE_OPEN_CLASS);
    const button = backdrop.querySelector("[data-inquiry-gate-google]");
    if (button instanceof HTMLElement) {
      window.setTimeout(() => button.focus(), 0);
    }
  };

  const closeInquiryGate = (clearPending = false) => {
    const backdrop = document.getElementById(INQUIRY_GATE_ID);
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.classList.remove(INQUIRY_GATE_OPEN_CLASS);
    if (clearPending) pendingInquiryAction = null;
  };

  const recordSharedInquiryClick = (key) => {
    const safeKey = toCleanString(key, 100);
    if (!safeKey) return;
    const url = `${COUNTER_API_BASE}/${encodeURIComponent(COUNTER_NAMESPACE)}/${encodeURIComponent(safeKey)}/up`;
    fetch(url, { cache: "no-store", keepalive: true }).catch(() => {});
  };

  const buildInquiryAction = (link) => {
    const key = toCleanString(link?.getAttribute("data-service-key"), 100);
    const label = toCleanString(link?.textContent, 100) || "Inquire";
    const title = getServiceTitleFromInquireLink(link) || "Service";
    const rememberToastForNavigation = shouldRememberToastForNavigation(link);
    let href = "";
    if (link instanceof HTMLAnchorElement) {
      href = toSafeHttpUrl(link.href);
    }
    return { key, label, title, rememberToastForNavigation, href };
  };

  const captureInquiryActivity = (action) => {
    const livePayload = {
      maskedName: getLiveInquiryUserMask(),
      title: toCleanString(action?.title, 120) || "Service"
    };
    showLiveInquiryToast(livePayload);
    broadcastLiveInquiry(livePayload);
    if (action?.rememberToastForNavigation) {
      rememberPendingInquiryToast(livePayload);
    }
    if (action?.key) {
      setRecentInquiry(`Inquire: ${action.key}`);
      return;
    }
    setRecentInquiry(`Inquire: ${toCleanString(action?.label, 100) || "Inquire"}`);
  };

  const continueInquiryNavigation = (href) => {
    const safeHref = toSafeHttpUrl(href);
    if (!safeHref) return;
    try {
      const targetUrl = new URL(safeHref, window.location.href);
      if (targetUrl.origin !== window.location.origin) return;
      if (targetUrl.pathname === window.location.pathname) {
        if (!targetUrl.hash) return;
        if (window.location.hash !== targetUrl.hash) {
          window.location.hash = targetUrl.hash;
          return;
        }
        const anchor = document.querySelector(targetUrl.hash);
        if (anchor instanceof HTMLElement) {
          anchor.scrollIntoView({ block: "start" });
        }
        return;
      }
      window.location.href = targetUrl.href;
    } catch {}
  };

  const continuePendingInquiry = () => {
    const pending = pendingInquiryAction;
    if (!pending) return;
    pendingInquiryAction = null;
    closeInquiryGate(false);
    captureInquiryActivity(pending);
    if (pending.key) {
      recordSharedInquiryClick(pending.key);
    }
    continueInquiryNavigation(pending.href);
  };

  const ensureDashboardStyles = () => {
    if (document.getElementById(DASHBOARD_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = DASHBOARD_STYLE_ID;
    style.textContent = `
      .qs-dashboard-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1300;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(12, 25, 44, 0.58);
      }
      .qs-dashboard-panel {
        width: min(520px, 100%);
        max-height: calc(100vh - 36px);
        overflow: auto;
        border-radius: 16px;
        border: 1px solid #d7dbe3;
        background: #ffffff;
        color: #11243d;
        padding: 18px;
        box-shadow: 0 26px 56px rgba(10, 23, 40, 0.22);
      }
      .qs-dashboard-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .qs-dashboard-header h2 {
        margin: 0;
        font-size: 1.2rem;
      }
      .qs-dashboard-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 36px;
        min-height: 36px;
        border-radius: 10px;
        border: 1px solid #cad2de;
        background: #ffffff;
        color: #11243d;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      .qs-dashboard-close:hover {
        background: #f5f8fc;
      }
      .qs-dashboard-google {
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid #e1e6ef;
        border-radius: 10px;
        padding: 10px;
        background: #f9fbff;
      }
      .qs-dashboard-google img {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        object-fit: cover;
        border: 1px solid #d7dbe3;
      }
      .qs-dashboard-google-identity {
        display: grid;
        gap: 2px;
      }
      .qs-dashboard-google-title {
        margin: 0;
        font-size: 0.95rem;
      }
      .qs-dashboard-google-email {
        margin: 0;
        color: #5a6b82;
        font-size: 0.85rem;
        word-break: break-word;
      }
      .qs-dashboard-grid {
        display: grid;
        gap: 10px;
      }
      .qs-dashboard-label {
        display: grid;
        gap: 6px;
        font-size: 0.92rem;
      }
      .qs-dashboard-label input {
        width: 100%;
        border: 1px solid #cad2de;
        border-radius: 10px;
        padding: 9px 10px;
        font: inherit;
      }
      .qs-dashboard-last-action {
        margin: 0;
        padding: 10px;
        border-radius: 10px;
        background: #f5f8fc;
        border: 1px solid #e1e6ef;
        color: #41556f;
      }
      .qs-dashboard-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 14px;
      }
      .qs-dashboard-status {
        margin: 0;
        min-height: 20px;
        color: #41556f;
        font-size: 0.9rem;
      }
      .qs-profile-button {
        background: #25537f;
      }
      .qs-profile-chip {
        align-items: center;
        gap: 8px;
      }
      .qs-profile-avatar {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        object-fit: cover;
        border: 1px solid rgba(255, 255, 255, 0.38);
      }
      body.qs-dashboard-open {
        overflow: hidden;
      }
    `;
    document.head.appendChild(style);
  };

  const closeDashboard = () => {
    const modal = document.getElementById(DASHBOARD_ID);
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove(DASHBOARD_OPEN_CLASS);
  };

  const completeSignIn = ({ name = "", email = "", avatarUrl = "" } = {}) => {
    const profile = readProfile();
    if (!profile.name && name) {
      profile.name = toCleanString(name, 90);
    }
    if (email) profile.email = toCleanString(email, 140);
    if (avatarUrl) profile.avatarUrl = toSafeHttpUrl(avatarUrl);
    writeProfile(profile);
    writeSession(true);
    emitAuthState(true);
    renderAuth();
  };

  const fallbackSignIn = (shouldOpenDashboard = false) => {
    completeSignIn();
    if (shouldOpenDashboard) openDashboard();
  };

  const handleGoogleCredential = (response) => {
    const credential = String(response?.credential || "");
    const payload = decodeJwtPayload(credential);
    const displayName =
      toCleanString(payload?.name, 90) ||
      toCleanString(payload?.given_name, 90) ||
      toCleanString(payload?.email, 90);
    const email = toCleanString(payload?.email, 140);
    const avatarUrl = toSafeHttpUrl(payload?.picture);
    completeSignIn({ name: displayName, email, avatarUrl });
    continuePendingInquiry();
    if (openDashboardAfterGoogleAuth) {
      openDashboardAfterGoogleAuth = false;
      openDashboard();
    }
  };

  const requestGooglePrompt = (shouldOpenDashboard = false, onUnavailable = null) => {
    if (!googleReady || !window.google?.accounts?.id) return false;
    openDashboardAfterGoogleAuth = shouldOpenDashboard;
    try {
      window.google.accounts.id.prompt((notification) => {
        const isNotDisplayed =
          typeof notification?.isNotDisplayed === "function" && notification.isNotDisplayed();
        const isSkipped = typeof notification?.isSkippedMoment === "function" && notification.isSkippedMoment();
        if ((isNotDisplayed || isSkipped) && typeof onUnavailable === "function") {
          onUnavailable(notification);
        }
      });
      return true;
    } catch {
      return false;
    }
  };

  const requestSignInFlow = (options = false) => {
    const normalized =
      typeof options === "boolean"
        ? { shouldOpenDashboard: options, requireGoogle: false }
        : {
            shouldOpenDashboard: Boolean(options?.shouldOpenDashboard),
            requireGoogle: Boolean(options?.requireGoogle),
            onPromptUnavailable: typeof options?.onPromptUnavailable === "function" ? options.onPromptUnavailable : null
          };
    const fallbackFromPrompt = () => {
      openDashboardAfterGoogleAuth = false;
      if (normalized.requireGoogle) {
        if (typeof normalized.onPromptUnavailable === "function") {
          normalized.onPromptUnavailable();
        }
        return;
      }
      fallbackSignIn(normalized.shouldOpenDashboard);
      continuePendingInquiry();
    };
    if (requestGooglePrompt(normalized.shouldOpenDashboard, fallbackFromPrompt)) return true;
    if (normalized.requireGoogle) return false;
    fallbackSignIn(normalized.shouldOpenDashboard);
    continuePendingInquiry();
    return true;
  };

  const initGoogleOneTap = async () => {
    if (googleInitStarted || Boolean(readSession())) return;
    googleInitStarted = true;

    const config = await readAuthConfig();
    const clientId = toCleanString(config?.googleClientId, 220);
    if (!clientId) return;

    const loaded = await loadGoogleIdentityScript();
    if (!loaded || !window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: "signin"
      });
      googleReady = true;
      window.google.accounts.id.prompt();
    } catch {
      googleReady = false;
    }
  };

  const ensureDashboard = () => {
    let backdrop = document.getElementById(DASHBOARD_ID);
    if (backdrop) return backdrop;
    ensureDashboardStyles();
    backdrop = document.createElement("div");
    backdrop.id = DASHBOARD_ID;
    backdrop.className = "qs-dashboard-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="qs-dashboard-panel" role="dialog" aria-modal="true" aria-labelledby="qsDashboardTitle">
        <header class="qs-dashboard-header">
          <h2 id="qsDashboardTitle">User Dashboard</h2>
          <button type="button" class="qs-dashboard-close" data-dashboard-close aria-label="Close dashboard">&times;</button>
        </header>
        <div class="qs-dashboard-grid">
          <div class="qs-dashboard-google">
            <img src="" alt="Google profile photo" data-dashboard-avatar hidden />
            <div class="qs-dashboard-google-identity">
              <p class="qs-dashboard-google-title" data-dashboard-title>Profile</p>
              <p class="qs-dashboard-google-email" data-dashboard-email></p>
            </div>
          </div>
          <p class="qs-dashboard-last-action"><strong>Recent inquiry:</strong> <span data-dashboard-last-action></span></p>
          <label class="qs-dashboard-label">
            Name
            <input type="text" maxlength="90" data-dashboard-field="name" placeholder="Your name" />
          </label>
          <label class="qs-dashboard-label">
            Location
            <input type="text" maxlength="90" data-dashboard-field="location" placeholder="City, Country" />
          </label>
          <label class="qs-dashboard-label">
            Number
            <input type="text" maxlength="30" data-dashboard-field="number" placeholder="+880..." />
          </label>
        </div>
        <div class="qs-dashboard-footer">
          <button type="button" class="menu-toggle" data-dashboard-save>Save changes</button>
          <p class="qs-dashboard-status" data-dashboard-status aria-live="polite"></p>
        </div>
      </section>
    `;

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeDashboard();
      }
    });

    const closeBtn = backdrop.querySelector("[data-dashboard-close]");
    closeBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDashboard();
    });

    const saveBtn = backdrop.querySelector("[data-dashboard-save]");
    saveBtn?.addEventListener("click", () => {
      const profile = readProfile();
      const nameInput = backdrop.querySelector('[data-dashboard-field="name"]');
      const locationInput = backdrop.querySelector('[data-dashboard-field="location"]');
      const numberInput = backdrop.querySelector('[data-dashboard-field="number"]');
      profile.name = toCleanString(nameInput?.value, 90);
      profile.location = toCleanString(locationInput?.value, 90);
      profile.number = toCleanString(numberInput?.value, 30);
      writeProfile(profile);
      const status = backdrop.querySelector("[data-dashboard-status]");
      if (status) status.textContent = "Dashboard saved.";
      renderAuth();
    });

    if (!dashboardEscapeBound) {
      dashboardEscapeBound = true;
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        closeDashboard();
        closeInquiryGate(true);
      });
    }

    document.body.appendChild(backdrop);
    return backdrop;
  };

  const updateDashboardContents = () => {
    const backdrop = document.getElementById(DASHBOARD_ID);
    if (!backdrop) return;
    const profile = readProfile();
    const nameInput = backdrop.querySelector('[data-dashboard-field="name"]');
    const locationInput = backdrop.querySelector('[data-dashboard-field="location"]');
    const numberInput = backdrop.querySelector('[data-dashboard-field="number"]');
    const actionNode = backdrop.querySelector("[data-dashboard-last-action]");
    const titleNode = backdrop.querySelector("[data-dashboard-title]");
    const emailNode = backdrop.querySelector("[data-dashboard-email]");
    const avatarNode = backdrop.querySelector("[data-dashboard-avatar]");
    if (nameInput) nameInput.value = profile.name;
    if (locationInput) locationInput.value = profile.location;
    if (numberInput) numberInput.value = profile.number;
    if (actionNode) actionNode.textContent = formatLastAction(profile.lastAction);
    if (titleNode) titleNode.textContent = profile.name || profile.email || "Profile";
    if (emailNode) emailNode.textContent = profile.email || "Google profile not available";
    if (avatarNode instanceof HTMLImageElement) {
      if (profile.avatarUrl) {
        avatarNode.src = profile.avatarUrl;
        avatarNode.hidden = false;
      } else {
        avatarNode.hidden = true;
        avatarNode.removeAttribute("src");
      }
    }
  };

  const openDashboard = () => {
    const backdrop = ensureDashboard();
    updateDashboardContents();
    const status = backdrop.querySelector("[data-dashboard-status]");
    if (status) status.textContent = "";
    backdrop.hidden = false;
    document.body.classList.add(DASHBOARD_OPEN_CLASS);
    const firstInput = backdrop.querySelector('[data-dashboard-field="name"]');
    if (firstInput instanceof HTMLElement) {
      window.setTimeout(() => firstInput.focus(), 0);
    }
  };

  const bindActivityTracking = () => {
    if (activityTrackingBound) return;
    activityTrackingBound = true;

    // Track "Inquire" clicks from both home and services pages.
    document.addEventListener(
      "click",
      (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest(".js-service-inquire");
      if (!link) return;
      const inquiryAction = buildInquiryAction(link);
      if (!readSession()) {
        event.preventDefault();
        event.stopPropagation();
        pendingInquiryAction = inquiryAction;
        openInquiryGate();
        return;
      }
      captureInquiryActivity(inquiryAction);
      },
      true
    );
  };

  const writeSession = (isAuthenticated) => {
    if (!isAuthenticated) {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({
        isAuthenticated: true,
        expiresAt: Date.now() + TTL_MS
      })
    );
  };

  const emitAuthState = (isAuthenticated) => {
    window.dispatchEvent(
      new CustomEvent(AUTH_EVENT_NAME, {
        detail: { isAuthenticated }
      })
    );
  };

  const renderAuth = () => {
    const mount = document.querySelector(".nav-actions");
    if (!mount) return;

    let wrap = document.getElementById(AUTH_MOUNT_ID);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = AUTH_MOUNT_ID;
      wrap.style.display = "flex";
      wrap.style.gap = "8px";
      mount.appendChild(wrap);
    }

    const isAuthenticated = Boolean(readSession());
    wrap.innerHTML = "";

    if (isAuthenticated) {
      const profile = readProfile();
      const profileBtn = document.createElement("button");
      profileBtn.type = "button";
      profileBtn.className = "menu-toggle qs-profile-button qs-profile-chip";
      profileBtn.style.display = "inline-flex";
      const profileLabel = profile.name || profile.email || "Profile";
      if (profile.avatarUrl) {
        const avatar = document.createElement("img");
        avatar.className = "qs-profile-avatar";
        avatar.src = profile.avatarUrl;
        avatar.alt = "Google profile";
        avatar.width = 22;
        avatar.height = 22;
        profileBtn.appendChild(avatar);
      }
      const label = document.createElement("span");
      label.textContent = profileLabel;
      profileBtn.appendChild(label);
      if (profile.email) profileBtn.title = profile.email;
      profileBtn.addEventListener("click", openDashboard);

      const signOutBtn = document.createElement("button");
      signOutBtn.type = "button";
      signOutBtn.className = "menu-toggle";
      signOutBtn.style.display = "inline-flex";
      signOutBtn.textContent = "Sign out";
      signOutBtn.addEventListener("click", () => {
        writeSession(false);
        emitAuthState(false);
        closeDashboard();
        renderAuth();
      });
      wrap.appendChild(profileBtn);
      wrap.appendChild(signOutBtn);
    } else {
      const signInBtn = document.createElement("button");
      signInBtn.type = "button";
      signInBtn.className = "menu-toggle qs-auth-signin";
      signInBtn.style.display = "inline-flex";
      signInBtn.textContent = "Sign in";
      signInBtn.addEventListener("click", () => {
        requestSignInFlow(false);
      });

      wrap.appendChild(signInBtn);
    }
  };

  window.qsSetRecentInquiry = setRecentInquiry;

  window.qsRequestSignIn = () => {
    requestSignInFlow(false);
  };

  const init = () => {
    bindLiveInquiryBroadcast();
    consumePendingInquiryToast();
    bindActivityTracking();
    renderAuth();
    initGoogleOneTap();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
