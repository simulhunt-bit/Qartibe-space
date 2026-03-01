"use strict";

(() => {
  const AUTH_SESSION_KEY = "qartibe_user_auth";
  const AUTH_EVENT_NAME = "qs-auth-state";
  const TTL_MS = 12 * 60 * 60 * 1000;

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

    let wrap = document.getElementById("qsAuthMount");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "qsAuthMount";
      wrap.style.display = "flex";
      wrap.style.gap = "8px";
      mount.appendChild(wrap);
    }

    const isAuthenticated = Boolean(readSession());
    wrap.innerHTML = "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-toggle";
    btn.style.display = "inline-flex";

    if (isAuthenticated) {
      btn.textContent = "Sign out";
      btn.addEventListener("click", () => {
        writeSession(false);
        emitAuthState(false);
        renderAuth();
      });
    } else {
      btn.textContent = "Sign in";
      btn.classList.add("qs-auth-signin");
      btn.addEventListener("click", () => {
        writeSession(true);
        emitAuthState(true);
        renderAuth();
      });
    }

    wrap.appendChild(btn);
  };

  window.qsRequestSignIn = () => {
    writeSession(true);
    emitAuthState(true);
    renderAuth();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAuth, { once: true });
  } else {
    renderAuth();
  }
})();
