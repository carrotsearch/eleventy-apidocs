// Process raster <img> tags through @11ty/eleventy-img: emit AVIF + WebP +
// fallback variants with srcsets, then replace the <img> with a <picture>
// wrapped in a LQIP container that holds the aspect ratio while the
// real image loads.
//
// Skipped inside <pre>. SVG handled separately by svg-inliner. The src
// is resolved against ctx.sourceDir. Output is namespaced under
// assets/apidocs/img so it can't collide with an authored page slug.

import fs from "node:fs/promises";
import path from "node:path";
import Image from "@11ty/eleventy-img";
import * as progress from "../progress.js";

export const RASTER = /\.(png|jpe?g|gif|webp|avif)$/i;
const DEFAULT_WIDTHS = [320, 640, 960, 1280, 1920, 2560, 3840];
const DEFAULT_FORMATS = ["avif", "webp", "auto"]; // auto = original format
const LQIP_WIDTH = 24;

// Cap for the single-URL paths — the <picture>'s bare <img src> fallback and
// the Markdown branch's <img src>. The responsive srcset carries the full
// ladder (up to native) for modern browsers and the lightbox upgrade; this
// keeps the no-srcset fallback from ballooning to a 3840/native variant.
const FALLBACK_WIDTH = 1920;

// Run an image through eleventy-img with the framework's standard widths
// and formats. Both the HTML pipeline (this file's imageProcessor) and the
// Markdown pipeline (process-markdown.js) call this — eleventy-img's
// in-memory cache makes the second call a no-op as long as the options
// match, so keeping a single entry point matters.
export async function loadImage(src, ctx) {
  const outputDir = ctx.outputDir || "_site";
  const imgDir = path.join(outputDir, "assets/apidocs/img");
  const urlPath = "/assets/apidocs/img/";
  const filePath = path.resolve(ctx.sourceDir || ".", src);
  try {
    return await Image(filePath, {
      // null = the source's own intrinsic width — the true ceiling the
      // lightbox upgrade can climb to. eleventy-img drops ladder rungs above
      // the source, so small images are unaffected.
      widths: [LQIP_WIDTH, ...DEFAULT_WIDTHS, null],
      formats: DEFAULT_FORMATS,
      outputDir: imgDir,
      urlPath,
      sharpOptions: { animated: true }
    });
  } catch (e) {
    console.warn(`[apidocs] Failed to process image ${src}: ${e.message}`);
    return null;
  }
}

// Pick the original-format variant list from an eleventy-img metadata bag.
// "Original" meaning the fallback browsers reach for when neither AVIF nor
// WebP is acceptable. Exported so the Markdown branch can resolve the same
// fallback URL we use for the HTML <picture>'s <img src>.
export function pickFallbackFormat(metadata) {
  for (const fmt of ["jpeg", "png", "gif", "webp"]) {
    if (metadata[fmt]?.length) {
      return fmt;
    }
  }
  return Object.keys(metadata)[0];
}

// Pick the variant a single-URL consumer should point its src at: the largest
// one no wider than FALLBACK_WIDTH (today's display default), so the bare
// <img src> fallback and the Markdown branch don't reference a 3840/native
// variant. Falls back to the largest available for sub-FALLBACK_WIDTH sources.
// Used by both pipelines; the responsive srcset still carries the full ladder.
export function pickFallbackVariant(entries) {
  const capped = entries.filter(e => e.width <= FALLBACK_WIDTH);
  const list = capped.length ? capped : entries;
  return list[list.length - 1];
}

export async function imageProcessor($, ctx) {
  const targets = $("img")
    .toArray()
    .filter(el => {
      const src = $(el).attr("src");
      return src && RASTER.test(src) && !$(el).parents("pre").length;
    });
  if (!targets.length) {
    return;
  }

  await Promise.all(targets.map(el => processOne($, el, ctx)));
}

async function processOne($, el, ctx) {
  const $img = $(el);
  const src = $img.attr("src");

  const metadata = await loadImage(src, ctx);
  if (!metadata) {
    return;
  }

  progress.image(src);

  // Pick the largest variant in the original format for dimensions, and the
  // capped variant for the bare <img src> fallback (the srcset carries the
  // rest). The ratio is identical across variants, so largest is purely for
  // intrinsic width/height and the LQIP aspect-ratio.
  const fallbackFormat = pickFallbackFormat(metadata);
  const fallbackList = metadata[fallbackFormat];
  const largest = fallbackList[fallbackList.length - 1];
  const fallbackVariant = pickFallbackVariant(fallbackList);

  // LQIP — read the tiny variant and base64 it for an instant inline preview.
  const lqip = await readLqip(metadata);

  const className = $img.attr("class") || "";
  const alt = $img.attr("alt") || "";
  const title = $img.attr("title");

  const sources = Object.entries(metadata)
    .filter(([fmt]) => fmt !== fallbackFormat)
    .map(([_fmt, entries]) => {
      // A source narrower than LQIP_WIDTH yields only the LQIP variant, so
      // filtering it out leaves nothing — skip the <source> rather than
      // dereference visible[0] of an empty list.
      const visible = entries.filter(e => e.width !== LQIP_WIDTH);
      if (!visible.length) {
        return "";
      }
      const srcset = visible.map(e => `${e.url} ${e.width}w`).join(", ");

      // sizes="auto" lets the browser select against each image's real
      // laid-out box (the images are loading="lazy"), so the article fetches a
      // column-sized variant instead of over-fetching for a 100vw lie. The
      // lightbox re-selects against the full-viewport box on zoom.
      return `<source type="${visible[0].sourceType}" srcset="${srcset}" sizes="auto">`;
    });

  const fallbackVisible = fallbackList.filter(e => e.width !== LQIP_WIDTH);
  const fallbackSrcset = fallbackVisible.map(e => `${e.url} ${e.width}w`).join(", ");
  const fallbackSrcsetAttr = fallbackSrcset ? ` srcset="${fallbackSrcset}" sizes="auto"` : "";

  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  const picture =
    `<picture>` +
    sources.join("") +
    `<img src="${fallbackVariant.url}"${fallbackSrcsetAttr}` +
    ` width="${largest.width}" height="${largest.height}"` +
    ` alt="${escapeAttr(alt)}"${titleAttr}` +
    ` loading="lazy" decoding="async">` +
    `</picture>`;

  const lqipStyle = lqip
    ? ` style="aspect-ratio: ${largest.width} / ${largest.height}; background-image: url('${lqip}')"`
    : ` style="aspect-ratio: ${largest.width} / ${largest.height}"`;
  const lqipClass = ["lqip", className].filter(Boolean).join(" ");

  $img.replaceWith(`<span class="${lqipClass}"${lqipStyle}>${picture}</span>`);
}

async function readLqip(metadata) {
  // Find the LQIP_WIDTH variant in any format; pick the smallest file.
  let smallest;
  for (const entries of Object.values(metadata)) {
    for (const e of entries) {
      if (e.width !== LQIP_WIDTH) {
        continue;
      }
      if (!smallest || e.size < smallest.size) {
        smallest = e;
      }
    }
  }
  if (!smallest) {
    return null;
  }
  try {
    const buf = await fs.readFile(smallest.outputPath);
    return `data:${smallest.sourceType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
