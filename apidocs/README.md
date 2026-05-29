# @carrotsearch/eleventy-apidocs

An [Eleventy](https://www.11ty.dev/) plugin for product and API documentation
authored in plain HTML. Write `<article>` files, point the plugin at them, and
get a fast, searchable, themeable static site whose URLs are relative to each
page &mdash; so the build is portable to any URL prefix without rebuilding.

## Features

- **Plain HTML source, no frontmatter.** The first `<h1>` is the page title;
  file paths map to URLs (`index.html` &rarr; `/`, `guide.html` &rarr; `/guide/`).
- **Portable output.** Every internal `href`/`src`/`srcset` is rewritten
  page-relative, so `_site/` works under `/`, `/docs/`, or `file://` unchanged.
- **Built-in search.** Pagefind full-text prose search and a fuzzysort symbol
  index, in one dialog (&#8984;K / Ctrl+K, or `/`). Both are static files &mdash;
  no search backend to host.
- **API reference styling.** `<section class="api">` and `<dt class="api">`
  render as monospace symbols and feed the symbol index automatically.
- **Code blocks** highlighted with [Shiki](https://shiki.style/), with a
  `highlight-line` directive, file embeds, and a copy button.
- **Responsive images** via `@11ty/eleventy-img` &mdash; srcset, LQIP, and
  separate light/dark variants.
- **Themed UI.** Light/dark switch with FOUC prevention, ToC scrollspy,
  lightbox, prev/next navigation, cross-document View Transitions, and
  speculation-rules prefetch.
- **LLM-friendly output.** A Markdown sibling for every page, plus `llms.txt`
  and `llms-full.txt` at the site root.
- **Extensible pipeline.** Splice your own cheerio passes in before
  (`transformers`) or after (`finalizers`) the built-in ones.

## Documentation

The full guide is at **<https://carrotsearch.github.io/eleventy-apidocs/>** &mdash;
it covers page structure, code blocks, images, callouts, tables, API reference
style, theming, search, the pipeline, and deployment. Its source is the sample
site under [`docs/`](https://github.com/carrotsearch/eleventy-apidocs/tree/main/docs),
built with this plugin, so it doubles as a living example and an integration test.


## Requirements

- [Eleventy](https://www.11ty.dev/) 3.x (declared as a peer dependency)
- Node.js &ge; 20.11
- ESM &mdash; the plugin ships as ES modules only

## Install

```sh
pnpm add -D @11ty/eleventy
pnpm add @carrotsearch/eleventy-apidocs
```

> **Using pnpm or Bun?** These managers don't run dependencies' install scripts
> by default. The theme needs `sharp` (responsive images) and `esbuild` (search
> bundling) built, so allow them after installing — otherwise image processing
> and search fail at build time. With pnpm, run `pnpm approve-builds` and allow
> both; with Bun, add them to `trustedDependencies` in `package.json`. npm and
> Yarn run these automatically and need nothing.

## Quick start

1. Create `eleventy.config.js` and return the plugin. It sets Eleventy's input
   directory for you, so there's nothing else to configure:

   ```js
   import apidocs from "@carrotsearch/eleventy-apidocs";

   export default async function (eleventyConfig) {
     return apidocs(eleventyConfig, {
       navigation: "src/navigation.json",
       contentDir: "src/content"
     });
   }
   ```

2. Write your documentation as plain HTML files under `src/content/`. No
   frontmatter &mdash; the first `<h1>` becomes the page title:

   ```html
   <!-- src/content/index.html -->
   <article>
     <h1>Hello</h1>
     <section id="intro">
       <h2>Welcome</h2>
       <p>This becomes the home page.</p>
     </section>
   </article>
   ```

3. Describe the navigation. Entries may be bare slugs (the title is read from
   the page's `<h1>`) or `{ slug, title }` objects, and may be grouped into
   chapters:

   ```json
   // src/navigation.json
   {
     "chapters": [
       {
         "title": "Introduction",
         "articles": [
           { "slug": "",                "title": "Home" },
           { "slug": "getting-started", "title": "Getting started" }
         ]
       }
     ]
   }
   ```

   A flat array works too: `[ "", "getting-started" ]`.

4. Build and serve:

   ```sh
   pnpm exec eleventy --serve   # dev with hot reload
   pnpm exec eleventy           # production build to _site/
   ```

All URLs in the generated HTML are relative to the page, so you can host
`_site/` from any URL prefix without rebuilding.

## Options

Pass options as the second argument to `apidocs(eleventyConfig, options)`. All
paths are resolved relative to the project root. Every option is optional;
defaults are shown.

| Option         | Default               | Description |
| -------------- | --------------------- | ----------- |
| `contentDir`   | `"src/content"`       | Directory of source HTML articles. Becomes Eleventy's input dir. |
| `navigation`   | `"src/navigation.json"` | Navigation manifest (flat or chaptered). Drives the sidebar and prev/next links. |
| `logo`         | `"src/logo.html"`     | Raw HTML for the header logo slot. |
| `footer`       | `"src/footer.html"`   | Raw HTML for the page footer. |
| `head`         | `"src/head.html"`     | Raw HTML injected into `<head>` (meta tags, analytics, custom links). |
| `variables`    | `{}`                  | Map of `$VAR$` tokens substituted across content and layout (e.g. version strings). |
| `styles`       | `[]`                  | Extra CSS files merged into the bundled, minified stylesheet. |
| `transformers` | `[]`                  | Cheerio passes run on the raw article **before** the built-in passes. |
| `finalizers`   | `[]`                  | Cheerio passes run on the article **after** the built-in passes. |

A pass is an async `($, ctx) => {}` function receiving the cheerio root and a
per-page context. See the **Pipeline extensions** page in the documentation for
the context shape and ordering guarantees.

## License

MIT
