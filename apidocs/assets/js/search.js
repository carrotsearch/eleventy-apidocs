// Search — wires the header trigger to a <dialog> hosting Pagefind UI.
// The UI is instantiated lazily on first open. If pagefind-ui.js failed to
// load (e.g. the index hasn't been built yet), the trigger is hidden.

function init() {
  const trigger = document.querySelector("[data-search-open]");
  const dialog = document.querySelector("[data-search-dialog]");
  const mount = dialog?.querySelector("[data-search-ui]");
  if (!trigger || !dialog || !mount) return;

  let pagefindUi = null;
  let initPromise = null;

  function whenPagefindReady() {
    if (window.PagefindUI) return Promise.resolve();
    const script = document.querySelector('script[src*="pagefind-ui.js"]');
    if (!script) return Promise.reject(new Error("pagefind-ui.js missing"));
    return new Promise((resolve, reject) => {
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("pagefind-ui.js failed")), { once: true });
    });
  }

  function ensureUI() {
    if (pagefindUi) return Promise.resolve();
    if (initPromise) return initPromise;
    initPromise = whenPagefindReady().then(() => {
      if (!window.PagefindUI) throw new Error("PagefindUI not exposed");
      pagefindUi = new window.PagefindUI({
        element: mount,
        showImages: false,
        showSubResults: true,
        resetStyles: false,
        autofocus: true
      });
    });
    return initPromise;
  }

  trigger.addEventListener("click", async () => {
    try {
      await ensureUI();
    } catch (err) {
      console.warn("[apidocs] search unavailable:", err.message);
      return;
    }
    if (!dialog.open) dialog.showModal();
    const input = mount.querySelector("input[type='text']");
    if (input) input.focus();
  });

  // Close when clicking outside the panel (backdrop click)
  dialog.addEventListener("click", e => {
    if (e.target === dialog) dialog.close();
  });

  // Close when a result link is clicked
  mount.addEventListener("click", e => {
    if (e.target.closest("a")) dialog.close();
  });

  // "/" hotkey to open search
  document.addEventListener("keydown", e => {
    if (e.key !== "/") return;
    const t = e.target;
    const isTyping = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (isTyping || dialog.open) return;
    e.preventDefault();
    trigger.click();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
