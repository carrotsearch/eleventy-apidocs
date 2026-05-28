import assert from "node:assert/strict";
import { test } from "node:test";
import { removeCommonIndent } from "../lib/remove-common-indent.js";

test("strips the shared space indent", () => {
  assert.equal(removeCommonIndent("    a\n    b"), "a\nb");
});

test("removes only the smallest shared run", () => {
  assert.equal(removeCommonIndent("    a\n  b"), "  a\nb");
});

test("dedents with tabs when the first line is tab-indented", () => {
  assert.equal(removeCommonIndent("\t\tfoo\n\tbar"), "\tfoo\nbar");
});

test("leaves content alone when the first non-empty line is flush left", () => {
  assert.equal(removeCommonIndent("foo\n  bar"), "foo\n  bar");
});

test("makes no change when any line has no indent (min run is 0)", () => {
  assert.equal(removeCommonIndent("  a\nb"), "  a\nb");
});

test("ignores blank lines when measuring the common indent", () => {
  assert.equal(removeCommonIndent("    a\n\n    b"), "a\n\nb");
});

test("treats a CRLF line break as one break, not two", () => {
  // Regression: splitting on /[\r\n]/ turned each CRLF into a blank line.
  assert.equal(removeCommonIndent("    a\r\n    b"), "a\nb");
});

test("returns empty string for empty or nullish input", () => {
  assert.equal(removeCommonIndent(""), "");
  assert.equal(removeCommonIndent(null), "");
  assert.equal(removeCommonIndent(undefined), "");
});

test("leaves all-blank content untouched (no indent char detected)", () => {
  assert.equal(removeCommonIndent("\n\n"), "\n\n");
});
