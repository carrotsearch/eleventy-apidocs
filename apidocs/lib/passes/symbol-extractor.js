// Symbol extractor — collects API elements for the client-side fuzzysort
// index. Any element with class "api" is a symbol. Output is appended to
// ctx.symbols (a build-scoped array threaded in from index.js).
//
// Per element:
//   name   = data-api-name | <dt> text | first <h*> text inside <section> | own text
//   kind   = data-api-kind | inferred from tag (dt→option, section→section)
//   anchor = own id | first heading id inside (for section.api) | nearest ancestor with id
//   url    = ctx.page.url

export function extractSymbols($, ctx) {
  if (!ctx?.symbols) return;
  const url = ctx.page?.url || "/";

  $(".api").each((_, el) => {
    const $el = $(el);
    const name = readName($el);
    if (!name) return;
    const anchor = readAnchor($el);
    if (!anchor) {
      console.warn(`[apidocs] .api element without anchor: "${name}" on ${url}`);
      return;
    }
    const kind = $el.attr("data-api-kind") || inferKind($el);
    ctx.symbols.push({ name, kind, url, anchor });
  });
}

function readName($el) {
  const explicit = $el.attr("data-api-name");
  if (explicit) return explicit.trim();
  if ($el.is("dt")) return $el.text().trim();
  if ($el.is("section")) {
    const $h = $el.children("h1, h2, h3, h4, h5, h6").first();
    if ($h.length) {
      const $clone = $h.clone();
      $clone.find("a.anchor").remove();
      return $clone.text().trim();
    }
  }
  return $el.text().trim();
}

function readAnchor($el) {
  const own = $el.attr("id");
  if (own) return own;
  if ($el.is("section")) {
    const $h = $el.children("h1, h2, h3, h4, h5, h6").first();
    if ($h.length && $h.attr("id")) return $h.attr("id");
  }
  const $ancestor = $el.parents("[id]").first();
  return $ancestor.attr("id") || null;
}

function inferKind($el) {
  if ($el.is("dt")) return "option";
  if ($el.is("section")) return "section";
  return null;
}
