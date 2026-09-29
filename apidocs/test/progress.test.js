import assert from "node:assert/strict";
import { test } from "node:test";
import { plural, progressOf, setPageTotal } from "../lib/progress.js";

test("singular for exactly one", () => {
  assert.equal(plural(1, "page"), "1 page");
});

test("plural for zero and many", () => {
  assert.equal(plural(0, "image"), "0 images");
  assert.equal(plural(11, "page"), "11 pages");
});

test("pluralizes the last word of a compound noun", () => {
  assert.equal(plural(1, "broken link"), "1 broken link");
  assert.equal(plural(3, "broken link"), "3 broken links");
});

test("progress shows a percentage once the page total is known", () => {
  setPageTotal(0);
  assert.equal(progressOf(3, "page"), "3 pages");
  setPageTotal(17);
  assert.equal(progressOf(3, "page"), "3 of 17 pages (18%)");
  assert.equal(progressOf(17, "page"), "17 of 17 pages (100%)");
  assert.equal(progressOf(1, "page"), "1 of 17 pages (6%)");
  setPageTotal(1);
  assert.equal(progressOf(1, "page"), "1 of 1 page (100%)");
  setPageTotal(0);
});
