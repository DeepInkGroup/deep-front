import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { genAnonUsername, type ResolvedPlayerName } from "./PlayerName";
import { MAX_USERNAME_LENGTH, validateUsername } from "./validations/username";
@customElement("username-input")
export class UsernameInput extends LitElement {
  @state() private name = localStorage.getItem("username") || genAnonUsername();
  @property({ type: String }) validationError = "";
  createRenderRoot() {
    return this;
  }
  connectedCallback() {
    super.connectedCallback();
    if (!localStorage.getItem("username"))
      localStorage.setItem("username", this.name);
  }
  getUsername() {
    return this.name.trim();
  }
  resolvedName(): ResolvedPlayerName {
    return { name: this.getUsername(), source: "stored", verified: false };
  }
  isVerified() {
    return false;
  }
  getClanTag(): string | null {
    return null;
  }
  clearClanTag(_expectedTag?: string) {
    localStorage.removeItem("clanTag");
  }
  getClanCheck(): Promise<string | null> {
    return Promise.resolve(null);
  }
  whenSeeded(): Promise<void> {
    return Promise.resolve();
  }
  canPlay() {
    return validateUsername(this.getUsername()).isValid;
  }
  private onInput(event: Event) {
    this.name = (event.target as HTMLInputElement).value;
    const result = validateUsername(this.getUsername());
    this.validationError = result.error || "";
    if (result.isValid) localStorage.setItem("username", this.getUsername());
    window.dispatchEvent(
      new CustomEvent("username-validity-change", {
        detail: { isValid: result.isValid },
      }),
    );
  }
  render() {
    return html`<label class="commander-input"
        ><span aria-hidden="true">◎</span
        ><input
          id="username"
          aria-label="Player name"
          autocomplete="nickname"
          maxlength=${MAX_USERNAME_LENGTH}
          .value=${this.name}
          @input=${this.onInput}
        /><span class="input-caption">PLAYER NAME</span></label
      >${this.validationError
        ? html`<p class="name-error" role="alert">${this.validationError}</p>`
        : ""}`;
  }
}
