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
