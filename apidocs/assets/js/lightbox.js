// Lightbox — click an image inside a <figure> to view it full-viewport
// in a <dialog>. Uses the View Transitions API for the zoom animation when
// available, otherwise opens/closes instantly. Close on ESC, click on the
// backdrop, or click on the zoomed image.
//
// Resolution upgrade: the dialog initially shows the exact pixels already
// rendered in-page (locked to the source <img>'s currentSrc, with srcset
// and <source> stripped). VT animates that. Only after the transition
// settles do we restore srcset/<source>, letting the browser pick a higher
// variant for the new 100vw display box if one is warranted.

const NAME = "apidocs-lightbox-image";

let dialog;
let lastSource = null;

function getDialog() {
  if (dialog) {
    return dialog;
  }
  dialog = document.createElement("dialog");
  dialog.className = "apidocs-lightbox";
  const frame = document.createElement("div");
  frame.className = "frame";
  dialog.appendChild(frame);
  document.body.appendChild(dialog);

  dialog.addEventListener("click", () => {
    // Click on the dialog itself (the backdrop/padding area) closes.
    // Clicks on the inner image bubble here too, so the whole modal closes
    // on any click — matching the original carrotsearch lightbox.
    closeLightbox();
  });
  dialog.addEventListener("cancel", e => {
    // ESC fires the cancel event first. Run our close path so the view
    // transition can play instead of an instant close.
    e.preventDefault();
    closeLightbox();
  });
  return dialog;
}

function findVisual(target) {
  const figure = target.closest?.("figure");
  if (!figure) {
    return null;
  }

  // Prefer the element actually clicked when it's the visual itself
  // (svg or img), but fall back to the figure's primary visual.
  let visual = target.closest("picture, img, svg");
  if (!visual || !figure.contains(visual)) {
    visual = figure.querySelector("picture, img, svg");
  }
  if (!visual) {
    return null;
  }
  return { figure, visual };
}

function openLightbox(figure, source) {
  const d = getDialog();
  const frame = d.querySelector(".frame");
  frame.replaceChildren();

  const clone = source.cloneNode(true);
  // Wipe any inherited view-transition-name. If the user re-opens during a
  // close VT's animation, the source still carries the close-frame's inline
  // `view-transition-name: NAME` (cleared only in close's t.finished.finally).
  // cloneNode then duplicates that name onto the new clone — both source and
  // clone match the named group's OLD snapshot, and Chrome resolves the new
  // clone's box at (0,0,0,0) (display:none, inside the closed dialog), so the
  // morph animates the in-page image to top-left/zero instead of zooming in.
  clone.style.viewTransitionName = "";
  if (clone.tagName === "PICTURE") {
    const img = clone.querySelector("img");
    if (img) {
      img.removeAttribute("loading");
    }
  }

  // Lock explicit pixel width/height on the clone — the largest box that
  // matches the source's natural aspect ratio inside the dialog frame. The
  // VT NEW snapshot then has a definite, correctly-sized box no matter when
  // the inner <img> finishes loading. Without this, under cold-cache +
  // throttled loads the picture's auto/auto sizing inside the grid cell can
  // momentarily resolve to zero and Chrome captures a (0,0,0,0) box at
  // top-left, which morphs the in-page image off-screen instead of zooming.
  const fit = fitBoxOf(source);
  if (fit) {
    clone.style.inlineSize = `${fit.w}px`;
    clone.style.blockSize = `${fit.h}px`;
  } else {
    const ar = aspectRatioOf(clone);
    if (ar) {
      clone.style.setProperty("--ar", ar);
    }
  }

  // Lock the clone to the source's already-rendered image so the VT
  // captures exactly those pixels (no late load, no LQIP flash). Returns
  // an upgrade() that restores srcset/<source> after the transition.
  const upgrade = lockAndCaptureUpgrade(source, clone);

  frame.appendChild(clone);

  const caption = figure.querySelector("figcaption");
  if (caption) {
    frame.appendChild(caption.cloneNode(true));
  }

  lastSource = source;

  const finishOpen = () => {
    d.showModal();
    document.body.classList.add("apidocs-lightbox-open");
  };

  if (!document.startViewTransition) {
    finishOpen();
    if (upgrade) {
      upgrade();
    }
    return;
  }

  source.style.viewTransitionName = NAME;

  // Scope the root crossfade timing for the duration of this transition.
  // CSS in lightbox.css keys off the html class to fade the page out fast
  // so the header is hidden before the image morph reaches the top.
  document.documentElement.classList.add("apidocs-lightbox-opening");
  const t = document.startViewTransition(() => {
    source.style.viewTransitionName = "";
    // Open the dialog FIRST, then tag the clone. The clone has to be in a
    // rendered (display:block) box when its view-transition-name is set,
    // otherwise Chrome captures the NEW snapshot at the clone's pre-showModal
    // (display:none) box — zero-sized at (0,0). That manifested as the image
    // "flying" to the top-left and shrinking to nothing under cold-cache +
    // throttled loads, where the layout race has more room to lose.
    finishOpen();
    clone.style.viewTransitionName = NAME;
  });

  // Keep the clone's view-transition-name so the close animation can
  // pick it up when the user dismisses.
  t.finished.finally(() => {
    document.documentElement.classList.remove("apidocs-lightbox-opening");
    if (upgrade) {
      upgrade();
    }
  });
}

// Strip srcset/<source>/sizes from the clone and pin its <img> to the
// source's currentSrc. Returns a function that puts them back (or null if
// there's nothing to upgrade — e.g. an SVG, or the source hasn't loaded
// yet so we have no currentSrc to pin to).
function lockAndCaptureUpgrade(source, clone) {
  if (source.tagName === "svg" || source.tagName === "SVG") {
    return null;
  }
  const sourceImg = source.tagName === "PICTURE" ? source.querySelector("img") : source;
  const clonedImg = clone.tagName === "PICTURE" ? clone.querySelector("img") : clone;
  if (!sourceImg || !clonedImg) {
    return null;
  }
  const currentSrc = sourceImg.currentSrc || sourceImg.src;
  if (!currentSrc) {
    return null;
  }

  // Read the upgrade attributes from `source`, not `clone` — we're about
  // to mutate the clone, and reading from the live source is unambiguous.
  const upgradeSrcset = sourceImg.getAttribute("srcset");
  const upgradeSources =
    source.tagName === "PICTURE"
      ? Array.from(source.querySelectorAll(":scope > source")).map(s => ({
          srcset: s.getAttribute("srcset"),
          type: s.getAttribute("type"),
          media: s.getAttribute("media")
        }))
      : [];

  if (clone.tagName === "PICTURE") {
    for (const s of clone.querySelectorAll(":scope > source")) {
      s.remove();
    }
  }
  clonedImg.removeAttribute("srcset");
  clonedImg.removeAttribute("sizes");
  clonedImg.src = currentSrc;

  if (!upgradeSrcset && !upgradeSources.length) {
    return null;
  }

  return async () => {
    if (!clone.isConnected) {
      return;
    }

    // Decode the upgrade variant off-DOM first. Under cache-disabled +
    // throttled loads, mutating the live <picture>'s sources/srcset and
    // letting it pick a fresh candidate makes Chrome briefly clear the
    // visible image while the new bytes arrive — the dialog backdrop
    // bleeds through as a black flash. Warming the image cache off-DOM
    // turns the live mutation into a synchronous cache hit instead.
    await preloadUpgrade(clonedImg.src, upgradeSrcset, upgradeSources, clone.tagName);

    if (!clone.isConnected) {
      return;
    }
    if (upgradeSources.length && clone.tagName === "PICTURE") {
      clone.insertBefore(buildSourceFrag(upgradeSources), clonedImg);
    }
    if (upgradeSrcset) {
      clonedImg.setAttribute("srcset", upgradeSrcset);
    }
    clonedImg.setAttribute("sizes", "100vw");
  };
}

// Render a hidden picture/img with the upgrade attributes at the lightbox's
// display width and await its decode. The browser then has the chosen
// variant decoded in its image cache by the time the live clone re-runs the
// picture algorithm.
async function preloadUpgrade(fallbackSrc, upgradeSrcset, upgradeSources, tagName) {
  const probe = document.createElement(tagName === "PICTURE" ? "picture" : "img");
  let probeImg;
  if (tagName === "PICTURE") {
    probe.appendChild(buildSourceFrag(upgradeSources));
    probeImg = document.createElement("img");
    probe.appendChild(probeImg);
  } else {
    probeImg = probe;
  }
  probeImg.decoding = "async";
  if (upgradeSrcset) {
    probeImg.setAttribute("srcset", upgradeSrcset);
  }
  probeImg.setAttribute("sizes", "100vw");
  probeImg.src = fallbackSrc;

  // Render at viewport width but off-screen so the picture algorithm picks
  // the same candidate the live clone will land on.
  const host = tagName === "PICTURE" ? probe : probeImg;
  host.style.cssText =
    "position:fixed; inset-block-start:0; inset-inline-start:-100vw; " +
    "inline-size:100vw; visibility:hidden; pointer-events:none; contain:strict;";
  document.body.appendChild(host);
  try {
    await probeImg.decode();
  } catch {
    // Decode rejects on load failure; the live swap will fail the same way.
  }
  host.remove();
}

function buildSourceFrag(specs) {
  const frag = document.createDocumentFragment();
  for (const s of specs) {
    const el = document.createElement("source");
    if (s.type) {
      el.type = s.type;
    }
    if (s.media) {
      el.setAttribute("media", s.media);
    }
    if (s.srcset) {
      el.setAttribute("srcset", s.srcset);
    }
    el.setAttribute("sizes", "100vw");
    frag.appendChild(el);
  }
  return frag;
}

// The largest box that fits the source's natural aspect ratio inside the
// dialog frame (viewport minus the .frame padding and a reserved row for
// the caption). Mirrors `dialog.apidocs-lightbox > .frame` from lightbox.css.
// Returning null lets the caller fall back to aspect-ratio-based sizing.
function fitBoxOf(source) {
  const ratio = naturalRatio(source);
  if (!ratio) {
    return null;
  }
  const framePad = 24; // .frame padding (1.5rem)
  const captionRow = 60; // figcaption row + grid gap, ample upper bound
  const maxW = Math.max(0, window.innerWidth - framePad * 2);
  const maxH = Math.max(0, window.innerHeight - framePad * 2 - captionRow);
  if (!maxW || !maxH) {
    return null;
  }
  const k = Math.min(maxW / ratio.w, maxH / ratio.h);
  return { w: Math.floor(ratio.w * k), h: Math.floor(ratio.h * k) };
}

function naturalRatio(el) {
  if (el.tagName === "PICTURE") {
    const img = el.querySelector("img");
    return img ? whFromImg(img) : null;
  }
  if (el.tagName === "IMG") {
    return whFromImg(el);
  }
  if (el.tagName === "svg" || el.tagName === "SVG") {
    const vb = el.getAttribute("viewBox");
    if (vb) {
      const parts = vb
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { w: parts[2], h: parts[3] };
      }
    }
    return whFromAttrs(el.getAttribute("width"), el.getAttribute("height"));
  }
  return null;
}

function whFromImg(img) {
  return (
    whFromAttrs(img.getAttribute("width"), img.getAttribute("height")) ||
    (img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null)
  );
}

function whFromAttrs(w, h) {
  const wn = parseFloat(w);
  const hn = parseFloat(h);
  return wn > 0 && hn > 0 ? { w: wn, h: hn } : null;
}

function closeLightbox() {
  if (!dialog?.open) {
    return;
  }
  const frame = dialog.querySelector(".frame");
  const clone = frame.querySelector("picture, img, svg");

  const finishClose = () => {
    dialog.close();
    document.body.classList.remove("apidocs-lightbox-open");
    if (lastSource) {
      lastSource.style.viewTransitionName = "";
    }
    lastSource = null;
    frame.replaceChildren();
  };

  if (!document.startViewTransition || !lastSource) {
    finishClose();
    return;
  }

  // The clone in the dialog currently owns NAME; flip it back to the
  // source so the snapshot animates to the in-page position.
  document.documentElement.classList.add("apidocs-lightbox-closing");
  const t = document.startViewTransition(() => {
    if (clone) {
      clone.style.viewTransitionName = "";
    }
    if (lastSource) {
      lastSource.style.viewTransitionName = NAME;
    }
    dialog.close();
    document.body.classList.remove("apidocs-lightbox-open");
  });
  t.finished.finally(() => {
    document.documentElement.classList.remove("apidocs-lightbox-closing");
    if (lastSource) {
      lastSource.style.viewTransitionName = "";
    }
    lastSource = null;
    frame.replaceChildren();
  });
}

// Derive an `<picture|img|svg>`'s intrinsic aspect ratio. For raster
// images the width/height attributes set by the image pipeline are the
// authoritative source. For inlined SVGs we read the viewBox.
function aspectRatioOf(el) {
  if (el.tagName === "PICTURE") {
    const img = el.querySelector("img");
    if (!img) {
      return null;
    }
    return arFromWH(img.getAttribute("width"), img.getAttribute("height"));
  }
  if (el.tagName === "IMG") {
    return arFromWH(el.getAttribute("width"), el.getAttribute("height"));
  }
  if (el.tagName === "svg" || el.tagName === "SVG") {
    const vb = el.getAttribute("viewBox");
    if (vb) {
      const parts = vb
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return `${parts[2]} / ${parts[3]}`;
      }
    }
    return arFromWH(el.getAttribute("width"), el.getAttribute("height"));
  }
  return null;
}

function arFromWH(w, h) {
  const wn = parseFloat(w);
  const hn = parseFloat(h);
  if (wn > 0 && hn > 0) {
    return `${wn} / ${hn}`;
  }
  return null;
}

function onClick(e) {
  if (dialog?.open) {
    return;
  }
  const hit = findVisual(e.target);
  if (!hit) {
    return;
  }
  if (hit.figure.dataset.lightbox === "off") {
    return;
  }
  e.preventDefault();
  openLightbox(hit.figure, hit.visual);
}

document.addEventListener("click", onClick);
