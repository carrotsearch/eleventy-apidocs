import { test } from "node:test";
import assert from "node:assert/strict";
import { linkRewriter } from "../lib/passes/link-rewriter.js";
import { loadFragment } from "./helpers.js";

function rewrite(html, pageUrl = "/") {
  const $ = loadFragment(html);
  linkRewriter($, { page: { url: pageUrl } });
  return $.html();
}

test("from root: sibling .html resolves to /slug/", () => {
  assert.equal(rewrite(`<a href="foo.html">x</a>`), `<a href="/foo/">x</a>`);
  assert.equal(rewrite(`<a href="./foo.html">x</a>`), `<a href="/foo/">x</a>`);
});

test("rewrites .htm with the same recipe", () => {
  assert.equal(rewrite(`<a href="bar.htm">x</a>`), `<a href="/bar/">x</a>`);
});

test("preserves query and fragment", () => {
  assert.equal(
    rewrite(`<a href="foo.html?a=1#sec">x</a>`),
    `<a href="/foo/?a=1#sec">x</a>`
  );
  assert.equal(rewrite(`<a href="foo.html#sec">x</a>`), `<a href="/foo/#sec">x</a>`);
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

test("from a sibling page: ./foo.html resolves to /foo/", () => {
  // Author writes ./code-blocks.html in callouts.html; the rendered URL is
  // /callouts/. Resolving against the source URL /callouts.html gives /code-blocks/,
  // which relativizeHtml will later turn into ../code-blocks/.
  assert.equal(
    rewrite(`<a href="./code-blocks.html">x</a>`, "/callouts/"),
    `<a href="/code-blocks/">x</a>`
  );
  assert.equal(
    rewrite(`<a href="code-blocks.html">x</a>`, "/callouts/"),
    `<a href="/code-blocks/">x</a>`
  );
});

test("parent-relative path resolves through the source directory", () => {
  assert.equal(
    rewrite(`<a href="../guide.html">x</a>`, "/section/page/"),
    `<a href="/guide/">x</a>`
  );
});

test("absolute .html paths get the trailing slash treatment", () => {
  assert.equal(rewrite(`<a href="/foo.html">x</a>`), `<a href="/foo/">x</a>`);
  assert.equal(
    rewrite(`<a href="/section/foo.html#x">x</a>`, "/anywhere/"),
    `<a href="/section/foo/#x">x</a>`
  );
});
