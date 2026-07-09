(function (global) {
  "use strict";

  const STORAGE_KEY = "runway-docs-sidebar-sections";
  const SECTION_CLASS = "runway-sidebar-section";
  const BOUND_ATTRIBUTE = "data-runway-nav-bound";
  const COLLAPSED_ATTRIBUTE = "data-runway-collapsed";

  function getSidebarContainer(documentRef) {
    return (
      documentRef.querySelector("#sidebar-content") ||
      documentRef.querySelector("#sidebar")
    );
  }

  function getSectionList(section) {
    return Array.from(section.children).find((child) =>
      child.classList?.contains("sidebar-group"),
    );
  }

  function getSectionLabel(header) {
    return header.querySelector(".sidebar-title")?.textContent?.trim() ?? "";
  }

  function readStoredState(storage) {
    if (!storage) return {};

    try {
      return JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      return {};
    }
  }

  function writeStoredState(storage, state) {
    if (!storage) return;

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore unavailable storage, such as private browsing restrictions.
    }
  }

  function hasActivePage(section) {
    return Boolean(
      section.querySelector("[data-active]") ||
        section.querySelector('[aria-current="page"]'),
    );
  }

  function setCollapsed(section, header, list, collapsed) {
    section.setAttribute(COLLAPSED_ATTRIBUTE, String(collapsed));
    header.setAttribute("aria-expanded", String(!collapsed));
    list.hidden = collapsed;
  }

  function enhanceSidebar(documentRef, storage) {
    const container = getSidebarContainer(documentRef);
    if (!container) return;

    const storedState = readStoredState(storage);
    const headers = Array.from(container.querySelectorAll(".sidebar-group-header"));

    headers.forEach((header, index) => {
      const section = header.parentElement;
      const list = section ? getSectionList(section) : null;
      const label = getSectionLabel(header);

      if (!section || !list || !label) return;

      section.classList.add(SECTION_CLASS);
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");

      if (!list.id) list.id = `runway-sidebar-section-${index}`;
      header.setAttribute("aria-controls", list.id);

      const isActive = hasActivePage(section);
      const collapsed = isActive ? false : (storedState[label] ?? true);
      setCollapsed(section, header, list, collapsed);

      if (header.getAttribute(BOUND_ATTRIBUTE) === "true") return;

      const toggle = () => {
        const nextCollapsed = section.getAttribute(COLLAPSED_ATTRIBUTE) !== "true";
        const nextState = readStoredState(storage);
        nextState[label] = nextCollapsed;
        writeStoredState(storage, nextState);
        setCollapsed(section, header, list, nextCollapsed);
      };

      header.addEventListener("click", (event) => {
        event.preventDefault();
        toggle();
      });

      header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      });

      header.setAttribute(BOUND_ATTRIBUTE, "true");
    });
  }

  function start() {
    const documentRef = global.document;
    if (!documentRef) return;

    let timeoutId;
    const scheduleEnhance = () => {
      global.clearTimeout?.(timeoutId);
      timeoutId = global.setTimeout?.(
        () => enhanceSidebar(documentRef, global.localStorage),
        50,
      );
    };

    if (documentRef.readyState === "loading") {
      documentRef.addEventListener("DOMContentLoaded", scheduleEnhance);
    } else {
      scheduleEnhance();
    }

    if (global.MutationObserver) {
      const observer = new global.MutationObserver(scheduleEnhance);
      observer.observe(documentRef.body, { childList: true, subtree: true });
    }

    global.addEventListener?.("popstate", scheduleEnhance);
    documentRef.addEventListener?.("click", scheduleEnhance, true);
  }

  const api = {
    STORAGE_KEY,
    enhanceSidebar,
    start,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  global.RunwayNavCollapse = api;
  start();
})(typeof globalThis !== "undefined" ? globalThis : window);
