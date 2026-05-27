// Lift the canonical section id onto its first heading. Authors write
// ids on <section> and the pipeline reads from there (clean authoring
// shape), but the rendered HTML carries the id on the heading instead.
//
// Reason: Pagefind's sub-result anchors only walk heading ids. Without
// this lift, every search hit would land at the page top rather than the
// matching subsection. The lift also keeps long-standing in-page bookmark
// targets (#heading-id) compatible.
//
// Runs after buildToc and extractSymbols so those passes still see the
// canonical section-id form.

export function liftSectionIds($) {
  $("article section[id]").each((_, section) => {
    const $section = $(section);
    const $heading = $section.children("h2, h3, h4, h5").first();
    if (!$heading.length || $heading.attr("id")) {
      return;
    }
    $heading.attr("id", $section.attr("id"));
    $section.removeAttr("id");
  });
}
