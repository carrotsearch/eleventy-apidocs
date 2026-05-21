import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { loadSourceFile } from "./lib/load-source-file.js";
import { relativizeHtml } from "./lib/relativize.js";
import { buildCss } from "./lib/build-css.js";

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
    const title = extractTitle(content) || "apidocs";
    const wrapped = env.render("apidocs.njk", { content, title, apidocs, page: this.page });
    return relativizeHtml(wrapped, this.page?.url || "/");
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
