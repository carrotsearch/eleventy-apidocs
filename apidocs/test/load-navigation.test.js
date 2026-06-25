import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { loadNavigation } from "../lib/load-navigation.js";

let tmpRoot;
let originalCwd;

before(async () => {
  originalCwd = process.cwd();
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "apidocs-nav-"));
  await mkdir(path.join(tmpRoot, "src", "content"), { recursive: true });
  process.chdir(tmpRoot);

  await writeFile("src/content/index.html", "<article><h1>Home</h1></article>");
  await writeFile("src/content/install.html", "<article><h1>How to install</h1></article>");
  await writeFile(
    "src/content/usage.html",
    "<article><h1>Using <code>apidocs</code></h1></article>"
  );
  await writeFile("src/content/no-title.html", "<article><p>no h1 here</p></article>");
  await writeFile(
    "src/content/reference.html",
    `<article>
      <h1>Reference</h1>
      <section id="alpha"><h2>Alpha</h2></section>
      <section id="beta"><h3><a class="anchor" href="#beta">#</a>Beta</h3></section>
      <section id="hidden" data-toc="omit"><h2>Hidden</h2></section>
      <section><h2>No id</h2></section>
    </article>`
  );
});

after(async () => {
  process.chdir(originalCwd);
  await rm(tmpRoot, { recursive: true, force: true });
});

let warnings;
let originalWarn;
beforeEach(() => {
  warnings = [];
  originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
});
afterEach(() => {
  console.warn = originalWarn;
});

async function writeNav(json) {
  const file = path.join(tmpRoot, `nav-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(file, JSON.stringify(json));
  return file;
}

test("returns null when path is falsy", async () => {
  assert.equal(await loadNavigation(null, "src/content"), null);
  assert.equal(await loadNavigation("", "src/content"), null);
});

test("returns null when manifest file is missing", async () => {
  assert.equal(await loadNavigation("does-not-exist.json", "src/content"), null);
});

test("flat form: bare strings get titles from <h1>", async () => {
  const file = await writeNav(["install", "usage"]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [
    { slug: "install", title: "How to install" },
    { slug: "usage", title: "Using apidocs" }
  ]);
});

test("flat form: explicit titles are preserved", async () => {
  const file = await writeNav([{ slug: "install", title: "Custom" }]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [{ slug: "install", title: "Custom" }]);
});

test("flat form: mixed strings and objects coexist", async () => {
  const file = await writeNav(["install", { slug: "usage", title: "Custom usage title" }]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [
    { slug: "install", title: "How to install" },
    { slug: "usage", title: "Custom usage title" }
  ]);
});

test("empty-string slug resolves to index.html", async () => {
  const file = await writeNav([""]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [{ slug: "", title: "Home" }]);
});

test("chaptered form: bare strings get titles from <h1>", async () => {
  const file = await writeNav({
    chapters: [{ title: "Start", articles: ["install", "usage"] }]
  });
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, {
    chapters: [
      {
        title: "Start",
        articles: [
          { slug: "install", title: "How to install" },
          { slug: "usage", title: "Using apidocs" }
        ]
      }
    ]
  });
});

test("chaptered form: a chapter's section divider label survives verbatim", async () => {
  const file = await writeNav({
    chapters: [{ section: "Guides", title: "Start", articles: ["install"] }]
  });
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, {
    chapters: [
      {
        section: "Guides",
        title: "Start",
        articles: [{ slug: "install", title: "How to install" }]
      }
    ]
  });
});

test("missing source file: warns and falls back to slug as title", async () => {
  const file = await writeNav(["ghost"]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [{ slug: "ghost", title: "ghost" }]);
  assert.ok(warnings.some(w => w.includes("ghost")));
});

test("source file without h1: warns and falls back to slug", async () => {
  const file = await writeNav(["no-title"]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [{ slug: "no-title", title: "no-title" }]);
  assert.ok(warnings.some(w => w.includes("no <h1>")));
});

test("inline tags in <h1> are stripped", async () => {
  const file = await writeNav(["usage"]);
  const nav = await loadNavigation(file, "src/content");
  assert.equal(nav[0].title, "Using apidocs");
});

test("expand: true attaches the page's top-level sections as children", async () => {
  const file = await writeNav([{ slug: "reference", expand: true }]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [
    {
      slug: "reference",
      title: "Reference",
      expand: true,
      children: [
        { slug: "reference", anchor: "alpha", title: "Alpha" },
        { slug: "reference", anchor: "beta", title: "Beta" }
      ]
    }
  ]);
});

test('expand: "<slug>" expands a different page; children carry that target slug', async () => {
  const file = await writeNav([{ slug: "usage", expand: "reference" }]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav[0].children, [
    { slug: "reference", anchor: "alpha", title: "Alpha" },
    { slug: "reference", anchor: "beta", title: "Beta" }
  ]);
});

test("expand on a page with no top-level sections yields no children", async () => {
  const file = await writeNav([{ slug: "install", expand: true }]);
  const nav = await loadNavigation(file, "src/content");
  assert.deepEqual(nav, [{ slug: "install", title: "How to install", expand: true }]);
});
