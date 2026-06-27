import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiKindRank,
  queryWords,
  regionCount,
  regionsStartAtBoundary
} from "../assets/js/search-filters.js";

// ---------- apiKindRank ----------

test("apiKindRank returns the kind's index in the order list", () => {
  const order = ["stage", "component"];
  assert.equal(apiKindRank(order, "stage"), 0);
  assert.equal(apiKindRank(order, "component"), 1);
});

test("apiKindRank sends unlisted and kindless entries to the back", () => {
  const order = ["stage", "component"];
  assert.equal(apiKindRank(order, "method"), Number.POSITIVE_INFINITY);
  assert.equal(apiKindRank(order, undefined), Number.POSITIVE_INFINITY);
});

test("apiKindRank treats a missing or non-array order as no ordering", () => {
  assert.equal(apiKindRank(undefined, "stage"), Number.POSITIVE_INFINITY);
  assert.equal(apiKindRank([], "stage"), Number.POSITIVE_INFINITY);
});

test("apiKindRank yields a stable, kind-grouped sort that preserves input order", () => {
  const order = ["stage", "component"];
  const hits = [
    { kind: "method", n: 1 },
    { kind: "component", n: 2 },
    { kind: "stage", n: 3 },
    { kind: "method", n: 4 },
    { kind: "stage", n: 5 }
  ];
  const sorted = [...hits].sort((a, b) => apiKindRank(order, a.kind) - apiKindRank(order, b.kind));
  assert.deepEqual(
    sorted.map(h => h.n),
    [3, 5, 2, 1, 4]
  );
});

// ---------- queryWords ----------

test("queryWords counts whitespace-separated tokens", () => {
  assert.equal(queryWords("one"), 1);
  assert.equal(queryWords("two words"), 2);
  assert.equal(queryWords("  spaced   out  "), 2);
});

test("queryWords returns 0 for empty input", () => {
  assert.equal(queryWords(""), 0);
  assert.equal(queryWords("   "), 0);
});

// ---------- regionCount ----------

test("regionCount returns 0 for empty input", () => {
  assert.equal(regionCount([]), 0);
  assert.equal(regionCount(null), 0);
  assert.equal(regionCount(undefined), 0);
});

test("regionCount counts contiguous runs", () => {
  assert.equal(regionCount([0]), 1);
  assert.equal(regionCount([0, 1, 2]), 1);
  assert.equal(regionCount([0, 1, 5, 6]), 2);
  assert.equal(regionCount([0, 5, 8]), 3);
  assert.equal(regionCount([2, 3, 11, 13, 18]), 4);
});

test("regionCount honors .len over .length to ignore stale buffer entries", () => {
  // Simulate fuzzysort's reused buffer: .length 5 but only 3 valid entries.
  const buf = [0, 5, 8, 99, 99];
  buf.len = 3;
  assert.equal(regionCount(buf), 3);
});

// ---------- regionsStartAtBoundary ----------

test("regionsStartAtBoundary accepts a single contiguous prefix", () => {
  // "lab" → "labelBox": one region starting at position 0.
  assert.equal(regionsStartAtBoundary([0, 1, 2], "labelBox"), true);
});

test("regionsStartAtBoundary accepts initialism on camelCase boundaries", () => {
  // "lbc" → "labelBoxColor": three regions at l@0, B@5, C@8.
  assert.equal(regionsStartAtBoundary([0, 5, 8], "labelBoxColor"), true);
});

test("regionsStartAtBoundary accepts multi-char prefixes at camelCase boundaries", () => {
  // "labbox" → "labelBox": two regions [0,1,2] starting at 'l' (pos 0) and
  // [5,6,7] starting at 'B' (camelCase boundary). Each region's start is at
  // a boundary; the chars inside the region don't need to be.
  assert.equal(regionsStartAtBoundary([0, 1, 2, 5, 6, 7], "labelBox"), true);
});

test("regionsStartAtBoundary accepts prefix + later initialism", () => {
  // "labc" → "labelBoxColor": [0,1] prefix + B@5 + C@8.
  assert.equal(regionsStartAtBoundary([0, 1, 5, 8], "labelBoxColor"), true);
});

test("regionsStartAtBoundary rejects mid-word region starts", () => {
  // "lable" (typo) → "labelSize" matches as [0,1,2,4,8]: region [0,1,2]
  // is fine, but the [4] region is 'l' in mid-word "label" and [8] is 'e'
  // mid-word in "Size" — neither a camelCase boundary nor a separator.
  assert.equal(regionsStartAtBoundary([0, 1, 2, 4, 8], "labelSize"), false);
});

test("regionsStartAtBoundary rejects when first region starts mid-word", () => {
  // "table" → "DotAtlas.LabelsLayer.defaults": first region [2,3] starts
  // at 't' in "DotAtlas" (preceded by 'o' lowercase — not a boundary).
  assert.equal(regionsStartAtBoundary([2, 3, 11, 13, 18], "DotAtlas.LabelsLayer.defaults"), false);
});

test("regionsStartAtBoundary treats separators as boundaries", () => {
  // "doc" → "lingo4g:result:stageName:documentClusters": one region
  // starting at 'd' (pos 25), preceded by ':'.
  assert.equal(
    regionsStartAtBoundary([25, 26, 27], "lingo4g:result:stageName:documentClusters"),
    true
  );
});

test("regionsStartAtBoundary rejects lowercase-after-lowercase region starts", () => {
  // "doc" → "labelShadowColor": region [8,9] starts at 'd' in mid-word
  // "Shadow" (preceded by 'a' lowercase). The [11] region starts at 'C'
  // (camelCase boundary) — but the first region disqualifies it.
  assert.equal(regionsStartAtBoundary([8, 9, 11], "labelShadowColor"), false);
});

test("regionsStartAtBoundary honors .len over .length", () => {
  // Reused buffer: stale entries at .length > .len must be ignored,
  // otherwise a junk index could spuriously fail the boundary check.
  const buf = [0, 5, 8, 99, 99];
  buf.len = 3;
  assert.equal(regionsStartAtBoundary(buf, "labelBoxColor"), true);
});

test("regionsStartAtBoundary returns true for empty indexes", () => {
  // Vacuously satisfied — no regions to validate.
  assert.equal(regionsStartAtBoundary([], "anything"), true);
});
