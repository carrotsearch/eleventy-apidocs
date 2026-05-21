// Rewrite internal .html links to clean directory URLs (foo.html → foo/).
// Skip:
//   - <a data-external> (explicit opt-out)
//   - protocol-bearing or protocol-relative URLs (http:, https:, //, mailto:, etc.)
//   - fragment-only or empty hrefs
// The rewrite preserves any #hash and ?query suffix.

const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

export function linkRewriter($) {
  $("a[href]").each((_, el) => {
    const $a = $(el);
    if ($a.attr("data-external") !== undefined) return;
    const href = $a.attr("href");
    if (!href || href.startsWith("#")) return;
    if (ABSOLUTE.test(href)) return;

    // Split off ?query and #fragment.
    const m = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    if (!m) return;
    const [, pathPart, query = "", fragment = ""] = m;
    if (!/\.html?$/i.test(pathPart)) return;

    const cleaned = pathPart.replace(/\.html?$/i, "/");
    $a.attr("href", cleaned + query + fragment);
  });
}
