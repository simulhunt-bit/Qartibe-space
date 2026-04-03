"use strict";

(() => {
  const MOBILE_BREAKPOINT = 860;

  const escapeHtml = (value) =>
    String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  const normalizeKey = (value) => String(value || "").trim().toLowerCase();



  const closeMenu = (menu, toggle) => {
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Menu";
  };

  const initMobileMenu = () => {
    const menu = document.getElementById("siteMenu");
    const navActions = document.querySelector(".nav-actions");
    if (!menu || !navActions || !navActions.parentElement) return;

    let toggle = document.querySelector(".nav-menu-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "menu-toggle nav-menu-toggle";
      toggle.setAttribute("aria-controls", "siteMenu");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
      navActions.parentElement.insertBefore(toggle, navActions);
    }

    const syncMenuByViewport = () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        closeMenu(menu, toggle);
      }
    };

    toggle.addEventListener("click", () => {
      const willOpen = !menu.classList.contains("open");
      if (willOpen) {
        menu.classList.add("open");
        toggle.setAttribute("aria-expanded", "true");
        toggle.textContent = "Close";
      } else {
        closeMenu(menu, toggle);
      }
    });

    menu.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link) return;
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        closeMenu(menu, toggle);
      }
    });

    window.addEventListener("resize", syncMenuByViewport);
    syncMenuByViewport();
  };

  const init = () => {
    initMobileMenu();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
