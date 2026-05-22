import { test } from "node:test";
import assert from "node:assert/strict";
import { linkRewriter } from "../lib/passes/link-rewriter.js";
import { loadFragment } from "./helpers.js";

function rewrite(html) {
  const $ = loadFragment(html);
  linkRewriter($);
  return $.html();
}

test("rewrites internal .html to clean directory URLs", () => {
  assert.equal(rewrite(`<a href="foo.html">x</a>`), `<a href="foo/">x</a>`);
});

test("rewrites .htm with the same recipe", () => {
  assert.equal(rewrite(`<a href="bar.htm">x</a>`), `<a href="bar/">x</a>`);
});

test("preserves query and fragment", () => {
  assert.equal(
    rewrite(`<a href="foo.html?a=1#sec">x</a>`),
    `<a href="foo/?a=1#sec">x</a>`
  );
  assert.equal(rewrite(`<a href="foo.html#sec">x</a>`), `<a href="foo/#sec">x</a>`);
});

test("skips http(s), protocol-relative, and mailto", () => {
  assert.equal(rewrite(`<a href="https://x.com/a.html">x</a>`), `<a href="https://x.com/a.html">x</a>`);
  assert.equal(rewrite(`<a href="//cdn.example/a.html">x</a>`), `<a href="//cdn.example/a.html">x</a>`);
  assert.equal(rewrite(`<a href="mailto:a@b">x</a>`), `<a href="mailto:a@b">x</a>`);
});

test("skips data-external explicit opt-out", () => {
  assert.equal(
    rewrite(`<a href="foo.html" data-external>x</a>`),
    `<a href="foo.html" data-external="">x</a>`
  );
});

test("skips fragment-only and empty hrefs", () => {
  assert.equal(rewrite(`<a href="#sec">x</a>`), `<a href="#sec">x</a>`);
  assert.equal(rewrite(`<a href="">x</a>`), `<a href="">x</a>`);
});

test("leaves non-.html hrefs alone", () => {
  assert.equal(rewrite(`<a href="foo.png">x</a>`), `<a href="foo.png">x</a>`);
  assert.equal(rewrite(`<a href="./sibling/">x</a>`), `<a href="./sibling/">x</a>`);
});

test("handles a parent-relative path", () => {
  assert.equal(rewrite(`<a href="../guide.html">x</a>`), `<a href="../guide/">x</a>`);
});
