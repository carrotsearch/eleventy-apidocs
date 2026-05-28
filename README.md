# apidocs

Eleventy-based framework for HTML-source product documentation. Replaces the
unmaintained [`gatsby-theme-apidocs`](https://github.com/carrotsearch/gatsby-theme-apidocs).

This repository is a pnpm workspace with two packages:

- `apidocs/` &mdash; the theme, published as `@carrotsearch/eleventy-apidocs`
- `docs/` &mdash; a sample site that consumes the theme, used as a
  living integration test

## Using the theme in your own project

1. Install Eleventy 3.x and the theme:

   ```sh
   pnpm add -D @11ty/eleventy
   pnpm add @carrotsearch/eleventy-apidocs
   ```

2. Create `eleventy.config.js`:

   ```js
   import apidocs from "@carrotsearch/eleventy-apidocs";

   export default async function (eleventyConfig) {
     return apidocs(eleventyConfig, {
       navigation: "src/navigation.json",
       logo:       "src/logo.html",
       footer:     "src/footer.html",
       contentDir: "src/content"
     });
   }
   ```

3. Write your documentation as plain HTML files under `src/content/`:

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

   No frontmatter. The first `<h1>` becomes the page title. File paths map
   to URLs (`index.html` &rarr; `/`, `getting-started.html` &rarr; `/getting-started/`).

4. Provide the navigation, logo, and footer:

   ```json
   // src/navigation.json
   [
     { "slug": "",                "title": "Home" },
     { "slug": "getting-started", "title": "Getting started" }
   ]
   ```

5. Build and serve:

   ```sh
   pnpm exec eleventy --serve   # dev with hot reload
   pnpm exec eleventy           # production build to _site/
   ```

All URLs in the generated HTML are relative to the page, so you can host
`_site/` from any URL prefix (`/`, `/docs/`, `file://...`) without rebuilding.

## Working on this repo

```sh
pnpm install         # install workspace deps
pnpm dev             # serve docs with hot reload
pnpm build           # build docs to docs/_site/
pnpm clean           # remove docs/_site/
pnpm test            # run the pipeline unit tests
pnpm check           # lint + format check with Biome (check:fix to auto-fix)
```

GitHub Actions runs `pnpm test` and `pnpm build` on every push and pull
request &mdash; see `.github/workflows/ci.yml`.

## Status

Feature-complete against the original `gatsby-theme-apidocs`. Not yet
published to npm &mdash; consume via `workspace:*` or a git dependency
until then.

What ships today:

- Plain HTML source, no frontmatter, auto-wrapped page shell
- Per-page relative URLs that survive any URL prefix without rebuild
- HTML pipeline: section anchors, fragment IDs, ToC, internal link
  rewriting, `$VAR$` substitution, code embeds, inline SVG, plus
  consumer-supplied transformers and finalizers
- Responsive images via `@11ty/eleventy-img` with srcset, LQIP, and
  separate light/dark variants
- Shiki code highlighting with `highlight-line` directive
- Pagefind prose search + fuzzysort symbol search in one dialog
  (&#8984;K / Ctrl+K, or `/`)
- Light/dark theme switch with FOUC-prevention
- ToC scrollspy, lightbox, code-block copy button
- Cross-document View Transitions
- Bundled, minified CSS (lightningcss) and JS (esbuild)
- Prev/next navigation and speculation-rules prefetch

Remaining for a v1 release: version bump and `npm publish`.
