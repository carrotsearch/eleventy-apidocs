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

import { createHighlighter } from "shiki";
import { cleanCodeText } from "../code-text.js";

const PRESERVED_DATA = new Set([
  "preserve-common-indent",
  "preserve-leading-and-trailing-newlines",
  "language"
]);

const THEMES = { light: "github-light", dark: "github-dark" };
const LANGS = [
  "javascript",
  "typescript",
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
  "python"
];

let highlighterPromise;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: Object.values(THEMES), langs: LANGS });
  }
  return highlighterPromise;
}

export async function codeHighlight($, _ctx) {
  const targets = $("pre[data-language]").toArray();
  if (!targets.length) {
    return;
  }
  const highlighter = await getHighlighter();
  const loaded = new Set(highlighter.getLoadedLanguages());

  for (const el of targets) {
    const $el = $(el);
    const lang = normalizeLang($el.attr("data-language"));
    const preserveIndent = has($el, "data-preserve-common-indent");
    const preserveNewlines = has($el, "data-preserve-leading-and-trailing-newlines");

    const { content, highlighted } = cleanCodeText($el.text(), {
      preserveIndent,
      preserveNewlines
    });

    const safeLang = loaded.has(lang) ? lang : "text";
    const html = highlighter.codeToHtml(content, {
      lang: safeLang,
      themes: THEMES,
      defaultColor: false,
      transformers: [
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
  return v;
}

function encodeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
