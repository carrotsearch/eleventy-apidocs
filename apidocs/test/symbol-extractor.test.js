import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSymbols } from "../lib/passes/symbol-extractor.js";
import { loadFragment } from "./helpers.js";

function extract(html, url = "/page/") {
  const $ = loadFragment(html);
  const ctx = { page: { url }, symbols: [] };
  extractSymbols($, ctx);
  return ctx.symbols;
}

// ---------- .api pass ----------

test("extracts .api dt as option, group=api", () => {
  const s = extract(`<article><dl><dt id="size" class="api">size</dt></dl></article>`);
  assert.deepEqual(s, [
    { name: "size", kind: "option", group: "api", url: "/page/", anchor: "size" }
  ]);
});

test(".api section without call-signature parens infers property kind", () => {
  const s = extract(`
    <article><section id="cfg" class="api"><h2>Config</h2></section></article>
  `);
  assert.deepEqual(s, [
    { name: "Config", kind: "property", group: "api", url: "/page/", anchor: "cfg" }
  ]);
});

test(".api section whose name ends with (…) infers method kind", () => {
  const s = extract(`
    <article><section id="proc" class="api"><h2>processOrder(order, options)</h2></section></article>
  `);
  assert.deepEqual(s, [
    {
      name: "processOrder(order, options)",
      kind: "method",
      group: "api",
      url: "/page/",
      anchor: "proc"
    }
  ]);
});

test(".api falls back to ancestor id when element has none", () => {
  const s = extract(`
    <article><section id="opts"><dl><dt class="api">x</dt></dl></section></article>
  `);
  assert.equal(s[0].anchor, "opts");
  assert.equal(s[0].group, "api");
});

test("data-api-name and data-api-kind override defaults", () => {
  const s = extract(`
    <article>
      <section id="ev" class="api" data-api-name="onClick" data-api-kind="event">
        <h2>ignored</h2>
      </section>
    </article>
  `);
  assert.deepEqual(s, [
    { name: "onClick", kind: "event", group: "api", url: "/page/", anchor: "ev" }
  ]);
});

// ---------- page (article > h1) pass ----------

test("article h1 becomes a kind=page entry with no anchor", () => {
  const s = extract(`<article><h1>Quick start</h1></article>`);
  assert.deepEqual(s, [{ name: "Quick start", kind: "page", group: "section", url: "/page/" }]);
});

test("article without an h1 produces no page entry", () => {
  const s = extract(`<article><p>Body only.</p></article>`);
  assert.deepEqual(s, []);
});

test("page entry strips a prepended anchor link from the h1", () => {
  const s = extract(`
    <article><h1><a class="anchor" href="#x">#</a>Title</h1></article>
  `);
  assert.equal(s[0].name, "Title");
});

// ---------- section pass ----------

test("plain sections are extracted as group=section", () => {
  const s = extract(`
    <article>
      <section id="intro"><h2>Intro</h2></section>
      <section id="usage"><h2>Usage</h2></section>
    </article>
  `);
  assert.deepEqual(s, [
    { name: "Intro", kind: "section", group: "section", url: "/page/", anchor: "intro" },
    { name: "Usage", kind: "section", group: "section", url: "/page/", anchor: "usage" }
  ]);
});

test("nested sections are included", () => {
  const s = extract(`
    <article>
      <section id="a"><h2>A</h2>
        <section id="a1"><h3>A.1</h3></section>
      </section>
    </article>
  `);
  assert.deepEqual(
    s.map(x => x.anchor),
    ["a", "a1"]
  );
});

test("section heading strips the prepended anchor link", () => {
  const s = extract(`
    <article>
      <section id="x"><h2><a class="anchor" href="#x">#</a>Title</h2></section>
    </article>
  `);
  assert.equal(s[0].name, "Title");
});

test("sections without an id are skipped", () => {
  const s = extract(`<article><section><h2>nope</h2></section></article>`);
  assert.deepEqual(s, []);
});

test("sections without a heading are skipped", () => {
  const s = extract(`<article><section id="x"><p>no heading</p></section></article>`);
  assert.deepEqual(s, []);
});

test("data-toc=omit drops the section", () => {
  const s = extract(`
    <article>
      <section id="a"><h2>A</h2></section>
      <section id="b" data-toc="omit"><h2>B</h2></section>
    </article>
  `);
  assert.deepEqual(
    s.map(x => x.name),
    ["A"]
  );
});

test("data-toc=omit-children keeps the section but drops descendants", () => {
  const s = extract(`
    <article>
      <section id="a" data-toc="omit-children">
        <h2>A</h2>
        <section id="a1"><h3>A.1</h3></section>
      </section>
    </article>
  `);
  assert.deepEqual(
    s.map(x => x.anchor),
    ["a"]
  );
});

// ---------- interaction between passes ----------

test("an .api section is not duplicated by the plain-section pass", () => {
  const s = extract(`
    <article>
      <section id="cfg" class="api"><h2>Config</h2></section>
    </article>
  `);
  assert.equal(s.length, 1);
  assert.equal(s[0].group, "api");
});

// ---------- crumbs ----------

test(".api dt inside a section on a titled page gets [page, section] crumbs", () => {
  const s = extract(`
    <article>
      <h1>Reference</h1>
      <section id="cfg"><h2>Config</h2>
        <dl><dt id="size" class="api">size</dt></dl>
      </section>
    </article>
  `);
  const size = s.find(x => x.name === "size");
  assert.deepEqual(size.crumbs, ["Reference", "Config"]);
});

test("nested plain section gets crumbs from page title and ancestor section", () => {
  const s = extract(`
    <article>
      <h1>Reference</h1>
      <section id="a"><h2>A</h2>
        <section id="a1"><h3>A.1</h3></section>
      </section>
    </article>
  `);
  const a = s.find(x => x.anchor === "a");
  const a1 = s.find(x => x.anchor === "a1");
  assert.deepEqual(a.crumbs, ["Reference"]);
  assert.deepEqual(a1.crumbs, ["Reference", "A"]);
});

test("matched section is excluded from its own crumbs", () => {
  const s = extract(`
    <article>
      <h1>Reference</h1>
      <section id="x" class="api"><h2>X</h2></section>
    </article>
  `);
  const x = s.find(e => e.anchor === "x");
  assert.deepEqual(x.crumbs, ["Reference"]);
});

test("crumbs omitted when there is no page title and no ancestor section", () => {
  const s = extract(`<article><dl><dt id="size" class="api">size</dt></dl></article>`);
  assert.equal(s[0].crumbs, undefined);
});

test("page entry never carries crumbs", () => {
  const s = extract(`<article><h1>Quick start</h1></article>`);
  assert.equal(s[0].crumbs, undefined);
});

test("ancestor sections without a readable heading are skipped in crumbs", () => {
  const s = extract(`
    <article>
      <h1>Reference</h1>
      <section id="outer">
        <section id="inner"><h3>Inner</h3>
          <dl><dt id="x" class="api">x</dt></dl>
        </section>
      </section>
    </article>
  `);
  const x = s.find(e => e.name === "x");
  assert.deepEqual(x.crumbs, ["Reference", "Inner"]);
});

test("plain section that contains .api items keeps both: section + items", () => {
  const s = extract(`
    <article>
      <section id="opts">
        <h2>Options</h2>
        <dl><dt class="api">size</dt><dt class="api">color</dt></dl>
      </section>
    </article>
  `);
  // Two .api options anchor to their nearest id ("opts"). The section
  // itself is also a section entry. Both options share the anchor — the
  // dedupe only keys off section anchors, so this is intentional.
  assert.deepEqual(
    s.map(x => ({ name: x.name, group: x.group })),
    [
      { name: "size", group: "api" },
      { name: "color", group: "api" },
      { name: "Options", group: "section" }
    ]
  );
});
