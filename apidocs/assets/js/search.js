// Unified search dialog. fuzzysort against /symbols.json for API hits,
// Pagefind's JS API for prose hits. Single keyboard cursor moves across
// both groups in visual order; Enter navigates; Esc closes.

const DEBOUNCE_MS = 80;
const API_LIMIT = 8;
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
    pages: dialog.querySelector('[data-search-group="pages"]')
  };
  const lists = {
    api: groups.api.querySelector("[data-search-list]"),
    pages: groups.pages.querySelector("[data-search-list]")
  };
  const emptyEl = dialog.querySelector("[data-search-empty]");
  const noHitsEl = dialog.querySelector("[data-search-nohits]");

  let symbols = null;
  let pagefind = null;
  let fuzzysort = null;
  let loadingPromise = null;
  let lastQuery = "";
  let debounceTimer = 0;
  let activeIndex = -1;
  let rows = []; // flat list of {anchor element, href}

  function ensureLoaded() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = Promise.all([loadSymbols(), loadPagefind(), loadFuzzysort()]).catch(err => {
      console.warn("[apidocs] search load failed:", err.message);
    });
    return loadingPromise;
  }

  async function loadSymbols() {
    const url = new URL("../../../symbols.json", import.meta.url);
    // The url above is relative to /assets/apidocs/js/search.js → /symbols.json
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
    showEmptyState("type");
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function clearResults() {
    lists.api.replaceChildren();
    lists.pages.replaceChildren();
    groups.api.hidden = true;
    groups.pages.hidden = true;
    rows = [];
    activeIndex = -1;
  }

  function showEmptyState(which) {
    emptyEl.hidden = which !== "type";
    noHitsEl.hidden = which !== "none";
  }

  async function search(query) {
    const q = query.trim();
    if (q === lastQuery) return;
    lastQuery = q;
    if (!q) {
      clearResults();
      showEmptyState("type");
      return;
    }
    await ensureLoaded();

    const apiHits = fuzzysort
      ? fuzzysort.go(q, symbols || [], { key: "name", limit: API_LIMIT, threshold: -10000 })
      : [];

    let pageHits = [];
    if (pagefind) {
      const r = await pagefind.debouncedSearch(q, DEBOUNCE_MS);
      if (r === null || q !== lastQuery) return; // superseded
      pageHits = await Promise.all(r.results.slice(0, PAGE_LIMIT).map(x => x.data()));
    }

    if (q !== lastQuery) return;
    render(apiHits, pageHits);
  }

  function render(apiHits, pageHits) {
    clearResults();
    showEmptyState(apiHits.length || pageHits.length ? null : "none");

    if (apiHits.length) {
      groups.api.hidden = false;
      for (const hit of apiHits) {
        const li = renderApiHit(hit);
        lists.api.appendChild(li);
        rows.push(li.querySelector("a"));
      }
    }
    if (pageHits.length) {
      groups.pages.hidden = false;
      for (const page of pageHits) {
        const li = renderPageHit(page);
        lists.pages.appendChild(li);
        rows.push(li.querySelector(":scope > a"));
        for (const sub of li.querySelectorAll(".search-subhit a")) {
          rows.push(sub);
        }
      }
    }

    if (rows.length) setActive(0);
  }

  function renderApiHit(hit) {
    const li = document.createElement("li");
    li.className = "search-hit search-hit-api";
    const a = document.createElement("a");
    a.href = symbolHref(hit.obj);
    a.innerHTML = `
      <span class="search-hit-name">${hit.highlight("<mark>", "</mark>") || escapeHtml(hit.obj.name)}</span>
      ${hit.obj.kind ? `<span class="search-hit-kind">${escapeHtml(hit.obj.kind)}</span>` : ""}
    `;
    li.appendChild(a);
    return li;
  }

  function renderPageHit(page) {
    const li = document.createElement("li");
    li.className = "search-hit search-hit-page";
    const a = document.createElement("a");
    a.href = page.url;
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
        subA.href = sub.url;
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

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value;
    debounceTimer = window.setTimeout(() => search(q), DEBOUNCE_MS);
  });

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

  document.addEventListener("keydown", e => {
    if (e.key !== "/") return;
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing || dialog.open) return;
    e.preventDefault();
    open();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
