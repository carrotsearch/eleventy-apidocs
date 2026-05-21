// ToC scrollspy — highlight the entry for the section whose header has
// most recently crossed the upper "fold" of the viewport.
//
// Picks the LAST <section[id]> (in document order) whose top is above
// the fold line. That works for siblings (upper wins until you scroll
// past) and for nesting (inner wins once its header crosses, even
// though the outer section's body still extends down off-screen).

const FOLD_FRACTION = 0.25;

function init() {
  const tocRoot = document.querySelector(".toc");
  if (!tocRoot) return;
  const links = tocRoot.querySelectorAll("[data-toc-anchor]");
  if (!links.length) return;

  const linkByAnchor = new Map();
  links.forEach(a => linkByAnchor.set(a.dataset.tocAnchor, a));

  const sections = [];
  for (const anchor of linkByAnchor.keys()) {
    const sec = document.getElementById(anchor);
    if (sec) sections.push(sec);
  }
  if (!sections.length) return;

  let activeAnchor = null;

  const update = () => {
    const fold = window.innerHeight * FOLD_FRACTION;
    let active = null;
    for (const s of sections) {
      if (s.getBoundingClientRect().top <= fold) active = s;
      else break;
    }
    const anchor = active ? active.id : null;
    if (anchor === activeAnchor) return;
    activeAnchor = anchor;
    links.forEach(a => a.classList.toggle("active", a.dataset.tocAnchor === anchor));
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
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
