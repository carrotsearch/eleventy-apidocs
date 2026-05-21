import path from "node:path";

// Rewrites absolute URLs (leading "/") to be relative to the given page URL,
// so the generated site works from any URL prefix without a rebuild.
//
// Covers href, src, and srcset. Inline style url() is a roadmap item.
export function relativizeHtml(html, fromUrl) {
  if (!fromUrl) return html;
  let out = html.replace(/\b(href|src)="([^"]+)"/g, (match, attr, url) => {
    return `${attr}="${relativizeUrl(url, fromUrl)}"`;
  });
  out = out.replace(/\bsrcset="([^"]+)"/g, (match, value) => {
    const rewritten = value
      .split(",")
      .map(part => {
        const trimmed = part.trim();
        if (!trimmed) return trimmed;
        // "url [descriptor]" — split on whitespace; descriptor may be absent.
        const ws = trimmed.indexOf(" ");
        if (ws === -1) return relativizeUrl(trimmed, fromUrl);
        const url = trimmed.slice(0, ws);
        const descriptor = trimmed.slice(ws);
        return relativizeUrl(url, fromUrl) + descriptor;
      })
      .join(", ");
    return `srcset="${rewritten}"`;
  });
  return out;
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
