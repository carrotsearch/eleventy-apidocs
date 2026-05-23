// Inject anchor link icons into id-bearing headings. The id lives on the
// heading itself (h2-h5), which is what Pagefind walks to build sub-result
// anchors.
//
// As a normalization step, an id on a <section> is lifted onto its first
// heading (when the heading doesn't already have one) and removed from the
// section. This lets authors put the id on either element — TOC, anchors,
// and Pagefind all then see a single shape.

const ICON = `<svg viewBox="0 0 16 16" width="0.9em" height="0.9em" aria-hidden="true" focusable="false">
<path fill="currentColor" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/>
</svg>`;

export function sectionAnchors($) {
  $("article section[id]").each((_, section) => {
    const $section = $(section);
    const id = $section.attr("id");
    const $heading = $section.children("h2, h3, h4, h5").first();
    if (!$heading.length || $heading.attr("id")) return;
    $heading.attr("id", id);
    $section.removeAttr("id");
  });

  $("article :is(h2, h3, h4, h5)[id]").each((_, heading) => {
    const $heading = $(heading);
    if ($heading.find("a.anchor").length) return;
    const id = $heading.attr("id");
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
