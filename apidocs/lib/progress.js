// Build-progress reporter. Streams a per-image counter and bracketed
// timing lines for each top-level stage (CSS/JS bundle, symbols.json,
// Pagefind), plus a final tally.
//
// Dev rebuilds (everything after the first `runMode === "serve"` build)
// go silent — keystroke-fast incrementals don't benefit from progress
// noise, and Eleventy's own "Wrote N files in Xs" already covers them.

import { performance } from "node:perf_hooks";

let runMode = "build";
let firstServeBuildDone = false;
let seenImages = new Set();
let pageCount = 0;
let linkPageCount = 0;
let buildStart = 0;
let pendingNote = null;

export function startBuild(mode) {
  runMode = mode || "build";
  seenImages = new Set();
  pageCount = 0;
  linkPageCount = 0;
  buildStart = performance.now();
}

export function endBuild() {
  if (!isVerbose()) {
    if (runMode === "serve") {
      firstServeBuildDone = true;
    }
    return;
  }
  const dt = formatMs(performance.now() - buildStart);
  console.log(`[apidocs] build done: ${pageCount} pages, ${seenImages.size} images, ${dt}`);
  if (runMode === "serve") {
    firstServeBuildDone = true;
  }
}

export async function stage(label, fn) {
  pendingNote = null;
  if (!isVerbose()) {
    return await fn();
  }
  const t0 = performance.now();
  console.log(`[apidocs] ${label}...`);
  try {
    const result = await fn();
    const tail = pendingNote ? `, ${pendingNote}` : "";
    pendingNote = null;
    console.log(`[apidocs] ${label} done in ${formatMs(performance.now() - t0)}${tail}`);
    return result;
  } catch (err) {
    console.log(`[apidocs] ${label} failed in ${formatMs(performance.now() - t0)}`);
    throw err;
  }
}

// Attach an extra detail (e.g. an artifact's uncompressed size) to the
// current stage's "done in …" line. Cleared at the next stage entry.
export function note(text) {
  pendingNote = text;
}

export function formatBytes(n) {
  if (n < 1000) {
    return `${n} B`;
  }
  if (n < 1_000_000) {
    return `${(n / 1000).toFixed(1)} kB`;
  }
  return `${(n / 1_000_000).toFixed(2)} MB`;
}

// Per-page render counter. Page rendering runs inside Eleventy's own render
// loop, not under a stage(), so the long gap between "js done" and the
// post-build stages is otherwise silent — only image-bearing pages surfaced
// anything (via image() below). One line per page makes that phase visible and
// proportional to page count. Caller passes the page URL.
export function page(url) {
  if (!isVerbose()) {
    return;
  }
  pageCount += 1;
  console.log(`[apidocs] page #${pageCount}: ${url}`);
}

// Per-page counter for the link-check crawl, driven by linkinator's `pagestart`
// event (see check-links.js). The crawl visits every built page to validate its
// links and #fragment anchors — a cost proportional to page count that the
// "links" stage would otherwise spend in silence. Mirrors page() above.
export function linkPage(url) {
  if (!isVerbose()) {
    return;
  }
  linkPageCount += 1;
  console.log(`[apidocs] link check #${linkPageCount}: ${url}`);
}

// Dedupe by src — the same image embedded on multiple pages still calls
// imageProcessor once per page, but eleventy-img's memory cache makes
// every call after the first a no-op. Logging only the first sighting
// keeps the counter honest.
export function image(src) {
  if (!isVerbose()) {
    return;
  }
  if (seenImages.has(src)) {
    return;
  }
  seenImages.add(src);
  console.log(`[apidocs] image #${seenImages.size}: ${src}`);
}

function isVerbose() {
  return runMode !== "serve" || !firstServeBuildDone;
}

function formatMs(ms) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
