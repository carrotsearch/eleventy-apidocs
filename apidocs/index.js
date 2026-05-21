import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { loadSourceFile } from "./lib/load-source-file.js";
import { relativizeHtml } from "./lib/relativize.js";
import { buildCss } from "./lib/build-css.js";
import { processContent, processDocument } from "./lib/pipeline.js";

const themeRoot = path.dirname(fileURLToPath(import.meta.url));

export default function apidocs(eleventyConfig, userOptions = {}) {
  const opts = {
    navigation: "src/navigation.json",
    logo: "src/logo.html",
    footer: "src/footer.html",
    contentDir: "src/content",
    variables: {},
    transformers: [],
    finalizers: [],
    ...userOptions
  };

  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(
      [path.join(themeRoot, "layouts"), path.join(themeRoot, "partials")],
      { noCache: true }
    ),
    { autoescape: false }
  );

  let cachedShell = null;
  async function getShellData() {
    if (cachedShell) return cachedShell;
    cachedShell = {
      navigation: await loadSourceFile(opts.navigation, "json"),
      logo: await loadSourceFile(opts.logo, "html"),
      footer: await loadSourceFile(opts.footer, "html"),
      variables: opts.variables,
      buildTime: new Date().toISOString()
    };
    return cachedShell;
  }

  eleventyConfig.on("eleventy.beforeWatch", () => {
    cachedShell = null;
  });

  // Bundle the theme CSS once before each build. lightningcss collapses
  // @imports and minifies in one pass, so the site ships a single .css file.
  eleventyConfig.on("eleventy.before", async () => {
    await buildCss(themeRoot);
  });

  // Watch CSS source so dev rebuilds pick up token/layout edits.
  eleventyConfig.addWatchTarget(path.join(themeRoot, "styles"));

  eleventyConfig.addTransform("apidocs-shell", async function (content, outputPath) {
    if (!outputPath || !outputPath.endsWith(".html")) return content;
    const apidocs = await getShellData();

    const sourceDir = this.page?.inputPath
      ? path.dirname(path.resolve(this.page.inputPath))
      : process.cwd();

    // Eleventy output dir for this page (e.g. "_site"). Derived from the
    // resolved output path, with the page's URL suffix stripped.
    const outputDir = deriveOutputDir(outputPath, this.page?.url);

    const ctx = {
      page: this.page,
      sourceDir,
      outputDir,
      transformers: opts.transformers,
      finalizers: opts.finalizers,
      variables: opts.variables,
      buildYear: new Date().getFullYear()
    };

    const processed = await processContent(content, ctx);
    const title = extractTitle(processed) || "apidocs";
    const wrapped = env.render("apidocs.njk", {
      content: processed,
      title,
      apidocs,
      page: this.page,
      toc: ctx.toc
    });
    const finalized = processDocument(wrapped, ctx);
    return relativizeHtml(finalized, this.page?.url || "/");
  });

  for (const f of [opts.navigation, opts.logo, opts.footer]) {
    if (f) eleventyConfig.addWatchTarget(f);
  }

  eleventyConfig.addPassthroughCopy({
    [path.join(themeRoot, "assets/css")]: "assets/apidocs/css",
    [path.join(themeRoot, "assets/js")]: "assets/apidocs/js"
  });

  return {
    dir: { input: opts.contentDir },
    htmlTemplateEngine: false,
    markdownTemplateEngine: false
  };
}

function extractTitle(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim();
}

// Given Eleventy's resolved output path (e.g. "_site/code-blocks/index.html")
// and the page's URL (e.g. "/code-blocks/"), strip the URL-derived suffix to
// recover the Eleventy output root (e.g. "_site").
function deriveOutputDir(outputPath, pageUrl) {
  if (!outputPath) return "_site";
  const url = pageUrl || "/";
  const suffix = url.replace(/^\//, "") + "index.html";
  if (outputPath.endsWith(suffix)) {
    const dir = outputPath.slice(0, outputPath.length - suffix.length);
    return dir.replace(/\/$/, "") || ".";
  }
  return path.dirname(outputPath);
}
