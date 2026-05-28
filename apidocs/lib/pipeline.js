// HTML pipeline. Pass order is fixed — each step depends on the shape
// produced by the previous ones; the per-call comments below explain why
// each pass sits where it does.
//
// processContent() runs the inner-content passes on the raw article HTML.
// processDocument() runs whole-document passes (current-year + $VAR$) on
// the page after the layout wraps the content. Splitting them lets
// variables and current-year reach layout-injected markup (e.g. footer
// year, header $SITE_NAME$), not just article body.

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

  // User transformers run first so callers can mutate source before any
  // built-in pass observes it.
  for (const fn of ctx.transformers ?? []) {
    await fn($, ctx);
  }

  // Inline <img src="*.svg"> as actual <svg>. Must precede imageProcessor,
  // which only handles raster sources and would otherwise wrap the SVG in
  // a <picture> it can't make variants for.
  await svgInliner($, ctx);

  // Wrap raster <img> in responsive <picture> + LQIP. Runs before the link
  // rewriter so the absolute /assets/ URLs it emits aren't picked up as
  // candidates for foo.html → /foo/ rewriting.
  await imageProcessor($, ctx);

  // foo.html → /foo/ on <a href>. External and data-external links are
  // left alone.
  linkRewriter($, ctx);

  // Normalize id placement (lift heading id onto its parent <section>
  // when the section has none; either authoring form is accepted, the
  // internal shape from here on is always section-id) and inject
  // <a class="anchor"> icons into the first heading of every id-bearing
  // section.
  sectionAnchors($);

  // Resolve <pre data-embed> / <embed src> by loading the referenced
  // file. Runs before the highlighter so embedded source gets highlighted
  // like any other <pre data-language>.
  await embedCode($, ctx);

  // Shiki + highlight/hide directives. Reads <pre data-language>;
  // replaces it with <apidocs-code-box> wrapping highlighted HTML. Runs
  // after embed so external sources are highlighted, and before
  // fragmentIds so md5 ids don't get stamped on code text.
  await codeHighlight($, ctx);

  // md5-based ids on p/li/dt for deep links. Stable across builds so
  // bookmarks survive unrelated content drift.
  fragmentIds($);

  // Walk <article> > <section> into a nested entry tree. Runs after
  // sectionAnchors so the heading's <a.anchor> icon can be stripped from
  // the label.
  ctx.toc = buildToc($);

  // Collect symbol names (.api elements, the page <h1>, id-bearing
  // sections) for fuzzysort. Runs after fragmentIds so symbols inside
  // prose can fall back to the nearest id-bearing ancestor for their
  // anchor.
  extractSymbols($, ctx);

  // Strip the page h1 from Pagefind's content stream — fuzzysort owns
  // page-title matches, and otherwise every prose excerpt would start
  // with the title prefix. Section headings stay indexed: Pagefind
  // builds sub-result anchors from heading text + id together.
  tagPagefindIgnore($);

  // Move <section id> onto the section's first heading. Runs last among
  // content passes because buildToc and extractSymbols read the
  // section-id shape, while Pagefind's sub-result anchors need the
  // heading-id shape in the final HTML.
  liftSectionIds($);

  // User finalizers run on the near-final shape.
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

  // $VAR$ substitution runs LAST, on the wrapped document, so variables
  // can appear anywhere — including in layout-injected markup like the
  // footer year or header site name.
  out = substituteVariables(out, ctx.variables);
  return out;
}
