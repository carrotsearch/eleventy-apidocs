// Strip the page-level <h1> from Pagefind's content stream so prose
// excerpts don't start with the page title.
//
// Pagefind serializes each page as one buffer; the page title is just
// the first block, so a query that matches the lead paragraph produces
// an excerpt like "Managing properties. Properties control…". fuzzysort
// already covers page-title matches via the "Pages and sections" group,
// so Pagefind doesn't need the h1.
//
// We do NOT ignore section headings — Pagefind builds its sub_result
// anchor list from heading text + id together, and stripping the text
// makes the heading disappear as an anchor candidate, collapsing every
// hit to the page top. The mild cosmetic cost of section-heading text
// appearing in some excerpts is worth keeping deep-link sub-results.
//
// Runs before liftSectionIds; only the h1 is touched, so pass ordering
// doesn't matter for this pass.

export function tagPagefindIgnore($) {
  $("article > h1").attr("data-pagefind-ignore", "");
}
