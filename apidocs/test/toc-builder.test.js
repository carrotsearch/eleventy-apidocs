import assert from "node:assert/strict";
import { test } from "node:test";
import { buildToc } from "../lib/passes/toc-builder.js";
import { loadFragment } from "./helpers.js";

function toc(html) {
  return buildToc(loadFragment(html));
}

test("builds a flat list from top-level sections", () => {
  const t = toc(`
    <article>
      <section id="a"><h2>A</h2></section>
      <section id="b"><h2>B</h2></section>
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
      <section id="a">
        <h2>A</h2>
        <section id="a1"><h3>A.1</h3></section>
        <section id="a2"><h3>A.2</h3></section>
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
      <section id="a"><h2>A</h2></section>
      <section id="b" data-toc="omit"><h2>B</h2></section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "A", anchor: "a" }]);
});

test("data-toc=omit-children keeps the section but drops descendants", () => {
  const t = toc(`
    <article>
      <section id="a" data-toc="omit-children">
        <h2>A</h2>
        <section id="a1"><h3>A.1</h3></section>
      </section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "A", anchor: "a" }]);
});

test("skips sections without an id", () => {
  const t = toc(`
    <article>
      <section><h2>No id</h2></section>
      <section id="ok"><h2>OK</h2></section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "OK", anchor: "ok" }]);
});

test("strips the prepended anchor icon from heading text", () => {
  const t = toc(`
    <article>
      <section id="x">
        <h2><a class="anchor" href="#x">#</a>Title</h2>
      </section>
    </article>
  `);
  assert.deepEqual(t, [{ heading: "Title", anchor: "x" }]);
});

test("returns an empty array when there are no sections", () => {
  assert.deepEqual(toc(`<article><p>No sections.</p></article>`), []);
});
