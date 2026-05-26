import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { writeHashedAsset } from "./hashed-asset.js";

const require = createRequire(import.meta.url);

/**
 * Bundle and minify the theme's JS entry into a single content-hashed ES
 * module under the Eleventy output dir, and return its public URL. Mirrors
 * lib/build-css.js: keeps the artifact out of any passthrough-copy source so
 * the watcher doesn't loop.
 *
 * Dynamic imports in search.js (pagefind.js, fuzzysort.js, symbols.json)
 * resolve via import.meta.url at runtime — esbuild leaves those alone, and
 * since they're resolved relative to the hashed script's URL they still find
 * their siblings without us having to rewrite the literals.
 *
 * fuzzysort ships as a UMD bundle and is loaded via a classic <script> tag
 * to expose window.fuzzysort, so it's minified standalone (bundle: false)
 * rather than rolled into the ESM entry. It stays at a stable filename
 * because search.js references it as a literal string — hashing it would
 * require a separate substitution pass that isn't worth the complexity yet.
 */
export async function buildJs(themeRoot, outputDir, { hashed = true } = {}) {
  const entry = path.join(themeRoot, "assets/js/apidocs.js");
  const outDir = path.join(outputDir, "assets/apidocs/js");

  const fuzzysortEntry = require.resolve("fuzzysort");
  const fuzzysortOut = path.join(outDir, "fuzzysort.js");

  const [apidocsResult] = await Promise.all([
    build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: "esm",
      target: "es2022",
      platform: "browser",
      logLevel: "warning",
      write: false
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

  const bundle = Buffer.from(apidocsResult.outputFiles[0].contents);
  const name = await writeHashedAsset(outDir, "apidocs", "js", bundle, { hashed });
  return `/assets/apidocs/js/${name}`;
}
