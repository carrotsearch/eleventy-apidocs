// Lightbox — click an image inside a <figure> to view it full-viewport
// in a <dialog>. Uses the View Transitions API for the zoom animation when
// available, otherwise opens/closes instantly. Close on ESC, click on the
// backdrop, or click on the zoomed image.

const NAME = "apidocs-lightbox-image";

let dialog;
let lastSource = null;

function getDialog() {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "apidocs-lightbox";
  const frame = document.createElement("div");
  frame.className = "frame";
  dialog.appendChild(frame);
  document.body.appendChild(dialog);

  dialog.addEventListener("click", (e) => {
    // Click on the dialog itself (the backdrop/padding area) closes.
    // Clicks on the inner image bubble here too, so the whole modal closes
    // on any click — matching the original carrotsearch lightbox.
    closeLightbox();
  });
  dialog.addEventListener("cancel", (e) => {
    // ESC fires the cancel event first. Run our close path so the view
    // transition can play instead of an instant close.
    e.preventDefault();
    closeLightbox();
  });
  return dialog;
}

function findVisual(target) {
  const figure = target.closest && target.closest("figure");
  if (!figure) return null;
  // Prefer the element actually clicked when it's the visual itself
  // (svg or img), but fall back to the figure's primary visual.
  let visual = target.closest("picture, img, svg");
  if (!visual || !figure.contains(visual)) {
    visual = figure.querySelector("picture, img, svg");
  }
  if (!visual) return null;
  return { figure, visual };
}

function openLightbox(figure, source) {
  const d = getDialog();
  const frame = d.querySelector(".frame");
  frame.replaceChildren();

  const clone = source.cloneNode(true);
  if (clone.tagName === "PICTURE") {
    const img = clone.querySelector("img");
    if (img) {
      img.removeAttribute("loading");
      img.setAttribute("sizes", "100vw");
    }
  }
  // Pin the clone's aspect-ratio to the image's natural dimensions so the
  // View Transitions snapshot box matches the image content exactly (no
  // letterbox padding inside the captured box).
  const ar = aspectRatioOf(clone);
  if (ar) clone.style.setProperty("--ar", ar);
  frame.appendChild(clone);

  const caption = figure.querySelector("figcaption");
  if (caption) frame.appendChild(caption.cloneNode(true));

  lastSource = source;

  const finishOpen = () => {
    d.showModal();
    document.body.classList.add("apidocs-lightbox-open");
  };

  if (!document.startViewTransition) {
    finishOpen();
    return;
  }

  source.style.viewTransitionName = NAME;
  const t = document.startViewTransition(() => {
    source.style.viewTransitionName = "";
    clone.style.viewTransitionName = NAME;
    finishOpen();
  });
  // Keep the clone's view-transition-name so the close animation can
  // pick it up when the user dismisses.
  t.finished.catch(() => {});
}

function closeLightbox() {
  if (!dialog || !dialog.open) return;
  const frame = dialog.querySelector(".frame");
  const clone = frame.querySelector("picture, img, svg");

  const finishClose = () => {
    dialog.close();
    document.body.classList.remove("apidocs-lightbox-open");
    if (lastSource) lastSource.style.viewTransitionName = "";
    lastSource = null;
    frame.replaceChildren();
  };

  if (!document.startViewTransition || !lastSource) {
    finishClose();
    return;
  }

  // The clone in the dialog currently owns NAME; flip it back to the
  // source so the snapshot animates to the in-page position.
  const t = document.startViewTransition(() => {
    if (clone) clone.style.viewTransitionName = "";
    if (lastSource) lastSource.style.viewTransitionName = NAME;
    dialog.close();
    document.body.classList.remove("apidocs-lightbox-open");
  });
  t.finished.finally(() => {
    if (lastSource) lastSource.style.viewTransitionName = "";
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
    if (!img) return null;
    return arFromWH(img.getAttribute("width"), img.getAttribute("height"));
  }
  if (el.tagName === "IMG") {
    return arFromWH(el.getAttribute("width"), el.getAttribute("height"));
  }
  if (el.tagName === "svg" || el.tagName === "SVG") {
    const vb = el.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
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
  if (wn > 0 && hn > 0) return `${wn} / ${hn}`;
  return null;
}

function onClick(e) {
  if (dialog && dialog.open) return;
  const hit = findVisual(e.target);
  if (!hit) return;
  if (hit.figure.dataset.lightbox === "off") return;
  e.preventDefault();
  openLightbox(hit.figure, hit.visual);
}

document.addEventListener("click", onClick);
