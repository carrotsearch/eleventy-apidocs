import assert from "node:assert/strict";
import { test } from "node:test";
import { extractFragment } from "../lib/extract-fragment.js";

test("returns the lines between the start and end markers, markers excluded", () => {
  const src = "junk\nfragment-start{x}\nline1\nline2\nfragment-end{x}\nmore";
  assert.equal(extractFragment(src, "x"), "line1\nline2");
});

test("matches markers embedded in a comment", () => {
  const src = "// fragment-start{x}\ncode\n// fragment-end{x}";
  assert.equal(extractFragment(src, "x"), "code");
});

test("drops nested fragment markers but keeps their content", () => {
  const src = [
    "fragment-start{out}",
    "a",
    "fragment-start{in}",
    "b",
    "fragment-end{in}",
    "c",
    "fragment-end{out}"
  ].join("\n");
  assert.equal(extractFragment(src, "out"), "a\nb\nc");
});

test("throws when an end marker precedes its start", () => {
  assert.throws(() => extractFragment("fragment-end{x}", "x"), /saw fragment-end first/);
});

test("throws when the end marker is missing", () => {
  assert.throws(() => extractFragment("fragment-start{x}\na", "x"), /fragment-end\{x\} not found/);
});

test("throws when the fragment id is absent entirely", () => {
  assert.throws(() => extractFragment("nothing here", "x"), /Fragment x not found/);
});

test("returns empty string for empty content", () => {
  assert.equal(extractFragment("", "x"), "");
});
