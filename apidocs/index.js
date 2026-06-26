import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { buildCss } from "./lib/build-css.js";
import { buildJs } from "./lib/build-js.js";
import { checkLinks } from "./lib/check-links.js";
import { extractH1 } from "./lib/extract-h1.js";
import { writeHashedAsset } from "./lib/hashed-asset.js";
import { buildLlmsFull, buildLlmsIndex } from "./lib/llms-txt.js";
import { loadNavigation } from "./lib/load-navigation.js";
import { loadSourceFile } from "./lib/load-source-file.js";
import { codeStylesCss } from "./lib/passes/code-highlight.js";
import { processContent, processDocument } from "./lib/pipeline.js";
import { processMarkdown } from "./lib/process-markdown.js";
import * as progress from "./lib/progress.js";
import { relativizeHtml, relativizeUrl } from "./lib/relativize.js";

// Distinct from the window.__APIDOCS_SYMBOLS_URL__ identifier on purpose:
// a plain replace() across each generated HTML would clobber the identifier
// too. Using `@@…@@` keeps the placeholder unique to the value position.
const SYMBOLS_URL_PLACEHOLDER = "@@APIDOCS_SYMBOLS_URL@@";

// The stylesheet href the layout emits in prod. The bundle can only be built in
// eleventy.after (it folds in the Shiki classes collected as pages render), so
// its hashed URL isn't known at render time. The layout bakes this placeholder
// instead, substituted per page post-build. `@@…@@` doesn't start with "/", so
// relativizeHtml leaves it untouched (see lib/relativize.js).
const CSS_URL_PLACEHOLDER = "@@APIDOCS_CSS_URL@@";

const themeRoot = path.dirname(fileURLToPath(import.meta.url));

export default function apidocs(eleventyConfig, userOptions = {}) {
  const opts = {
    navigation: "src/navigation.json",
    logo: "src/logo.html",
    footer: "src/footer.html",
    head: "src/head.html",
    contentDir: "src/content",
    variables: {},
    transformers: [],
    finalizers: [],
    styles: [],
    linkCheck: true,
    ...userOptions
  };

  // Normalize the link-check option once: `true` → default settings, anything
  // falsy → off. The eleventy.after handler then just checks for an object.
  const linkCheckOptions = opts.linkCheck === true ? {} : opts.linkCheck || null;

  // autoescape on: page titles, ToC headings, nav/prev-next labels and
  // section anchors all flow from author content and must be escaped. The
  // four genuinely-raw slots (content, logo, footer, head) opt out per-use
  // with the `| safe` filter in the templates.
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(
      [path.join(themeRoot, "layouts"), path.join(themeRoot, "partials")],
      { noCache: true }
    ),
    { autoescape: true }
  );

  // Build-scoped symbol accumulator. Reset before each build; the
  // apidocs-shell transform pushes harvested .api elements into it via
  // ctx.symbols; eleventy.after writes the manifest to symbols.json.
  let symbols = [];

  // Build-scoped per-page Markdown accumulator. The apidocs-shell transform
  // converts each page's processed HTML to Markdown and pushes it here;
  // eleventy.after writes one .md file per URL alongside its .html.
  let markdownPages = [];

  // Build-scoped set of responsive-image variant filenames eleventy-img emitted
  // this build (content-hashed, so unique). The apidocs-shell transform fills it
  // via ctx.imageOutputs; eleventy.after deletes any file under
  // assets/apidocs/img not in it — the stale variants a restored CI image cache
  // (see .github/workflows/ci.yml) leaves behind when a source image changes or
  // is removed.
  let imageOutputs = new Set();

  // Latched once we've emitted Pagefind + symbols.json in the dev server's
  // lifetime. Subsequent dev rebuilds skip both — search reflects the
  // start-up snapshot until the dev server restarts. Per design memo
  // /Users/stanislawosinski/.claude/plans/is-it-viable-to-greedy-mccarthy.md
  let devIndexedOnce = false;

  // Carried from eleventy.before to other events so we can branch without
  // re-checking process.env each time. Default matches Eleventy's own
  // "build" runMode for the safe (production) path.
  let currentRunMode = "build";

  // Mutated in place by eleventy.before after the asset bundles are hashed.
  // The shell data caches a reference to this object, so subsequent builds
  // see fresh URLs without invalidating the cache.
  const assets = { css: null, js: null, symbolsUrl: SYMBOLS_URL_PLACEHOLDER };

  let cachedShell = null;
  async function getShellData() {
    if (cachedShell) {
      return cachedShell;
    }
    cachedShell = {
      navigation: await loadNavigation(opts.navigation, opts.contentDir, {
        cache: currentRunMode === "serve"
      }),
      logo: await loadSourceFile(opts.logo, "html"),
      footer: await loadSourceFile(opts.footer, "html"),
      head: await loadSourceFile(opts.head, "html"),
      variables: opts.variables,
      buildTime: new Date().toISOString(),
      assets,
      dev: currentRunMode === "serve"
    };
    return cachedShell;
  }

  eleventyConfig.on("eleventy.beforeWatch", () => {
    // Drop the cached shell so navigation gets re-derived. In dev this is
    // cheap: loadNavigation's mtime cache short-circuits any source HTML
    // whose file hasn't changed.
    cachedShell = null;
  });

  // Bundle the theme CSS and JS once before each build. Both write directly
  // into the Eleventy output dir to stay out of any passthrough-copy source
  // path — see lib/build-css.js and lib/build-js.js.
  //
  // Under `--serve`, we emit stable filenames (no content hash) and a stable
  // symbols.json URL so the layout can hard-code them — the per-page URL
  // substitution pass in eleventy.after is skipped entirely in dev.
  eleventyConfig.on("eleventy.before", async ({ directories, dir, runMode }) => {
    currentRunMode = runMode || "build";
    progress.startBuild(currentRunMode);
    const hashed = currentRunMode !== "serve";
    symbols = [];
    markdownPages = [];
    imageOutputs = new Set();
    const output = directories?.output || dir?.output;
    if (output) {
      assets.js = await progress.stage("js", () => buildJs(themeRoot, output, { hashed }));
    }

    // CSS is bundled in eleventy.after, not here: the bundle folds in the Shiki
    // highlight classes, whose registry isn't complete until every page has
    // rendered. The layout bakes a placeholder href (substituted per page
    // post-build) in prod; in dev the stable filename is known up front.
    assets.css = hashed ? CSS_URL_PLACEHOLDER : "/assets/apidocs/css/apidocs.css";
    assets.symbolsUrl = hashed ? SYMBOLS_URL_PLACEHOLDER : "/assets/apidocs/symbols.json";

    // Warm the shell cache here rather than letting the first page's transform
    // trigger it lazily. Navigation enrichment reads and parses source HTML per
    // slug (titles, and sections for `expand` entries) — a cost proportional to
    // page count that would otherwise be folded silently into the "js done" →
    // "page #1" gap. Surfacing it as its own stage shortens that gap and gives
    // the work an honest timing line. `assets` is mutated in place above, so the
    // cached shell sees the final css/symbols URLs by reference.
    await progress.stage("navigation", getShellData);
  });

  // Watch source so dev rebuilds pick up token/layout/script edits.
  eleventyConfig.addWatchTarget(path.join(themeRoot, "styles"));
  eleventyConfig.addWatchTarget(path.join(themeRoot, "assets/js"));
  for (const f of [].concat(opts.styles || [])) {
    if (f) {
      eleventyConfig.addWatchTarget(f);
    }
  }

  eleventyConfig.addTransform("apidocs-shell", async function (content, outputPath) {
    if (!outputPath?.endsWith(".html")) {
      return content;
    }
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
      codeThemes: opts.codeThemes,
      buildYear: new Date().getFullYear(),
      symbols,
      imageOutputs
    };

    const processed = await processContent(content, ctx);
    const title = extractH1(processed) || "apidocs";

    // Stash a Markdown rendering of the article alongside the HTML. Runs
    // its own slim pipeline on the raw source HTML — see
    // lib/process-markdown.js — rather than turning processContent's
    // browser-shaped output back into Markdown. Title and summary are
    // captured for llms.txt assembly in eleventy.after.
    const md = await processMarkdown(content, ctx);
    markdownPages.push({
      url: this.page?.url || "/",
      title: md.title,
      summary: md.summary,
      markdown: md.markdown
    });

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
    const html = relativizeHtml(finalized, this.page?.url || "/");

    // Logged on completion, not entry: Eleventy enters every page's transform
    // synchronously up to the first await, so an entry-time counter would dump
    // all pages at once and leave the render gap silent. Completion order
    // streams the lines across the work that fills "js done" → post-build.
    progress.page(this.page?.url || outputPath);
    return html;
  });

  for (const f of [opts.navigation, opts.logo, opts.footer, opts.head]) {
    if (f) {
      eleventyConfig.addWatchTarget(f);
    }
  }

  // Post-build: write the per-page Markdown siblings (plus llms.txt /
  // llms-full.txt on full builds), then emit the fuzzysort symbol manifest
  // and run Pagefind.
  //
  // In dev (`runMode === "serve"`) the symbol and Pagefind passes run once
  // per process lifetime and then short-circuit — Pagefind reindexing the
  // entire _site on every keystroke is the dominant per-build cost we're
  // avoiding, and search.js degrades gracefully when the indices are stale
  // or missing.
  eleventyConfig.on("eleventy.after", async ({ directories, dir, runMode }) => {
    const output = directories?.output || dir?.output;
    if (!output) {
      return;
    }
    const siteDir = path.resolve(output);

    const isDev = (runMode || currentRunMode) === "serve";

    // Bundle the CSS now that every page has rendered, folding in the Shiki
    // highlight classes collected during the build. Runs ahead of the dev
    // short-circuit below so incremental rebuilds always refresh the bundle;
    // the class registry is content-hashed and monotonic, so the dev bundle
    // stays a superset and unchanged pages keep referencing valid classes. In
    // prod, substitute the hashed URL into the placeholder the layout baked.
    await progress.stage("css", async () => {
      const url = await buildCss(themeRoot, output, opts.styles, {
        hashed: !isDev,
        extraCss: codeStylesCss()
      });
      if (!isDev) {
        await substitutePlaceholder(siteDir, CSS_URL_PLACEHOLDER, url);
      }
    });

    // Per-page Markdown siblings (e.g. /foo/ → _site/foo.md). Runs on every
    // build — in dev with --incremental, markdownPages only carries the
    // pages that actually re-rendered, so the .md files stay in sync with
    // their .html counterparts without re-writing the whole tree.
    //
    // After the per-page files land, emit llms.txt (index) and llms-full.txt
    // (every page concatenated in navigation order). Both are written from
    // a full-build accumulator so they only make sense on full builds;
    // skip during incremental dev rebuilds where markdownPages is partial.
    if (markdownPages.length) {
      await progress.stage("markdown", async () => {
        await Promise.all(
          markdownPages.map(async ({ url, markdown }) => {
            const file = mdPathFor(siteDir, url);
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, markdown);
          })
        );
        if (!isDev) {
          const shell = await getShellData();
          await fs.writeFile(
            path.join(siteDir, "llms.txt"),
            buildLlmsIndex(markdownPages, shell.navigation)
          );
          await fs.writeFile(
            path.join(siteDir, "llms-full.txt"),
            buildLlmsFull(markdownPages, shell.navigation)
          );
        }
      });
    }

    // Prune stale responsive-image variants. A restored CI image cache (see
    // .github/workflows/ci.yml) carries variants from earlier builds; when a
    // source image changes or is removed, eleventy-img writes new content-hashed
    // files but the superseded ones linger. Delete any file under
    // assets/apidocs/img this build didn't emit, so the published output — and
    // the cache it seeds — holds exactly the variants in use. Build-only: an
    // incremental dev rebuild reprocesses only changed pages, so imageOutputs is
    // partial and would delete live variants.
    if (!isDev) {
      await progress.stage("images", () =>
        pruneImages(path.join(siteDir, "assets/apidocs/img"), imageOutputs)
      );
    }

    if (isDev && devIndexedOnce) {
      await progress.endBuild();
      return;
    }

    // Content-hashed symbols manifest for the client-side fuzzysort index.
    // In prod the hash can only be computed here because `symbols` is
    // populated by the apidocs-shell transform as each page renders, so the
    // layout can't bake the URL in directly — it injects a placeholder
    // string, which we rewrite per page below with the relativized hashed
    // URL. In dev we emit a stable filename and the layout uses that URL
    // verbatim, so the per-page substitution pass is skipped.
    await progress.stage("symbols", async () => {
      try {
        // Crumbs (page → ancestor section path) only disambiguate; drop them
        // from any entry whose name is unique across the whole index so the
        // manifest doesn't carry payload no one will read.
        pruneUniqueCrumbs(symbols);

        // Sort before hashing so the manifest (and its hash) stay stable when
        // the only thing that changed between builds is page render order.
        const sorted = [...symbols].sort(compareSymbols);
        const buf = Buffer.from(JSON.stringify(sorted));
        const name = await writeHashedAsset(
          path.join(siteDir, "assets/apidocs"),
          "symbols",
          "json",
          buf,
          { hashed: !isDev }
        );
        progress.note(progress.formatBytes(buf.length));
        if (!isDev) {
          await substitutePlaceholder(siteDir, SYMBOLS_URL_PLACEHOLDER, `/assets/apidocs/${name}`);
        }
      } catch (err) {
        console.warn("[apidocs] symbols.json write failed:", err?.message || err);
      }
    });

    // Pagefind index for prose search.
    await progress.stage("pagefind", async () => {
      try {
        const { createIndex } = await import("pagefind");
        const { errors, index } = await createIndex({ verbose: false });
        if (errors?.length) {
          console.warn("[apidocs] pagefind init:", errors);
        } else if (index) {
          await index.addDirectory({ path: siteDir });
          await index.writeFiles({
            outputPath: path.join(siteDir, "assets/apidocs/pagefind")
          });
        }
      } catch (err) {
        console.warn("[apidocs] pagefind failed:", err?.message || err);
      }
    });

    // Link check last, once every page, asset, Markdown sibling and the
    // symbols/Pagefind output is on disk — so a crawl sees the same tree a
    // visitor would. Full builds only: an incremental dev rebuild emits a
    // partial tree, and broken-link noise on every keystroke is the opposite
    // of useful. Throws on broken links (unless linkCheck.fatal is false),
    // failing the build so CI catches dead anchors and 404s.
    await runLinkCheck(siteDir, isDev, linkCheckOptions, imageOutputs);

    if (isDev) {
      devIndexedOnce = true;
    }
    await progress.endBuild();
  });

  return {
    dir: { input: opts.contentDir },
    htmlTemplateEngine: false,
    markdownTemplateEngine: false
  };
}

// Gate the post-build link check: full builds only (an incremental dev
// rebuild emits a partial tree), and only when the consumer hasn't opted out
// (linkCheckOptions is null). Kept out of the eleventy.after handler so that
// handler stays under the cognitive-complexity budget.
async function runLinkCheck(siteDir, isDev, linkCheckOptions, imageOutputs) {
  if (isDev || !linkCheckOptions) {
    return;
  }
  await progress.stage("links", () => checkLinks(siteDir, linkCheckOptions, imageOutputs));
}

// Flatten the navigation manifest (chaptered or flat) into an ordered list
// and return the {prev, next} entries surrounding the current page.
function neighborsFor(navigation, currentUrl) {
  const flat = flattenArticles(navigation);
  if (!flat.length || !currentUrl) {
    return { prev: null, next: null };
  }
  const idx = flat.findIndex(a => articleHref(a) === currentUrl);
  if (idx < 0) {
    return { prev: null, next: null };
  }
  return {
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null
  };
}

function flattenArticles(navigation) {
  if (!navigation) {
    return [];
  }
  if (Array.isArray(navigation)) {
    return navigation;
  }
  if (Array.isArray(navigation.chapters)) {
    return navigation.chapters.flatMap(c => c.articles || []);
  }
  return [];
}

function articleHref(article) {
  const slug = article.slug || "";
  return `/${slug}${slug ? "/" : ""}`;
}

// Walk every generated HTML file and replace the symbols-URL placeholder
// (planted by the layout) with the hashed URL, relativized for that page so
// the site still works from any URL prefix.
// Replace `placeholder` in every emitted HTML page with `absUrl` relativized to
// that page — used for assets whose hashed URL can only be known post-build
// (the CSS bundle, symbols.json), so the layout bakes a placeholder instead.
async function substitutePlaceholder(siteDir, placeholder, absUrl) {
  const files = await collectHtml(siteDir);
  await Promise.all(
    files.map(async file => {
      const html = await fs.readFile(file, "utf8");
      if (!html.includes(placeholder)) {
        return;
      }
      const pageUrl = pageUrlFromFile(siteDir, file);
      const url = relativizeUrl(absUrl, pageUrl);
      await fs.writeFile(file, html.split(placeholder).join(url));
    })
  );
}

function pruneUniqueCrumbs(symbols) {
  const counts = new Map();
  for (const s of symbols) {
    counts.set(s.name, (counts.get(s.name) || 0) + 1);
  }
  for (const s of symbols) {
    if (s.crumbs && counts.get(s.name) === 1) {
      delete s.crumbs;
    }
  }
}

function compareSymbols(a, b) {
  return (
    cmp(a.url, b.url) ||
    cmp(a.anchor || "", b.anchor || "") ||
    cmp(a.kind, b.kind) ||
    cmp(a.name, b.name)
  );
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Delete every file under imgDir whose name isn't in keep (the variant
// filenames this build emitted). Names are unique content hashes, so a name
// not in keep is a stale variant a restored cache left behind. No-op when the
// dir doesn't exist (a site with no raster images).
async function pruneImages(imgDir, keep) {
  let entries;
  try {
    entries = await fs.readdir(imgDir);
  } catch {
    return;
  }
  let removed = 0;
  await Promise.all(
    entries.map(async name => {
      if (keep.has(name)) {
        return;
      }
      await fs.rm(path.join(imgDir, name), { force: true });
      removed++;
    })
  );
  progress.note(`${removed} stale removed`);
}

async function collectHtml(root) {
  const out = [];
  async function recurse(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await recurse(p);
      } else if (e.isFile() && e.name.endsWith(".html")) {
        out.push(p);
      }
    }
  }
  await recurse(root);
  return out;
}

// Map a page URL to its .md sibling path under siteDir:
//   /       → <siteDir>/index.md
//   /foo/   → <siteDir>/foo.md
//   /a/b/   → <siteDir>/a/b.md
function mdPathFor(siteDir, url) {
  if (!url || url === "/") {
    return path.join(siteDir, "index.md");
  }
  const clean = url.replace(/^\//, "").replace(/\/$/, "");
  return path.join(siteDir, `${clean}.md`);
}

function pageUrlFromFile(siteDir, file) {
  const rel = path.relative(siteDir, file).split(path.sep).join("/");
  if (rel === "index.html") {
    return "/";
  }
  if (rel.endsWith("/index.html")) {
    return `/${rel.slice(0, -"index.html".length)}`;
  }
  return `/${rel}`;
}

// Given Eleventy's resolved output path (e.g. "_site/code-blocks/index.html")
// and the page's URL (e.g. "/code-blocks/"), strip the URL-derived suffix to
// recover the Eleventy output root (e.g. "_site").
function deriveOutputDir(outputPath, pageUrl) {
  if (!outputPath) {
    return "_site";
  }
  const url = pageUrl || "/";
  const suffix = `${url.replace(/^\//, "")}index.html`;
  if (outputPath.endsWith(suffix)) {
    const dir = outputPath.slice(0, outputPath.length - suffix.length);
    return dir.replace(/\/$/, "") || ".";
  }
  return path.dirname(outputPath);
}
