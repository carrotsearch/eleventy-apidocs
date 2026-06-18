# CLAUDE.md

Guidance for working in this repository. Read it before writing or changing code.

## What this is

`apidocs` is an Eleventy-based framework for HTML-source product documentation,
replacing the unmaintained `gatsby-theme-apidocs`. It's a pnpm workspace with
two packages:

- `apidocs/` — the theme, published as `@carrotsearch/eleventy-apidocs`. ESM only, Node >= 20.11.
- `docs/` — a sample site that consumes the theme. It doubles as a **living
  integration test**: if a theme change isn't reflected (correctly) in the
  built sample site, the change isn't done.

The theme processes authored HTML through an ordered pipeline of cheerio
passes, wraps it in a Nunjucks layout, and emits a static site whose URLs are
relative to each page (so `_site/` is portable to any URL prefix).

## Working principles

Adapted from Karpathy's coding guidelines.

### 1. Think before coding
State assumptions explicitly; if uncertain, ask. If there are multiple
interpretations, present them — don't silently pick one. If a simpler approach
exists, say so. When something is unclear, stop and name what's confusing.

### 2. Simplicity first
Write the minimum code that solves the problem. No features beyond what was
asked, no abstractions for single-use code, no configurability that wasn't
requested, no error handling for impossible scenarios. New pipeline behavior is
**a new pass, not a new tool** — keep the one build pipeline.

### 3. Surgical changes
Touch only what the task requires. Don't "improve" adjacent code, comments, or
formatting; match the existing style even if you'd do it differently. Remove
imports/variables your change orphaned, but leave pre-existing dead code alone
(mention it instead). Every changed line should trace to the request.

### 4. Goal-driven execution
Turn tasks into verifiable goals: "fix the bug" → "write a test that reproduces
it, then make it pass". For pipeline passes and input-processing helpers, a unit
test under `apidocs/test/` is usually the right success criterion. Loop until
the verification commands below pass.

## Project conventions

### Never parse structured formats with regexps
- **HTML structure → cheerio.** Don't match, rewrite, or extract HTML with
  regular expressions. Load it with cheerio and operate on the DOM, so you only
  touch real attributes/elements — never URL-shaped text in a script or prose.
  See `lib/relativize.js` and `lib/pipeline.js`.
- Small regexps over plain strings (a URL, a filename, a single token) are fine
  — the rule is about *structural* parsing of HTML and JSON.

### Comment style
- Put a **blank line before every `//`-style comment block.** Biome doesn't
  enforce this; do it by hand.
- Comments explain **why**, not what — especially *why a pass sits where it does*
  in the pipeline (each pass depends on the shape produced by the previous ones).
  Well-named code already says what it does.

### The HTML pipeline (two phases)
Pass order is fixed and load-bearing. See `lib/pipeline.js`.
1. `processContent($)` runs on the **raw article fragment**, before the layout:
   user transformers → built-in passes (SVG inline, image, link rewrite, section
   anchors, embed, highlight, fragment ids, ToC, symbol extract, pagefind-ignore,
   lift section ids) → user finalizers.
2. Nunjucks wraps the processed article in the layout.
3. `processDocument()` runs whole-document passes: current-year, then `$VAR$`
   substitution **last** (so variables resolve in layout markup too).
4. `relativizeHtml()` rewrites URLs for portability.

When adding a pass, place it deliberately and document why it sits where it does.

### Portability invariant
Emitted **HTML** must contain no leading-slash (`/…`) `href`/`src`/`srcset`.
Markdown siblings (`*.md`, `llms.txt`, `llms-full.txt`) are *not* relativized —
their absolute links are by design. Verify HTML only:
```sh
grep -rE 'href="/|src="/' --include='*.html' docs/_site/ && echo FAILED || echo OK
```

### Formatting (Biome 2.4.x)
Biome owns mechanical formatting — don't hand-format, let `pnpm check:fix` do it.
`_site/`, `node_modules/`, and the lockfile are excluded. Conventions Biome
**doesn't** enforce, do by hand:
- Keep an empty line before `//`-style comments inside functions/methods for clarity.
- One `let`/`const` per variable with a value initializer (no comma-separated
  declarations) — Biome reflows those onto newlines, which hurts readability.
- Always use `{ }`, even for single-statement bodies (`if (x) { fn(x); }`, never
  `if (x) fn(x)`).

### Security
Author content flows through Nunjucks with `autoescape` on; only the four raw
slots (content, logo, footer, head) opt out via `| safe`. Don't widen that
surface. When building HTML in a pass, build it through cheerio, not string
concatenation of untrusted input.

## Before you commit

Run from the repo root and make sure each passes:

```sh
pnpm test          # node --test on apidocs/test/*.test.js
pnpm check         # biome lint + format check (use check:fix to auto-fix)
pnpm build         # build the docs sample site (CI runs this too)
```

For theme/pipeline or content changes, also:
- Rebuild `docs/` and confirm the affected pages render correctly (the sample
  site is the integration test).
- Run the portability grep above if you touched URL handling.
- For UI/runtime JS or CSS, load the page in a browser — type checks and unit
  tests don't verify feature correctness.

CI runs `pnpm test` and `pnpm build` on every push and PR.

## Git etiquette
- **Only commit when explicitly asked.**
- Stage specific files by name; never `git add -A`.
- Commit message style: `<area>: <lowercase imperative summary>`
  (e.g. `relativize: rewrite URLs via cheerio instead of regexp`).
- Don't push, force-push, or amend published commits unless asked.
