// Lightbox — click an image inside a <figure> to view it full-viewport
// in a <dialog>. Uses the View Transitions API for the zoom animation when
// available, otherwise opens/closes instantly. Close on ESC, click on the
// backdrop, or click on the zoomed image.

const NAME = "apidocs-lightbox-image";

let dialog;
let lastSource = null;

// Monotonic token guarding the async tails of overlapping transitions. A
// view transition superseded by a newer startViewTransition still runs its
// update callback and settles its `finished` promise; without the guard, a
// stale close cleanup wipes the frame and name state the newer open just
// set up (the dialog opens empty), and a stale open callback calls
// showModal() on an already-open dialog, which throws.
let session = 0;

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
  // (svg or img), but fall back to the figure's first *rendered* visual —
  // light/dark figures carry both theme variants and one is display:none,
  // so an unfiltered querySelector could zoom the wrong-theme image.
  let visual = target.closest("picture, img, svg");
  if (!visual || !figure.contains(visual)) {
    visual = Array.from(figure.querySelectorAll("picture, img, svg")).find(
      el => el.getClientRects().length > 0
    );
  }
  if (!visual) {
    return null;
  }

  // A raster <img> rewrapped by the image pipeline lives inside a <picture>;
  // a direct click resolves to the <img> itself. Zoom the <picture> instead so
  // the clone keeps the AVIF/WebP <source>s — the bare <img> carries only the
  // fallback-format srcset, so upgradeClone would re-select a heavy PNG/JPEG.
  if (visual.tagName === "IMG" && visual.parentElement?.tagName === "PICTURE") {
    visual = visual.parentElement;
  }
  return { figure, visual };
}

function openLightbox(figure, source) {
  const mySession = ++session;
  const d = getDialog();
  const frame = d.querySelector(".frame");
  frame.replaceChildren();

  // A close VT superseded by this open skips its cleanup (session guard in
  // closeLightbox), so the previous source may still carry the close
  // frame's inline view-transition-name. Remember it — `begin` clears it
  // right before tagging the new source: a leftover name would
  // duplicate-tag the named group and break capture.
  const prevSource = lastSource;

  const clone = source.cloneNode(true);
  // The clone copies any stale inline view-transition-name along with the
  // rest of the source's inline style; wipe it for the same reason.
  clone.style.viewTransitionName = "";
  const caption = figure.querySelector("figcaption");

  // Lock explicit pixel width/height on the clone — the largest box that
  // matches the source's natural aspect ratio inside the dialog frame. The
  // VT NEW snapshot then has a definite, correctly-sized box no matter when
  // the inner <img> finishes loading. Without this, under cold-cache +
  // throttled loads the picture's auto/auto sizing inside the grid cell can
  // momentarily resolve to zero and Chrome captures a (0,0,0,0) box at
  // top-left, which morphs the in-page image off-screen instead of zooming.
  const fit = fitBoxOf(source, !!caption);
  if (fit) {
    clone.style.inlineSize = `${fit.w}px`;
    clone.style.blockSize = `${fit.h}px`;
  }

  const clonedImg = pinClone(source, clone);

  frame.appendChild(clone);
  if (caption) {
    frame.appendChild(caption.cloneNode(true));
  }

  lastSource = source;

  const begin = () => beginOpenTransition(mySession, source, prevSource, clone, d);

  // A freshly created <img> loads and decodes asynchronously even when the
  // bytes sit in the HTTP cache, and the VT's NEW side paints blank until
  // the decode lands — visible as the zoomed image flashing blank at the
  // start of the morph. Wait for the decode before starting the
  // transition; the cap keeps a cold cache from freezing the click (the
  // image then pops in mid-zoom instead). Warm-cache decodes land in
  // single-digit milliseconds.
  if (clonedImg) {
    Promise.race([clonedImg.decode().catch(() => {}), new Promise(r => setTimeout(r, 300))]).then(
      begin
    );
  } else {
    begin();
  }
}

function beginOpenTransition(mySession, source, prevSource, clone, d) {
  // Superseded while waiting for the clone's decode — the newer session
  // owns the dialog and the named group now.
  if (mySession !== session) {
    return;
  }

  const finishOpen = () => {
    d.showModal();
    document.body.classList.add("apidocs-lightbox-open");
  };

  if (!document.startViewTransition) {
    finishOpen();
    upgradeClone(mySession, source, clone);
    return;
  }

  // Clear a stale name left by a superseded close VT before tagging the
  // new source (order matters when both are the same element).
  if (prevSource) {
    prevSource.style.viewTransitionName = "";
  }
  source.style.viewTransitionName = NAME;

  // Scope the root crossfade timing for the duration of this transition.
  // CSS in lightbox.css keys off the html class to fade the page out fast
  // so the header is hidden before the image morph reaches the top. Remove
  // the closing class too — a skipped close VT's cleanup never runs.
  document.documentElement.classList.remove("apidocs-lightbox-closing");
  document.documentElement.classList.add("apidocs-lightbox-opening");
  const t = document.startViewTransition(() => {
    // Superseded by a newer open (double-click inside the snapshot-capture
    // window): leave everything to the newer session — wiping the source's
    // name here would break the newer OLD capture, and a second
    // showModal() on the now-open dialog would throw.
    if (mySession !== session) {
      return;
    }
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

  // A transition superseded during capture rejects `ready` with AbortError;
  // nothing consumes `ready` here, so swallow it to keep the console clean.
  t.ready.catch(() => {});

  // Keep the clone's view-transition-name so the close animation can
  // pick it up when the user dismisses.
  t.finished.finally(() => {
    if (mySession !== session) {
      return;
    }
    document.documentElement.classList.remove("apidocs-lightbox-opening");

    // The morph is done; only now restore the responsive markup so the
    // browser can upgrade. Doing this earlier would feed the VT an
    // unloaded/re-selecting image and capture a blank NEW snapshot.
    upgradeClone(mySession, source, clone);
  });
}

// After the zoom settles, hand the full-viewport clone back its responsive
// markup so the browser's own picture algorithm upgrades it. pinClone left the
// clone showing the in-doc currentSrc (already decoded) and stripped its
// candidates; we read the originals off the still-intact in-page source,
// restore them, and set sizes="100vw" — honest now that the box is the whole
// viewport. The pinned src stays as the img's current request, so the upgrade
// loads as a pending request and swaps in atomically once fully decoded (no
// blank, no progressive repaint). No-ops for SVG and single-res sources.
//
// To make the sharpen read as a dissolve rather than a snap, a cheap copy of
// the still-shown lower-res image is laid over the clone and faded out once the
// clone has swapped in the higher-res variant. This is a plain CSS opacity
// transition — deliberately not a second view transition, so it stays clear of
// the open/close VT seams; the session token only gates the async tails, and
// the cover lives in .frame, which openLightbox/closeLightbox already clear.
function upgradeClone(mySession, source, clone) {
  const sourceImg = source.tagName === "PICTURE" ? source.querySelector("img") : source;
  const clonedImg = clone.tagName === "PICTURE" ? clone.querySelector("img") : clone;
  if (!clonedImg || clonedImg.tagName !== "IMG") {
    return;
  }

  // Nothing to upgrade if the source carries no candidates at all.
  const srcset = sourceImg?.getAttribute("srcset");
  const hasSources = source.tagName === "PICTURE" && !!source.querySelector(":scope > source");
  if (!srcset && !hasSources) {
    return;
  }

  const frame = clone.parentElement;
  const animate = frame && !matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Lay a copy of the currently-shown (lower-res) image over the clone, locked
  // to the clone's exact rendered box, before the base starts upgrading. It
  // loads instantly from cache (same pinned src) so there's no flash, and it
  // hides the base's in-place swap until we dissolve it out.
  let cover = null;
  if (animate) {
    cover = clonedImg.cloneNode(true);
    cover.className = "apidocs-lightbox-upgrade";
    cover.style.viewTransitionName = "";
    cover.style.left = `${clone.offsetLeft}px`;
    cover.style.top = `${clone.offsetTop}px`;
    cover.style.inlineSize = `${clone.offsetWidth}px`;
    cover.style.blockSize = `${clone.offsetHeight}px`;
    frame.appendChild(cover);

    // Dissolve the cover once the base finishes loading (and decoding) the
    // higher-res variant — by then the sharp image sits ready underneath.
    clonedImg.addEventListener(
      "load",
      async () => {
        if (mySession !== session) {
          return;
        }
        await clonedImg.decode().catch(() => {});
        if (mySession !== session || !cover.isConnected) {
          return;
        }
        cover.addEventListener("transitionend", () => cover.remove(), { once: true });
        cover.style.opacity = "0";
      },
      { once: true }
    );
  }

  // Re-attach the source's <source> candidates ahead of the clone's <img>,
  // then restore srcset/sizes so the browser re-selects for the full viewport.
  if (clone.tagName === "PICTURE" && source.tagName === "PICTURE") {
    for (const s of source.querySelectorAll(":scope > source")) {
      clone.insertBefore(s.cloneNode(true), clonedImg);
    }
  }
  if (srcset) {
    clonedImg.setAttribute("srcset", srcset);
  }
  clonedImg.setAttribute("sizes", "100vw");
  for (const s of clone.querySelectorAll(":scope > source")) {
    s.setAttribute("sizes", "100vw");
  }
}

// Pin the clone to the source's already-rendered image so the VT captures
// exactly those pixels (no refetch, no LQIP flash): strip <source>/srcset/
// sizes so the clone can't re-run candidate selection, and point its src at
// the source's currentSrc. Pinning is skipped for images that haven't
// loaded yet (no currentSrc) — the clone then loads candidates normally
// once the dialog shows it. Returns the clone's inner <img> so the caller
// can await its decode, or null for SVG.
function pinClone(source, clone) {
  const sourceImg = source.tagName === "PICTURE" ? source.querySelector("img") : source;
  const clonedImg = clone.tagName === "PICTURE" ? clone.querySelector("img") : clone;
  if (!clonedImg || clonedImg.tagName !== "IMG") {
    return null;
  }

  // The dialog shows the clone immediately — never lazy-load it.
  clonedImg.removeAttribute("loading");

  const currentSrc = sourceImg?.currentSrc;
  if (!currentSrc) {
    return clonedImg;
  }
  if (clone.tagName === "PICTURE") {
    for (const s of clone.querySelectorAll(":scope > source")) {
      s.remove();
    }
  }
  clonedImg.removeAttribute("srcset");
  clonedImg.removeAttribute("sizes");
  clonedImg.src = currentSrc;
  return clonedImg;
}

// The largest box that fits the source's natural aspect ratio inside the
// dialog frame (viewport minus the .frame padding, the grid gap and, when
// the figure has one, a reserved row for the caption). Mirrors
// `dialog.apidocs-lightbox > .frame` from lightbox.css. Returning null lets
// the caller fall back to CSS auto sizing.
function fitBoxOf(source, hasCaption) {
  const ratio = naturalRatio(source);
  if (!ratio) {
    return null;
  }
  const framePad = 24; // .frame padding (1.5rem)
  const captionRow = hasCaption ? 60 : 16; // caption + gap, or just the gap
  const maxW = Math.max(0, window.innerWidth - framePad * 2);
  const maxH = Math.max(0, window.innerHeight - framePad * 2 - captionRow);
  if (!maxW || !maxH) {
    return null;
  }
  const k = Math.min(maxW / ratio.w, maxH / ratio.h);
  return { w: Math.floor(ratio.w * k), h: Math.floor(ratio.h * k) };
}

// Derive a `<picture|img|svg>`'s intrinsic dimensions. For raster images
// the width/height attributes set by the image pipeline are the
// authoritative source, with the decoded naturalWidth as a fallback. For
// inlined SVGs we read the viewBox.
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
  const mySession = ++session;
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
  document.documentElement.classList.remove("apidocs-lightbox-opening");
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

  // Same as the open path: swallow the AbortError of a superseded capture.
  t.ready.catch(() => {});

  t.finished.finally(() => {
    // Superseded by a re-open during the close animation: the new session
    // owns the frame, lastSource and the html classes now — wiping them
    // here would leave the freshly opened dialog empty.
    if (mySession !== session) {
      return;
    }
    document.documentElement.classList.remove("apidocs-lightbox-closing");
    if (lastSource) {
      lastSource.style.viewTransitionName = "";
    }
    lastSource = null;
    frame.replaceChildren();
  });
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
