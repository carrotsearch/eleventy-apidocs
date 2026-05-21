import path from "node:path";

// Rewrites absolute URLs (leading "/") to be relative to the given page URL,
// so the generated site works from any URL prefix without a rebuild.
//
// Covers href="..." and src="..." in v0. srcset / inline style url() are
// roadmap items along with the responsive-image and Pagefind phases.
export function relativizeHtml(html, fromUrl) {
  if (!fromUrl) return html;
  return html.replace(/\b(href|src)="([^"]+)"/g, (match, attr, url) => {
    return `${attr}="${relativizeUrl(url, fromUrl)}"`;
  });
}

function relativizeUrl(url, fromUrl) {
  if (
    !url ||
    !url.startsWith("/") ||
    url.startsWith("/.11ty/") ||
    url.startsWith("//")
  ) {
    return url;
  }

  const fromDir = fromUrl.endsWith("/") ? fromUrl : path.dirname(fromUrl) + "/";
  let rel = path.relative(fromDir, url);
  if (!rel.startsWith(".")) rel = "./" + rel;
  if (url.endsWith("/") && !rel.endsWith("/")) rel += "/";
  return rel;
}
