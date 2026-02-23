"use strict";

(() => {
  const DEFAULT_GOOGLE_CLIENT_ID = "982580357123-f351g3v65asetcesavs42smq866uju9b.apps.googleusercontent.com";
  const AUTH_CONFIG_URL = "/content/auth-config.json";
  const AUTH_SESSION_KEY = "qartibe_user_auth";
  const AUTH_EVENT_NAME = "qs-auth-state";
  const GOOGLE_TOKEN_READY_ERROR = "Google auth is not ready yet.";

  const normalizeScopes = (scopeInput) => {
    if (Array.isArray(scopeInput)) {
      return scopeInput.map((scope) => String(scope || "").trim()).filter(Boolean).join(" ");
    }
    if (typeof scopeInput === "string") {
      return scopeInput
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean)
        .join(" ");
    }
    return "";
  };

  const AUTH_STYLE = `
    .qs-auth-slot {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nav-links .qs-auth-signin {
      font: inherit;
      cursor: pointer;
      line-height: 1;
      padding: 8px 14px;
    }
    .qs-auth-avatar {
      width: 34px;
      height: 34px;
      border: 1px solid rgba(96, 75, 49, 0.3);
      border-radius: 999px;
      padding: 0;
      background: rgba(255, 255, 255, 0.9);
      overflow: hidden;
      cursor: pointer;
      box-shadow: 0 8px 14px rgba(76, 54, 28, 0.16);
    }
    .qs-auth-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .qs-auth-popover {
      position: fixed;
      z-index: 80;
      width: min(330px, calc(100vw - 20px));
      border: 1px solid rgba(96, 75, 49, 0.24);
      border-radius: 14px;
      background: linear-gradient(160deg, rgba(255, 251, 242, 0.98), rgba(252, 243, 228, 0.97));
      box-shadow: 0 18px 34px rgba(40, 26, 10, 0.24);
      padding: 12px;
    }
    .qs-auth-top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .qs-auth-top img {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      object-fit: cover;
      border: 1px solid rgba(96, 75, 49, 0.3);
      background: #ffffff;
    }
    .qs-auth-name {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #1f1914;
      line-height: 1.2;
    }
    .qs-auth-email {
      margin: 2px 0 0;
      font-size: 12px;
      color: #6f665d;
      line-height: 1.3;
      word-break: break-word;
    }
    .qs-auth-popover-close {
      margin-left: auto;
      border: 1px solid rgba(96, 75, 49, 0.24);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.8);
      color: #1f1914;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 8px;
      cursor: pointer;
    }
    .qs-auth-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .qs-auth-link,
    .qs-auth-signout {
      border: 1px solid rgba(96, 75, 49, 0.24);
      border-radius: 999px;
      padding: 7px 11px;
      background: rgba(255, 255, 255, 0.8);
      color: #1f1914;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .qs-auth-signout {
      border-color: rgba(12, 93, 86, 0.45);
      background: rgba(221, 247, 242, 0.88);
    }
    @media (max-width: 900px) {
      .qs-auth-slot {
        width: 100%;
      }
      .nav-links .qs-auth-signin {
        width: 100%;
        text-align: center;
      }
      .qs-auth-avatar {
        width: 38px;
        height: 38px;
      }
    }
  `;

  const ensureStyle = () => {
    if (document.getElementById("qs-auth-style")) return;
    const style = document.createElement("style");
    style.id = "qs-auth-style";
    style.textContent = AUTH_STYLE;
    document.head.appendChild(style);
  };

  const fetchClientId = async () => {
    try {
      const response = await fetch(AUTH_CONFIG_URL, { cache: "default" });
      if (!response.ok) return DEFAULT_GOOGLE_CLIENT_ID;
      const config = await response.json();
      const value = String(config?.googleClientId || "").trim();
      return value || DEFAULT_GOOGLE_CLIENT_ID;
    } catch {
      return DEFAULT_GOOGLE_CLIENT_ID;
    }
  };

  const loadGoogleScript = () =>
    new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google.accounts.oauth2);
        return;
      }

      let script = document.querySelector("script[data-google-gsi='true']");
      if (!script) {
        script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.dataset.googleGsi = "true";
        document.head.appendChild(script);
      }

      const timeoutMs = 8000;
      const start = Date.now();
      const check = () => {
        if (window.google?.accounts?.oauth2) {
          resolve(window.google.accounts.oauth2);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          reject(new Error("Google OAuth library did not load"));
          return;
        }
        setTimeout(check, 120);
      };
      check();
    });

  const saveSession = (session) => {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    return session;
  };

  const loadSession = () => {
    try {
      const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.expiresAt || Date.now() >= Number(session.expiresAt)) {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
  };

  const clearSession = () => {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  };

  window.qsGetAuthSession = () => loadSession();
  window.qsRequestGoogleToken = async () => {
    throw new Error(GOOGLE_TOKEN_READY_ERROR);
  };
  window.qsCurrentSession = loadSession();

  const broadcastAuthState = (session) => {
    const detail = {
      isAuthenticated: Boolean(session),
      session: session || null
    };
    window.dispatchEvent(new CustomEvent(AUTH_EVENT_NAME, { detail }));
  };

  const fetchUserProfile = async (accessToken) => {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`User profile request failed (${response.status})`);
    }
    const profile = await response.json();
    return {
      name: String(profile?.name || profile?.given_name || "User"),
      email: String(profile?.email || ""),
      picture: String(profile?.picture || "")
    };
  };

  const setupHeaderAuth = async () => {
    const navMenu = document.getElementById("siteMenu");
    if (!navMenu) return;

    ensureStyle();

    const authSlot = document.createElement("div");
    authSlot.className = "qs-auth-slot";
    authSlot.innerHTML = `
      <button type="button" class="qs-auth-signin nav-cta-link" data-auth-signin>Sign in</button>
      <button class="qs-auth-avatar" type="button" data-auth-avatar hidden aria-label="Open user popup">
        <img data-auth-avatar-img alt="Google profile avatar" src="" />
      </button>
    `;

    const contactLink = navMenu.querySelector(".nav-cta-link");
    if (contactLink) {
      navMenu.insertBefore(authSlot, contactLink);
    } else {
      navMenu.appendChild(authSlot);
    }

    const signInButton = authSlot.querySelector("[data-auth-signin]");
    const authAvatarBtn = authSlot.querySelector("[data-auth-avatar]");
    const authAvatarImg = authSlot.querySelector("[data-auth-avatar-img]");

    const popover = document.createElement("div");
    popover.className = "qs-auth-popover";
    popover.hidden = true;
    popover.innerHTML = `
      <div class="qs-auth-top">
        <img data-popover-avatar alt="User avatar" src="" />
        <div>
          <p class="qs-auth-name" data-popover-name>User</p>
          <p class="qs-auth-email" data-popover-email></p>
        </div>
        <button type="button" class="qs-auth-popover-close" data-popover-close>Close</button>
      </div>
      <div class="qs-auth-links">
        <a class="qs-auth-link" href="/">Home</a>
        <a class="qs-auth-link" href="/blog">Blog</a>
        <a class="qs-auth-link" href="/portfolio">Portfolio</a>
        <button type="button" class="qs-auth-signout" data-popover-signout>Sign out</button>
      </div>
    `;
    document.body.appendChild(popover);

    const popoverAvatar = popover.querySelector("[data-popover-avatar]");
    const popoverName = popover.querySelector("[data-popover-name]");
    const popoverEmail = popover.querySelector("[data-popover-email]");
    const popoverClose = popover.querySelector("[data-popover-close]");
    const popoverSignOut = popover.querySelector("[data-popover-signout]");

    let currentSession = null;
    let oauth2 = null;
    let tokenClient = null;
    let requestSignIn = () => {};
    let requestGoogleToken = async () => {
      throw new Error(GOOGLE_TOKEN_READY_ERROR);
    };
    let googleClientId = "";

    const positionPopover = () => {
      const rect = authAvatarBtn.getBoundingClientRect();
      const spacing = 8;
      const maxLeft = Math.max(10, window.innerWidth - popover.offsetWidth - 10);
      const left = Math.min(Math.max(10, rect.left), maxLeft);
      popover.style.left = `${left}px`;
      popover.style.top = `${rect.bottom + spacing}px`;
    };

    const openPopover = () => {
      if (authAvatarBtn.hidden) return;
      popover.hidden = false;
      positionPopover();
    };

    const closePopover = () => {
      popover.hidden = true;
    };

    const applySignedOut = () => {
      signInButton.hidden = false;
      authAvatarBtn.hidden = true;
      authAvatarImg.src = "";
      popoverAvatar.src = "";
      popoverName.textContent = "User";
      popoverEmail.textContent = "";
      currentSession = null;
      window.qsCurrentSession = null;
      closePopover();
      broadcastAuthState(null);
    };

  const applySignedIn = (session) => {
    const name = String(session?.name || "User").trim() || "User";
    const email = String(session?.email || "").trim();
    const picture = String(session?.picture || "").trim();

    // set third-party consent cookie for 7 days after login
    document.cookie = "qs_thirdparty_ok=1; Max-Age=604800; Path=/; SameSite=None; Secure";

    signInButton.hidden = true;
    authAvatarBtn.hidden = false;
    authAvatarImg.src = picture;
    popoverAvatar.src = picture;
      popoverName.textContent = name;
      popoverEmail.textContent = email;
      currentSession = session;
      window.qsCurrentSession = session;
      broadcastAuthState(session);
    };

    const signOut = () => {
      if (currentSession?.accessToken && oauth2?.revoke) {
        oauth2.revoke(currentSession.accessToken, () => {});
      }
      clearSession();
      applySignedOut();
    };

    authAvatarBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (popover.hidden) {
        openPopover();
      } else {
        closePopover();
      }
    });
    popoverClose.addEventListener("click", () => closePopover());
    popoverSignOut.addEventListener("click", () => signOut());

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!target) return;
      if (!popover.hidden && !popover.contains(target) && !authAvatarBtn.contains(target)) {
        closePopover();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popover.hidden) {
        closePopover();
      }
    });
    window.addEventListener(
      "scroll",
      () => {
        if (!popover.hidden) positionPopover();
      },
      { passive: true }
    );
    window.addEventListener("resize", () => {
      if (!popover.hidden) positionPopover();
    });

    const restoredSession = loadSession();
    if (restoredSession) {
      applySignedIn(restoredSession);
    } else {
      applySignedOut();
    }

    try {
      oauth2 = await loadGoogleScript();
    } catch {
      signInButton.disabled = true;
      signInButton.textContent = "Sign in unavailable";
      return;
    }

    const clientId = await fetchClientId();
    googleClientId = clientId;
    tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid profile email",
      callback: async (tokenResponse) => {
        if (tokenResponse?.error || !tokenResponse?.access_token) {
          return;
        }
        try {
          const profile = await fetchUserProfile(tokenResponse.access_token);
          if (!profile.email) return;

          const session = saveSession({
            name: profile.name,
            email: profile.email,
            picture: profile.picture,
            accessToken: tokenResponse.access_token,
            expiresAt: Date.now() + (Number(tokenResponse.expires_in) || 3600) * 1000
          });
          applySignedIn(session);
          openPopover();
        } catch {
          // ignore profile errors and keep signed out state
        }
      }
    });

    requestSignIn = () => {
      if (!tokenClient) return;
      tokenClient.requestAccessToken({ prompt: "select_account" });
    };

    requestGoogleToken = (scopes, options = {}) =>
      new Promise((resolve, reject) => {
        if (!oauth2 || !googleClientId) {
          reject(new Error(GOOGLE_TOKEN_READY_ERROR));
          return;
        }

        const normalizedScopes = normalizeScopes(scopes);
        if (!normalizedScopes) {
          reject(new Error("Missing OAuth scopes."));
          return;
        }

        const scopedTokenClient = oauth2.initTokenClient({
          client_id: googleClientId,
          scope: normalizedScopes,
          callback: (tokenResponse) => {
            if (tokenResponse?.error || !tokenResponse?.access_token) {
              reject(new Error(String(tokenResponse?.error || "Failed to get Google token.")));
              return;
            }
            resolve(tokenResponse.access_token);
          }
        });

        scopedTokenClient.requestAccessToken({
          prompt: typeof options?.prompt === "string" ? options.prompt : "consent",
          include_granted_scopes: true,
          login_hint: currentSession?.email || undefined
        });
      });

    signInButton.addEventListener("click", () => {
      requestSignIn();
    });

    window.qsRequestSignIn = requestSignIn;
    window.qsRequestGoogleToken = requestGoogleToken;
    window.qsGetAuthSession = () => currentSession || loadSession();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupHeaderAuth, { once: true });
  } else {
    setupHeaderAuth();
  }
})();
