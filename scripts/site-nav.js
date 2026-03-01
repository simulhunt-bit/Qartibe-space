"use strict";

(() => {
  const MOBILE_BREAKPOINT = 860;

  const escapeHtml = (value) =>
    String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  const normalizeKey = (value) => String(value || "").trim().toLowerCase();

  const labelByPage = {
    home: "Home",
    blog: "Blog",
    portfolio: "Portfolio",
    services: "Services"
  };

  const buildCrumbs = () => {
    const page = normalizeKey(document.body?.dataset?.page);
    const pageTitle = document.getElementById("pageTitle");
    const titleText = pageTitle ? String(pageTitle.textContent || "").trim() : "";
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.replace(/\/+$/, "");
    const blogSlugMatch = path.match(/\/blog\/([^/]+)$/i);
    const portfolioSlugMatch = path.match(/\/portfolio\/([^/]+)$/i);
    const crumbs = [{ label: "Home", href: "/" }];

    if (page && page !== "home") {
      crumbs.push({ label: labelByPage[page] || "Page", href: `/${page}` });
    }

    if (page === "blog" && (params.get("post") || blogSlugMatch)) {
      const label =
        titleText && titleText !== "Latest Blog Posts" && titleText !== "Post not found" ? titleText : "Article";
      crumbs.push({ label });
    }

    if (page === "portfolio" && (params.get("project") || portfolioSlugMatch)) {
      const label =
        titleText && titleText !== "Latest Portfolio Projects" && titleText !== "Project not found" ? titleText : "Project";
      crumbs.push({ label });
    }

    return crumbs;
  };

  const renderBreadcrumb = () => {
    const mount = document.getElementById("breadcrumbTrail");
    if (!mount) return;

    const crumbs = buildCrumbs();
    mount.innerHTML = crumbs
      .map((item, index) => {
        const isLast = index === crumbs.length - 1;
        const label = escapeHtml(item.label);
        const part = isLast || !item.href ? `<span aria-current="page">${label}</span>` : `<a href="${escapeHtml(item.href)}">${label}</a>`;
        if (index === 0) return `<li>${part}</li>`;
        return `<li><span class="crumb-sep" aria-hidden="true">/</span>${part}</li>`;
      })
      .join("");
  };

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
    renderBreadcrumb();
    initMobileMenu();

    const titleNode = document.getElementById("pageTitle");
    if (titleNode) {
      const observer = new MutationObserver(() => renderBreadcrumb());
      observer.observe(titleNode, { childList: true, subtree: true, characterData: true });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
