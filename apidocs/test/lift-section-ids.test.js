import assert from "node:assert/strict";
import { test } from "node:test";
import { liftSectionIds } from "../lib/passes/lift-section-ids.js";
import { loadFragment } from "./helpers.js";

function lift(html) {
  const $ = loadFragment(html);
  liftSectionIds($);
  return $;
}

test("moves the section id onto its first heading", () => {
  const $ = lift(`<article><section id="intro"><h2>Intro</h2><p>p</p></section></article>`);
  assert.equal($("section").attr("id"), undefined);
  assert.equal($("h2").attr("id"), "intro");
});

test("targets h2-h5 (whichever is the first child heading)", () => {
  const $ = lift(`
    <article>
      <section id="a"><h2>A</h2></section>
      <section id="b"><h3>B</h3></section>
      <section id="c"><h4>C</h4></section>
      <section id="d"><h5>D</h5></section>
    </article>
  `);
  assert.equal($("h2").attr("id"), "a");
  assert.equal($("h3").attr("id"), "b");
  assert.equal($("h4").attr("id"), "c");
  assert.equal($("h5").attr("id"), "d");
  assert.equal($("section[id]").length, 0);
});

test("leaves sections without an id untouched", () => {
  const $ = lift(`<article><section><h2>No id</h2></section></article>`);
  assert.equal($("h2").attr("id"), undefined);
});

test("leaves sections without a child heading untouched", () => {
  const $ = lift(`<article><section id="x"><p>No heading</p></section></article>`);
  assert.equal($("section").attr("id"), "x");
});

test("does not overwrite an existing heading id", () => {
  const $ = lift(
    `<article><section id="from-section"><h2 id="from-heading">H</h2></section></article>`
  );
  assert.equal($("h2").attr("id"), "from-heading");
  assert.equal($("section").attr("id"), "from-section");
});

test("uses the first child heading, not a deeper one", () => {
  const $ = lift(`
    <article>
      <section id="outer">
        <h2>Outer</h2>
        <section id="inner"><h3>Inner</h3></section>
      </section>
    </article>
  `);
  assert.equal($("h2").attr("id"), "outer");
  assert.equal($("h3").attr("id"), "inner");
  assert.equal($("section[id]").length, 0);
});
