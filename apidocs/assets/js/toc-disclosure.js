// Mobile on-page ToC disclosure. On narrow viewports the ToC rail moves to
// the top of the body and collapses behind a button (see the <48rem block in
// layout.css). The list's visibility is driven entirely by the button's
// aria-expanded in CSS, so this only flips the attribute — there's nothing to
// show/hide imperatively. On desktop the button is display:none, so its
// listeners never fire and the rail stays open.

const toggle = document.querySelector("[data-toc-toggle]");
const list = toggle && document.getElementById(toggle.getAttribute("aria-controls"));

if (toggle && list) {
  const setOpen = open => {
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  // Tapping a heading link jumps within the page; collapse so the list
  // doesn't linger over the content the user just jumped to.
  list.addEventListener("click", e => {
    if (e.target.closest("a")) {
      setOpen(false);
    }
  });

  // Escape closes and returns focus to the trigger (W3C disclosure pattern).
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
}
