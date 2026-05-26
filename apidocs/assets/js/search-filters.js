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
  if (!n) return 0;
  let runs = 1;
  for (let i = 1; i < n; i++) {
    if (indexes[i] !== indexes[i - 1] + 1) runs++;
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
    if (i > 0 && indexes[i] === indexes[i - 1] + 1) continue;
    if (!isWordBoundary(indexes[i], target)) return false;
  }
  return true;
}

function isWordBoundary(pos, target) {
  if (pos === 0) return true;
  const cur = target.charCodeAt(pos);
  const prev = target.charCodeAt(pos - 1);
  const prevAlnum =
    (prev >= 48 && prev <= 57) || (prev >= 65 && prev <= 90) || (prev >= 97 && prev <= 122);
  if (!prevAlnum) return true;
  const curUpper = cur >= 65 && cur <= 90;
  const prevLower = prev >= 97 && prev <= 122;
  return curUpper && prevLower;
}
