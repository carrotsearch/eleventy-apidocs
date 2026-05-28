import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCodeText, readPreSource } from "../lib/code-text.js";
import { loadFragment } from "./helpers.js";

test("removes the common indent by default", () => {
  assert.equal(cleanCodeText("    a\n    b").content, "a\nb");
});

test("preserveIndent leaves leading whitespace intact", () => {
  assert.equal(cleanCodeText("    a\n    b", { preserveIndent: true }).content, "    a\n    b");
});

test("trims a leading and trailing blank line", () => {
  assert.equal(cleanCodeText("\n  a\n  b\n").content, "a\nb");
});

test("hide-next-line drops the directive and the line after it", () => {
  assert.equal(cleanCodeText("a\n// hide-next-line\nb\nc").content, "a\nc");
});

test("an inline hide-line drops its whole line", () => {
  assert.equal(cleanCodeText("a\nb // hide-line\nc").content, "a\nc");
});

test("the # comment form is honored", () => {
  assert.equal(cleanCodeText("a\n# hide-next-line\nb\nc").content, "a\nc");
});

test("highlight-next-line marks the following line and removes the directive", () => {
  const { content, highlighted } = cleanCodeText("a\n// highlight-next-line\nb\nc");
  assert.equal(content, "a\nb\nc");
  assert.deepEqual([...highlighted], [2]); // 1-based: "b" after directive removal
});

test("an inline highlight-line keeps the code and strips the directive", () => {
  const { content, highlighted } = cleanCodeText("a\nb // highlight-line\nc");
  assert.equal(content, "a\nb\nc");
  assert.deepEqual([...highlighted], [2]);
});

test("the block-comment highlight form is honored", () => {
  const { content, highlighted } = cleanCodeText("a\nx /* highlight-line */\nc");
  assert.equal(content, "a\nx\nc");
  assert.deepEqual([...highlighted], [2]);
});

test("highlight-range marks each line in the range", () => {
  const { highlighted } = cleanCodeText("// highlight-range{1-2}\na\nb\nc");
  assert.deepEqual(
    [...highlighted].sort((x, y) => x - y),
    [1, 2]
  );
});

test("readPreSource decodes basic entities", () => {
  const $ = loadFragment("<pre>&lt;div&gt;</pre>");
  assert.equal(readPreSource($("pre")), "<div>");
});

test("readPreSource decodes &amp; last so &amp;lt; round-trips to &lt;", () => {
  const $ = loadFragment("<pre>&amp;lt;</pre>");
  assert.equal(readPreSource($("pre")), "&lt;");
});
