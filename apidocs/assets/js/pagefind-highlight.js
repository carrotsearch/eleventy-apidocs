// On-page highlighting for arrivals from search.
//
// Pagefind ships pagefind-highlight.js (built on mark.js) that reads a
// query string from a URL param and wraps matches in <mark>. We don't
// want it on every navigation, so the module is loaded lazily: only
// when the current URL actually carries ?pagefind-highlight=… After
// applying highlights we drop the param so the URL the user copies
// matches the URL they see in the address bar of the search results.
//
// The bundled class auto-scopes to [data-pagefind-body] (our <main
// class="article">) and respects [data-pagefind-ignore]. We pass
// addStyles:false because the bundled styles set a hardcoded yellow on
// .pagefind-highlight that overrides the theme — our search.css styles
// it to match :target / search-dialog marks.

const PARAM = "pagefind-highlight";

async function run() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM)) return;
  try {
    const mod = await import("/pagefind/pagefind-highlight.js");
    new mod.default({ highlightParam: PARAM, addStyles: false });
  } catch (err) {
    console.warn("[apidocs] pagefind-highlight load failed:", err?.message || err);
    return;
  }
  url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
