// Replace <pre data-embed="path"> and <embed src="path"> with a
// <pre data-language="X"> whose text content is the (optionally extracted)
// embedded file. Runs before code-highlight, which then highlights the result.
//
// Path is resolved against ctx.sourceDir (the directory of the source HTML).
// Variables in the embedded content are substituted via ctx.variables.

import fs from "node:fs/promises";
import path from "node:path";
import { extractFragment } from "../extract-fragment.js";
import { extractJsonpath } from "../extract-jsonpath.js";
import { substituteVariables } from "./variables.js";

export async function embedCode($, ctx) {
  const targets = $("pre[data-embed], embed[src]").toArray();
  for (const el of targets) {
    if ($(el).parents("pre[data-language]").length) {
      continue;
    }
    await embedOne($, el, ctx);
  }
}

async function embedOne($, el, ctx) {
  const $el = $(el);
  const declared = $el.attr("data-embed") || $el.attr("src");
  const fragment = $el.attr("data-fragment");
  const jsonpath = $el.attr("data-jsonpath");
  const declaredLanguage = $el.attr("data-language");

  if (jsonpath && fragment) {
    throw new Error("data-jsonpath and data-fragment are mutually exclusive.");
  }
  if (!declared) {
    $el.remove();
    return;
  }

  const filePath = path.resolve(ctx.sourceDir || ".", declared);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    console.warn(`[apidocs] Failed to embed ${declared}: ${e.message}`);
    $el.remove();
    return;
  }
  raw = substituteVariables(raw, ctx.variables);

  const ext = path.extname(declared).slice(1).toLowerCase();
  const language = declaredLanguage || ext || "text";

  const langAttr = encodeAttr(language);
  if (jsonpath) {
    const fragments = extractJsonpath(raw, jsonpath);
    const html = fragments
      .map(f => `<pre data-language="${langAttr}">${encode(f)}</pre>`)
      .join("\n");
    $el.replaceWith(html);
    return;
  }

  const content = fragment ? extractFragment(raw, fragment) : raw;
  $el.replaceWith(`<pre data-language="${langAttr}">${encode(content)}</pre>`);
}

// Element text content: quotes are safe between tags, so & < > suffice.
function encode(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Double-quoted attribute value: also escape the quote so the value can't
// break out of data-language="…" (re-read downstream by code-highlight).
function encodeAttr(s) {
  return encode(s).replace(/"/g, "&quot;");
}
