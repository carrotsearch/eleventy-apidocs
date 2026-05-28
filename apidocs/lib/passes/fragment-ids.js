// Assign stable IDs to indexable fragments so search results can deep-link
// to a specific paragraph, list item, or definition term.
//
// Recipe:
//   - Targets: p, li, dt that don't already have an id
//   - ID = "_" + md5(textContent.slice(0, 200).trim())
//   - Stable across builds for unchanged content so bookmarks survive; small
//     drift acceptable.

import crypto from "node:crypto";

const SELECTOR = "p, li, dt";

export function fragmentIds($) {
  $(SELECTOR).each((_, el) => {
    const $el = $(el);
    if ($el.attr("id")) {
      return;
    }

    const text = $el.text().trim().slice(0, 200);
    if (!text) {
      return;
    }

    const hash = crypto.createHash("md5").update(text).digest("hex").slice(0, 8);
    $el.attr("id", `_${hash}`);
  });
}
