import fs from "node:fs/promises";
import path from "node:path";
import { bundleAsync } from "lightningcss";

/**
 * Bundle the theme's CSS source tree into a single minified file, written
 * straight into the Eleventy output dir. Writing here (not into the theme's
 * own assets/) keeps the bundled artifact out of any passthrough-copy source
 * — otherwise the watcher would loop: build → write into a watched path →
 * rebuild.
 */
export async function buildCss(themeRoot, outputDir) {
  const entry = path.join(themeRoot, "styles/apidocs.css");
  const outFile = path.join(outputDir, "assets/apidocs/css/apidocs.css");

  const { code } = await bundleAsync({
    filename: entry,
    minify: true,
    sourceMap: false
  });

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, code);
  return outFile;
}
