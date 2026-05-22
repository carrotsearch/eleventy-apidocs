import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);

/**
 * Bundle and minify the theme's JS entry into a single ES module, written
 * straight into the Eleventy output dir. Mirrors lib/build-css.js: keeps the
 * artifact out of any passthrough-copy source so the watcher doesn't loop.
 *
 * Dynamic imports in search.js (pagefind.js, fuzzysort.js, symbols.json)
 * resolve via import.meta.url at runtime — esbuild leaves those alone, so
 * the bundled apidocs.js still loads them lazily from sibling paths.
 *
 * fuzzysort ships as a UMD bundle and is loaded via a classic <script> tag
 * to expose window.fuzzysort, so it's minified standalone (bundle: false)
 * rather than rolled into the ESM entry — keeps the UMD wrapper intact.
 */
export async function buildJs(themeRoot, outputDir) {
  const entry = path.join(themeRoot, "assets/js/apidocs.js");
  const outFile = path.join(outputDir, "assets/apidocs/js/apidocs.js");

  const fuzzysortEntry = require.resolve("fuzzysort");
  const fuzzysortOut = path.join(outputDir, "assets/apidocs/js/fuzzysort.js");

  await Promise.all([
    build({
      entryPoints: [entry],
      outfile: outFile,
      bundle: true,
      minify: true,
      format: "esm",
      target: "es2022",
      platform: "browser",
      logLevel: "warning"
    }),
    build({
      entryPoints: [fuzzysortEntry],
      outfile: fuzzysortOut,
      bundle: false,
      minify: true,
      target: "es2022",
      platform: "browser",
      logLevel: "warning"
    })
  ]);

  return outFile;
}
