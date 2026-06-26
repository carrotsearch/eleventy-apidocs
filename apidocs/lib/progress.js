// Build-progress reporter. Two backends behind one API: an interactive
// listr2 task tree that updates in place (full builds on a real terminal,
// see progress-listr.js), and the line-based fallback below (CI, piped
// output, and dev rebuilds). The build code calls the same functions either
// way — startBuild() picks the backend.
//
// Dev rebuilds (everything after the first `runMode === "serve"` build)
// go silent — keystroke-fast incrementals don't benefit from progress
// noise, and Eleventy's own "Wrote N files in Xs" already covers them.

import { performance } from "node:perf_hooks";
import { createListrBackend } from "./progress-listr.js";

let runMode = "build";
let firstServeBuildDone = false;
let seenImages = new Set();
let pageCount = 0;
let linkPageCount = 0;
let buildStart = 0;
let pendingNote = null;
let lastActivity = null;
let backend = null;

// Full builds always drive the listr tree (live on a TTY, append-only `simple`
// lines in CI — listr switches automatically). For dev `--serve`, only the
// first build gets the tree — the one build worth waiting on; later incremental
// rebuilds stay silent on the line backend, since a full-screen tree per
// keystroke would fight Eleventy's own watch logs.
function useListr(mode) {
  return mode === "build" || (mode === "serve" && !firstServeBuildDone);
}

// `APIDOCS_VERBOSE=1` is the plugin-side `--verbose`: Eleventy's CLI rejects
// unknown flags, so the toggle rides an env var instead. It selects listr2's
// `verbose` renderer (one tagged line per state change).
function verboseProgress() {
  return process.env.APIDOCS_VERBOSE === "1" || process.env.APIDOCS_VERBOSE === "true";
}

export function startBuild(mode) {
  runMode = mode || "build";
  seenImages = new Set();
  pageCount = 0;
  linkPageCount = 0;
  lastActivity = null;
  buildStart = performance.now();
  backend = useListr(runMode)
    ? createListrBackend({ verbose: verboseProgress(), dev: runMode === "serve" })
    : null;
}

export async function endBuild() {
  if (backend) {
    await backend.finish();
    backend = null;

    // Latch the dev flag here too: the first serve build used the tree, so its
    // line-backend counterpart never ran to flip this. Without it, every
    // subsequent rebuild would re-enter the tree instead of going silent.
    if (runMode === "serve") {
      firstServeBuildDone = true;
    }
    const dt = formatMs(performance.now() - buildStart);
    console.log(`[apidocs] build done: ${pageCount} pages, ${seenImages.size} images, ${dt}`);
    return;
  }
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
  if (backend) {
    backend.stageStart(label);
    try {
      const result = await fn();
      backend.stageDone(label, pendingNote);
      pendingNote = null;
      return result;
    } catch (err) {
      backend.stageFail(label, err);
      throw err;
    }
  }
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
// current stage's "done in …" line (line backend) or its task title (listr).
// Cleared at the next stage entry.
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
  pageCount += 1;
  if (backend) {
    lastActivity = url;
    backend.setRender(renderText());
    return;
  }
  if (!isVerbose()) {
    return;
  }
  console.log(`[apidocs] page #${pageCount}: ${url}`);
}

// Per-page counter for the link-check crawl, driven by linkinator's `pagestart`
// event (see check-links.js). The crawl visits every built page to validate its
// links and #fragment anchors — a cost proportional to page count that the
// "links" stage would otherwise spend in silence. Mirrors page() above.
export function linkPage(url) {
  linkPageCount += 1;
  if (backend) {
    backend.setLinkPage(`${linkPageCount} pages — ${url}`);
    return;
  }
  if (!isVerbose()) {
    return;
  }
  console.log(`[apidocs] link check #${linkPageCount}: ${url}`);
}

// Dedupe by src — the same image embedded on multiple pages still calls
// imageProcessor once per page, but eleventy-img's memory cache makes
// every call after the first a no-op. Logging only the first sighting
// keeps the counter honest.
export function image(src) {
  if (seenImages.has(src)) {
    return;
  }
  seenImages.add(src);
  if (backend) {
    lastActivity = src.split("/").pop();
    backend.setRender(renderText());
    return;
  }
  if (!isVerbose()) {
    return;
  }
  console.log(`[apidocs] image #${seenImages.size}: ${src}`);
}

// One-line summary for the render task's live output: page and image counts
// plus the most recent path, so the phase reads as proportional progress.
function renderText() {
  let text = `${pageCount} pages`;
  if (seenImages.size) {
    text += `, ${seenImages.size} images`;
  }
  if (lastActivity) {
    text += ` — ${lastActivity}`;
  }
  return text;
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
