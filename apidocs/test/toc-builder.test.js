import { test } from "node:test";
import assert from "node:assert/strict";
import { buildToc } from "../lib/passes/toc-builder.js";
import { loadFragment } from "./helpers.js";

function toc(html) {
  return buildToc(loadFragment(html));
}

test("builds a flat list from top-level sections", () => {
  const t = toc(`
    <article>
      <section><h2 id="a">A</h2></section>
      <section><h2 id="b">B</h2></section>
    </article>
  `);
  assert.deepEqual(t, [
    { heading: "A", anchor: "a" },
    { heading: "B", anchor: "b" }
  ]);
});

test("nests child sections under their parent", () => {
  const t = toc(`
    <article>
      <section>
        <h2 id="a">A</h2>
        <section><h3 id="a1">A.1</h3></section>
        <section><h3 id="a2">A.2</h3></section>
      </section>
    </article>
  `);
  assert.deepEqual(t, [
    {
      heading: "A",
      anchor: "a",
      sections: [
        { heading: "A.1", anchor: "a1" },
        { heading: "A.2", anchor: "a2" }
      ]
    }
  ]);
});

test("data-toc=omit drops the section entirely", () => {
  const t = toc(`
    <article>
      <section><h2 id="a">A</h2></section>
      <section data-toc="omit"><h2 id="b">B</h2></section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "A", anchor: "a" }]);
});

test("data-toc=omit-children keeps the section but drops descendants", () => {
  const t = toc(`
    <article>
      <section data-toc="omit-children">
        <h2 id="a">A</h2>
        <section><h3 id="a1">A.1</h3></section>
      </section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "A", anchor: "a" }]);
});

test("skips sections whose heading lacks an id", () => {
  const t = toc(`
    <article>
      <section><h2>No id</h2></section>
      <section><h2 id="ok">OK</h2></section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "OK", anchor: "ok" }]);
});

test("strips the prepended anchor icon from heading text", () => {
  const t = toc(`
    <article>
      <section>
        <h2 id="x"><a class="anchor" href="#x">#</a>Title</h2>
      </section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "Title", anchor: "x" }]);
});

test("returns an empty array when there are no sections", () => {
  assert.deepEqual(toc(`<article><p>No sections.</p></article>`), []);
});
