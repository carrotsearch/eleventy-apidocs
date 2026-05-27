// ToC scrollspy — highlight the entry for the section whose heading has
// most recently crossed the upper "fold" of the viewport.
//
// Picks the LAST heading (in document order) whose top is at or above
// the fold line. The pipeline lifts section ids onto their headings, so
// getElementById(anchor) returns the heading itself — which is exactly
// what we want: "the heading just crossed the fold."
//
// Click handling overrides the scroll-driven pick: clicking a ToC link
// pins the active state to that link and suspends scrollspy until the
// smooth-scroll settles, so a nested subsection whose header also lies
// above the fold after the jump doesn't steal the highlight.

const FOLD_FRACTION = 0.25;
const CLICK_SUPPRESS_MS = 800;

function init() {
  const tocRoot = document.querySelector(".toc");
  if (!tocRoot) {
    return;
  }
  const links = tocRoot.querySelectorAll("[data-toc-anchor]");
  if (!links.length) {
    return;
  }

  const linkByAnchor = new Map();
  links.forEach(a => {
    linkByAnchor.set(a.dataset.tocAnchor, a);
  });

  const sections = [];
  for (const anchor of linkByAnchor.keys()) {
    const sec = document.getElementById(anchor);
    if (sec) {
      sections.push(sec);
    }
  }
  if (!sections.length) {
    return;
  }

  let activeAnchor = null;
  let suppressedUntil = 0;

  const setActive = anchor => {
    if (anchor === activeAnchor) {
      return;
    }
    activeAnchor = anchor;
    links.forEach(a => {
      a.classList.toggle("active", a.dataset.tocAnchor === anchor);
    });
  };

  const update = () => {
    if (performance.now() < suppressedUntil) {
      return;
    }
    const fold = window.innerHeight * FOLD_FRACTION;
    let active = null;
    for (const s of sections) {
      if (s.getBoundingClientRect().top <= fold) {
        active = s;
      } else {
        break;
      }
    }
    setActive(active ? active.id : null);
  };

  links.forEach(a => {
    a.addEventListener("click", () => {
      setActive(a.dataset.tocAnchor);
      suppressedUntil = performance.now() + CLICK_SUPPRESS_MS;
    });
  });

  // Lift the suppression as soon as the smooth-scroll settles so manual
  // scrolling shortly after a click stays responsive. Falls back to the
  // CLICK_SUPPRESS_MS timeout when scrollend isn't available.
  if ("onscrollend" in window) {
    window.addEventListener("scrollend", () => {
      suppressedUntil = 0;
      update();
    });
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  update();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
