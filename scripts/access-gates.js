"use strict";

(() => {
  const AUTH_SESSION_KEY = "qartibe_user_auth";
  const AUTH_EVENT_NAME = "qs-auth-state";
  const SIGN_IN_TO_CONTINUE_TEXT = "Sign in to continue";

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

  const isHomePage = Boolean(document.querySelector('#contact form[action*="web3forms"]'));
  const isPortfolioPage = document.body.dataset.page === "portfolio";

  const createSignInButton = (label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-toggle";
    button.style.display = "inline-flex";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (typeof window.qsRequestSignIn === "function") {
        window.qsRequestSignIn();
      }
    });
    return button;
  };

  const setPortfolioNavVisibility = (isAuthenticated) => {
    const links = document.querySelectorAll(
      'a[href="/portfolio"], a[href="/portfolio/"], a[href="portfolio.html"], a[href="./portfolio.html"]'
    );
    links.forEach((link) => {
      link.hidden = !isAuthenticated;
      link.setAttribute("aria-hidden", isAuthenticated ? "false" : "true");
    });
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
      note.dataset.authNote = "contact";
      note.style.marginTop = "12px";
      note.innerHTML = "<strong>Login required:</strong> Sign in to continue.";
      note.appendChild(createSignInButton(SIGN_IN_TO_CONTINUE_TEXT));
      contactForm.appendChild(note);
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
      gate.style.maxWidth = "760px";
      gate.style.margin = "36px auto";
      gate.style.padding = "0 18px";
      gate.innerHTML =
        '<div style="border:1px solid rgba(20,32,51,.18);border-radius:16px;padding:22px;background:#fff;"><h2 style="margin:0 0 10px;">Login required</h2><p style="margin:0 0 12px;color:#4b5c74;">Sign in to continue.</p></div>';
      gate.firstElementChild?.appendChild(createSignInButton(SIGN_IN_TO_CONTINUE_TEXT));
      main.parentElement?.insertBefore(gate, main);
    }
  };

  const applyAccess = (isAuthenticated) => {
    setPortfolioNavVisibility(isAuthenticated);
    if (isHomePage) setContactAccess(isAuthenticated);
    if (isPortfolioPage) setPortfolioAccess(isAuthenticated);
  };

  const init = () => {
    applyAccess(Boolean(readSession()));
    window.addEventListener(AUTH_EVENT_NAME, (event) => {
      applyAccess(Boolean(event?.detail?.isAuthenticated));
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
