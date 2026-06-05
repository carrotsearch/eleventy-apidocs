// Apply a JSONPath expression to embedded JSON(C) content.
// Supports a `{ ... }` suffix for post-processing:
//   path{ 'key1', /key.*/, trim-brackets, remove-comments }
// Key selectors filter retained properties; trim-brackets strips outer
// braces from each rendered object. Comments are always dropped by the
// JSONC parser, so remove-comments is accepted but a no-op.

import * as jsonc from "jsonc-parser";
import { JSONPath } from "jsonpath-plus";

export function extractJsonpath(content, expr) {
  if (!content) {
    throw new Error("Cannot apply jsonpath to empty content.");
  }

  const opts = parseSuffix(expr);

  // jsonc.parse ignores // and /* */ comments natively, so JSONC source
  // parses without any pre-stripping — and a regexp strip would corrupt
  // comment-like substrings inside string values (e.g. "https://…").
  const errors = [];
  const parsed = jsonc.parse(content, errors, { allowTrailingComma: true });
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
  const path = raw.trim();
  if (!path.endsWith("}")) {
    return { path, trimBrackets: false, keyFilter: null };
  }

  const lastBrace = path.lastIndexOf("{");
  const tokens = path
    .slice(lastBrace + 1, -1)
    .trim()
    .split(/\s*,\s*/);

  let trimBrackets = false;
  const matchers = [];
  for (const tok of tokens) {
    const decoded = decodeSuffixToken(tok);
    if (decoded.matcher) {
      matchers.push(decoded.matcher);
    }
    if (decoded.trimBrackets) {
      trimBrackets = true;
    }
  }
  const keyFilter = matchers.length ? k => matchers.some(m => m(k)) : null;

  return { path: path.slice(0, lastBrace).trim(), trimBrackets, keyFilter };
}

function decodeSuffixToken(tok) {
  if (/^'.+'$|^".+"$/.test(tok)) {
    const name = tok.slice(1, -1);
    return { matcher: k => k === name };
  }
  if (/^\/.+\/$/.test(tok)) {
    let re;
    try {
      re = new RegExp(tok.slice(1, -1));
    } catch (e) {
      throw new Error(`Invalid jsonpath key regex ${tok}: ${e.message}`);
    }
    return { matcher: k => re.test(k) };
  }
  const lower = tok.toLowerCase();
  if (lower === "trim-brackets") {
    return { trimBrackets: true };
  }

  // remove-comments accepted for compatibility; jsonc.parse always ignores comments.
  if (lower === "remove-comments") {
    return {};
  }
  throw new Error(`Unknown jsonpath option: ${tok}`);
}
