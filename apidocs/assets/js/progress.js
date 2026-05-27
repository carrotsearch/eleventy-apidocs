// Navigation progress bar. Cross-document view transitions hold the old
// page fully visible while the next document is fetched, so a slow server
// looks like nothing's happening. We arm a short timer on same-origin
// link clicks; if it fires before the swap, a thin indeterminate bar
// appears at the top of the viewport. The bar lives on the outgoing
// document — the view transition discards it with the rest of the old
// root, so we don't need to clear it ourselves on success.

const SHOW_AFTER = 150;
// Auto-hide if a click somehow didn't lead to a navigation (defaultPrevented
// downstream, link resolved to the current page, etc.) so the bar can't get
// stuck.
const HIDE_AFTER = 10_000;

let showTimer = null;
let hideTimer = null;
let bar = null;

document.addEventListener("click", event => {
  if (event.defaultPrevented) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const link = event.target.closest("a[href]");
  if (!link) {
    return;
  }
  if (link.target && link.target !== "_self") {
    return;
  }
  if (link.hasAttribute("download")) {
    return;
  }
  if (link.getAttribute("rel")?.includes("external")) {
    return;
  }

  let url;
  try {
    url = new URL(link.href, document.baseURI);
  } catch {
    return;
  }

  if (url.origin !== location.origin) {
    return;
  }
  // Same-page anchor / hash — no document fetch.
  if (url.pathname === location.pathname && url.search === location.search) {
    return;
  }

  arm();
});

function arm() {
  cancel();
  showTimer = setTimeout(() => {
    showTimer = null;
    show();
    hideTimer = setTimeout(hide, HIDE_AFTER);
  }, SHOW_AFTER);
}

function cancel() {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  hide();
}

function show() {
  if (bar) {
    return;
  }
  bar = document.createElement("div");
  bar.className = "apidocs-progress";
  document.body.appendChild(bar);
}

function hide() {
  if (bar) {
    bar.remove();
    bar = null;
  }
}
