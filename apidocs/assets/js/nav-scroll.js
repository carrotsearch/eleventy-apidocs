// Preserve the main-nav scroll offset across navigation. Cross-document View
// Transitions crossfade the nav visually, but the new document still loads its
// inner <ul> at scrollTop 0 — and browsers never restore an inner scroll
// container's offset across navigation. The nav markup is identical on every
// page (only .active moves), so a saved offset transfers cleanly.

const KEY = "apidocs-nav-scroll";

// The scrollable element is the inner <ul>, not .main-nav itself (see
// .main-nav > ul in layout.css), so the scrollbar starts at the first chapter.
const scroller = () => document.querySelector(".main-nav > ul");

const save = () => {
  const el = scroller();
  if (el) {
    sessionStorage.setItem(KEY, String(el.scrollTop));
  }
};

const restore = () => {
  const el = scroller();
  const y = sessionStorage.getItem(KEY);
  if (el && y !== null) {
    el.scrollTop = Number(y);
  }
};

// pageswap/pagereveal run inside the cross-document VT lifecycle: pagereveal
// fires before the new page's first render, so restoring there beats the VT
// snapshot and there's no flicker. pagehide + restore-on-load covers browsers
// without View Transitions, where the offset still carries but isn't seamless.
if ("onpagereveal" in window) {
  window.addEventListener("pageswap", save);
  window.addEventListener("pagereveal", restore);
} else {
  window.addEventListener("pagehide", save);
  restore();
}
