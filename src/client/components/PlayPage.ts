import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }
  render() {
    return html` <div id="page-play" class="front-home">
      <header class="front-heading">
        <span class="eyebrow"
          ><span class="status-dot"></span> YOUR NEXT CAMPAIGN</span
        >
        <h1>A world of possibilities.<br /><span>Make your move.</span></h1>
        <p>Expand your borders. Build your strategy. Take the world.</p>
      </header>
      <div class="commander-row">
        <div>
          <span class="eyebrow">BEFORE YOU DEPLOY</span>
          <p>What should we call you?</p>
        </div>
        <username-input></username-input>
      </div>
      <game-mode-selector></game-mode-selector>
      <div class="front-tips">
        <span>01 <strong>Choose your territory</strong></span
        ><span>02 <strong>Grow your economy</strong></span
        ><span>03 <strong>Lead the map</strong></span>
      </div>
    </div>`;
  }
}
