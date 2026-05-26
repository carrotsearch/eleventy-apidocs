import assert from "node:assert/strict";
import { test } from "node:test";
import { tagPagefindIgnore } from "../lib/passes/pagefind-ignore.js";
import { loadFragment } from "./helpers.js";

function run(html) {
  const $ = loadFragment(html);
  tagPagefindIgnore($);
  return $;
}

test("tags article > h1", () => {
  const $ = run(`<article><h1>Title</h1><p>Body.</p></article>`);
  assert.equal($("h1").attr("data-pagefind-ignore"), "");
});

test("leaves section headings untouched (Pagefind needs them for sub_results)", () => {
  const $ = run(`
    <article>
      <h1>Title</h1>
      <section id="a"><h2>A</h2></section>
      <section id="b"><h3>B</h3></section>
    </article>
  `);
  assert.equal($("section#a > h2").attr("data-pagefind-ignore"), undefined);
  assert.equal($("section#b > h3").attr("data-pagefind-ignore"), undefined);
});

test("does not tag body paragraphs", () => {
  const $ = run(`<article><h1>Title</h1><p>keep me</p></article>`);
  assert.equal($("p").attr("data-pagefind-ignore"), undefined);
});

test("is a no-op when the article has no h1", () => {
  const $ = run(`<article><p>just prose</p></article>`);
  assert.equal($("[data-pagefind-ignore]").length, 0);
});
