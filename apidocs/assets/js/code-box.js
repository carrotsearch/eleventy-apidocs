// <apidocs-code-box> — wraps a Shiki-rendered <pre><code>...</code></pre>
// and adds a copy-to-clipboard button. The plain text to copy lives on
// the wrapper's data-plain-text attribute (the pipeline sets it).

class ApidocsCodeBox extends HTMLElement {
  connectedCallback() {
    if (this.#button) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.title = "Copy code to clipboard";
    button.setAttribute("aria-label", "Copy code to clipboard");
    button.addEventListener("click", () => this.#copy(button));
    this.appendChild(button);
  }

  get #button() {
    return this.querySelector(":scope > button.copy");
  }

  async #copy(button) {
    const text = this.getAttribute("data-plain-text") ?? "";
    try {
      await navigator.clipboard.writeText(text);
      this.#flash(button, "ok", "Code copied to clipboard");
    } catch {
      this.#flash(button, "failed", "Failed to copy");
    }
  }

  #flash(button, state, message) {
    button.classList.remove("ok", "failed");
    button.classList.add(state);
    button.title = message;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      button.classList.remove(state);
      button.title = "Copy code to clipboard";
    }, 1200);
  }

  #timer;
}

customElements.define("apidocs-code-box", ApidocsCodeBox);
