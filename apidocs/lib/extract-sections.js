import * as cheerio from "cheerio";

// Collects the top-level `<article> > <section id>` entries of an HTML
// fragment as { anchor, title } in document order. This is the standalone,
// raw-string twin of buildToc's top-level pass (lib/passes/toc-builder.js):
// the nav loader needs the same selection from a file it reads itself, not
// from the live pipeline `$`. Keep the heading rule identical to buildToc.
//
// Reads the SOURCE `section[id]` form, not lifted-heading ids: lift-section-ids
// runs later, per page, on rendered output, so the loader never sees it. The
// `#id` anchor still resolves at runtime because that pass lands the same id
// on the heading.
export function extractSections(html) {
  if (!html) {
    return [];
  }
  const $ = cheerio.load(html, null, false);
  const sections = [];
  $("article > section[id]").each((_, el) => {
    const $section = $(el);
    if ($section.attr("data-toc") === "omit") {
      return;
    }

    const $heading = $section.children("h2, h3, h4, h5").first();
    if (!$heading.length) {
      return;
    }

    // Heading text without the prepended anchor-link icon.
    const $clone = $heading.clone();
    $clone.find("a.anchor").remove();
    const title = $clone.text().trim();
    if (!title) {
      return;
    }

    sections.push({ anchor: $section.attr("id"), title });
  });
  return sections;
}
