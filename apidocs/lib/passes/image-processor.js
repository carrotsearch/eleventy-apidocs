// Process raster <img> tags through @11ty/eleventy-img: emit AVIF + WebP +
// fallback variants with srcsets, then replace the <img> with a <picture>
// wrapped in a LQIP container that holds the aspect ratio while the
// real image loads.
//
// Skipped inside <pre>. SVG handled separately by svg-inliner. The src
// is resolved against ctx.sourceDir. Output goes to ctx.outputDir/img.

import fs from "node:fs/promises";
import path from "node:path";
import Image from "@11ty/eleventy-img";

const RASTER = /\.(png|jpe?g|gif|webp|avif)$/i;
const DEFAULT_WIDTHS = [320, 640, 960, 1280, 1920];
const DEFAULT_FORMATS = ["avif", "webp", "auto"]; // auto = original format
const LQIP_WIDTH = 24;

export async function imageProcessor($, ctx) {
  const targets = $("img").toArray().filter(el => {
    const src = $(el).attr("src");
    return src && RASTER.test(src) && !$(el).parents("pre").length;
  });
  if (!targets.length) return;

  const outputDir = ctx.outputDir || "_site";
  const imgDir = path.join(outputDir, "img");
  const urlPath = "/img/";

  await Promise.all(targets.map(el => processOne($, el, ctx, imgDir, urlPath)));
}

async function processOne($, el, ctx, imgDir, urlPath) {
  const $img = $(el);
  const src = $img.attr("src");
  const filePath = path.resolve(ctx.sourceDir || ".", src);

  let metadata;
  try {
    metadata = await Image(filePath, {
      widths: [LQIP_WIDTH, ...DEFAULT_WIDTHS],
      formats: DEFAULT_FORMATS,
      outputDir: imgDir,
      urlPath,
      sharpOptions: { animated: true }
    });
  } catch (e) {
    console.warn(`[apidocs] Failed to process image ${src}: ${e.message}`);
    return;
  }

  // Pick the largest variant in the original format for dimensions.
  const fallbackFormat = pickFallbackFormat(metadata);
  const fallbackList = metadata[fallbackFormat];
  const largest = fallbackList[fallbackList.length - 1];

  // LQIP — read the tiny variant and base64 it for an instant inline preview.
  const lqip = await readLqip(metadata);

  const className = $img.attr("class") || "";
  const alt = $img.attr("alt") || "";
  const title = $img.attr("title");

  const sources = Object.entries(metadata)
    .filter(([fmt]) => fmt !== fallbackFormat)
    .map(([fmt, entries]) => {
      const visible = entries.filter(e => e.width !== LQIP_WIDTH);
      const srcset = visible.map(e => `${e.url} ${e.width}w`).join(", ");
      return `<source type="${visible[0].sourceType}" srcset="${srcset}" sizes="100vw">`;
    });

  const fallbackVisible = fallbackList.filter(e => e.width !== LQIP_WIDTH);
  const fallbackSrcset = fallbackVisible.map(e => `${e.url} ${e.width}w`).join(", ");

  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  const picture =
    `<picture>` +
    sources.join("") +
    `<img src="${largest.url}" srcset="${fallbackSrcset}" sizes="100vw"` +
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

function pickFallbackFormat(metadata) {
  for (const fmt of ["jpeg", "png", "gif", "webp"]) {
    if (metadata[fmt]?.length) return fmt;
  }
  // fall back to whatever's first
  return Object.keys(metadata)[0];
}

async function readLqip(metadata) {
  // Find the LQIP_WIDTH variant in any format; pick the smallest file.
  let smallest;
  for (const entries of Object.values(metadata)) {
    for (const e of entries) {
      if (e.width !== LQIP_WIDTH) continue;
      if (!smallest || e.size < smallest.size) smallest = e;
    }
  }
  if (!smallest) return null;
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
