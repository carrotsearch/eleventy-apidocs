// Apply a JSONPath expression to embedded JSON(C) content.
// Supports a `{ ... }` suffix for post-processing:
//   path{ 'key1', /key.*/, trim-brackets, remove-comments }
// Key selectors filter retained properties; trim-brackets strips outer
// braces from each rendered object; remove-comments parses JSONC strictly.

import * as jsonc from "jsonc-parser";
import { JSONPath } from "jsonpath-plus";

export function extractJsonpath(content, expr) {
  if (!content) {
    throw new Error("Cannot apply jsonpath to empty content.");
  }

  const opts = parseSuffix(expr);
  const text = opts.removeComments
    ? jsonc.applyEdits(content, []).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
    : content;

  const errors = [];
  const parsed = jsonc.parse(text, errors, { allowTrailingComma: true });
  if (errors.length) {
    throw new Error(
      `JSON parse failed: ${errors.map(e => jsonc.printParseErrorCode(e.error)).join(", ")}`
    );
  }

  let results;
  try {
    results = JSONPath({ path: opts.path, json: parsed });
  } catch (e) {
    throw new Error(`JSONPath ${opts.path} failed: ${e.message}`);
  }
  if (!results.length) {
    throw new Error(`No matches for JSONPath ${opts.path}.`);
  }

  if (opts.keyFilter) {
    results = results.map(v => {
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        return v;
      }
      const out = {};
      for (const k of Object.keys(v)) {
        if (opts.keyFilter(k)) {
          out[k] = v[k];
        }
      }
      return out;
    });
  }

  return results.map(v => {
    if (typeof v === "number" || typeof v === "string") {
      return String(v);
    }
    let s = JSON.stringify(v, null, "  ");
    if (opts.trimBrackets) {
      s = s.replace(/^\s*\{[ \t]*\r?\n?|[ \t]*\}\s*$/g, "");
    }
    return s;
  });
}

function parseSuffix(raw) {
  let path = raw.trim();
  let trimBrackets = false;
  let removeComments = false;
  let keyFilter = null;

  if (path.endsWith("}")) {
    const lastBrace = path.lastIndexOf("{");
    const tokens = path
      .slice(lastBrace + 1, -1)
      .trim()
      .split(/\s*,\s*/);
    path = path.slice(0, lastBrace).trim();

    const matchers = [];
    for (const tok of tokens) {
      if (/^'.+'$|^".+"$/.test(tok)) {
        const name = tok.slice(1, -1);
        matchers.push(k => k === name);
      } else if (/^\/.+\/$/.test(tok)) {
        const re = new RegExp(tok.slice(1, -1));
        matchers.push(k => re.test(k));
      } else if (tok.toLowerCase() === "trim-brackets") {
        trimBrackets = true;
      } else if (tok.toLowerCase() === "remove-comments") {
        removeComments = true;
      } else {
        throw new Error(`Unknown jsonpath option: ${tok}`);
      }
    }
    if (matchers.length) {
      keyFilter = k => matchers.some(m => m(k));
    }
  }

  return { path, trimBrackets, removeComments, keyFilter };
}
