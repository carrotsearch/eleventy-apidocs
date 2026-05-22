import path from "node:path";
import { build } from "esbuild";

/**
 * Bundle and minify the theme's JS entry into a single ES module, written
 * straight into the Eleventy output dir. Mirrors lib/build-css.js: keeps the
 * artifact out of any passthrough-copy source so the watcher doesn't loop.
 *
 * Dynamic imports in search.js (pagefind.js, fuzzysort.js, symbols.json)
 * resolve via import.meta.url at runtime — esbuild leaves those alone, so
 * the bundled apidocs.js still loads them lazily from sibling paths.
 */
export async function buildJs(themeRoot, outputDir) {
  const entry = path.join(themeRoot, "assets/js/apidocs.js");
  const outFile = path.join(outputDir, "assets/apidocs/js/apidocs.js");

  await build({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    logLevel: "warning"
  });

  return outFile;
}
