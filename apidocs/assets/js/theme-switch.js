// <apidocs-theme-switch> — toggles data-theme on <html>, persists choice in localStorage.
// The FOUC-prevention inline script in the layout reads the same storage key on first paint.

const STORAGE_KEY = "apidocs-theme";

class ApidocsThemeSwitch extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot || this.firstElementChild) {
      return;
    }
    this.innerHTML = `
      <button type="button" aria-pressed="false" aria-label="Toggle dark mode" title="Toggle dark mode">
        <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
        </svg>
        <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>`;
    const btn = this.querySelector("button");
    btn.addEventListener("click", () => this.#toggle());
    this.#sync();

    // If the user changes OS preference and they haven't pinned a manual choice,
    // re-sync the button's aria-pressed state.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (!document.documentElement.hasAttribute("data-theme")) {
        this.#sync();
      }
    });
  }

  #toggle() {
    const isDark = this.#isDark();
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    this.#sync();
  }

  #isDark() {
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit) {
      return explicit === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  #sync() {
    const btn = this.querySelector("button");
    if (btn) {
      btn.setAttribute("aria-pressed", String(this.#isDark()));
    }
  }
}

customElements.define("apidocs-theme-switch", ApidocsThemeSwitch);
