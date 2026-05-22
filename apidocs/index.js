import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { loadSourceFile } from "./lib/load-source-file.js";
import { relativizeHtml } from "./lib/relativize.js";
import { buildCss } from "./lib/build-css.js";
import { buildJs } from "./lib/build-js.js";
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

  // Build-scoped symbol accumulator. Reset before each build; the
  // apidocs-shell transform pushes harvested .api elements into it via
  // ctx.symbols; eleventy.after writes the manifest to symbols.json.
  let symbols = [];

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

  // Bundle the theme CSS and JS once before each build. Both write directly
  // into the Eleventy output dir to stay out of any passthrough-copy source
  // path — see lib/build-css.js and lib/build-js.js.
  eleventyConfig.on("eleventy.before", async ({ directories, dir }) => {
    symbols = [];
    const output = directories?.output || dir?.output;
    if (output) {
      await buildCss(themeRoot, output);
      await buildJs(themeRoot, output);
    }
  });

  // Watch source so dev rebuilds pick up token/layout/script edits.
  eleventyConfig.addWatchTarget(path.join(themeRoot, "styles"));
  eleventyConfig.addWatchTarget(path.join(themeRoot, "assets/js"));

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
      buildYear: new Date().getFullYear(),
      symbols
    };

    const processed = await processContent(content, ctx);
    const title = extractTitle(processed) || "apidocs";
    const { prev, next } = neighborsFor(apidocs.navigation, this.page?.url);
    const wrapped = env.render("apidocs.njk", {
      content: processed,
      title,
      apidocs,
      page: this.page,
      toc: ctx.toc,
      prev,
      next
    });
    const finalized = processDocument(wrapped, ctx);
    return relativizeHtml(finalized, this.page?.url || "/");
  });

  for (const f of [opts.navigation, opts.logo, opts.footer]) {
    if (f) eleventyConfig.addWatchTarget(f);
  }

  // Post-build: emit the fuzzysort symbol manifest, then run Pagefind.
  eleventyConfig.on("eleventy.after", async ({ directories, dir }) => {
    const output = directories?.output || dir?.output;
    if (!output) return;
    const siteDir = path.resolve(output);

    // Symbols manifest for the client-side fuzzysort index.
    try {
      const symbolsFile = path.join(siteDir, "symbols.json");
      await fs.writeFile(symbolsFile, JSON.stringify(symbols));
    } catch (err) {
      console.warn("[apidocs] symbols.json write failed:", err?.message || err);
    }

    // Pagefind index for prose search.
    try {
      const { createIndex } = await import("pagefind");
      const { errors, index } = await createIndex({ verbose: false });
      if (errors?.length) {
        console.warn("[apidocs] pagefind init:", errors);
        return;
      }
      if (!index) return;
      await index.addDirectory({ path: siteDir });
      await index.writeFiles({ outputPath: path.join(siteDir, "pagefind") });
    } catch (err) {
      console.warn("[apidocs] pagefind failed:", err?.message || err);
    }
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

// Flatten the navigation manifest (chaptered or flat) into an ordered list
// and return the {prev, next} entries surrounding the current page.
function neighborsFor(navigation, currentUrl) {
  const flat = flattenArticles(navigation);
  if (!flat.length || !currentUrl) return { prev: null, next: null };
  const idx = flat.findIndex(a => articleHref(a) === currentUrl);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null
  };
}

function flattenArticles(navigation) {
  if (!navigation) return [];
  if (Array.isArray(navigation)) return navigation;
  if (Array.isArray(navigation.chapters)) {
    return navigation.chapters.flatMap(c => c.articles || []);
  }
  return [];
}

function articleHref(article) {
  const slug = article.slug || "";
  return "/" + slug + (slug ? "/" : "");
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
