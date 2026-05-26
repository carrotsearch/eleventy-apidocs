// HTML pipeline. Ported from gatsby-transformer-html.
//
// Pass order is fixed (see apidocs_authoring_contract memory):
//   1. user transformers
//   2. svg inliner                       [Phase 4]
//   3. image processor                   [Phase 4]
//   4. internal link rewriter
//   5. section anchor injection
//   6. embed code                        [Phase 3]
//   7. code highlighter                  [Phase 3]
//   8. fragment-ID assignment
//   9. toc + symbol extraction           (consume section ids)
//   10. pagefind-ignore tagging          (hide page h1 from Pagefind body)
//   11. lift section ids to headings     (final HTML shape — for Pagefind)
//   12. user finalizers
//   13. variable substitution            (runs on the wrapped document — see processDocument)
//
// processContent() runs the inner-content passes (1-9). processDocument()
// runs whole-document passes (current-year + $VAR$) after the layout wraps
// the content. Splitting them lets variables and current-year reach
// layout-injected markup, matching the Gatsby behavior.

import * as cheerio from "cheerio";
import { codeHighlight } from "./passes/code-highlight.js";
import { currentYear } from "./passes/current-year.js";
import { embedCode } from "./passes/embed-code.js";
import { fragmentIds } from "./passes/fragment-ids.js";
import { imageProcessor } from "./passes/image-processor.js";
import { liftSectionIds } from "./passes/lift-section-ids.js";
import { linkRewriter } from "./passes/link-rewriter.js";
import { tagPagefindIgnore } from "./passes/pagefind-ignore.js";
import { sectionAnchors } from "./passes/section-anchors.js";
import { svgInliner } from "./passes/svg-inliner.js";
import { extractSymbols } from "./passes/symbol-extractor.js";
import { buildToc } from "./passes/toc-builder.js";
import { substituteVariables } from "./passes/variables.js";

// Load HTML as a fragment — cheerio's default mode wraps content in
// <html><head><body>, which we don't want for inner article fragments.
function loadFragment(html) {
  return cheerio.load(html, null, false);
}

// Load a full HTML document — used for the wrapped page.
function loadDocument(html) {
  return cheerio.load(html);
}

/**
 * Run the inner-content pipeline. `html` is the raw article HTML from the
 * content directory.
 */
export async function processContent(html, ctx) {
  const $ = loadFragment(html);

  for (const fn of ctx.transformers ?? []) {
    await fn($, ctx);
  }

  await svgInliner($, ctx);
  await imageProcessor($, ctx);
  linkRewriter($, ctx);
  sectionAnchors($);
  await embedCode($, ctx);
  await codeHighlight($, ctx);
  fragmentIds($);
  // Build ToC after anchor injection so heading text excludes the
  // anchor icon.
  ctx.toc = buildToc($);
  // Symbol harvest runs after fragmentIds so anchor resolution can fall
  // back to the nearest ancestor id (the enclosing section).
  extractSymbols($, ctx);
  // Strip the page h1 from Pagefind's content stream — fuzzysort owns
  // page-title matches, and otherwise every prose excerpt would start
  // with the title prefix. Section headings stay indexed: Pagefind
  // builds sub-result anchors from heading text + id together.
  tagPagefindIgnore($);
  // Move section ids onto their headings — final HTML carries heading
  // ids so Pagefind's sub-result anchors work. Runs after the section-id
  // consumers above.
  liftSectionIds($);

  for (const fn of ctx.finalizers ?? []) {
    await fn($, ctx);
  }

  return $.html();
}

/**
 * Run whole-document passes. `html` is the fully-wrapped page (content
 * inside the apidocs layout).
 */
export function processDocument(html, ctx) {
  const $ = loadDocument(html);
  currentYear($, ctx.buildYear);
  let out = $.html();
  out = substituteVariables(out, ctx.variables);
  return out;
}
