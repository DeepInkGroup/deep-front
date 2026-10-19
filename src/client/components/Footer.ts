import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "@openfront/shared/AssetUrls";
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
      >
      <nav class="footer-socials" aria-label="Deep Front community">
        <a
          href="https://t.me/DeepFrontGame"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Telegram"
          title="Telegram"
          ><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M21.6 3.3c.6-.3 1.2.2 1 1L19.3 20c-.1.7-.6 1-1.2.6l-5-3.7-2.5 2.4c-.3.2-.5.4-.9.4l.4-5.2 9.3-8.4c.4-.4-.1-.6-.6-.3L7.3 13l-5-1.6c-.7-.2-.7-.7.1-1l19.2-7.1Z"
            /></svg
          ><span>Telegram</span></a
        >
        <a
          href="https://github.com/DeepInkGroup"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          title="GitHub"
          ><img
            src=${assetUrl("icons/github-mark-white.svg")}
            alt=""
            width="20"
            height="20"
          /><span>GitHub</span></a
        >
      </nav>
      <span
        >Solo & multiplayer <span class="footer-separator">·</span>
        <button class="nav-menu-item footer-help" data-page="page-help">
          How to play
        </button>
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
