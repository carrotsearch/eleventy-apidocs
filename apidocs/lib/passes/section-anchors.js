// Inject anchor link icons into sectioned headings. The canonical place
// for an id is on the <section> tag (matching the dotatlas authoring
// shape); the injected <a class="anchor"> inside the heading points to
// that section id.
//
// As a normalization step, an id placed directly on a heading is lifted
// to its parent <section> when the section has no id of its own. Authors
// can use either form; pipeline output is always section-id.

const ICON = `<svg viewBox="0 0 16 16" width="0.9em" height="0.9em" aria-hidden="true" focusable="false">
<path fill="currentColor" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/>
</svg>`;

export function sectionAnchors($) {
  // Lift heading-id to its parent section when the section has none.
  $("article :is(h2, h3, h4, h5)[id]").each((_, heading) => {
    const $heading = $(heading);
    const $section = $heading.parent("section");
    if (!$section.length || $section.attr("id")) return;
    $section.attr("id", $heading.attr("id"));
    $heading.removeAttr("id");
  });

  // Inject an anchor link into the first heading of each id-bearing section.
  $("article section[id]").each((_, section) => {
    const $section = $(section);
    const $heading = $section.children("h2, h3, h4, h5").first();
    if (!$heading.length || $heading.find("a.anchor").length) return;
    const id = $section.attr("id");
    $heading.prepend(
      `<a class="anchor" href="#${escapeAttr(id)}" aria-label="Link to this section">${ICON}</a>`
    );
  });
}

function escapeAttr(s) {
  return String(s).replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]
  );
}
