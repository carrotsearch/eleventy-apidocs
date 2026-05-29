# @carrotsearch/eleventy-apidocs

Monorepo for `@carrotsearch/eleventy-apidocs`, an [Eleventy](https://www.11ty.dev/)
plugin for HTML-source product documentation. Replaces the unmaintained
[`gatsby-theme-apidocs`](https://github.com/carrotsearch/gatsby-theme-apidocs).

**Using the plugin?** See the package README in [`apidocs/`](apidocs/README.md),
the [npm page](https://www.npmjs.com/package/@carrotsearch/eleventy-apidocs), or
the live docs at <https://carrotsearch.github.io/eleventy-apidocs/>. The rest of
this file is for working on the repo itself.

## Layout

A pnpm workspace with two packages:

- `apidocs/` &mdash; the plugin, published as `@carrotsearch/eleventy-apidocs`.
- `docs/` &mdash; a sample site that consumes the plugin. It doubles as a
  living integration test.

## Working on this repo

```sh
pnpm install   # install workspace deps
pnpm dev       # serve docs with hot reload
pnpm build     # build docs to docs/_site/
pnpm clean     # remove docs/_site/
pnpm test      # run the pipeline unit tests
pnpm check     # lint + format check with Biome (check:fix to auto-fix)
```

## CI and publishing

GitHub Actions runs `pnpm test` and `pnpm build` on every push and pull request,
then deploys `docs/` to GitHub Pages from `main` &mdash; see
`.github/workflows/ci.yml`. Publishing to npm is a manual, dry-run-by-default,
see `.github/workflows/publish.yml`.

See [CLAUDE.md](CLAUDE.md) for repository conventions.
