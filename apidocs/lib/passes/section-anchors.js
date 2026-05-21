// Inject anchor link icons into headings inside <section id="X">.
// Mirrors the gatsby-theme-apidocs contract: clicking the icon copies the
// fragment URL; CSS reveals the icon on heading hover.
//
// Skip:
//   - <h1> (page title — no self-link)
//   - sections marked data-toc="omit" still get anchors; data-toc only
//     controls ToC inclusion, not anchorability.

const ICON = `<svg viewBox="0 0 16 16" width="0.9em" height="0.9em" aria-hidden="true" focusable="false">
<path fill="currentColor" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/>
</svg>`;

export function sectionAnchors($) {
  $("section[id]").each((_, section) => {
    const id = $(section).attr("id");
    if (!id) return;

    // The first matching heading (h2-h5) gets the section's id-anchor.
    const $heading = $(section).children("h2, h3, h4, h5").first();
    if (!$heading.length || $heading.find("a.anchor").length) return;

    $heading.prepend(
      `<a class="anchor" href="#${escapeAttr(id)}" aria-label="Link to this section">${ICON}</a>`
    );
  });
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[c]));
}
