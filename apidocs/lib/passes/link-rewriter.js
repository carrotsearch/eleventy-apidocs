import path from "node:path";

// Rewrite internal .html links to clean directory URLs (foo.html → /foo/).
//
// Relative hrefs are resolved against the page's source URL (e.g.
// /callouts.html) so the result is a root-relative path. relativizeHtml
// later re-relativizes against the rendered URL (e.g. /callouts/), which
// is what makes ../foo/ work from a trailing-slash directory URL.
//
// Skip:
//   - <a data-external> (explicit opt-out)
//   - protocol-bearing or protocol-relative URLs (http:, https:, //, mailto:, etc.)
//   - fragment-only or empty hrefs

const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

export function linkRewriter($, ctx) {
  const pageUrl = ctx?.page?.url || "/";

  // Source URL: where this page would live before Eleventy's pretty-URL
  // rewrite. /callouts/ → /callouts.html, / → /index.html.
  const sourceUrl = pageUrl === "/" ? "/index.html" : pageUrl.replace(/\/$/, ".html");
  const sourceDir = sourceUrl.slice(0, sourceUrl.lastIndexOf("/") + 1);

  $("a[href]").each((_, el) => {
    const $a = $(el);
    if ($a.attr("data-external") !== undefined) {
      return;
    }
    const href = $a.attr("href");
    if (!href || href.startsWith("#")) {
      return;
    }
    if (ABSOLUTE.test(href)) {
      return;
    }

    const m = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    if (!m) {
      return;
    }
    const [, pathPart, query = "", fragment = ""] = m;
    if (!/\.html?$/i.test(pathPart)) {
      return;
    }

    const resolved = pathPart.startsWith("/")
      ? pathPart
      : path.posix.normalize(sourceDir + pathPart);
    const cleaned = resolved.replace(/\.html?$/i, "/");
    $a.attr("href", cleaned + query + fragment);
  });
}
