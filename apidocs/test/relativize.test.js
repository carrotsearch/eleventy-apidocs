import assert from "node:assert/strict";
import { test } from "node:test";
import { relativizeHtml, relativizeUrl } from "../lib/relativize.js";

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

test("returns html unchanged when no fromUrl is given", () => {
  const html = '<a href="/x">';
  assert.equal(relativizeHtml(html, ""), html);
});

test("rewrites href and src attributes", () => {
  assert.equal(relativizeHtml('<a href="/a/b.html">', "/a/"), '<a href="./b.html">');
});

test("rewrites each candidate in a srcset, preserving descriptors", () => {
  const out = relativizeHtml('<img srcset="/a/x.png 1x, /a/y.png 2x">', "/b/");
  assert.equal(out, '<img srcset="../a/x.png 1x, ../a/y.png 2x">');
});
