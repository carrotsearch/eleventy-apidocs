// Unified search dialog. fuzzysort against /symbols.json for API hits,
// Pagefind's JS API for prose hits. Single keyboard cursor moves across
// both groups in visual order; Enter navigates; Esc closes.
//
// fuzzysort runs synchronously on every keystroke (sub-ms). Pagefind has
// its own debouncedSearch and lags by PAGE_DEBOUNCE_MS, so API hits paint
// instantly and prose hits stream in beside them.

import {
  bucketSymbolHits,
  queryWords,
  regionCount,
  regionsStartAtBoundary,
  resolveSearchLimits
} from "./search-filters.js";

const PAGE_DEBOUNCE_MS = 80;
const SUB_LIMIT = 2; // sub-results per page

// Display caps, kind front-load order and the fuzzysort retrieval count, all
// configurable per site via the searchLimits / searchFetchLimit / apiKindOrder
// theme options. The layout's inline head script sets these globals before this
// deferred module evaluates (the same ordering __APIDOCS_SYMBOLS_URL__ relies
// on), so resolving them once at module scope is safe.
const SEARCH_LIMITS = resolveSearchLimits(window.__APIDOCS_SEARCH_LIMITS__);
const KIND_ORDER = window.__APIDOCS_API_KIND_ORDER__;
const FETCH_LIMIT = Number(window.__APIDOCS_SEARCH_FETCH_LIMIT__) || 32;

// Deployment base path, recovered from where this bundle was loaded
// from. The bundle lands at <BASE>/assets/apidocs/js/<file>; whatever
// precedes that suffix is the base ("/" at site root, "/eleventy-apidocs/"
// on a GitHub Pages project site, etc.). Pagefind and symbols.json URLs
// are indexed without a path prefix, so we re-prefix them at render time.
const BASE =
  new URL(import.meta.url).pathname.match(/^(.*\/)assets\/apidocs\/js\/[^/]+$/)?.[1] ?? "/";

function init() {
  const trigger = document.querySelector("[data-search-open]");
  const dialog = document.querySelector("[data-search-dialog]");
  if (!trigger || !dialog) {
    return;
  }

  const input = dialog.querySelector("[data-search-input]");
  const closeBtn = dialog.querySelector("[data-search-close]");
  const groups = {
    api: dialog.querySelector('[data-search-group="api"]'),
    sections: dialog.querySelector('[data-search-group="sections"]'),
    pages: dialog.querySelector('[data-search-group="pages"]')
  };
  const lists = {
    api: groups.api.querySelector("[data-search-list]"),
    sections: groups.sections.querySelector("[data-search-list]"),
    pages: groups.pages.querySelector("[data-search-list]")
  };
  const emptyEl = dialog.querySelector("[data-search-empty]");
  const noHitsEl = dialog.querySelector("[data-search-nohits]");

  let symbols = null;
  let pagefind = null;
  let fuzzysort = null;
  let apiReady = null; // resolves when symbols.json + fuzzysort are loaded
  let pagesReady = null; // resolves when pagefind.js is loaded
  let lastQuery = "";
  let activeIndex = -1;
  let rows = []; // flat list of {anchor element, href}
  let apiRendered = false;
  let pagesRendered = false;

  function ensureLoaded() {
    if (!apiReady) {
      apiReady = Promise.all([loadSymbols(), loadFuzzysort()]).catch(err => {
        console.warn("[apidocs] search api load failed:", err.message);
      });
    }
    if (!pagesReady) {
      pagesReady = loadPagefind().catch(err => {
        console.warn("[apidocs] search pages load failed:", err.message);
      });
    }
  }

  async function loadSymbols() {
    // The layout injects window.__APIDOCS_SYMBOLS_URL__ with the
    // content-hashed, per-page relativized URL of symbols.json.
    const url = window.__APIDOCS_SYMBOLS_URL__;
    if (!url) {
      throw new Error("symbols URL not set");
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`symbols.json ${res.status}`);
    }
    symbols = await res.json();
  }

  async function loadPagefind() {
    const url = new URL("../pagefind/pagefind.js", import.meta.url);
    pagefind = await import(url.href);

    // baseUrl pinned to BASE because pagefind auto-detects it from
    // pagefind.js's own location — now <BASE>/assets/apidocs/pagefind/ —
    // and would otherwise prefix every result URL with that subdirectory.
    // BASE recovers the deployment prefix so subpath deploys (e.g.
    // /eleventy-apidocs/ on GitHub Pages) get correctly prefixed result
    // URLs instead of 404s.
    await pagefind.options?.({ excerptLength: 24, baseUrl: BASE });
  }

  function loadFuzzysort() {
    if (window.fuzzysort) {
      fuzzysort = window.fuzzysort;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("./fuzzysort.js", import.meta.url).href;
      s.onload = () => {
        fuzzysort = window.fuzzysort;
        if (!fuzzysort) {
          reject(new Error("fuzzysort failed to expose global"));
        } else {
          resolve();
        }
      };
      s.onerror = () => reject(new Error("fuzzysort load failed"));
      document.head.appendChild(s);
    });
  }

  // History entry pushed on open so the device back button closes the
  // dialog instead of leaving the page. We listen on the dialog's
  // native `close` event so every dismissal path (button, Esc, link
  // click) cleans up the entry uniformly.
  //
  // Link-click dismissals are a special case: the link's own
  // navigation runs synchronously alongside our close, and queuing a
  // history.back() at the same time races the forward navigation —
  // under cross-document View Transitions the browser cancels the
  // forward nav and the progress bar gets stuck. Instead we
  // replaceState() to drop the overlay marker from the current entry,
  // so the link's navigation pushes the target URL cleanly on top.
  let historyPushed = false;
  let closingFromPopstate = false;
  let closingFromLink = false;

  function open() {
    if (dialog.open) {
      return;
    }
    ensureLoaded();
    dialog.showModal();
    input.value = "";
    lastQuery = "";
    clearResults();
    updateEmptyState();
    requestAnimationFrame(() => input.focus());
    if (!historyPushed) {
      history.pushState({ apidocsOverlay: "search" }, "");
      historyPushed = true;
    }
  }

  function close() {
    if (dialog.open) {
      dialog.close();
    }
  }

  dialog.addEventListener("close", () => {
    const wasPushed = historyPushed;
    historyPushed = false;
    if (!wasPushed || closingFromPopstate) {
      return;
    }
    if (closingFromLink) {
      closingFromLink = false;
      history.replaceState(null, "");
    } else {
      history.back();
    }
  });

  window.addEventListener("popstate", () => {
    if (!dialog.open) {
      return;
    }
    closingFromPopstate = true;
    dialog.close();
    closingFromPopstate = false;
  });

  function clearResults() {
    lists.api.replaceChildren();
    lists.sections.replaceChildren();
    lists.pages.replaceChildren();
    groups.api.hidden = true;
    groups.sections.hidden = true;
    groups.pages.hidden = true;
    rows = [];
    activeIndex = -1;
    apiRendered = false;
    pagesRendered = false;
  }

  function updateEmptyState() {
    if (!lastQuery) {
      emptyEl.hidden = false;
      noHitsEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    const hasHits = !groups.api.hidden || !groups.sections.hidden || !groups.pages.hidden;

    // Only declare "no results" once both sides have reported back.
    noHitsEl.hidden = !(apiRendered && pagesRendered && !hasHits);
  }

  function search(query) {
    const q = query.trim();
    if (q === lastQuery) {
      return;
    }
    lastQuery = q;
    if (!q) {
      clearResults();
      updateEmptyState();
      return;
    }
    ensureLoaded();
    apiRendered = false;
    pagesRendered = false;
    updateEmptyState();

    searchApiAndSections(q);
    searchPages(q);
  }

  // API + Sections path — synchronous, paints on every keystroke. One
  // fuzzysort pass over the symbols index, split into the two groups by
  // sym.group ("api" vs "section") at render time.
  async function searchApiAndSections(q) {
    await apiReady;
    if (q !== lastQuery) {
      return;
    }

    // fuzzysort v3 compresses scores to 0..1, so a single threshold no
    // longer separates good fuzzy hits from scattered ones. Pair the
    // threshold with a region-count cap to drop "doc"→"labelShadowColor"
    // noise, then let the boundary escape hatch readmit initialism and
    // prefix-at-boundary matches ("lbc"→"labelBoxColor", "lab"→"labelBox")
    // even when their region count exceeds the cap.
    const maxRegions = Math.max(2, queryWords(q) + 1);
    const hits = fuzzysort
      ? fuzzysort
          .go(q, symbols || [], {
            key: "name",
            limit: FETCH_LIMIT,
            threshold: 0.3
          })
          .filter(
            h =>
              regionCount(h._indexes) <= maxRegions || regionsStartAtBoundary(h._indexes, h.target)
          )
      : [];
    if (q !== lastQuery) {
      return;
    }
    const { apiHits, sectionHits } = bucketSymbolHits(hits, SEARCH_LIMITS, KIND_ORDER);
    renderApi(apiHits);
    renderSections(sectionHits);
  }

  // Pages path — pagefind handles its own debouncing.
  async function searchPages(q) {
    await pagesReady;
    if (q !== lastQuery) {
      return;
    }
    if (!pagefind) {
      renderPages([], q);
      return;
    }
    const r = await pagefind.debouncedSearch(q, PAGE_DEBOUNCE_MS);
    if (r === null || q !== lastQuery) {
      return;
    }
    const pageHits = await Promise.all(r.results.slice(0, SEARCH_LIMITS.pages).map(x => x.data()));
    if (q !== lastQuery) {
      return;
    }
    renderPages(pageHits, q);
  }

  function renderApi(apiHits) {
    lists.api.replaceChildren();
    if (apiHits.length) {
      groups.api.hidden = false;
      for (const hit of apiHits) {
        lists.api.appendChild(renderApiHit(hit));
      }
    } else {
      groups.api.hidden = true;
    }
    apiRendered = true;
    rebuildRows();
    updateEmptyState();
  }

  function renderSections(sectionHits) {
    lists.sections.replaceChildren();
    if (sectionHits.length) {
      groups.sections.hidden = false;
      for (const hit of sectionHits) {
        lists.sections.appendChild(renderSectionHit(hit));
      }
    } else {
      groups.sections.hidden = true;
    }
    rebuildRows();
    updateEmptyState();
  }

  function renderPages(pageHits, q) {
    lists.pages.replaceChildren();
    if (pageHits.length) {
      groups.pages.hidden = false;
      for (const page of pageHits) {
        lists.pages.appendChild(renderPageHit(page, q));
      }
    } else {
      groups.pages.hidden = true;
    }
    pagesRendered = true;
    rebuildRows();
    updateEmptyState();
  }

  function rebuildRows() {
    const prevHref = activeIndex >= 0 ? rows[activeIndex]?.href : null;
    rows = [
      ...lists.api.querySelectorAll(":scope > .search-hit > a"),
      ...lists.sections.querySelectorAll(":scope > .search-hit > a"),
      ...lists.pages.querySelectorAll(":scope > .search-hit > a, .search-subhit > a")
    ];
    if (!rows.length) {
      activeIndex = -1;
      return;
    }
    const restored = prevHref ? rows.findIndex(a => a.href === prevHref) : -1;
    setActive(restored >= 0 ? restored : 0);
  }

  function renderApiHit(hit) {
    const li = document.createElement("li");
    li.className = "search-hit search-hit-api";
    const a = document.createElement("a");

    // No pagefind-highlight param: a fuzzysort hit resolves to a precise
    // #anchor, and the fuzzy query (e.g. "lbc" → "labelBoxColor") rarely
    // matches literal prose — highlighting would only scatter marks.
    a.href = symbolHref(hit.obj);
    a.innerHTML = `
      <span class="search-hit-name">${highlightMatch(hit)}</span>
      ${renderCrumbs(hit.obj.crumbs)}
      ${hit.obj.kind ? `<span class="search-hit-kind">${escapeHtml(hit.obj.kind)}</span>` : ""}
    `;
    li.appendChild(a);
    return li;
  }

  function renderSectionHit(hit) {
    const li = document.createElement("li");
    li.className = "search-hit search-hit-section";
    const a = document.createElement("a");
    a.href = symbolHref(hit.obj);
    a.innerHTML = `
      <span class="search-hit-title">${highlightMatch(hit)}</span>
      ${renderCrumbs(hit.obj.crumbs)}
    `;
    li.appendChild(a);
    return li;
  }

  // crumbs is the root → immediate-parent chain (page title, then ancestor
  // section titles). Only present on entries whose name collides with another
  // somewhere in the index — index.js prunes the rest.
  function renderCrumbs(crumbs) {
    if (!crumbs?.length) {
      return "";
    }
    return `<span class="search-hit-crumbs">${crumbs.map(escapeHtml).join(" › ")}</span>`;
  }

  function renderPageHit(page, q) {
    const li = document.createElement("li");
    li.className = "search-hit search-hit-page";
    const a = document.createElement("a");
    a.href = withHighlight(page.url, q);
    a.innerHTML = `
      <span class="search-hit-title">${escapeHtml(page.meta?.title || page.url)}</span>
      <span class="search-hit-excerpt">${page.excerpt || ""}</span>
    `;
    li.appendChild(a);

    const subs = (page.sub_results || []).filter(s => s.anchor).slice(0, SUB_LIMIT);
    if (subs.length) {
      const subList = document.createElement("ul");
      subList.className = "search-subhits";
      for (const sub of subs) {
        const subLi = document.createElement("li");
        subLi.className = "search-subhit";
        const subA = document.createElement("a");
        subA.href = withHighlight(sub.url, q);
        subA.innerHTML = `
          <span class="search-subhit-title">${escapeHtml(sub.title || "")}</span>
          <span class="search-subhit-excerpt">${sub.excerpt || ""}</span>
        `;
        subLi.appendChild(subA);
        subList.appendChild(subLi);
      }
      li.appendChild(subList);
    }
    return li;
  }

  function symbolHref(sym) {
    const url = BASE === "/" ? sym.url : BASE + sym.url.replace(/^\//, "");
    return sym.anchor ? `${url}#${sym.anchor}` : url;
  }

  // Append ?pagefind-highlight=<q> to a hit href so the destination page
  // can highlight matches. Param goes before any #fragment so the
  // fragment still drives scroll. assets/js/pagefind-highlight.js
  // strips the param after applying highlights.
  function withHighlight(href, q) {
    if (!q) {
      return href;
    }
    const hashIdx = href.indexOf("#");
    const base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}pagefind-highlight=${encodeURIComponent(q)}${hash}`;
  }

  function setActive(i) {
    if (!rows.length) {
      activeIndex = -1;
      return;
    }
    activeIndex = (i + rows.length) % rows.length;
    rows.forEach((row, idx) => {
      row.classList.toggle("is-active", idx === activeIndex);
    });
    rows[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[c]
    );
  }

  // Build highlighted markup for a fuzzysort hit. fuzzysort's own
  // .highlight() concatenates raw target characters, so a symbol name with
  // <, > or & (generics, operators, HTML tag names — routine in API docs)
  // would inject unescaped into innerHTML. Reconstruct from target +
  // matched indexes instead, escaping every character and wrapping matched
  // runs in <mark>.
  function highlightMatch(hit) {
    const target = hit.target || "";
    const matched = new Set(hit.indexes);
    let out = "";
    let open = false;
    for (let i = 0; i < target.length; i++) {
      const isMatch = matched.has(i);
      if (isMatch && !open) {
        out += "<mark>";
        open = true;
      } else if (!isMatch && open) {
        out += "</mark>";
        open = false;
      }
      out += escapeHtml(target[i]);
    }
    if (open) {
      out += "</mark>";
    }
    return out;
  }

  // --- Event wiring ---

  trigger.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  dialog.addEventListener("click", e => {
    if (e.target === dialog) {
      close();
    }
  });

  input.addEventListener("input", () => search(input.value));

  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rows.length) {
        setActive(activeIndex + 1);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) {
        setActive(activeIndex - 1);
      }
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        rows[activeIndex].click();
      }
    }
  });

  dialog.addEventListener("click", e => {
    const link = e.target.closest("a");
    if (link && dialog.contains(link)) {
      closingFromLink = true;
      close();
    }
  });

  // Show ⌘K on macOS, Ctrl K elsewhere. Both, plus "/", open the dialog.
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const kbd = trigger.querySelector("[data-search-kbd]");
  if (kbd) {
    kbd.textContent = isMac ? "⌘ K" : "Ctrl K";
  }

  document.addEventListener("keydown", e => {
    if (dialog.open) {
      return;
    }
    const modK = (isMac ? e.metaKey : e.ctrlKey) && (e.key === "k" || e.key === "K");
    if (modK) {
      e.preventDefault();
      open();
      return;
    }
    if (e.key !== "/") {
      return;
    }
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing) {
      return;
    }
    e.preventDefault();
    open();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
