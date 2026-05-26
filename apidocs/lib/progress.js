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
let buildStart = 0;

export function startBuild(mode) {
  runMode = mode || "build";
  seenImages = new Set();
  buildStart = performance.now();
}

export function endBuild() {
  if (!isVerbose()) {
    if (runMode === "serve") firstServeBuildDone = true;
    return;
  }
  const dt = formatMs(performance.now() - buildStart);
  console.log(`[apidocs] build done: ${seenImages.size} images, ${dt}`);
  if (runMode === "serve") firstServeBuildDone = true;
}

export async function stage(label, fn) {
  if (!isVerbose()) return await fn();
  const t0 = performance.now();
  console.log(`[apidocs] ${label}...`);
  try {
    const result = await fn();
    console.log(`[apidocs] ${label} done in ${formatMs(performance.now() - t0)}`);
    return result;
  } catch (err) {
    console.log(`[apidocs] ${label} failed in ${formatMs(performance.now() - t0)}`);
    throw err;
  }
}

// Dedupe by src — the same image embedded on multiple pages still calls
// imageProcessor once per page, but eleventy-img's memory cache makes
// every call after the first a no-op. Logging only the first sighting
// keeps the counter honest.
export function image(src) {
  if (!isVerbose()) return;
  if (seenImages.has(src)) return;
  seenImages.add(src);
  console.log(`[apidocs] image #${seenImages.size}: ${src}`);
}

function isVerbose() {
  return runMode !== "serve" || !firstServeBuildDone;
}

function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
