// Replace <span class="current-year">…</span> bodies with the build year.
// Authors put a placeholder year in the source for a sane fallback; the
// pipeline overwrites it at build time. Operates on the loaded document.

export function currentYear($, year = new Date().getFullYear()) {
  $("span.current-year").text(String(year));
}
