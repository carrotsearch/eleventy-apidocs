import assert from "node:assert/strict";
import { test } from "node:test";
import { sectionAnchors } from "../lib/passes/section-anchors.js";
import { loadFragment } from "./helpers.js";

function anchor(html) {
  const $ = loadFragment(html);
  sectionAnchors($);
  return $;
}

test("prepends an anchor link to the heading of an id-bearing section", () => {
  const $ = anchor(`<article><section id="intro"><h2>Intro</h2></section></article>`);
  const $a = $("h2 > a.anchor");
  assert.equal($a.length, 1);
  assert.equal($a.attr("href"), "#intro");
  assert.ok($a.find("svg").length, "anchor contains the SVG icon");
});

test("targets headings h2-h5", () => {
  const $ = anchor(`
    <article>
      <section id="a"><h2>A</h2></section>
      <section id="b"><h3>B</h3></section>
      <section id="c"><h4>C</h4></section>
      <section id="d"><h5>D</h5></section>
    </article>
  `);
  assert.equal($("a.anchor").length, 4);
});

test("ignores h1 and h6", () => {
  const $ = anchor(`
    <article>
      <section id="title"><h1>Title</h1></section>
      <section id="aside"><h6>Aside</h6></section>
    </article>
  `);
  assert.equal($("a.anchor").length, 0);
});

test("skips sections without an id", () => {
  const $ = anchor(`<article><section><h2>No id</h2></section></article>`);
  assert.equal($("a.anchor").length, 0);
});

test("ignores sections outside <article>", () => {
  const $ = anchor(
    `<section id="loose"><h2>Loose</h2></section><article><section id="ok"><h2>OK</h2></section></article>`
  );
  assert.equal($("a.anchor").length, 1);
  assert.equal($("a.anchor").attr("href"), "#ok");
});

test("does not double-inject when run twice", () => {
  const $ = loadFragment(`<article><section id="x"><h2>X</h2></section></article>`);
  sectionAnchors($);
  sectionAnchors($);
  assert.equal($("a.anchor").length, 1);
});

test("escapes special characters in the href on serialization", () => {
  const $ = anchor(`<article><section id='&quot;weird&quot;'><h2>W</h2></section></article>`);

  // .attr() returns the decoded value; the escape is visible in serialized HTML.
  assert.equal($("a.anchor").attr("href"), `#"weird"`);
  assert.match($.html(), /href="#&quot;weird&quot;"/);
});

test("places the anchor as the first child of the heading", () => {
  const $ = anchor(`<article><section id="x"><h2>Heading text</h2></section></article>`);
  const first = $("h2").contents().first()[0];
  assert.equal(first.tagName, "a");
});

test("lifts heading id to its parent section when the section has none", () => {
  const $ = anchor(`<article><section><h2 id="npm">NPM</h2><p>p</p></section></article>`);
  assert.equal($("h2[id]").length, 0, "id is removed from heading");
  assert.equal($("section").attr("id"), "npm", "section inherits the heading id");
  assert.equal($("a.anchor").attr("href"), "#npm", "anchor uses lifted id");
});

test("does not lift heading id when the section already has one", () => {
  const $ = anchor(
    `<article><section id="from-section"><h2 id="from-heading">H</h2></section></article>`
  );
  assert.equal($("section").attr("id"), "from-section");
  assert.equal($("h2").attr("id"), "from-heading");
  assert.equal($("a.anchor").attr("href"), "#from-section", "anchor uses section id");
});
