import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSections } from "../lib/extract-sections.js";

test("collects top-level section[id] as {anchor, title} in order", () => {
  const s = extractSections(`
    <article>
      <section id="a"><h2>A</h2></section>
      <section id="b"><h3>B</h3></section>
    </article>
  `);
  assert.deepEqual(s, [
    { anchor: "a", title: "A" },
    { anchor: "b", title: "B" }
  ]);
});

test("ignores nested sections (top-level only)", () => {
  const s = extractSections(`
    <article>
      <section id="a">
        <h2>A</h2>
        <section id="a1"><h3>A.1</h3></section>
      </section>
    </article>
  `);
  assert.deepEqual(s, [{ anchor: "a", title: "A" }]);
});

test("skips sections without an id", () => {
  const s = extractSections(`
    <article>
      <section><h2>No id</h2></section>
      <section id="b"><h2>B</h2></section>
    </article>
  `);
  assert.deepEqual(s, [{ anchor: "b", title: "B" }]);
});

test('skips data-toc="omit"', () => {
  const s = extractSections(`
    <article>
      <section id="a" data-toc="omit"><h2>A</h2></section>
      <section id="b"><h2>B</h2></section>
    </article>
  `);
  assert.deepEqual(s, [{ anchor: "b", title: "B" }]);
});

test("strips the anchor-link icon from the title", () => {
  const s = extractSections(`
    <article>
      <section id="a"><h2><a class="anchor" href="#a">#</a>A</h2></section>
    </article>
  `);
  assert.deepEqual(s, [{ anchor: "a", title: "A" }]);
});

test("skips sections whose heading has no text", () => {
  const s = extractSections(`
    <article>
      <section id="a"><h2><a class="anchor" href="#a">#</a></h2></section>
      <section id="b"><h2>B</h2></section>
    </article>
  `);
  assert.deepEqual(s, [{ anchor: "b", title: "B" }]);
});

test("returns [] when there are no top-level sections", () => {
  assert.deepEqual(extractSections("<article><h1>Title</h1><p>prose</p></article>"), []);
  assert.deepEqual(extractSections(""), []);
});
