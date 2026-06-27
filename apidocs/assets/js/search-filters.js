// Pure helpers for the API-symbol search post-filter. Split out so node:test
// can import them — the rest of search.js touches the DOM and dialog APIs.
//
// fuzzysort v3 compresses its score range to 0..1, which makes a single
// threshold a poor separator between a good fuzzy hit and a scattered one.
// We pair a threshold with a region check: count contiguous runs of matched
// indexes in the target, then either cap the count or accept any count if
// every region starts at a word boundary (camelCase or separator). The
// boundary path is what lets "lbc" land on "labelBoxColor" and "lab" land
// on "labelBoxColor" too — the first region is the prefix of a word, the
// later regions begin at later camelCase/separator boundaries.

// Number of whitespace-separated tokens in a query. Used to scale the
// region cap — multi-word queries naturally split into more runs.
export function queryWords(q) {
  return q.trim().split(/\s+/).filter(Boolean).length;
}

// Number of contiguous runs in a sorted index array. [0,1,5,6] → 2.
// fuzzysort reuses the indexes buffer across calls and grows it without
// shrinking, so we honor the .len property when present rather than
// trusting .length (which can carry stale entries from longer queries).
export function regionCount(indexes) {
  const n = indexes?.len ?? indexes?.length ?? 0;
  if (!n) {
    return 0;
  }
  let runs = 1;
  for (let i = 1; i < n; i++) {
    if (indexes[i] !== indexes[i - 1] + 1) {
      runs++;
    }
  }
  return runs;
}

// True if every contiguous run of matched indexes *starts* at a word
// boundary in target. A boundary is position 0, just after a non-alphanumeric
// separator, or a capital letter right after a lowercase one (camelCase).
// Only the first index of each run is checked — the rest of the run is the
// natural extension of a prefix match (eg "lab" inside "label").
export function regionsStartAtBoundary(indexes, target) {
  const n = indexes?.len ?? indexes?.length ?? 0;
  for (let i = 0; i < n; i++) {
    if (i > 0 && indexes[i] === indexes[i - 1] + 1) {
      continue;
    }
    if (!isWordBoundary(indexes[i], target)) {
      return false;
    }
  }
  return true;
}

// Rank of a data-api-kind within the configured front-load order. A listed
// kind sorts to its index; anything unlisted (or kindless) falls to the back.
// Drives the API group's kind-priority sort — Array.sort's stability then keeps
// relevance order within each kind.
export function apiKindRank(order, kind) {
  const i = Array.isArray(order) ? order.indexOf(kind) : -1;
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

// Per-group display totals. The three reserved keys below are group caps; any
// other key in the searchLimits map is a per-data-api-kind sub-cap within the
// API group. Defaults match the limits that were hard-coded before the option
// existed.
const DEFAULT_SEARCH_LIMITS = { api: 8, sections: 8, pages: 8 };
const RESERVED_LIMIT_KEYS = new Set(["api", "sections", "pages"]);

// Normalize the injected searchLimits map into {api, sections, pages, kinds}.
// Reserved keys become group totals (numeric override, else default); every
// other numeric entry becomes a per-kind sub-cap in `kinds`. Tolerates a
// missing/empty map (all defaults, no kind caps) and ignores non-numeric values.
export function resolveSearchLimits(raw) {
  const limits = { ...DEFAULT_SEARCH_LIMITS, kinds: {} };
  if (!raw || typeof raw !== "object") {
    return limits;
  }
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      continue;
    }
    if (RESERVED_LIMIT_KEYS.has(key)) {
      limits[key] = n;
    } else {
      limits.kinds[key] = n;
    }
  }
  return limits;
}

// Split fuzzysort symbol hits into the API and Sections display groups, honoring
// the configured caps. Hits arrive in relevance order; we fill each group up to
// its total, and within the API group drop a hit once its data-api-kind has hit
// its per-kind sub-cap (kinds with no sub-cap are bounded only by the api total).
// Capping the relevance-ordered stream — not the full fuzzysort output — keeps
// the visible set purely relevance-based before the kind-priority re-sort below.
export function bucketSymbolHits(hits, limits, order) {
  const apiHits = [];
  const sectionHits = [];
  const kindCounts = new Map();
  for (const h of hits) {
    if (h.obj.group === "section") {
      if (sectionHits.length < limits.sections) {
        sectionHits.push(h);
      }
      continue;
    }
    if (apiHits.length >= limits.api) {
      continue;
    }
    const kind = h.obj.kind;
    const cap = limits.kinds[kind];
    if (cap !== undefined) {
      const used = kindCounts.get(kind) || 0;
      if (used >= cap) {
        continue;
      }
      kindCounts.set(kind, used + 1);
    }
    apiHits.push(h);
  }

  // Re-order the already capped API hits by kind priority. Sorting the limited
  // list (not the full fuzzysort output) keeps the cap purely relevance-based —
  // a weak `stage` match can't displace a strong one from the visible set —
  // while Array.sort's stability preserves relevance order within each kind.
  apiHits.sort((a, b) => apiKindRank(order, a.obj.kind) - apiKindRank(order, b.obj.kind));
  return { apiHits, sectionHits };
}

function isWordBoundary(pos, target) {
  if (pos === 0) {
    return true;
  }
  const cur = target.charCodeAt(pos);
  const prev = target.charCodeAt(pos - 1);
  const prevAlnum =
    (prev >= 48 && prev <= 57) || (prev >= 65 && prev <= 90) || (prev >= 97 && prev <= 122);
  if (!prevAlnum) {
    return true;
  }
  const curUpper = cur >= 65 && cur <= 90;
  const prevLower = prev >= 97 && prev <= 122;
  return curUpper && prevLower;
}
