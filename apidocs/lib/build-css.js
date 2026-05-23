import fs from "node:fs/promises";
import path from "node:path";
import { bundleAsync } from "lightningcss";

/**
 * Bundle the theme's CSS source tree into a single minified file, written
 * straight into the Eleventy output dir. Writing here (not into the theme's
 * own assets/) keeps the bundled artifact out of any passthrough-copy source
 * — otherwise the watcher would loop: build → write into a watched path →
 * rebuild.
 *
 * Optional `userStyles` (string | string[]) lets the consuming site append
 * its own CSS to the same bundle. Each user entry is bundled independently
 * (so @import and url() resolve relative to its own location) and the
 * minified outputs are concatenated — theme first, user CSS last so it can
 * override theme rules without specificity tricks.
 */
export async function buildCss(themeRoot, outputDir, userStyles) {
  const themeEntry = path.join(themeRoot, "styles/apidocs.css");
  const outFile = path.join(outputDir, "assets/apidocs/css/apidocs.css");

  const userEntries = (Array.isArray(userStyles) ? userStyles : [userStyles])
    .filter(Boolean)
    .map(p => path.resolve(process.cwd(), p));

  const chunks = [];
  for (const entry of [themeEntry, ...userEntries]) {
    const { code } = await bundleAsync({
      filename: entry,
      minify: true,
      sourceMap: false
    });
    chunks.push(code);
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, Buffer.concat(chunks));
  return outFile;
}
