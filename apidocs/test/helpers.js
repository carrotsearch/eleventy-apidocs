import * as cheerio from "cheerio";

// Load HTML as an inner fragment — same mode pipeline.js uses for article
// content. Returns the cheerio object so tests can pass it straight to a pass.
export function loadFragment(html) {
  return cheerio.load(html, null, false);
}
