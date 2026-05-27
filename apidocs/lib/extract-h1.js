import * as cheerio from "cheerio";

// Extracts the text of the first <h1> from an HTML fragment, with inline
// tags stripped. Returns null when no <h1> is present or its text is empty.
export function extractH1(html) {
  if (!html) {
    return null;
  }
  const $ = cheerio.load(html, null, false);
  const h1 = $("h1").first();
  if (!h1.length) {
    return null;
  }
  const text = h1.text().trim();
  return text || null;
}
