import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { checkLinks } from "../lib/check-links.js";

// A two-page fixture exercising the link classes this theme leans on:
// same-page #anchors, page-relative cross-page #anchors, and an external
// link (which must be skipped by default so it can't make builds flaky).
let siteDir;

before(async () => {
  siteDir = await mkdtemp(path.join(os.tmpdir(), "apidocs-links-"));
  await mkdir(path.join(siteDir, "other"), { recursive: true });

  await writeFile(
    path.join(siteDir, "index.html"),
    `<!doctype html><html><body>
      <h2 id="here">Here</h2>
      <a href="#here">same-page ok</a>
      <a href="other/#there">cross-page ok</a>
      <a href="https://does-not-exist.invalid/page">external</a>
    </body></html>`
  );
  await writeFile(
    path.join(siteDir, "other", "index.html"),
    `<!doctype html><html><body><h2 id="there">There</h2></body></html>`
  );
});

after(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

// checkLinks prints the broken-link list to stderr before throwing; silence
// it so a passing run's output stays clean.
let originalError;
beforeEach(() => {
  originalError = console.error;
  console.error = () => {};
});

afterEach(() => {
  console.error = originalError;
});

test("passes a site whose anchors all resolve, skipping external links", async () => {
  await checkLinks(siteDir);
});

test("throws on a broken same-page fragment", async () => {
  await writeFile(
    path.join(siteDir, "index.html"),
    `<!doctype html><html><body><a href="#missing">x</a></body></html>`
  );
  await assert.rejects(() => checkLinks(siteDir), /broken link/);
});

test("throws on a broken page-relative cross-page fragment", async () => {
  await writeFile(
    path.join(siteDir, "index.html"),
    `<!doctype html><html><body><a href="other/#missing">x</a></body></html>`
  );
  await assert.rejects(() => checkLinks(siteDir), /broken link/);
});

test("fatal:false reports but does not throw", async () => {
  await writeFile(
    path.join(siteDir, "index.html"),
    `<!doctype html><html><body><a href="#missing">x</a></body></html>`
  );
  await checkLinks(siteDir, { fatal: false });
});
