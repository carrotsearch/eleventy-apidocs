// Lightbox — click an image inside a <figure> to view it full-viewport
// in a <dialog>. Uses the View Transitions API for the zoom animation when
// available, otherwise opens/closes instantly. Close on ESC, click on the
// backdrop, or click on the zoomed image.
//
// Resolution upgrade: the dialog initially shows the exact pixels already
// rendered in-page (locked to the source <img>'s currentSrc, with srcset
// and <source> stripped). VT animates that. Only after the transition
// settles do we restore srcset/<source>, letting the browser pick a higher
// variant for the new 100vw display box if one is warranted. Hover/focus/
// pointerdown over a figure also prefetches the upgrade via <link
// rel=preload> so the swap is already cached by the time it kicks in.

const NAME = "apidocs-lightbox-image";

let dialog;
let lastSource = null;
const preloaded = new WeakSet();

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

  // Belt-and-suspenders: a direct click (no prior hover, no keyboard focus)
  // never had a chance to fire the preload listeners. Trigger here too —
  // the WeakSet guard makes this cheap if it already ran.
  preloadFigure(figure);

  const clone = source.cloneNode(true);
  if (clone.tagName === "PICTURE") {
    const img = clone.querySelector("img");
    if (img) {
      img.removeAttribute("loading");
    }
  }

  // Pin the clone's aspect-ratio to the image's natural dimensions so the
  // View Transitions snapshot box matches the image content exactly (no
  // letterbox padding inside the captured box).
  const ar = aspectRatioOf(clone);
  if (ar) {
    clone.style.setProperty("--ar", ar);
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
    clone.style.viewTransitionName = NAME;
    finishOpen();
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

  return () => {
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

// Prefetch the lightbox-resolution variant(s) for this figure via
// <link rel=preload as=image>. One link per <source> (with `type` so the
// browser only fetches the format it supports) plus the fallback <img>'s
// srcset as a backstop. Idempotent per figure.
function preloadFigure(figure) {
  if (preloaded.has(figure)) {
    return;
  }
  if (figure.dataset.lightbox === "off") {
    return;
  }
  const picture = figure.querySelector("picture");
  if (!picture) {
    return;
  }
  preloaded.add(figure);

  for (const s of picture.querySelectorAll(":scope > source")) {
    addImagePreload(s.getAttribute("srcset"), s.getAttribute("type"));
  }
  const img = picture.querySelector("img");
  if (img) {
    addImagePreload(img.getAttribute("srcset"), null);
  }
}

function addImagePreload(srcset, type) {
  if (!srcset) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  if (type) {
    link.type = type;
  }
  link.setAttribute("imagesrcset", srcset);
  link.setAttribute("imagesizes", "100vw");
  document.head.appendChild(link);
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

function onPreloadCue(e) {
  if (dialog?.open) {
    return;
  }
  const figure = e.target?.closest?.("figure");
  if (figure) {
    preloadFigure(figure);
  }
}

document.addEventListener("click", onClick);

// pointerover catches desktop hover; focusin catches keyboard tab; pointerdown
// gives touch users some head start on the network fetch before click fires.
document.addEventListener("pointerover", onPreloadCue);
document.addEventListener("focusin", onPreloadCue);
document.addEventListener("pointerdown", onPreloadCue);
