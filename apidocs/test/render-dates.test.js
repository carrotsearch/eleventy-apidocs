import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDates } from "../lib/passes/render-dates.js";
import { loadFragment } from "./helpers.js";

function render(html) {
  const $ = loadFragment(html);
  renderDates($);
  return $;
}

test("fills an empty <time> from its datetime attribute", () => {
  const $ = render(`<time datetime="2025-05-28"></time>`);
  assert.equal($("time").text(), "May 28, 2025");
});

test("leaves a <time> that already has text untouched", () => {
  const $ = render(`<time datetime="2030-01-01">Not yet released</time>`);
  assert.equal($("time").text(), "Not yet released");
});

test("ignores <time> without a parseable date", () => {
  const $ = render(`<time>whenever</time><time datetime="soon"></time>`);
  assert.equal($("time").eq(0).text(), "whenever");
  assert.equal($("time").eq(1).text(), "");
});

test("uses only the date part of a fuller datetime value", () => {
  const $ = render(`<time datetime="2025-05-28T12:00:00Z"></time>`);
  assert.equal($("time").text(), "May 28, 2025");
});
