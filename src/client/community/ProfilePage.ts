import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { CommunityUser } from "@openfront/engine-api/game/CommunityMaps";
import { communityRequest, communityUser, signOutCommunity } from "./Community";

export function accountDate(at: number | null | undefined) {
  return at
    ? new Date(at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";
}

@customElement("profile-page")
export class ProfilePage extends LitElement {
  @state() private user = communityUser();
  @state() private data: {
    user: CommunityUser;
    submissions: number;
    published: number;
    pending: number;
    sessions: number;
  } | null = null;
  @state() private error = "";
  @state() private busy = false;
  private onPage = (event: Event) => {
    if ((event as CustomEvent).detail === "page-profile") void this.load();
  };
  private onSession = () => {
    this.user = communityUser();
    this.data = null;
  };
  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("showPage", this.onPage);
    window.addEventListener("community-session", this.onSession);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("showPage", this.onPage);
    window.removeEventListener("community-session", this.onSession);
  }
  createRenderRoot() {
    return this;
  }
  private async load() {
    this.user = communityUser();
    if (!this.user) return;
    this.error = "";
    try {
      this.data = await communityRequest("/profile");
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  private async password(event: SubmitEvent) {
    event.preventDefault();
    if (this.busy) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    this.busy = true;
    this.error = "";
    try {
      await communityRequest("/password", {
        current: String(form.get("current")),
        password: String(form.get("password")),
      });
      await signOutCommunity();
      window.showPage?.("page-community");
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
  render() {
    const user = this.user;
    return html`<div class="community-shell profile-shell">
      <header class="community-heading">
        <div>
          <span class="eyebrow">YOUR ACCOUNT</span>
          <h1>Profile</h1>
        </div>
        <button
          class="community-button"
          @click=${() => window.showPage?.("page-community")}
        >
          ${user?.role === "admin" ? "Back to admin panel" : "Map studio"}
        </button>
      </header>
      ${this.error
        ? html`<p class="community-alert error" role="alert">${this.error}</p>`
        : nothing}
      ${user
        ? html`<section class="community-panel profile-identity">
              <span class="profile-avatar" aria-hidden="true"
                >${user.username.slice(0, 1).toUpperCase()}</span
              >
              <div>
                <h2>${user.username}</h2>
                <span class="status-tag"
                  >${user.role === "admin"
                    ? "Administrator · Management only"
                    : "Player & map creator"}</span
                >
                <p class="community-muted">
                  Joined ${accountDate(user.createdAt)}
                </p>
              </div>
            </section>
            ${this.data
              ? html`<div class="admin-stats profile-stats">
                  ${[
                    [this.data.submissions, "Maps submitted"],
                    [this.data.published, "Published maps"],
                    [this.data.pending, "Awaiting review"],
                    [this.data.sessions, "Signed-in sessions"],
                  ].map(
                    ([n, label]) =>
                      html`<div class="community-panel">
                        <strong>${n}</strong><span>${label}</span>
                      </div>`,
                  )}
                </div>`
              : nothing}
            <section class="community-panel">
              <h2>Account security</h2>
              <p class="community-muted">
                Changing your password signs out every device, including this
                one.
              </p>
              <form class="profile-password" @submit=${this.password}>
                <label
                  >Current password<input
                    name="current"
                    type="password"
                    autocomplete="current-password"
                    required
                    maxlength="128" /></label
                ><label
                  >New password<input
                    name="password"
                    type="password"
                    autocomplete="new-password"
                    minlength="8"
                    maxlength="128"
                    required /></label
                ><button
                  class="community-button primary"
                  ?disabled=${this.busy}
                >
                  Update password
                </button>
              </form>
            </section>
            <button
              class="community-button danger"
              ?disabled=${this.busy}
              @click=${async () => {
                this.busy = true;
                try {
                  await signOutCommunity();
                } catch (e) {
                  this.error = (e as Error).message;
                } finally {
                  this.busy = false;
                }
              }}
            >
              Sign out
            </button>`
        : html`<section class="community-panel">
            <p>Sign in to see your profile.</p>
            <button
              class="community-button primary"
              @click=${() => window.showPage?.("page-community")}
            >
              Sign in
            </button>
          </section>`}
    </div>`;
  }
}
