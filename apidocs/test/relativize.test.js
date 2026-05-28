import assert from "node:assert/strict";
import { test } from "node:test";
import { relativizeHtml, relativizeUrl, relativizeUrls } from "../lib/relativize.js";
import { loadFragment } from "./helpers.js";

test("rewrites a sibling asset relative to a directory URL", () => {
  assert.equal(relativizeUrl("/assets/x.css", "/foo/"), "../assets/x.css");
});

test("derives the page directory from a file URL", () => {
  assert.equal(relativizeUrl("/a/b.css", "/a/page.html"), "./b.css");
});

test("preserves a trailing slash on directory targets", () => {
  assert.equal(relativizeUrl("/foo/bar/", "/foo/"), "./bar/");
});

test("leaves external, protocol-relative and /.11ty/ URLs untouched", () => {
  assert.equal(relativizeUrl("https://x/y", "/foo/"), "https://x/y");
  assert.equal(relativizeUrl("//cdn/x", "/foo/"), "//cdn/x");
  assert.equal(relativizeUrl("/.11ty/abc", "/foo/"), "/.11ty/abc");
});

test("emits forward slashes (path.posix, not platform default)", () => {
  assert.equal(relativizeUrl("/a/b/c.css", "/x/y/page.html"), "../../a/b/c.css");
});

test("rewrites href and src attributes", () => {
  const $ = loadFragment('<a href="/a/b.html"></a><img src="/a/c.png">');
  relativizeUrls($, "/a/");
  assert.equal($("a").attr("href"), "./b.html");
  assert.equal($("img").attr("src"), "./c.png");
});

test("rewrites each candidate in a srcset, preserving descriptors", () => {
  const $ = loadFragment('<img srcset="/a/x.png 1x, /a/y.png 2x">');
  relativizeUrls($, "/b/");
  assert.equal($("img").attr("srcset"), "../a/x.png 1x, ../a/y.png 2x");
});

test("only touches real attributes, not URL-shaped text in scripts", () => {
  const $ = loadFragment('<script>var href = "/a/keep.js";</script><a href="/a/go.html"></a>');
  relativizeUrls($, "/a/");
  assert.match($("script").html(), /\/a\/keep\.js/);
  assert.equal($("a").attr("href"), "./go.html");
});

test("relativizeUrls is a no-op without a fromUrl", () => {
  const $ = loadFragment('<a href="/x"></a>');
  relativizeUrls($, "");
  assert.equal($("a").attr("href"), "/x");
});

test("relativizeHtml returns html unchanged when no fromUrl is given", () => {
  const html = '<a href="/x">';
  assert.equal(relativizeHtml(html, ""), html);
});

test("relativizeHtml relativizes a wrapped document and preserves the doctype", () => {
  const html = '<!doctype html><html><head></head><body><a href="/a/b.html">x</a></body></html>';
  const out = relativizeHtml(html, "/a/");
  assert.match(out, /^<!DOCTYPE html>/);
  assert.match(out, /href="\.\/b\.html"/);
});
