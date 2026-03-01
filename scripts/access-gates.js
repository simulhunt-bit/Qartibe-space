"use strict";

(() => {
  const AUTH_SESSION_KEY = "qartibe_user_auth";
  const AUTH_EVENT_NAME = "qs-auth-state";
  const SIGN_IN_TO_CONTINUE_TEXT = "Sign in to continue";

  const ACCESS_STYLE = `
    .qs-access-note {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px dashed rgba(20, 32, 51, 0.34);
      background: rgba(255, 244, 230, 0.92);
      color: #1b2f4a;
      font-size: 13px;
      line-height: 1.5;
    }
    .qs-access-note .btn {
      margin-top: 10px;
    }
    .qs-portfolio-gate {
      max-width: 760px;
      margin: 36px auto 0;
      padding: 0 18px;
    }
    .qs-portfolio-gate-card {
      border: 1px solid rgba(20, 32, 51, 0.18);
      border-radius: 16px;
      padding: 22px;
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.98), rgba(255, 243, 229, 0.96));
      box-shadow: 0 18px 28px rgba(20, 32, 51, 0.12);
    }
    .qs-portfolio-gate-card h2 {
      margin: 0 0 10px;
    }
    .qs-portfolio-gate-card p {
      margin: 0 0 12px;
      color: #4b5c74;
      line-height: 1.6;
    }
  `;

  const ensureStyle = () => {
    if (document.getElementById("qs-access-style")) return;
    const style = document.createElement("style");
    style.id = "qs-access-style";
    style.textContent = ACCESS_STYLE;
    document.head.appendChild(style);
  };

  const normalizePath = (pathName) => {
    if (typeof pathName !== "string" || !pathName.trim()) return "/";
    let path = pathName.trim();
    if (path.endsWith(".html")) {
      path = path.slice(0, -5);
    }
    if (path.endsWith("/index")) {
      path = path.slice(0, -6) || "/";
    }
    path = path.replace(/\/+$/, "") || "/";
    return path;
  };

  const route = normalizePath(window.location.pathname);
  const isHomePage = Boolean(document.querySelector('#contact form[action*="web3forms"]'));
  const isPortfolioPage =
    route === "/portfolio" || route.endsWith("/portfolio") || Boolean(document.getElementById("cmsPortfolioList"));
  const isTopupPage = false;
  const isNotesPage = false;

  const readSession = () => {
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

  const setPortfolioNavVisibility = (isAuthenticated) => {
    const portfolioLinks = document.querySelectorAll('a[href="/portfolio"], a[href="/portfolio/"], a[href="portfolio.html"], a[href="./portfolio.html"], a[href="portfolio"]');
    portfolioLinks.forEach((link) => {
      link.hidden = !isAuthenticated;
      link.setAttribute("aria-hidden", isAuthenticated ? "false" : "true");
    });
  };

  const createSignInButton = (label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (typeof window.qsRequestSignIn === "function") {
        window.qsRequestSignIn();
        return;
      }
      const signInButton = document.querySelector(".qs-auth-signin");
      if (signInButton) signInButton.click();
    });
    return button;
  };

  const setContactAccess = (isAuthenticated) => {
    const contactForm = document.querySelector('#contact form[action*="web3forms"]');
    if (!contactForm) return;

    const fields = contactForm.querySelectorAll('input:not([type="hidden"]), textarea');
    const submitButton = contactForm.querySelector('button[type="submit"]');
    let note = contactForm.querySelector("[data-auth-note='contact']");

    if (isAuthenticated) {
      fields.forEach((field) => {
        field.disabled = false;
      });
      if (submitButton) {
        submitButton.hidden = false;
        submitButton.disabled = false;
      }
      if (note) note.remove();
      return;
    }

    fields.forEach((field) => {
      field.disabled = true;
    });
    if (submitButton) {
      submitButton.hidden = true;
      submitButton.disabled = true;
    }

    if (!note) {
      note = document.createElement("div");
      note.className = "qs-access-note";
      note.dataset.authNote = "contact";
      note.innerHTML = "<strong>Login required:</strong> Sign in to continue.";
      note.appendChild(createSignInButton(SIGN_IN_TO_CONTINUE_TEXT));
      contactForm.appendChild(note);
    }
  };

  const setTopupAccess = (isAuthenticated) => {
    const openTopupButton = document.getElementById("openTopup");
    if (!openTopupButton) return;

    const gameButtons = document.querySelectorAll(".game-button");
    const continueButton = document.getElementById("continueToPrices");
    let note = document.querySelector("[data-auth-note='topup']");

    if (isAuthenticated) {
      openTopupButton.disabled = false;
      gameButtons.forEach((button) => {
        button.disabled = false;
      });
      if (note) note.remove();
      return;
    }

    openTopupButton.disabled = true;
    gameButtons.forEach((button) => {
      button.disabled = true;
    });
    if (continueButton) continueButton.disabled = true;

    if (!note) {
      note = document.createElement("div");
      note.className = "qs-access-note";
      note.dataset.authNote = "topup";
      note.innerHTML = "<strong>Login required:</strong> Sign in to continue.";
      note.appendChild(createSignInButton(SIGN_IN_TO_CONTINUE_TEXT));
      openTopupButton.parentElement?.appendChild(note);
    }
  };

  const setPortfolioAccess = (isAuthenticated) => {
    const main = document.querySelector("main");
    const footer = document.querySelector("footer");
    if (!main) return;

    let gate = document.getElementById("qsPortfolioGate");

    if (isAuthenticated) {
      main.hidden = false;
      if (footer) footer.hidden = false;
      if (gate) gate.remove();
      return;
    }

    main.hidden = true;
    if (footer) footer.hidden = true;

    if (!gate) {
      gate = document.createElement("section");
      gate.id = "qsPortfolioGate";
      gate.className = "qs-portfolio-gate";
      gate.innerHTML = `
        <div class="qs-portfolio-gate-card">
          <h2>Login required</h2>
          <p>Sign in to continue.</p>
        </div>
      `;
      gate.querySelector(".qs-portfolio-gate-card")?.appendChild(createSignInButton(SIGN_IN_TO_CONTINUE_TEXT));
      main.parentElement?.insertBefore(gate, main);
    }
  };

  const setNotesAccess = () => {
    const main = document.querySelector("main");
    const footer = document.querySelector("footer");
    if (main) {
      main.hidden = false;
    }
    if (footer) {
      footer.hidden = false;
    }
    const gate = document.getElementById("qsNotesGate");
    if (gate) {
      gate.remove();
    }
  };

  const applyAccess = (isAuthenticated) => {
    setPortfolioNavVisibility(isAuthenticated);
    if (isHomePage) {
      setContactAccess(isAuthenticated);
    }
    if (isTopupPage) {
      setTopupAccess(isAuthenticated);
    }
    if (isPortfolioPage) {
      setPortfolioAccess(isAuthenticated);
    }
    if (isNotesPage) {
      setNotesAccess();
    }
  };

  const init = () => {
    ensureStyle();
    applyAccess(Boolean(readSession()));

    window.addEventListener(AUTH_EVENT_NAME, (event) => {
      const isAuthenticated = Boolean(event?.detail?.isAuthenticated);
      applyAccess(isAuthenticated);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

