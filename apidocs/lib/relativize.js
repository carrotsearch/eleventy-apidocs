import path from "node:path";
import * as cheerio from "cheerio";

// Rewrites absolute URLs (leading "/") to be relative to the given page URL,
// so the generated site works from any URL prefix without a rebuild.
//
// Covers href, src, and srcset. Inline style url() is a roadmap item. Runs
// on the wrapped document after $VAR$ substitution, so a variable that
// expands to an absolute path (e.g. href="$BASE$/page" → /page) is
// relativized too.
export function relativizeHtml(html, fromUrl) {
  if (!fromUrl) {
    return html;
  }
  const $ = cheerio.load(html);
  relativizeUrls($, fromUrl);
  return $.html();
}

// Walk the parsed document and relativize every href/src/srcset. Working on
// the DOM rather than a regexp over the serialized HTML means we only touch
// real attributes — never a URL-shaped string sitting in script text, a
// comment, or prose.
export function relativizeUrls($, fromUrl) {
  if (!fromUrl) {
    return;
  }
  $("[href]").each((_, el) => {
    const $el = $(el);
    $el.attr("href", relativizeUrl($el.attr("href"), fromUrl));
  });
  $("[src]").each((_, el) => {
    const $el = $(el);
    $el.attr("src", relativizeUrl($el.attr("src"), fromUrl));
  });
  $("[srcset]").each((_, el) => {
    const $el = $(el);
    $el.attr("srcset", relativizeSrcset($el.attr("srcset"), fromUrl));
  });
}

function relativizeSrcset(value, fromUrl) {
  return value
    .split(",")
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) {
        return trimmed;
      }
      // "url [descriptor]" — split on whitespace; descriptor may be absent.
      const ws = trimmed.indexOf(" ");
      if (ws === -1) {
        return relativizeUrl(trimmed, fromUrl);
      }
      const url = trimmed.slice(0, ws);
      const descriptor = trimmed.slice(ws);
      return relativizeUrl(url, fromUrl) + descriptor;
    })
    .join(", ");
}

export function relativizeUrl(url, fromUrl) {
  if (!url?.startsWith("/") || url.startsWith("/.11ty/") || url.startsWith("//")) {
    return url;
  }

  // URL paths always use "/" — path.posix keeps the output forward-slashed
  // on Windows, where the platform default would emit backslashes.
  const fromDir = fromUrl.endsWith("/") ? fromUrl : `${path.posix.dirname(fromUrl)}/`;
  let rel = path.posix.relative(fromDir, url);
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  if (url.endsWith("/") && !rel.endsWith("/")) {
    rel += "/";
  }
  return rel;
}
