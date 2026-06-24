import path from "node:path";
import { bundleAsync } from "lightningcss";
import { writeHashedAsset } from "./hashed-asset.js";

/**
 * Bundle the theme's CSS source tree into a single minified, content-hashed
 * file under the Eleventy output dir, and return its public URL. Writing here
 * (not into the theme's own assets/) keeps the bundled artifact out of any
 * passthrough-copy source — otherwise the watcher would loop: build → write
 * into a watched path → rebuild.
 *
 * Optional `userStyles` (string | string[]) lets the consuming site append
 * its own CSS to the same bundle. Each user entry is bundled independently
 * (so @import and url() resolve relative to its own location) and the
 * minified outputs are concatenated — theme first, user CSS last so it can
 * override theme rules without specificity tricks.
 *
 * Optional `extraCss` (string) is concatenated between the theme and user CSS.
 * It carries the Shiki syntax-highlighting classes collected during the build
 * (see code-highlight.js), which is why this runs in eleventy.after, not
 * before — the registry isn't complete until every page has been highlighted.
 * It's already plain, compact class rules, so it's concatenated raw rather than
 * routed through bundleAsync (which expects a file path for @import/url()).
 */
export async function buildCss(
  themeRoot,
  outputDir,
  userStyles,
  { hashed = true, extraCss = "" } = {}
) {
  const themeEntry = path.join(themeRoot, "styles/apidocs.css");
  const outDir = path.join(outputDir, "assets/apidocs/css");

  const userEntries = (Array.isArray(userStyles) ? userStyles : [userStyles])
    .filter(Boolean)
    .map(p => path.resolve(process.cwd(), p));

  const chunks = [];

  const { code: themeCode } = await bundleAsync({
    filename: themeEntry,
    minify: true,
    sourceMap: false
  });
  chunks.push(themeCode);

  if (extraCss) {
    chunks.push(Buffer.from(extraCss));
  }

  for (const entry of userEntries) {
    const { code } = await bundleAsync({
      filename: entry,
      minify: true,
      sourceMap: false
    });
    chunks.push(code);
  }

  const name = await writeHashedAsset(outDir, "apidocs", "css", Buffer.concat(chunks), { hashed });
  return `/assets/apidocs/css/${name}`;
}
