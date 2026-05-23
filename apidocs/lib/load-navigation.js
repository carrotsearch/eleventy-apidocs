import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractH1 } from "./extract-h1.js";

// Loads the navigation manifest and normalizes every article entry to
// {slug, title}. Bare-string entries become {slug, title} with the title
// pulled from the corresponding source HTML file's first <h1>.
//
// Accepts both shapes:
//   Flat:      [ "slug" | {slug, title}, ... ]
//   Chaptered: { chapters: [ {title, articles: [ "slug" | {slug, title}, ... ]}, ... ] }
//
// Returns null when the manifest path is missing or the file isn't there,
// so a project without a navigation file doesn't crash the build.
export async function loadNavigation(navigationPath, contentDir) {
  if (!navigationPath) return null;
  const abs = path.resolve(process.cwd(), navigationPath);
  let raw;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  const nav = JSON.parse(raw);
  await enrichNavigation(nav, contentDir);
  return nav;
}

async function enrichNavigation(nav, contentDir) {
  const titleCache = new Map();

  const normalize = async (articles) => {
    for (let i = 0; i < articles.length; i++) {
      if (typeof articles[i] === "string") {
        articles[i] = { slug: articles[i] };
      }
      const entry = articles[i];
      if (!entry.title) {
        const slug = entry.slug ?? "";
        if (!titleCache.has(slug)) {
          titleCache.set(slug, await readTitleForSlug(contentDir, slug));
        }
        entry.title = titleCache.get(slug) || slug || "Untitled";
      }
    }
  };

  if (Array.isArray(nav)) {
    await normalize(nav);
  } else if (nav && Array.isArray(nav.chapters)) {
    for (const chapter of nav.chapters) {
      if (Array.isArray(chapter.articles)) await normalize(chapter.articles);
    }
  }
}

async function readTitleForSlug(contentDir, slug) {
  if (!contentDir) return null;
  const file = slug === ""
    ? path.join(contentDir, "index.html")
    : path.join(contentDir, slug + ".html");
  const abs = path.resolve(process.cwd(), file);
  try {
    const html = await readFile(abs, "utf8");
    const title = extractH1(html);
    if (!title) {
      console.warn(`[apidocs] navigation: no <h1> in ${file}; using slug "${slug}" as title`);
    }
    return title;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`[apidocs] navigation: no source file for slug "${slug}" (looked for ${file})`);
      return null;
    }
    throw err;
  }
}
