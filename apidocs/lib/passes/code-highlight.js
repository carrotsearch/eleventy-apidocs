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
import { removeCommonIndent } from "../remove-common-indent.js";

const DIR_INNER = /(highlight|hide)-(line|next-line|range\{(\d+)-(\d+)\})/;
const DIR_LINE_PATTERNS = [
  new RegExp(`(?://|#)\\s*(${DIR_INNER.source})\\s*$`),
  new RegExp(`/\\*\\*?\\s*(${DIR_INNER.source})\\s*\\*/`)
];
const DIR_INLINE = new RegExp(DIR_LINE_PATTERNS.map(r => `\\s*(${r.source})`).join("|"));

const PRESERVED_DATA = new Set(["preserve-common-indent", "preserve-leading-and-trailing-newlines", "language"]);

const THEMES = { light: "github-light", dark: "github-dark" };
const LANGS = [
  "javascript", "typescript", "json", "html", "css", "scss",
  "bash", "shell", "yaml", "xml", "markdown", "java", "python"
];

let highlighterPromise;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: Object.values(THEMES), langs: LANGS });
  }
  return highlighterPromise;
}

export async function codeHighlight($, ctx) {
  const targets = $("pre[data-language]").toArray();
  if (!targets.length) return;
  const highlighter = await getHighlighter();
  const loaded = new Set(highlighter.getLoadedLanguages());

  for (const el of targets) {
    const $el = $(el);
    const lang = normalizeLang($el.attr("data-language"));
    const preserveIndent = has($el, "data-preserve-common-indent");
    const preserveNewlines = has($el, "data-preserve-leading-and-trailing-newlines");

    let text = $el.text();
    if (!preserveIndent) text = removeCommonIndent(text);
    if (!preserveNewlines) text = trimNewlines(text);

    text = applyHide(text);
    const { content, highlighted } = collectHighlight(text);

    const safeLang = loaded.has(lang) ? lang : "text";
    const html = highlighter.codeToHtml(content, {
      lang: safeLang,
      themes: THEMES,
      defaultColor: false,
      transformers: [{
        line(node, line) {
          if (highlighted.has(line)) this.addClassToHast(node, "highlighted");
        }
      }]
    });

    const carryAttrs = collectAttrs($el);
    const plain = encodeAttr(content);
    $el.replaceWith(
      `<apidocs-code-box${carryAttrs} data-plain-text="${plain}">${html}</apidocs-code-box>`
    );
  }
}

function trimNewlines(s) {
  return s.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function parseDirective(line) {
  for (const re of DIR_LINE_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    const action = m[2];
    const scope = m[3];
    if (scope === "line") return { action, type: "line", start: 0, end: 1 };
    if (scope === "next-line") return { action, type: "next-line", start: 1, end: 2 };
    const start = parseInt(m[4], 10);
    const end = parseInt(m[5], 10) + 1;
    if (end < start) return null;
    return { action, type: "range", start, end };
  }
  return null;
}

function applyHide(content) {
  const lines = content.split("\n");
  const drop = new Set();
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) continue;
    const dir = parseDirective(lines[i]);
    if (dir && dir.action === "hide") {
      const base = dir.type === "line" ? i : i + 1;
      for (let k = dir.start; k < dir.end; k++) drop.add(base + (dir.type === "line" ? k : k - 1));
      if (dir.type !== "line") continue;
      // For hide-line we still drop this line entirely.
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

function collectHighlight(content) {
  const input = content.split("\n");
  const out = [];
  const highlighted = new Set();
  let offset = 0;

  for (let i = 0; i < input.length; i++) {
    const dir = parseDirective(input[i]);
    if (dir && dir.action === "highlight") {
      const base = dir.type === "line" ? i - offset : i - 1 - offset;
      for (let k = dir.start; k < dir.end; k++) highlighted.add(base + k + 1); // Shiki lines are 1-based
      if (dir.type !== "line") { offset++; continue; }
      out.push(input[i].replace(DIR_INLINE, ""));
      continue;
    }
    out.push(input[i]);
  }
  return { content: out.join("\n"), highlighted };
}

function collectAttrs($el) {
  const attrs = [];
  const cls = $el.attr("class");
  if (cls) attrs.push(`class="${encodeAttr(cls)}"`);
  for (const [name, value] of Object.entries($el.attr() || {})) {
    if (!name.startsWith("data-")) continue;
    const key = name.slice(5);
    if (PRESERVED_DATA.has(key)) continue;
    attrs.push(`${name}="${encodeAttr(value)}"`);
  }
  return attrs.length ? " " + attrs.join(" ") : "";
}

function has($el, name) {
  const v = $el.attr(name);
  return v === "" || v === name || v === "true" || v === "preserve";
}

function normalizeLang(l) {
  if (!l) return "text";
  const v = l.trim().toLowerCase();
  if (v === "js") return "javascript";
  if (v === "ts") return "typescript";
  if (v === "sh") return "bash";
  if (v === "yml") return "yaml";
  if (v === "md") return "markdown";
  return v;
}

function encodeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
