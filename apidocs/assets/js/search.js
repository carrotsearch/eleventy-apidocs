// Unified search dialog. fuzzysort against /symbols.json for API hits,
// Pagefind's JS API for prose hits. Single keyboard cursor moves across
// both groups in visual order; Enter navigates; Esc closes.
//
// fuzzysort runs synchronously on every keystroke (sub-ms). Pagefind has
// its own debouncedSearch and lags by PAGE_DEBOUNCE_MS, so API hits paint
// instantly and prose hits stream in beside them.

import { queryWords, regionCount, regionsStartAtBoundary } from "./search-filters.js";

const PAGE_DEBOUNCE_MS = 80;
const API_LIMIT = 8;
const SECTION_LIMIT = 8;
const PAGE_LIMIT = 8;
const SUB_LIMIT = 2; // sub-results per page

function init() {
  const trigger = document.querySelector("[data-search-open]");
  const dialog = document.querySelector("[data-search-dialog]");
  if (!trigger || !dialog) return;

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
  let apiReady = null;   // resolves when symbols.json + fuzzysort are loaded
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
    if (!url) throw new Error("symbols URL not set");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`symbols.json ${res.status}`);
    symbols = await res.json();
  }

  async function loadPagefind() {
    const url = new URL("../../../pagefind/pagefind.js", import.meta.url);
    pagefind = await import(url.href);
    await pagefind.options?.({ excerptLength: 24 });
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
        if (!fuzzysort) reject(new Error("fuzzysort failed to expose global"));
        else resolve();
      };
      s.onerror = () => reject(new Error("fuzzysort load failed"));
      document.head.appendChild(s);
    });
  }

  function open() {
    if (dialog.open) return;
    ensureLoaded();
    dialog.showModal();
    input.value = "";
    lastQuery = "";
    clearResults();
    updateEmptyState();
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    if (dialog.open) dialog.close();
  }

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

  async function search(query) {
    const q = query.trim();
    if (q === lastQuery) return;
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

    // API + Sections path — synchronous, paints on every keystroke. One
    // fuzzysort pass over the symbols index, split into the two groups by
    // sym.group ("api" vs "section") at render time.
    (async () => {
      await apiReady;
      if (q !== lastQuery) return;
      // fuzzysort v3 compresses scores to 0..1, so a single threshold no
      // longer separates good fuzzy hits from scattered ones. Pair the
      // threshold with a region-count cap to drop "doc"→"labelShadowColor"
      // noise, then let the boundary escape hatch readmit initialism and
      // prefix-at-boundary matches ("lbc"→"labelBoxColor", "lab"→"labelBox")
      // even when their region count exceeds the cap.
      const maxRegions = Math.max(2, queryWords(q) + 1);
      const hits = fuzzysort
        ? fuzzysort
            .go(q, symbols || [], { key: "name", limit: (API_LIMIT + SECTION_LIMIT) * 2, threshold: 0.3 })
            .filter(h => regionCount(h._indexes) <= maxRegions || regionsStartAtBoundary(h._indexes, h.target))
        : [];
      if (q !== lastQuery) return;
      const apiHits = [];
      const sectionHits = [];
      for (const h of hits) {
        if (h.obj.group === "section") {
          if (sectionHits.length < SECTION_LIMIT) sectionHits.push(h);
        } else {
          if (apiHits.length < API_LIMIT) apiHits.push(h);
        }
      }
      renderApi(apiHits, q);
      renderSections(sectionHits, q);
    })();

    // Pages path — pagefind handles its own debouncing.
    (async () => {
      await pagesReady;
      if (q !== lastQuery) return;
      if (!pagefind) { renderPages([], q); return; }
      const r = await pagefind.debouncedSearch(q, PAGE_DEBOUNCE_MS);
      if (r === null || q !== lastQuery) return;
      const pageHits = await Promise.all(r.results.slice(0, PAGE_LIMIT).map(x => x.data()));
      if (q !== lastQuery) return;
      renderPages(pageHits, q);
    })();
  }

  function renderApi(apiHits, q) {
    lists.api.replaceChildren();
    if (apiHits.length) {
      groups.api.hidden = false;
      for (const hit of apiHits) lists.api.appendChild(renderApiHit(hit, q));
    } else {
      groups.api.hidden = true;
    }
    apiRendered = true;
    rebuildRows();
    updateEmptyState();
  }

  function renderSections(sectionHits, q) {
    lists.sections.replaceChildren();
    if (sectionHits.length) {
      groups.sections.hidden = false;
      for (const hit of sectionHits) lists.sections.appendChild(renderSectionHit(hit, q));
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
      for (const page of pageHits) lists.pages.appendChild(renderPageHit(page, q));
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
    if (!rows.length) { activeIndex = -1; return; }
    const restored = prevHref ? rows.findIndex(a => a.href === prevHref) : -1;
    setActive(restored >= 0 ? restored : 0);
  }

  function renderApiHit(hit, q) {
    const li = document.createElement("li");
    li.className = "search-hit search-hit-api";
    const a = document.createElement("a");
    a.href = withHighlight(symbolHref(hit.obj), q);
    a.innerHTML = `
      <span class="search-hit-name">${hit.highlight("<mark>", "</mark>") || escapeHtml(hit.obj.name)}</span>
      ${renderCrumbs(hit.obj.crumbs)}
      ${hit.obj.kind ? `<span class="search-hit-kind">${escapeHtml(hit.obj.kind)}</span>` : ""}
    `;
    li.appendChild(a);
    return li;
  }

  function renderSectionHit(hit, q) {
    const li = document.createElement("li");
    li.className = "search-hit search-hit-section";
    const a = document.createElement("a");
    a.href = withHighlight(symbolHref(hit.obj), q);
    a.innerHTML = `
      <span class="search-hit-title">${hit.highlight("<mark>", "</mark>") || escapeHtml(hit.obj.name)}</span>
      ${renderCrumbs(hit.obj.crumbs)}
    `;
    li.appendChild(a);
    return li;
  }

  // crumbs is the root → immediate-parent chain (page title, then ancestor
  // section titles). Only present on entries whose name collides with another
  // somewhere in the index — index.js prunes the rest.
  function renderCrumbs(crumbs) {
    if (!crumbs || !crumbs.length) return "";
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
    return sym.anchor ? `${sym.url}#${sym.anchor}` : sym.url;
  }

  // Append ?pagefind-highlight=<q> to a hit href so the destination page
  // can highlight matches. Param goes before any #fragment so the
  // fragment still drives scroll. assets/js/pagefind-highlight.js
  // strips the param after applying highlights.
  function withHighlight(href, q) {
    if (!q) return href;
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
    rows.forEach((row, idx) => row.classList.toggle("is-active", idx === activeIndex));
    rows[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // --- Event wiring ---

  trigger.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  dialog.addEventListener("click", e => {
    if (e.target === dialog) close();
  });

  input.addEventListener("input", () => search(input.value));

  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rows.length) setActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) setActive(activeIndex - 1);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        rows[activeIndex].click();
      }
    }
  });

  dialog.addEventListener("click", e => {
    const link = e.target.closest("a");
    if (link && dialog.contains(link)) close();
  });

  // Show ⌘K on macOS, Ctrl K elsewhere. Both, plus "/", open the dialog.
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const kbd = trigger.querySelector("[data-search-kbd]");
  if (kbd) kbd.textContent = isMac ? "⌘ K" : "Ctrl K";

  document.addEventListener("keydown", e => {
    if (dialog.open) return;
    const modK = (isMac ? e.metaKey : e.ctrlKey) && (e.key === "k" || e.key === "K");
    if (modK) {
      e.preventDefault();
      open();
      return;
    }
    if (e.key !== "/") return;
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing) return;
    e.preventDefault();
    open();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
