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

// Generated responsive-image variants are validated against the build manifest
// (imageOutputs), not the filesystem — the image pipeline owns their existence,
// and crawling them races the writes / overloads the static server.
test("skips a generated image variant that the manifest emitted", async () => {
  await writeFile(
    path.join(siteDir, "index.html"),
    `<!doctype html><html><body>
      <img src="assets/apidocs/img/pic-320.webp"
           srcset="assets/apidocs/img/pic-320.webp 320w, assets/apidocs/img/pic-640.webp 640w">
    </body></html>`
  );

  // The files are deliberately absent on disk; membership in the manifest is
  // what satisfies them.
  const manifest = new Set(["pic-320.webp", "pic-640.webp"]);
  await checkLinks(siteDir, {}, manifest);
});

test("still catches a generated image URL the manifest did not emit", async () => {
  await writeFile(
    path.join(siteDir, "index.html"),
    `<!doctype html><html><body>
      <img src="assets/apidocs/img/stale-320.webp">
    </body></html>`
  );

  // A stale/typo'd variant the build didn't emit (the prune pass would have
  // deleted it) must still fail — no manifest entry, real 404.
  await assert.rejects(() => checkLinks(siteDir, {}, new Set(["pic-320.webp"])), /broken link/);
});
