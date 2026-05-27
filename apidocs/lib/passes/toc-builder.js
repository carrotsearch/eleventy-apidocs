// Build a table-of-contents tree from the <article> > <section> structure.
// Each section's anchor is its own id; sections without an id are skipped
// (they're structural, not navigable). The label comes from the section's
// first heading.
//
// Read-only — doesn't mutate the DOM, just returns a nested array of
// { heading, anchor, sections? } entries that the layout renders.
//
// Honors two opt-out attributes mirroring the gatsby-theme-apidocs contract:
//   data-toc="omit"           — skip this section entirely
//   data-toc="omit-children"  — include this section but not its descendants
//
// Runs after sectionAnchors so the heading already has an injected <a.anchor>;
// the link's text is stripped when computing the entry label.

export function buildToc($) {
  const top = $("article > section")
    .toArray()
    .map(el => entryFor($, $(el)))
    .filter(Boolean);
  return top;
}

function entryFor($, $section) {
  if ($section.attr("data-toc") === "omit") {
    return null;
  }

  const id = $section.attr("id");
  if (!id) {
    return null;
  }

  const $heading = $section.children("h2, h3, h4, h5").first();
  if (!$heading.length) {
    return null;
  }

  // Heading text without the prepended anchor-link icon.
  const $clone = $heading.clone();
  $clone.find("a.anchor").remove();
  const heading = $clone.text().trim();
  if (!heading) {
    return null;
  }

  const entry = { heading, anchor: id };

  if ($section.attr("data-toc") !== "omit-children") {
    const children = $section
      .children("section")
      .toArray()
      .map(el => entryFor($, $(el)))
      .filter(Boolean);
    if (children.length) {
      entry.sections = children;
    }
  }

  return entry;
}
