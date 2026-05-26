// Mobile nav drawer. The hamburger button in the header toggles
// [data-nav-open] on .layout; CSS handles the slide-in and backdrop. We
// also flip `inert` on the nav so keyboard focus and screen readers
// ignore it while it's off-screen.

const layout = document.querySelector(".layout");
const toggle = document.querySelector("[data-nav-toggle]");
const nav = document.getElementById("main-nav");

if (layout && toggle && nav) {
  const mql = window.matchMedia("(max-width: 47.99rem)");

  const setOpen = (open) => {
    if (open) layout.setAttribute("data-nav-open", "");
    else layout.removeAttribute("data-nav-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    nav.inert = !open && mql.matches;
    // Lock body scroll while the drawer is open so swipes scroll the nav.
    document.documentElement.style.overflow = open ? "hidden" : "";
  };

  const syncToViewport = () => {
    if (!mql.matches) {
      // Desktop / tablet — drawer state is meaningless; clear it.
      layout.removeAttribute("data-nav-open");
      toggle.setAttribute("aria-expanded", "false");
      nav.inert = false;
      document.documentElement.style.overflow = "";
    } else {
      // Mobile — start closed; nav is inert until opened.
      nav.inert = !layout.hasAttribute("data-nav-open");
    }
  };

  toggle.addEventListener("click", () => {
    setOpen(!layout.hasAttribute("data-nav-open"));
  });

  // Backdrop dismiss. The ::before backdrop isn't clickable as a real
  // element, so we listen on .layout and dismiss when the target is the
  // layout itself (clicks on nav/header bubble through their own targets).
  layout.addEventListener("click", (e) => {
    if (!layout.hasAttribute("data-nav-open")) return;
    if (e.target === layout) setOpen(false);
  });

  // ESC dismisses.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && layout.hasAttribute("data-nav-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Tapping a nav link navigates the page; close so it doesn't linger
  // when the new page renders the same drawer state.
  nav.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (link) setOpen(false);
  });

  mql.addEventListener("change", syncToViewport);
  syncToViewport();
}
