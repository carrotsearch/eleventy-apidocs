// Extracts the first <h1> from an HTML string and strips inline tags.
// Returns null when no <h1> is present.
export function extractH1(html) {
  if (!html) return null;
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim() || null;
}
