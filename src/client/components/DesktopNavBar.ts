import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  createRenderRoot() {
    return this;
  }
  render() {
    return html` <nav class="front-nav" aria-label="Main navigation">
      <a href="/" class="front-brand"
        ><span class="brand-symbol">◈</span> DEEP<span>FRONT</span
        ><span class="edition">OPENFRONT EDITION</span></a
      >
      <div class="front-nav-actions">
        <button
          class="nav-menu-item"
          data-page="page-play"
          aria-label="Play"
          title="Play"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path d="m9 5 10 7-10 7V5Z" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          class="nav-menu-item"
          data-page="page-help"
          aria-label="How to play"
          title="How to play"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path
              d="M9.5 9a2.5 2.5 0 0 1 5 .3c0 1.7-2.5 2-2.5 3.7"
              stroke-linecap="round"
            />
            <path d="M12 16.5h.01" stroke-width="2.5" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="nav-menu-item"
          data-page="page-settings"
          aria-label="Settings"
          title="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path
              d="m9.5 3-.6 2.3-2 .9L4.8 6l-2.1 3.6 1.7 1.6v2l-1.7 1.5 2.1 3.6 2.2-.6 1.9 1.1.6 2.2h4.2l.6-2.2 2-1.1 2.1.6 2.1-3.6-1.7-1.5v-2l1.7-1.6L18.4 6l-2.1.2-2-.9L13.7 3H9.5Z"
              stroke-linejoin="round"
            />
            <circle cx="11.6" cy="12" r="3" />
          </svg>
        </button>
      </div>
      <span id="game-version" hidden></span>
    </nav>`;
  }
}
