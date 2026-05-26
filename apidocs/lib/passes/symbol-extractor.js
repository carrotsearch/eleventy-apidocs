// Symbol extractor — collects entries for the client-side fuzzysort index:
//   * every .api element (explicit API symbols)                → group: "api"
//   * the article's top-level <h1> (the page itself)            → group: "section"
//   * every <article> <section> with an id (ToC-style sections) → group: "section"
// Output is appended to ctx.symbols (a build-scoped array threaded in from
// index.js).
//
// Per element:
//   name   = data-api-name | <dt> text | first <h*> text inside <section> | own text
//   kind   = data-api-kind | inferred from tag and name shape
//            (dt → option; .api section → method when the name ends in `(…)`
//             else property; plain section → section; h1 → page)
//   group  = "api" | "section" — which search dialog category the entry belongs to
//   anchor = own id | nearest ancestor with id (omitted for page-level entries)
//   url    = ctx.page.url
//   crumbs = [pageTitle?, ...ancestorSectionTitles] — root → immediate parent.
//            Omitted when the chain is empty and on the page-level entry itself.
//            Index-assembly in index.js drops crumbs from any entry whose name
//            is unique across the build.
//
// Section pass mirrors toc-builder's inclusion rules: data-toc="omit" drops
// the section, data-toc="omit-children" drops descendants. A section already
// extracted via the .api pass is skipped to avoid duplicates.

export function extractSymbols($, ctx) {
  if (!ctx?.symbols) return;
  const url = ctx.page?.url || "/";
  const pageName = readHeadingText($("article > h1").first());
  const seenAnchors = new Set();

  $(".api").each((_, el) => {
    const $el = $(el);
    const name = readName($el);
    if (!name) return;
    const anchor = readAnchor($el);
    if (!anchor) {
      console.warn(`[apidocs] .api element without anchor: "${name}" on ${url}`);
      return;
    }
    const kind = $el.attr("data-api-kind") || inferKind($el, name);
    ctx.symbols.push(
      withCrumbs({ name, kind, group: "api", url, anchor }, readCrumbs($, $el, pageName))
    );
    if ($el.is("section")) seenAnchors.add(anchor);
  });

  if (pageName) {
    ctx.symbols.push({ name: pageName, kind: "page", group: "section", url });
  }

  $("article section[id]").each((_, el) => {
    const $el = $(el);
    if ($el.hasClass("api")) return;
    if ($el.attr("data-toc") === "omit") return;
    if (hasOmitChildrenAncestor($, $el)) return;
    const anchor = $el.attr("id");
    if (seenAnchors.has(anchor)) return;
    const name = readSectionName($el);
    if (!name) return;
    seenAnchors.add(anchor);
    ctx.symbols.push(
      withCrumbs(
        { name, kind: "section", group: "section", url, anchor },
        readCrumbs($, $el, pageName)
      )
    );
  });
}

// Walks the ancestor <section> chain (innermost-first from cheerio) and
// returns [pageTitle?, ...ancestorSectionTitles] in root → parent order.
// The matched element itself is naturally excluded since `.parents()` does
// not include the start node.
function readCrumbs($, $el, pageName) {
  const ancestors = [];
  $el.parents("article section").each((_, p) => {
    const name = readSectionName($(p));
    if (name) ancestors.push(name);
  });
  ancestors.reverse();
  return pageName ? [pageName, ...ancestors] : ancestors;
}

function withCrumbs(sym, crumbs) {
  if (crumbs.length) sym.crumbs = crumbs;
  return sym;
}

function readName($el) {
  const explicit = $el.attr("data-api-name");
  if (explicit) return explicit.trim();
  if ($el.is("dt")) return $el.text().trim();
  if ($el.is("section")) return readSectionName($el);
  return $el.text().trim();
}

function readSectionName($el) {
  return readHeadingText($el.children("h1, h2, h3, h4, h5, h6").first());
}

function readHeadingText($h) {
  if (!$h?.length) return "";
  const $clone = $h.clone();
  $clone.find("a.anchor").remove();
  return $clone.text().trim();
}

function readAnchor($el) {
  const own = $el.attr("id");
  if (own) return own;
  const $ancestor = $el.parents("[id]").first();
  return $ancestor.attr("id") || null;
}

function inferKind($el, name) {
  if ($el.is("dt")) return "option";
  if ($el.is("section")) return /\(.*\)$/.test(name) ? "method" : "property";
  return null;
}

function hasOmitChildrenAncestor($, $el) {
  let omits = false;
  $el.parents("section").each((_, p) => {
    if ($(p).attr("data-toc") === "omit-children") omits = true;
  });
  return omits;
}
