// Slim pipeline that turns an article's source HTML into Markdown. The
// HTML branch (lib/pipeline.js) wraps images in <picture>/LQIP and code in
// <apidocs-code-box>, both of which turndown would have to undo; running a
// separate small set of passes keeps the Markdown converter operating on
// author-shape markup (`<img>`, `<pre data-language="X">`).
//
// Passes here are a subset of the HTML pipeline:
//   - substituteVariables: expand $VAR$ tokens (HTML branch does this at
//     processDocument time, after the layout wrap, which the Markdown
//     branch never reaches)
//   - embedCode: resolve <pre data-embed="path"> to file contents
//   - linkRewriter: rewrite foo.html → /foo/
//   - cleanPreText: strip highlight/hide directive comments and apply the
//     same common-indent/newline trimming the HTML branch applies inside
//     code-highlight.js, so the rendered fenced block matches what Shiki
//     would show
//   - image src rewriter (local, below): rewrite raster <img src> to the
//     deployed /assets/apidocs/img/<hashed> URL without wrapping in
//     <picture>. Shares loadImage() with imageProcessor so the second call
//     hits eleventy-img's in-memory cache for free.
//
// Returns { markdown, title, summary } so the caller can both write the
// per-page .md sibling and assemble an llms.txt index without having to
// reparse the output.

import * as cheerio from "cheerio";
import { cleanCodeText, readPreSource } from "./code-text.js";
import { htmlToMarkdown } from "./markdown.js";
import { embedCode } from "./passes/embed-code.js";
import {
  loadImage,
  pickFallbackFormat,
  pickFallbackVariant,
  RASTER
} from "./passes/image-processor.js";
import { linkRewriter } from "./passes/link-rewriter.js";
import { substituteVariables } from "./passes/variables.js";

export async function processMarkdown(html, ctx) {
  const substituted = substituteVariables(html, ctx.variables);
  const $ = cheerio.load(substituted, null, false);
  await embedCode($, ctx);
  linkRewriter($, ctx);
  cleanPreText($);
  await rewriteImageSrcs($, ctx);
  const title = extractTitle($);
  const summary = extractSummary($);
  const markdown = htmlToMarkdown($.html());
  return { markdown, title, summary };
}

function extractTitle($) {
  return normalize($("h1").first().text());
}

// Author-provided <meta name="description" content="..."> wins; otherwise
// the first <p> in document order (works for pages whose intro paragraph
// lives inside the first <section> rather than directly under <article>).
// Returns "" when neither is available.
function extractSummary($) {
  const meta = $('meta[name="description"]').attr("content");
  if (meta) {
    return normalize(meta);
  }
  const firstP = $("p").first();
  if (firstP.length) {
    return normalize(firstP.text());
  }
  return "";
}

function normalize(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPreText($) {
  $("pre[data-language]").each((_, el) => {
    const $el = $(el);
    const preserveIndent = hasFlag($el, "data-preserve-common-indent");
    const preserveNewlines = hasFlag($el, "data-preserve-leading-and-trailing-newlines");
    const { content } = cleanCodeText(readPreSource($el), { preserveIndent, preserveNewlines });
    $el.text(content);
  });
}

function hasFlag($el, name) {
  const v = $el.attr(name);
  return v === "" || v === name || v === "true" || v === "preserve";
}

async function rewriteImageSrcs($, ctx) {
  const targets = $("img")
    .toArray()
    .filter(el => {
      const src = $(el).attr("src");
      return src && RASTER.test(src) && !$(el).parents("pre").length;
    });
  if (!targets.length) {
    return;
  }

  await Promise.all(
    targets.map(async el => {
      const $img = $(el);
      const metadata = await loadImage($img.attr("src"), ctx);
      if (!metadata) {
        return;
      }
      const fallback = metadata[pickFallbackFormat(metadata)];
      $img.attr("src", pickFallbackVariant(fallback).url);
    })
  );
}
