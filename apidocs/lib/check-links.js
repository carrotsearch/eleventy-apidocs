import * as progress from "./progress.js";

// linkinator stands up a static web server over the built directory, so
// internal links resolve against http://localhost:<port>/ while genuine
// cross-site links keep their own host. This negative lookahead keeps the
// localhost (internal) URLs and skips everything else, so a third-party site
// being slow or down can't fail the docs build. External checking is opt-in
// (linkCheck.external) precisely because it's the flaky part.
const SKIP_EXTERNAL = "^https?://(?!localhost)";

// Crawl the built site for 404s and broken in-page #fragment anchors. Runs
// only on full builds (never dev --serve) — see index.js, where the dev
// short-circuit skips it alongside Pagefind. Validates server-rendered HTML
// only, which is exactly the static output this theme emits.
export async function checkLinks(siteDir, options = {}) {
  const { external = false, skip = [], fatal = true } = options;
  const { check } = await import("linkinator");

  const linksToSkip = external ? [...skip] : [SKIP_EXTERNAL, ...skip];

  const { links } = await check({
    path: siteDir,
    recurse: true,

    // The whole reason for shipping this: confirm every #id a link points at
    // actually exists on the target page (broken section anchors / deep-links).
    checkFragments: true,
    linksToSkip
  });

  const broken = links.filter(l => l.state === "BROKEN");
  progress.note(`${links.length} links, ${broken.length} broken`);
  if (!broken.length) {
    return;
  }

  // linkinator reports each URL prefixed with the on-disk crawl root (and,
  // for some links, the synthetic localhost origin). Strip both so lines read
  // as site paths (/foo/#anchor) the author can map straight to a source file.
  const tidy = url => {
    const u = url.replace(/^https?:\/\/localhost(?::\d+)?/, "");
    return (u.startsWith(siteDir) ? u.slice(siteDir.length) : u) || "/";
  };

  // One line per broken link — the target plus the page that links to it, so
  // a CI log points straight at the file to fix. Emitted before we throw so
  // the detail is visible regardless of how Eleventy renders the error.
  const detail = broken
    .map(l => `  ${tidy(l.url)}${l.parent ? ` (linked from ${tidy(l.parent)})` : ""}`)
    .join("\n");
  console.error(`[apidocs] ${broken.length} broken link(s):\n${detail}`);

  if (fatal) {
    throw new Error(`[apidocs] link check failed: ${broken.length} broken link(s)`);
  }
}
