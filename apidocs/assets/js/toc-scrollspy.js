// Scrollspy — highlight the entry for the section whose heading has most
// recently crossed the upper "fold" of the viewport.
//
// Drives two link groups over the same page geometry: the right-hand ToC
// (marks the <a> with .active) and, on a page reached through an `expand`ed
// nav entry, the top-level section links the loader adds to the left nav
// (marks the <li> with .active, like an ordinary page). Each group spies its
// OWN anchors, so the nav — which only lists top-level sections — keeps the
// current top-level section lit even while the ToC highlights a nested
// subsection within it.
//
// Picks the LAST heading (in document order) whose top is at or above the
// fold line. The pipeline lifts section ids onto their headings, so
// getElementById(anchor) returns the heading itself — exactly what we want:
// "the heading just crossed the fold."
//
// Click handling overrides the scroll-driven pick: clicking a link pins the
// active state and suspends scrollspy until the smooth-scroll settles, so a
// nested subsection whose header also lies above the fold after the jump
// doesn't steal the highlight.

const FOLD_FRACTION = 0.25;
const CLICK_SUPPRESS_MS = 800;

// One spy group. `activeElOf` maps a link to the element that carries the
// .active class — the <a> for the ToC, the <li> for the nav. `fallbackEl`,
// when given, is the element kept active while no section has crossed the
// fold: the nav's current-page link, which the server renders active. Returns
// an update(fold) the shared loop calls, or null if the group is empty.
function buildSpy({ links, anchorOf, activeElOf, fallbackEl, suppress }) {
  if (!links.length) {
    return null;
  }

  const entries = [];
  const seen = new Set();
  links.forEach(a => {
    const anchor = anchorOf(a);
    if (!anchor || seen.has(anchor)) {
      return;
    }
    const sec = document.getElementById(anchor);
    if (!sec) {
      return;
    }
    seen.add(anchor);
    entries.push({ anchor, sec, el: activeElOf(a) });
  });
  if (!entries.length) {
    return null;
  }

  let activeAnchor;

  const setActive = anchor => {
    if (anchor === activeAnchor) {
      return;
    }
    activeAnchor = anchor;

    // No section above the fold → hand the highlight back to the page link.
    if (fallbackEl) {
      fallbackEl.classList.toggle("active", anchor === null);
    }
    entries.forEach(e => {
      e.el.classList.toggle("active", e.anchor === anchor);
    });
  };

  const update = fold => {
    let active = null;
    for (const e of entries) {
      if (e.sec.getBoundingClientRect().top <= fold) {
        active = e.anchor;
      } else {
        break;
      }
    }
    setActive(active);
  };

  links.forEach(a => {
    a.addEventListener("click", () => {
      setActive(anchorOf(a));
      suppress();
    });
  });

  return update;
}

function init() {
  let suppressedUntil = 0;
  const suppress = () => {
    suppressedUntil = performance.now() + CLICK_SUPPRESS_MS;
  };

  const updates = [
    buildSpy({
      links: document.querySelectorAll(".toc [data-toc-anchor]"),
      anchorOf: a => a.dataset.tocAnchor,
      activeElOf: a => a,
      suppress
    }),
    buildSpy({
      links: document.querySelectorAll(".main-nav [data-nav-anchor]"),
      anchorOf: a => a.dataset.navAnchor,
      activeElOf: a => a.closest("li"),
      fallbackEl: document.querySelector(".main-nav li.active"),
      suppress
    })
  ].filter(Boolean);

  if (!updates.length) {
    return;
  }

  const update = () => {
    if (performance.now() < suppressedUntil) {
      return;
    }
    const fold = window.innerHeight * FOLD_FRACTION;
    updates.forEach(u => {
      u(fold);
    });
  };

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
