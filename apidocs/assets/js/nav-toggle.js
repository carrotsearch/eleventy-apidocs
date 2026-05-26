// Mobile nav overlay. The hamburger button in the header toggles
// [data-nav-open] on .layout; CSS handles the slide-in. The sticky
// header stays above the panel, so the hamburger flips to an X and
// serves as the close affordance. We also flip `inert` on the nav so
// keyboard focus and screen readers ignore it while it's off-screen.

const layout = document.querySelector(".layout");
const toggle = document.querySelector("[data-nav-toggle]");
const nav = document.getElementById("main-nav");

if (layout && toggle && nav) {
  const mql = window.matchMedia("(max-width: 47.99rem)");

  // History entry pushed on open so the device back button closes the
  // overlay instead of leaving the page. The flag tracks whether our
  // entry is still on top of the stack so close() knows whether to pop.
  //
  // Link-click closes use replaceState rather than history.back(): the
  // link's own navigation runs alongside our close, and a queued back
  // races the forward navigation — under cross-document View
  // Transitions the browser cancels the forward nav and leaves the
  // progress bar stuck. Dropping the overlay marker via replaceState
  // lets the link's navigation push the target URL cleanly on top.
  let historyPushed = false;

  const setOpen = (open, { fromPopstate = false, fromLink = false } = {}) => {
    if (open) layout.setAttribute("data-nav-open", "");
    else layout.removeAttribute("data-nav-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    nav.inert = !open && mql.matches;
    // Lock body scroll while the drawer is open so swipes scroll the nav.
    document.documentElement.style.overflow = open ? "hidden" : "";

    if (open) {
      if (!historyPushed) {
        history.pushState({ apidocsOverlay: "nav" }, "");
        historyPushed = true;
      }
    } else {
      const wasPushed = historyPushed;
      historyPushed = false;
      if (wasPushed && !fromPopstate) {
        // Pop the marker entry — unless a link's default navigation is
        // about to fire, in which case we replace the marker so the
        // forward nav has nothing to race with.
        if (fromLink) history.replaceState(null, "");
        else history.back();
      }
    }
  };

  const syncToViewport = () => {
    if (!mql.matches) {
      // Desktop / tablet — drawer state is meaningless. Route through
      // setOpen so any pushed history entry gets cleaned up.
      if (layout.hasAttribute("data-nav-open")) setOpen(false);
      nav.inert = false;
    } else {
      // Mobile — start closed; nav is inert until opened.
      nav.inert = !layout.hasAttribute("data-nav-open");
    }
  };

  toggle.addEventListener("click", () => {
    setOpen(!layout.hasAttribute("data-nav-open"));
  });

  // ESC dismisses.
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && layout.hasAttribute("data-nav-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Tapping a nav link navigates the page; close so it doesn't linger
  // when the new page renders the same drawer state.
  nav.addEventListener("click", e => {
    const link = e.target.closest("a");
    if (link) setOpen(false, { fromLink: true });
  });

  // Device back button: if our marker is on top of the stack, the user
  // expects "back" to close the overlay before leaving the page.
  window.addEventListener("popstate", () => {
    if (layout.hasAttribute("data-nav-open")) {
      setOpen(false, { fromPopstate: true });
    }
  });

  mql.addEventListener("change", syncToViewport);
  syncToViewport();
}
