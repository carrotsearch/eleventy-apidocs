# apidocs

Eleventy-based framework for HTML-source product documentation. Replaces the
unmaintained [`gatsby-theme-apidocs`](https://github.com/carrotsearch/gatsby-theme-apidocs).

This repository is a pnpm workspace with two packages:

- `apidocs/` &mdash; the theme, published as `@carrotsearch/eleventy-apidocs`
- `sample-docs/` &mdash; a sample site that consumes the theme, used as a
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
pnpm dev             # serve sample-docs with hot reload
pnpm build           # build sample-docs to sample-docs/_site/
pnpm clean           # remove sample-docs/_site/
pnpm format          # run Prettier
```

## Status

v0 scaffolding only. The framework currently provides:

- HTML-source content with auto-wrapped page shell
- Per-page relative URLs (portable across URL prefixes)
- Light/dark theme variables with FOUC-prevention
- Responsive desktop/mobile layout
- Static asset passthrough from the theme

Roadmap (each item is its own port from the Gatsby version): full CSS port,
theme switch, HTML processing pipeline (`$VAR$` substitution, ToC, anchor
links, highlight-line), Shiki code highlighting, responsive images via
`@11ty/eleventy-img`, Pagefind search, prev/next navigation, lightbox,
View Transitions.
