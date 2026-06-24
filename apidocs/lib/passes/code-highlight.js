// Highlight <pre data-language="X"> blocks with Shiki.
// Honors directive comments inside the code:
//   // hide-line          // hide-next-line        // hide-range{N-M}
//   // highlight-line     // highlight-next-line   // highlight-range{N-M}
//   /* highlight-line */  // same as above, block-comment form
// Hidden lines are removed; highlighted lines get a .highlighted class on
// their .line wrapper so CSS can paint them. The directive comments are
// stripped from the rendered code (for -line they're removed in-place; for
// -next-line and -range the directive line itself is removed).
//
// The original (unrendered) plain text is preserved on the wrapper as
// data-plain-text so <apidocs-code-box> can copy it to clipboard.

import { transformerStyleToClass } from "@shikijs/transformers";
import { createHighlighter, isSpecialLang } from "shiki";
import { cleanCodeText, readPreSource } from "../code-text.js";

const PRESERVED_DATA = new Set([
  "preserve-common-indent",
  "preserve-leading-and-trailing-newlines",
  "language"
]);

const THEMES = { light: "github-light", dark: "github-dark" };
const LANGS = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "html",
  "css",
  "scss",
  "bash",
  "shell",
  "yaml",
  "xml",
  "markdown",
  "java",
  "python",
  "http"
];

let highlighterPromise;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: Object.values(THEMES), langs: LANGS });
  }
  return highlighterPromise;
}

// Hoists Shiki's per-token inline styles into deduplicated CSS classes plus a
// generated stylesheet, instead of repeating `style="--shiki-light:…;
// --shiki-dark:…"` on every span. One module-level instance accumulates a
// build-scoped registry across all pages (same lifetime as the highlighter
// above); index.js folds its getCSS() into the main bundle in eleventy.after.
// Class names are content-hashed, so the registry is deterministic and safe to
// grow monotonically across incremental dev rebuilds.
let styleToClass;
function getStyleToClass() {
  if (!styleToClass) {
    styleToClass = transformerStyleToClass({ classPrefix: "sk-" });
  }
  return styleToClass;
}

export function codeStylesCss() {
  return styleToClass ? styleToClass.getCSS() : "";
}

const warnedLangs = new Set();

export async function codeHighlight($, _ctx) {
  const targets = $("pre[data-language]").toArray();
  if (!targets.length) {
    return;
  }
  const highlighter = await getHighlighter();
  const loaded = new Set(highlighter.getLoadedLanguages());

  for (const el of targets) {
    const $el = $(el);
    const rawLang = $el.attr("data-language");
    const lang = normalizeLang(rawLang);
    const preserveIndent = has($el, "data-preserve-common-indent");
    const preserveNewlines = has($el, "data-preserve-leading-and-trailing-newlines");

    const { content, highlighted } = cleanCodeText(readPreSource($el), {
      preserveIndent,
      preserveNewlines
    });

    // Shiki's plain-text/ansi languages render without a grammar and never
    // appear in getLoadedLanguages(); isSpecialLang covers them so an explicit
    // data-language="text" doesn't trip the unknown-language warning below.
    const known = loaded.has(lang) || isSpecialLang(lang);
    if (!known && !warnedLangs.has(lang)) {
      warnedLangs.add(lang);
      console.warn(
        `[apidocs] unknown data-language="${rawLang}" — rendered as plain text. ` +
          `Add it to LANGS in code-highlight.js, or alias it in normalizeLang.`
      );
    }
    const safeLang = known ? lang : "text";
    const html = highlighter.codeToHtml(content, {
      lang: safeLang,
      themes: THEMES,
      defaultColor: false,
      transformers: [
        getStyleToClass(),
        {
          line(node, line) {
            if (highlighted.has(line)) {
              this.addClassToHast(node, "highlighted");
            }
          }
        }
      ]
    });

    const carryAttrs = collectAttrs($el);
    const plain = encodeAttr(content);
    $el.replaceWith(
      `<apidocs-code-box${carryAttrs} data-plain-text="${plain}">${html}</apidocs-code-box>`
    );
  }
}

function collectAttrs($el) {
  const attrs = [];
  const cls = $el.attr("class");
  if (cls) {
    attrs.push(`class="${encodeAttr(cls)}"`);
  }
  for (const [name, value] of Object.entries($el.attr() || {})) {
    if (!name.startsWith("data-")) {
      continue;
    }
    const key = name.slice(5);
    if (PRESERVED_DATA.has(key)) {
      continue;
    }
    attrs.push(`${name}="${encodeAttr(value)}"`);
  }
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function has($el, name) {
  const v = $el.attr(name);
  return v === "" || v === name || v === "true" || v === "preserve";
}

function normalizeLang(l) {
  if (!l) {
    return "text";
  }
  const v = l.trim().toLowerCase();
  if (v === "js") {
    return "javascript";
  }
  if (v === "ts") {
    return "typescript";
  }
  if (v === "sh") {
    return "bash";
  }
  if (v === "yml") {
    return "yaml";
  }
  if (v === "md") {
    return "markdown";
  }

  // Prism's "markup" grammar covers HTML/XML/SVG. Shiki has no single
  // umbrella grammar — `html` is the closest match and handles inline
  // <script>/<style> the way authors using `markup` would expect.
  if (v === "markup") {
    return "html";
  }
  return v;
}

function encodeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
