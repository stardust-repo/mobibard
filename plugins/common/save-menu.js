(() => {
  "use strict";

  // One "저장" button that opens a small menu (Simple / Player). Existing save buttons are moved
  // into the menu as items, so their click handlers, busy text and disabled state keep working.
  const VERSION = "1.0.0";
  const STYLE_ID = "mabiSaveMenuStyles";
  const menus = new Set();

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .mabi-save-menu-wrap{position:relative;display:inline-flex}
      .mabi-save-menu-button{display:inline-flex;align-items:center;justify-content:center;gap:5px}
      .mabi-save-menu-button::after{content:"";width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;opacity:.7;transition:transform .15s}
      .mabi-save-menu-button[aria-expanded="true"]::after{transform:rotate(180deg)}
      .mabi-save-menu{position:fixed;z-index:100500;min-width:168px;display:grid;gap:2px;padding:5px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;background:var(--surface,var(--panel,var(--card,#fff)));color:var(--text,inherit);box-shadow:0 14px 34px rgba(8,14,24,.24);box-sizing:border-box}
      [data-theme="dark"] .mabi-save-menu{background:var(--surface,var(--panel,#20242c));color:var(--text,#edf0f4)}
      .mabi-save-menu[hidden]{display:none!important}
      .mabi-save-menu .mabi-save-menu-item{all:unset;box-sizing:border-box;display:flex;align-items:center;width:100%;min-height:34px;padding:7px 11px;border-radius:8px;font:inherit;font-size:13px;font-weight:700;line-height:1.25;color:inherit;cursor:pointer;white-space:nowrap}
      .mabi-save-menu .mabi-save-menu-item:hover:not(:disabled),.mabi-save-menu .mabi-save-menu-item:focus-visible{background:color-mix(in srgb,currentColor 10%,transparent);outline:none}
      .mabi-save-menu .mabi-save-menu-item:disabled{opacity:.42;cursor:default}
      .mabi-save-menu .mabi-save-menu-item[hidden]{display:none!important}
    `;
    document.head.append(style);
  }

  function closeAll(except = null) {
    for (const menu of menus) if (menu !== except) menu.close();
  }

  document.addEventListener("pointerdown", (event) => {
    for (const menu of menus) {
      if (!menu.isOpen()) continue;
      if (menu.wrap.contains(event.target) || menu.panel.contains(event.target)) continue;
      menu.close();
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const menu of menus) {
      if (menu.isOpen()) { menu.close(); menu.button.focus(); }
    }
  });
  window.addEventListener("resize", () => closeAll());
  // Close on page scroll, but ignore scrolls that land right after opening (e.g. the browser
  // scrolling the button into view for the same click).
  window.addEventListener("scroll", (event) => {
    for (const menu of menus) {
      if (!menu.isOpen() || menu.panel.contains(event.target)) continue;
      if (performance.now() - menu.openedAt < 300) { menu.reposition(); continue; }
      menu.close();
    }
  }, true);

  // create({ label, buttonClassName, items: [HTMLButtonElement...] }) -> { wrap, button, panel, setLabel, sync, close }
  function create({ label = "Save", buttonClassName = "", items = [], ariaLabel = "" } = {}) {
    addStyles();
    const wrap = document.createElement("div");
    wrap.className = "mabi-save-menu-wrap";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${buttonClassName} mabi-save-menu-button`.trim();
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.textContent = label;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    const panel = document.createElement("div");
    panel.className = "mabi-save-menu";
    panel.setAttribute("role", "menu");
    panel.hidden = true;
    wrap.append(button);
    document.body.append(panel);

    const api = {
      wrap, button, panel,
      isOpen: () => !panel.hidden,
      setLabel(text) { button.textContent = String(text || ""); },
      addItems(list) {
        for (const item of list || []) {
          if (!item) continue;
          item.classList.add("mabi-save-menu-item");
          item.setAttribute("role", "menuitem");
          if (item.parentElement !== panel) panel.append(item);
          if (!item.dataset.mabiSaveMenuBound) {
            item.dataset.mabiSaveMenuBound = "1";
            // Close after the item's own click handler has run.
            item.addEventListener("click", () => window.setTimeout(() => api.close(), 0));
          }
        }
        api.sync();
      },
      sync() {
        const usable = [...panel.querySelectorAll(".mabi-save-menu-item")].some((item) => !item.hidden && !item.disabled);
        button.disabled = !usable;
        if (!usable) api.close();
      },
      openedAt: 0,
      open() {
        closeAll(api);
        api.sync();
        if (button.disabled) return;
        panel.hidden = false;
        api.openedAt = performance.now();
        button.setAttribute("aria-expanded", "true");
        api.reposition();
        panel.querySelector(".mabi-save-menu-item:not(:disabled):not([hidden])")?.focus({ preventScroll: true });
      },
      reposition() {
        if (panel.hidden) return;
        const rect = button.getBoundingClientRect();
        const width = Math.max(panel.offsetWidth, rect.width);
        const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
        const below = rect.bottom + 6;
        const fitsBelow = below + panel.offsetHeight <= window.innerHeight - 8;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(fitsBelow ? below : Math.max(8, rect.top - 6 - panel.offsetHeight))}px`;
      },
      close() {
        if (panel.hidden) return;
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
      },
    };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (api.isOpen()) api.close(); else api.open();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const list = [...panel.querySelectorAll(".mabi-save-menu-item:not(:disabled):not([hidden])")];
      const index = list.indexOf(document.activeElement);
      const next = list[(index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length];
      next?.focus();
    });
    // Keep the main button's enabled state in step with the items (they are enabled/disabled by app code).
    new MutationObserver(() => api.sync()).observe(panel, { subtree: true, attributes: true, attributeFilter: ["disabled", "hidden"], childList: true });
    menus.add(api);
    api.addItems(items);
    return api;
  }

  window.MabiSaveMenu = Object.freeze({ VERSION, create, closeAll });
})();
