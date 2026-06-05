// Shared text cleaning for <pre data-language> code blocks. Both branches
// (HTML highlight via Shiki, Markdown via turndown) need to strip directive
// comments and apply common-indent/newline trimming the same way, otherwise
// the .md output ends up with `// highlight-next-line` markers leaking
// through.
//
// Directive forms honored (same as code-highlight.js):
//   // hide-line          // hide-next-line        // hide-range{N-M}
//   // highlight-line     // highlight-next-line   // highlight-range{N-M}
//   /* highlight-line */  (block-comment form, same rules)

import { removeCommonIndent } from "./remove-common-indent.js";

const DIR_INNER = /(highlight|hide)-(line|next-line|range\{(\d+)-(\d+)\})/;
const DIR_LINE_PATTERNS = [
  new RegExp(`(?://|#)\\s*(${DIR_INNER.source})\\s*$`),
  new RegExp(`/\\*\\*?\\s*(${DIR_INNER.source})\\s*\\*/`)
];
const DIR_INLINE = new RegExp(DIR_LINE_PATTERNS.map(r => `\\s*(${r.source})`).join("|"));

// Read the text content of a <pre data-language> via the cloned HTML it
// has already been parsed into, then decode the entity escapes that
// re-serialization re-applied. Using $el.html() rather than $el.text() lets
// authors inline real <script>/<style>/XML tags inside a markup code block
// without escaping every angle bracket — cheerio promotes them to real
// child elements while parsing, and $.text() would drop their tags and
// only leave their inner text. Trade-off: this means literal <i>/<em> etc.
// inside a code block also come back as their source markup, not as styled
// text — the right call for a code block, where the source form is what
// the reader wants to see anyway.
export function readPreSource($el) {
  return decodeBasicEntities($el.html() || "");
}

function decodeBasicEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&"); // last so &amp;lt; round-trips to &lt;, not <
}

// Returns { content, highlighted } — `highlighted` is a Set of 1-based line
// numbers (Shiki's convention) for the HTML branch to paint; the Markdown
// branch ignores it.
export function cleanCodeText(raw, { preserveIndent = false, preserveNewlines = false } = {}) {
  let text = raw;
  if (!preserveIndent) {
    text = removeCommonIndent(text);
  }
  if (!preserveNewlines) {
    text = trimNewlines(text);
  }
  text = applyHide(text);
  return collectHighlight(text);
}

function trimNewlines(s) {
  return s.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function parseDirective(line) {
  for (const re of DIR_LINE_PATTERNS) {
    const m = line.match(re);
    if (!m) {
      continue;
    }
    const action = m[2];
    const scope = m[3];
    if (scope === "line") {
      return { action, type: "line", start: 0, end: 1 };
    }
    if (scope === "next-line") {
      return { action, type: "next-line", start: 1, end: 2 };
    }
    const start = parseInt(m[4], 10);
    const end = parseInt(m[5], 10) + 1;
    if (end < start) {
      return null;
    }
    return { action, type: "range", start, end };
  }
  return null;
}

function applyHide(content) {
  const lines = content.split("\n");
  const drop = new Set();
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) {
      continue;
    }
    const dir = parseDirective(lines[i]);
    if (dir && dir.action === "hide") {
      // start/end are offsets relative to the directive line, so the hidden
      // indices are just i + k (line: {i}, next-line: {i+1}, range: i+start..).
      for (let k = dir.start; k < dir.end; k++) {
        drop.add(i + k);
      }
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
      for (let k = dir.start; k < dir.end; k++) {
        highlighted.add(base + k + 1); // Shiki lines are 1-based
      }
      if (dir.type !== "line") {
        offset++;
        continue;
      }
      out.push(input[i].replace(DIR_INLINE, ""));
      continue;
    }
    out.push(input[i]);
  }
  return { content: out.join("\n"), highlighted };
}
