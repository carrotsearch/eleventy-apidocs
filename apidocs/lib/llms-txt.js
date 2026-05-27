// Assemble llms.txt + llms-full.txt from the per-page Markdown the
// apidocs-shell transform collects. Follows the llmstxt.org convention:
//
//   # <site name>
//   > <site summary>
//
//   ## <chapter title>
//   - [<article title>](<url>): <one-sentence summary>
//
// llms-full.txt is a flat concatenation of every page's Markdown, ordered
// by the navigation manifest so an LLM reading top-to-bottom follows the
// same sequence a human reader would. Pages not referenced by the manifest
// are appended at the end so nothing is silently dropped.

export function buildLlmsIndex(pages, navigation) {
  const byUrl = new Map(pages.map(p => [p.url, p]));
  const home = byUrl.get("/");
  const siteName = home?.title || "Documentation";
  const siteSummary = home?.summary || "";

  const lines = [`# ${siteName}`];
  if (siteSummary) {
    lines.push("", `> ${siteSummary}`);
  }

  const chapters = navChapters(navigation);
  for (const chapter of chapters) {
    const articles = (chapter.articles || [])
      .map(a => byUrl.get(articleHref(a)))
      .filter(p => p && p.url !== "/");
    if (!articles.length) {
      continue;
    }
    lines.push("", `## ${chapter.title || "Pages"}`, "");
    for (const page of articles) {
      const summary = page.summary ? `: ${page.summary}` : "";
      lines.push(`- [${page.title || page.url}](${mdUrl(page.url)})${summary}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildLlmsFull(pages, navigation) {
  const byUrl = new Map(pages.map(p => [p.url, p]));
  const seen = new Set();
  const ordered = [];

  const home = byUrl.get("/");
  if (home) {
    ordered.push(home);
    seen.add(home.url);
  }

  for (const chapter of navChapters(navigation)) {
    for (const article of chapter.articles || []) {
      const page = byUrl.get(articleHref(article));
      if (!page || seen.has(page.url)) {
        continue;
      }
      ordered.push(page);
      seen.add(page.url);
    }
  }

  // Any pages not referenced by navigation (orphans) — append rather than
  // drop, sorted by URL for determinism.
  const orphans = pages.filter(p => !seen.has(p.url)).sort((a, b) => cmp(a.url, b.url));
  ordered.push(...orphans);

  const sections = ordered.map(p => p.markdown.trim());
  return `${sections.join("\n\n---\n\n")}\n`;
}

function navChapters(navigation) {
  if (!navigation) {
    return [];
  }
  if (Array.isArray(navigation)) {
    return [{ title: null, articles: navigation }];
  }
  if (Array.isArray(navigation.chapters)) {
    return navigation.chapters;
  }
  return [];
}

function articleHref(article) {
  const slug = article.slug || "";
  return `/${slug}${slug ? "/" : ""}`;
}

// Map a page URL ("/" or "/foo/") to the public path of its .md sibling.
// Mirrors mdPathFor() in index.js: trailing slash dropped, ".md" appended.
function mdUrl(url) {
  if (!url || url === "/") {
    return "/index.md";
  }
  return `${url.replace(/\/$/, "")}.md`;
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
