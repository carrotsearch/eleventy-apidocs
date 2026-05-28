// HTML → Markdown converter for the .md per-page siblings. Runs against
// the *author-shape* HTML produced by lib/process-markdown.js — code blocks
// are still plain <pre data-language="X">, images are still <img>, no
// LQIP/picture/anchor-icon wrappers — so the rules below key off the markup
// authors actually write.

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  fence: "```",
  bulletListMarker: "-",
  emDelimiter: "_",
  linkStyle: "inlined",
  hr: "---"
});

// GFM tables, strikethrough, task lists.
turndown.use(gfm);

// Class checks done by hand — turndown's DOM polyfill (domino) doesn't
// implement classList consistently.
function hasClass(node, name) {
  const cls = node.getAttribute?.("class");
  if (!cls) {
    return false;
  }
  return cls.split(/\s+/).includes(name);
}

// <pre data-language="X">...</pre> → fenced code block. Reads textContent
// from the still-unhighlighted source, so no Shiki span soup to undo.
turndown.addRule("apidocs-pre-lang", {
  filter: node => node.nodeName === "PRE" && node.getAttribute?.("data-language"),
  replacement: (_content, node) => {
    const lang = node.getAttribute("data-language") || "";
    const text = node.textContent ?? "";
    return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
  }
});

// Callouts: info → [!NOTE], warning → [!WARNING], box → plain blockquote.
turndown.addRule("apidocs-callout", {
  filter: node => {
    if (node.nodeName !== "DIV") {
      return false;
    }
    return hasClass(node, "info") || hasClass(node, "warning") || hasClass(node, "box");
  },
  replacement: (content, node) => {
    const admonition = hasClass(node, "info")
      ? "[!NOTE]"
      : hasClass(node, "warning")
        ? "[!WARNING]"
        : null;
    const body = content.trim();
    if (!body) {
      return "";
    }
    const lines = body.split("\n");
    const prefixed = lines.map(l => (l ? `> ${l}` : ">")).join("\n");
    const head = admonition ? `> ${admonition}\n` : "";
    return `\n\n${head}${prefixed}\n\n`;
  }
});

// Definition lists: dt.api → "### name" so option names land as headings
// (and are discoverable by anchor). Plain dt stays bold.
turndown.addRule("apidocs-dl", {
  filter: "dl",
  replacement: content => `\n\n${content.trim()}\n\n`
});

turndown.addRule("apidocs-dt", {
  filter: "dt",
  replacement: (content, node) => {
    const text = content.trim();
    if (!text) {
      return "";
    }
    return hasClass(node, "api") ? `\n\n### ${text}\n\n` : `\n\n**${text}**\n\n`;
  }
});

turndown.addRule("apidocs-dd", {
  filter: "dd",
  replacement: content => `${content.trim()}\n\n`
});

// <section class="api"> is purely a styling wrapper — its children are
// what matter (a heading + the body). Pass through. Plain <section>
// already passes through via turndown's default _keep behavior, but a
// rule that emits the inner content with surrounding blank lines is
// cleaner than relying on that.
turndown.addRule("apidocs-section", {
  filter: "section",
  replacement: content => `\n\n${content.trim()}\n\n`
});

// GFM tables require each row to be a single line, so cells can only
// hold inline content. Anything that turndown converts with a newline
// in the result — paragraphs, lists, code blocks, <br>, nested tables,
// etc. — breaks the row. Detect any such child and emit the whole table
// as raw HTML; Markdown allows inline HTML and renderers/LLMs handle it.
// Plain inline-only cells still flow through turndown's gfm rule.
const BLOCK_IN_CELL = new Set([
  "P",
  "BR",
  "UL",
  "OL",
  "PRE",
  "BLOCKQUOTE",
  "DL",
  "TABLE",
  "DIV",
  "HR",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6"
]);

function cellHasBlockContent(cell) {
  const children = Array.from(cell.childNodes || []);
  for (const child of children) {
    if (child.nodeType !== 1) {
      continue;
    }
    if (BLOCK_IN_CELL.has(child.nodeName)) {
      return true;
    }
  }
  return false;
}

function tableHasRichCells(table) {
  const ths = Array.from(table.getElementsByTagName?.("th") || []);
  const tds = Array.from(table.getElementsByTagName?.("td") || []);
  return ths.some(cellHasBlockContent) || tds.some(cellHasBlockContent);
}

turndown.addRule("apidocs-rich-table", {
  filter: node => node.nodeName === "TABLE" && tableHasRichCells(node),
  replacement: (_content, node) => `\n\n${node.outerHTML}\n\n`
});

export function htmlToMarkdown(html) {
  const md = turndown.turndown(html);

  // Collapse runs of blank lines that adjacent rules can introduce when
  // each pads with its own \n\n.
  return `${md.replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
