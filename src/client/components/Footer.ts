import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
@customElement("page-footer")
export class Footer extends LitElement {
  createRenderRoot() {
    return this;
  }
  render() {
    return html`<footer class="front-footer">
      <span
        >© OpenFront and Contributors
        <span class="footer-separator">/</span> Deep Front</span
      ><span
        >Solo & multiplayer <span class="footer-separator">·</span>
        <a href="/source.zip">Source code (AGPL-3.0)</a>
        <span class="footer-separator">·</span>
        <a
          href="https://github.com/openfrontio/OpenFrontIO"
          target="_blank"
          rel="noopener noreferrer"
          >Original project ↗</a
        ></span
      >
    </footer>`;
  }
}
