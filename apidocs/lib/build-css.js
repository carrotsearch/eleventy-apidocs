import fs from "node:fs/promises";
import path from "node:path";
import { bundleAsync } from "lightningcss";

/**
 * Bundle the theme's CSS source tree into a single file lightningcss has
 * already minified + collapsed @imports for. Eleventy then passthrough-copies
 * the output into the site under assets/apidocs/css/.
 *
 * Returns the absolute path of the bundled file so callers can hand it to
 * addPassthroughCopy.
 */
export async function buildCss(themeRoot) {
  const entry = path.join(themeRoot, "styles/apidocs.css");
  const outDir = path.join(themeRoot, "assets/css");
  const outFile = path.join(outDir, "apidocs.css");

  const { code } = await bundleAsync({
    filename: entry,
    minify: true,
    sourceMap: false
  });

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, code);
  return outFile;
}
