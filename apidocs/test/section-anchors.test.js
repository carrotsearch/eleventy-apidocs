import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionAnchors } from "../lib/passes/section-anchors.js";
import { loadFragment } from "./helpers.js";

function anchor(html) {
  const $ = loadFragment(html);
  sectionAnchors($);
  return $;
}

test("prepends an anchor link to id-bearing headings inside <article>", () => {
  const $ = anchor(`<article><h2 id="intro">Intro</h2></article>`);
  const $a = $("h2 > a.anchor");
  assert.equal($a.length, 1);
  assert.equal($a.attr("href"), "#intro");
  assert.ok($a.find("svg").length, "anchor contains the SVG icon");
});

test("targets h2-h5", () => {
  const $ = anchor(`
    <article>
      <h2 id="a">A</h2>
      <h3 id="b">B</h3>
      <h4 id="c">C</h4>
      <h5 id="d">D</h5>
    </article>
  `);
  assert.equal($("a.anchor").length, 4);
});

test("ignores h1 and h6", () => {
  const $ = anchor(`
    <article>
      <h1 id="title">Title</h1>
      <h6 id="aside">Aside</h6>
    </article>
  `);
  assert.equal($("a.anchor").length, 0);
});

test("skips headings without an id", () => {
  const $ = anchor(`<article><h2>No id</h2></article>`);
  assert.equal($("a.anchor").length, 0);
});

test("ignores headings outside <article>", () => {
  const $ = anchor(`<h2 id="loose">Loose</h2><article><h2 id="ok">OK</h2></article>`);
  assert.equal($("a.anchor").length, 1);
  assert.equal($("a.anchor").attr("href"), "#ok");
});

test("does not double-inject when run twice", () => {
  const $ = loadFragment(`<article><h2 id="x">X</h2></article>`);
  sectionAnchors($);
  sectionAnchors($);
  assert.equal($("a.anchor").length, 1);
});

test("escapes special characters in the href on serialization", () => {
  const $ = anchor(`<article><h2 id='&quot;weird&quot;'>W</h2></article>`);
  // .attr() returns the decoded value; the escape is visible in serialized HTML.
  assert.equal($("a.anchor").attr("href"), `#"weird"`);
  assert.match($.html(), /href="#&quot;weird&quot;"/);
});

test("places the anchor as the first child of the heading", () => {
  const $ = anchor(`<article><h2 id="x">Heading text</h2></article>`);
  const first = $("h2").contents().first()[0];
  assert.equal(first.tagName, "a");
});

test("lifts section id onto its first heading when the heading has none", () => {
  const $ = anchor(`<article><section id="npm"><h2>NPM</h2><p>p</p></section></article>`);
  assert.equal($("section[id]").length, 0, "section id is removed");
  assert.equal($("h2").attr("id"), "npm", "heading inherits the section id");
  assert.equal($("a.anchor").attr("href"), "#npm", "anchor uses lifted id");
});

test("does not overwrite an existing heading id when section also has one", () => {
  const $ = anchor(`<article><section id="from-section"><h2 id="from-heading">H</h2></section></article>`);
  assert.equal($("h2").attr("id"), "from-heading");
  assert.equal($("section").attr("id"), "from-section");
});
