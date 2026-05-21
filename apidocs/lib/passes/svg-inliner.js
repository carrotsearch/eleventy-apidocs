// Replace <img src="*.svg"> with the file's <svg> element inlined into
// the document. The src is resolved against ctx.sourceDir; any class
// attribute on the original <img> carries over to the inlined <svg>.
//
// Skipped inside <pre> (so SVG markup shown in code samples is left alone).

import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

export async function svgInliner($, ctx) {
  const targets = $('img[src$=".svg"], img[src$=".SVG"]').toArray();
  for (const el of targets) {
    if ($(el).parents("pre").length) continue;
    await inlineOne($, el, ctx);
  }
}

async function inlineOne($, el, ctx) {
  const $img = $(el);
  const src = $img.attr("src");
  const filePath = path.resolve(ctx.sourceDir || ".", src);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    console.warn(`[apidocs] Failed to inline SVG ${src}: ${e.message}`);
    return;
  }

  // Strip any XML declaration before parsing.
  raw = raw.replace(/^\s*<\?xml[^?]*\?>\s*/i, "");

  const $svg = cheerio.load(raw, null, false);
  const svgEl = $svg("svg").first();
  if (!svgEl.length) {
    console.warn(`[apidocs] No <svg> element found in ${src}`);
    return;
  }

  // Carry over the img's class and alt (alt → aria-label).
  const className = $img.attr("class");
  const alt = $img.attr("alt");
  if (className) {
    const existing = svgEl.attr("class") || "";
    svgEl.attr("class", `${existing} ${className}`.trim());
  }
  if (alt && !svgEl.attr("aria-label")) {
    svgEl.attr("aria-label", alt);
    svgEl.attr("role", "img");
  }

  $img.replaceWith($svg.html(svgEl));
}
