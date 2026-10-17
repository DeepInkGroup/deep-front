import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { z } from "zod";
import {
  CommunityMapSummary,
  CommunityUser,
  MapDraft,
  MapDraftSchema,
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
} from "@openfront/engine-api/game/CommunityMaps";
import {
  communityRequest,
  communityUser,
  reloadAccountHome,
  signOutCommunity,
} from "./Community";

const COLORS = ["#315a70", "#a9bb7d", "#b6a477", "#d3d0c2"];
function template(kind = "islands"): MapDraft {
  const tiles = Array(W * H).fill(0);
  if (kind !== "blank")
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const split =
          kind === "continents"
            ? Math.abs(x - 64 - 5 * Math.sin(y / 11)) > 3
            : true;
        const land =
          kind === "continents"
            ? x > 6 && x < 122 && y > 6 && y < 90
            : Math.hypot((x - 38) / 28, (y - 42) / 31) < 1 ||
              Math.hypot((x - 94) / 23, (y - 55) / 28) < 1;
        if (land && split)
          tiles[y * W + x] = Math.abs(Math.sin(x / 9 + y / 13)) < 0.12 ? 3 : 1;
      }
  return { name: "", description: "", scale: 8, tiles, nations: [] };
}
@customElement("community-page")
export class CommunityPage extends LitElement {
  @state() private user: CommunityUser | null = communityUser();
  @state() private signUp = false;
  @state() private busy = false;
  @state() private message = "";
  @state() private error = "";
  @state() private draft: MapDraft = template();
  @state() private tool = 1;
  @state() private brush = 4;
  @state() private nationName = "";
  @state() private maps: CommunityMapSummary[] = [];
  @state() private accounts: CommunityUser[] = [];
  @state() private selected: CommunityMapSummary | null = null;
  @state() private selectedDraft: MapDraft | null = null;
  @state() private filter = "pending";
  private painting = false;
  private dashboardTimer: ReturnType<typeof setInterval> | undefined;
  private undo: { tiles: number[]; nations: MapDraft["nations"] }[] = [];
  private lastPoint: { x: number; y: number } | null = null;
  createRenderRoot() {
    return this;
  }
  private onSession = () => {
    this.user = communityUser();
    void this.loadDashboard();
  };
  private onPage = (event: Event) => {
    if ((event as CustomEvent).detail === "page-community")
      void this.loadDashboard();
  };
  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("community-session", this.onSession);
    window.addEventListener("showPage", this.onPage);
    this.dashboardTimer = setInterval(() => {
      if (
        this.user &&
        !this.busy &&
        document.visibilityState === "visible" &&
        this.getClientRects().length
      )
        void this.loadDashboard();
    }, 10000);
    if (this.user) void this.loadDashboard();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("community-session", this.onSession);
    window.removeEventListener("showPage", this.onPage);
    clearInterval(this.dashboardTimer);
  }
  updated() {
    this.draw();
  }
  private key() {
    return `deepfront.map-draft.${this.user?.id}`;
  }
  private saveDraft() {
    try {
      localStorage.setItem(this.key(), JSON.stringify(this.draft));
    } catch {
      this.error =
        "Device storage is full. Publish your map or free some space before saving.";
    }
  }
  private restoreDraft() {
    try {
      const saved = localStorage.getItem(this.key());
      if (saved)
        this.draft = MapDraftSchema.extend({ name: z.string().max(60) }).parse(
          JSON.parse(saved),
        );
    } catch {
      this.error = "The saved draft could not be restored.";
    }
  }
  private loadedFor = "";
  private async loadDashboard() {
    if (!this.user) return;
    if (this.loadedFor !== this.user.id) {
      this.loadedFor = this.user.id;
      this.restoreDraft();
    }
    try {
      if (this.user.role === "admin") {
        const result = await communityRequest("/admin");
        this.maps = result.maps;
        this.accounts = result.users;
      } else this.maps = (await communityRequest("/my-maps")).maps;
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
  private async work(action: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      await action();
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }
  private auth = (event: SubmitEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    void this.work(async () => {
      const username = String(form.get("username")),
        password = String(form.get("password"));
      const result = await communityRequest(
        this.signUp ? "/signup" : "/login",
        { username, password },
      );
      if (result.user.role === "player")
        localStorage.setItem("username", result.user.username);
      reloadAccountHome();
    });
  };
  private remember() {
    this.undo.push({
      tiles: [...this.draft.tiles],
      nations: this.draft.nations.map((n) => ({ ...n })),
    });
    if (this.undo.length > 30) this.undo.shift();
  }
  private newTerrain(kind: string) {
    this.remember();
    this.draft = {
      ...template(kind),
      name: this.draft.name,
      description: this.draft.description,
      scale: this.draft.scale,
    };
    this.saveDraft();
  }
  private undoTerrain() {
    const previous = this.undo.pop();
    if (!previous) return;
    this.draft = {
      ...this.draft,
      tiles: previous.tiles,
      nations: previous.nations,
    };
    this.saveDraft();
  }
  private draw() {
    const canvas = this.querySelector<HTMLCanvasElement>(".terrain-editor");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = canvas.width / W;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = COLORS[this.draft.tiles[y * W + x]];
        ctx.fillRect(x * s, y * s, s, s);
      }
    ctx.strokeStyle = "#ffffff0a";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x * s, 0);
      ctx.lineTo(x * s, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y * s);
      ctx.lineTo(canvas.width, y * s);
      ctx.stroke();
    }
    for (const [i, n] of this.draft.nations.entries()) {
      ctx.fillStyle = "#ffe399";
      ctx.strokeStyle = "#122a24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((n.x + 0.5) * s, (n.y + 0.5) * s, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = "bold 10px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.strokeText(String(i + 1), (n.x + 0.5) * s + 6, (n.y + 0.5) * s - 4);
      ctx.fillText(String(i + 1), (n.x + 0.5) * s + 6, (n.y + 0.5) * s - 4);
    }
  }
  private point(event: PointerEvent) {
    const rect = (
      event.currentTarget as HTMLCanvasElement
    ).getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          W - 1,
          Math.floor(((event.clientX - rect.left) / rect.width) * W),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          H - 1,
          Math.floor(((event.clientY - rect.top) / rect.height) * H),
        ),
      ),
    };
  }
  private paint(x: number, y: number) {
    const radius = (this.brush - 1) / 2;
    for (
      let py = Math.max(0, Math.floor(y - radius));
      py <= Math.min(H - 1, Math.ceil(y + radius));
      py++
    )
      for (
        let px = Math.max(0, Math.floor(x - radius));
        px <= Math.min(W - 1, Math.ceil(x + radius));
        px++
      )
        if ((px - x) ** 2 + (py - y) ** 2 <= (radius + 0.5) ** 2)
          this.draft.tiles[py * W + px] = this.tool;
  }
  private pointerDown = (event: PointerEvent) => {
    if (this.busy || this.user?.role !== "player") return;
    event.preventDefault();
    const point = this.point(event);
    if (this.tool === 4) {
      if (!this.nationName.trim()) {
        this.error = "Enter a nation name, then click its spawn on land.";
        return;
      }
      if (this.draft.tiles[point.y * W + point.x] === 0) {
        this.error = "Place nation spawns on land.";
        return;
      }
      if (this.draft.nations.length >= 24) {
        this.error = "A map can have up to 24 named nations.";
        return;
      }
      this.draft = {
        ...this.draft,
        nations: [
          ...this.draft.nations,
          { ...point, name: this.nationName.trim() },
        ],
      };
      this.nationName = "";
      this.saveDraft();
      return;
    }
    this.error = "";
    this.remember();
    this.painting = true;
    this.lastPoint = point;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(
      event.pointerId,
    );
    this.paint(point.x, point.y);
    this.draw();
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.painting) return;
    const point = this.point(event),
      from = this.lastPoint || point;
    const steps = Math.max(
      Math.abs(point.x - from.x),
      Math.abs(point.y - from.y),
    );
    for (let i = 0; i <= steps; i++) {
      const ratio = steps ? i / steps : 0;
      this.paint(
        Math.round(from.x + (point.x - from.x) * ratio),
        Math.round(from.y + (point.y - from.y) * ratio),
      );
    }
    this.lastPoint = point;
    this.draw();
  };
  private pointerUp = () => {
    if (!this.painting) return;
    this.painting = false;
    this.lastPoint = null;
    this.draft = {
      ...this.draft,
      nations: this.draft.nations.filter(
        (n) => this.draft.tiles[n.y * W + n.x] !== 0,
      ),
    };
    this.saveDraft();
  };
  private publish = (event: SubmitEvent) => {
    event.preventDefault();
    this.saveDraft();
    void this.work(async () => {
      const draft = MapDraftSchema.parse(this.draft);
      await communityRequest("/maps", draft);
      await this.loadDashboard();
      this.message =
        "Map submitted. An administrator will review it before it appears in solo and multiplayer.";
    });
  };
  private async editCopy(map: CommunityMapSummary) {
    await this.work(async () => {
      const result = await communityRequest(`/maps/${map.id}/draft`);
      this.draft = {
        ...result.draft,
        name: (result.draft.name + " v2").slice(0, 60),
      };
      this.undo = [];
      this.saveDraft();
      this.querySelector(".map-workspace")?.scrollIntoView({
        behavior: "smooth",
      });
    });
  }
  private async selectReview(map: CommunityMapSummary) {
    await this.work(async () => {
      this.selected = map;
      this.selectedDraft = (
        await communityRequest(`/maps/${map.id}/draft`)
      ).draft;
      await this.updateComplete;
      this.querySelector(".review-detail")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }
  private review(action: "approve" | "reject") {
    if (!this.selected) return;
    const notes = (
      this.querySelector<HTMLTextAreaElement>("#review-notes")?.value || ""
    ).trim();
    void this.work(async () => {
      await communityRequest(`/admin/maps/${this.selected!.id}/review`, {
        action,
        notes,
      });
      await this.loadDashboard();
      this.selected = null;
      this.selectedDraft = null;
      this.message =
        action === "approve"
          ? "Map approved. It is now available in solo and multiplayer."
          : "Map rejected. Feedback has been sent to its creator.";
      window.dispatchEvent(new Event("community-maps-changed"));
    });
  }
  private security() {
    return html`<details class="account-security">
      <summary>Change password</summary>
      <form
        @submit=${(event: SubmitEvent) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget as HTMLFormElement);
          void this.work(async () => {
            await communityRequest("/password", {
              current: String(form.get("current")),
              password: String(form.get("password")),
            });
            reloadAccountHome();
          });
        }}
      >
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
            required
            minlength="8"
            maxlength="128" /></label
        ><button class="community-button" ?disabled=${this.busy}>
          Update password and sign out
        </button>
      </form>
    </details>`;
  }
  private authentication() {
    return html`<div class="community-intro">
        <span class="eyebrow">BUILT BY THE COMMUNITY</span>
        <h1>Create your next battlefield.</h1>
        <p>
          Paint a world of your own. Submit it for review, then share the
          battlefield with everyone.
        </p>
      </div>
      <div class="auth-layout">
        <div class="auth-story">
          <span class="editor-symbol" aria-hidden="true">◈</span>
          <h2>Your world. Everyone’s next campaign.</h2>
          <ol>
            <li>Draw coastlines, mountains and islands.</li>
            <li>Add nations and publish for review.</li>
            <li>Approved maps join solo and multiplayer.</li>
          </ol>
          <span class="community-muted"
            >An account is required to submit maps.</span
          >
        </div>
        <form class="community-panel auth-form" @submit=${this.auth}>
          <div class="community-tabs">
            <button
              type="button"
              aria-pressed=${!this.signUp}
              @click=${() => {
                this.signUp = false;
                this.error = "";
              }}
            >
              Sign in</button
            ><button
              type="button"
              aria-pressed=${this.signUp}
              @click=${() => {
                this.signUp = true;
                this.error = "";
              }}
            >
              Sign up
            </button>
          </div>
          <h2>${this.signUp ? "Join the map makers" : "Welcome back"}</h2>
          <label
            >Username<input
              name="username"
              autocomplete="username"
              minlength="3"
              maxlength="24"
              pattern="[A-Za-z0-9_]+"
              required
              placeholder="Your username" /></label
          ><label
            >Password<input
              name="password"
              type="password"
              autocomplete=${this.signUp ? "new-password" : "current-password"}
              minlength="8"
              maxlength="128"
              required
              placeholder="At least 8 characters" /></label
          ><button class="community-button primary" ?disabled=${this.busy}>
            ${this.busy
              ? "Please wait…"
              : this.signUp
                ? "Create account"
                : "Sign in"}
          </button>
          <p class="community-muted">
            ${this.signUp
              ? "Use 3–24 letters, numbers or underscores for your username."
              : "Sign in to create maps and check your submissions."}
          </p>
        </form>
      </div>`;
  }
  private editor() {
    return html`<form class="map-workspace" @submit=${this.publish}>
        <div class="community-panel map-details">
          <h2>Map details</h2>
          <label
            >Map name<input
              maxlength="60"
              minlength="3"
              required
              .value=${this.draft.name}
              @input=${(e: Event) => {
                this.draft = {
                  ...this.draft,
                  name: (e.target as HTMLInputElement).value,
                };
                this.saveDraft();
              }}
              placeholder="Give your world a name" /></label
          ><label
            >Description<textarea
              maxlength="600"
              rows="3"
              .value=${this.draft.description}
              @input=${(e: Event) => {
                this.draft = {
                  ...this.draft,
                  description: (e.target as HTMLTextAreaElement).value,
                };
                this.saveDraft();
              }}
              placeholder="What makes this battlefield special?"
            ></textarea></label
          ><label
            >Map size<select
              .value=${String(this.draft.scale)}
              @change=${(e: Event) => {
                this.draft = {
                  ...this.draft,
                  scale: Number((e.target as HTMLSelectElement).value) as
                    | 8
                    | 12,
                };
                this.saveDraft();
              }}
            >
              <option value="8">Standard · 1024 × 768</option>
              <option value="12">Large · 1536 × 1152</option>
            </select></label
          >
          <div class="draft-actions">
            <button
              type="button"
              class="community-button"
              @click=${() => {
                this.saveDraft();
                this.message = "Draft saved on this device.";
              }}
            >
              Save draft</button
            ><button class="community-button primary" ?disabled=${this.busy}>
              ${this.busy ? "Submitting…" : "Publish for review"}
            </button>
          </div>
          <p class="community-muted">
            Drafts save on this device. Only approved submissions appear in the
            game.
          </p>
        </div>
        <div class="community-panel terrain-panel">
          <div class="editor-toolbar">
            <div role="group" aria-label="Terrain brush">
              ${["Water", "Plains", "Hills", "Mountains", "Nation spawn"].map(
                (name, type) =>
                  html`<button
                    type="button"
                    aria-pressed=${this.tool === type}
                    @click=${() => (this.tool = type)}
                  >
                    <span
                      class="terrain-swatch"
                      style=${`background:${COLORS[type] || "#ffe399"}`}
                    ></span
                    >${name}
                  </button>`,
              )}
            </div>
            <label
              >Brush size<select
                aria-label="Brush size"
                .value=${String(this.brush)}
                @change=${(e: Event) =>
                  (this.brush = Number((e.target as HTMLSelectElement).value))}
              >
                ${[1, 4, 8, 12].map(
                  (n) =>
                    html`<option value=${n}>
                      ${n} ${n === 1 ? "cell" : "cells"}
                    </option>`,
                )}
              </select></label
            >
          </div>
          ${this.tool === 4
            ? html`<label
                >Nation name<input
                  maxlength="40"
                  .value=${this.nationName}
                  @input=${(e: Event) =>
                    (this.nationName = (e.target as HTMLInputElement).value)}
                  placeholder="Name a nation, then click the map"
              /></label>`
            : nothing}<canvas
            class="terrain-editor"
            width="768"
            height="576"
            aria-label="Map terrain editor. Drag to paint terrain."
            @pointerdown=${this.pointerDown}
            @pointermove=${this.pointerMove}
            @pointerup=${this.pointerUp}
            @pointercancel=${this.pointerUp}
          ></canvas>
          <div class="editor-bottom">
            <span class="community-muted"
              >Drag to paint · ${W} × ${H} editable cells</span
            ><button
              type="button"
              class="community-button small"
              ?disabled=${!this.undo.length}
              @click=${() => this.undoTerrain()}
            >
              Undo
            </button>
          </div>
          <div class="template-actions">
            <span>Start with</span>${["islands", "continents", "blank"].map(
              (kind) =>
                html`<button
                  type="button"
                  class="community-button small"
                  @click=${() => this.newTerrain(kind)}
                >
                  ${kind[0].toUpperCase() + kind.slice(1)}
                </button>`,
            )}
          </div>
          ${this.draft.nations.length
            ? html`<ul class="nation-list">
                ${this.draft.nations.map(
                  (n, i) =>
                    html`<li>
                      <span>${i + 1}. ${n.name}</span
                      ><button
                        type="button"
                        aria-label=${`Remove ${n.name}`}
                        @click=${() => {
                          this.draft = {
                            ...this.draft,
                            nations: this.draft.nations.filter(
                              (_, index) => index !== i,
                            ),
                          };
                          this.saveDraft();
                        }}
                      >
                        ×
                      </button>
                    </li>`,
                )}
              </ul>`
            : nothing}
        </div>
      </form>
      <section class="community-panel submissions">
        <div class="section-title">
          <h2>Your submissions</h2>
          <button
            type="button"
            class="community-button small"
            @click=${() => void this.loadDashboard()}
          >
            Refresh
          </button>
        </div>
        ${this.maps.length
          ? this.mapList(this.maps, false)
          : html`<p class="community-muted">
              Your submitted maps and review feedback will appear here.
            </p>`}
      </section>`;
  }
  private mapList(list: CommunityMapSummary[], admin: boolean) {
    return html`<div class="submission-grid">
      ${list.map(
        (map) =>
          html`<article class="submission-card">
            <img
              src=${`/api/community/maps/${map.id}/${map.status === "approved" || map.status === "withdrawn" ? "thumbnail.svg" : "preview"}`}
              alt=${map.name}
              loading="lazy"
            />
            <div>
              <span class=${`status-tag status-${map.status}`}
                >${map.status}</span
              >
              <h3>${map.name}</h3>
              <p class="community-muted">
                ${map.author} · ${map.width} × ${map.height}
              </p>
              <p>${map.description}</p>
              ${map.notes
                ? html`<p class="review-feedback">
                    <strong>Review:</strong> ${map.notes}
                  </p>`
                : nothing}<button
                class="community-button small"
                type="button"
                ?disabled=${this.busy}
                @click=${() =>
                  admin ? void this.selectReview(map) : void this.editCopy(map)}
              >
                ${admin ? "Review details" : "Edit a copy"}</button
              >${admin && map.status === "approved"
                ? html`<button
                    class="community-button small danger"
                    type="button"
                    ?disabled=${this.busy}
                    @click=${() =>
                      void this.work(async () => {
                        await communityRequest(
                          `/admin/maps/${map.id}/withdraw`,
                          {},
                        );
                        await this.loadDashboard();
                        this.selected = null;
                        this.message =
                          "Map unpublished. Existing games can still load its files.";
                        window.dispatchEvent(
                          new Event("community-maps-changed"),
                        );
                      })}
                  >
                    Unpublish
                  </button>`
                : nothing}
            </div>
          </article>`,
      )}
    </div>`;
  }
  private admin() {
    const pending = this.maps.filter((m) => m.status === "pending").length;
    const list = this.maps.filter(
      (m) => this.filter === "all" || m.status === this.filter,
    );
    return html`<div class="admin-stats">
        <div class="community-panel">
          <strong>${pending}</strong><span>Awaiting review</span>
        </div>
        <div class="community-panel">
          <strong
            >${this.maps.filter((m) => m.status === "approved").length}</strong
          ><span>Published maps</span>
        </div>
        <div class="community-panel">
          <strong
            >${this.accounts.filter((u) => u.role === "player").length}</strong
          ><span>Player accounts</span>
        </div>
      </div>
      <section class="community-panel">
        <div class="section-title">
          <h2>Map review queue</h2>
          <button
            class="community-button small"
            @click=${() => void this.loadDashboard()}
          >
            Refresh
          </button>
        </div>
        <div class="community-tabs">
          ${["pending", "approved", "rejected", "all"].map(
            (status) =>
              html`<button
                aria-pressed=${this.filter === status}
                @click=${() => (this.filter = status)}
              >
                ${status[0].toUpperCase() + status.slice(1)}
              </button>`,
          )}
        </div>
        ${list.length
          ? this.mapList(list, true)
          : html`<p class="community-empty">
              No ${this.filter === "all" ? "submitted" : this.filter} maps.
            </p>`}
      </section>
      ${this.selected && this.selectedDraft
        ? html`<section class="community-panel review-detail">
            <div class="section-title">
              <div>
                <span class="eyebrow">MAP REVIEW</span>
                <h2>${this.selected.name}</h2>
              </div>
              <button
                class="community-button small"
                @click=${() => {
                  this.selected = null;
                  this.selectedDraft = null;
                }}
              >
                Close review
              </button>
            </div>
            <img
              class="review-preview"
              src=${`/api/community/maps/${this.selected.id}/preview`}
              alt=${`Review ${this.selected.name}`}
            />
            <p>${this.selected.description}</p>
            <p class="community-muted">
              Submitted by ${this.selected.author} · ${this.selected.width} ×
              ${this.selected.height} · ${this.selectedDraft.nations.length}
              nation spawns
            </p>
            ${this.selectedDraft.nations.length
              ? html`<p>
                  ${this.selectedDraft.nations.map((n) => n.name).join(" · ")}
                </p>`
              : nothing}${this.selected.status === "pending"
              ? html`<label
                    >Review feedback<textarea
                      id="review-notes"
                      rows="3"
                      maxlength="600"
                      placeholder="Explain any changes the creator should make."
                    ></textarea>
                  </label>
                  <div class="review-actions">
                    <button
                      class="community-button primary"
                      ?disabled=${this.busy}
                      @click=${() => this.review("approve")}
                    >
                      Approve and publish</button
                    ><button
                      class="community-button danger"
                      ?disabled=${this.busy}
                      @click=${() => this.review("reject")}
                    >
                      Reject with feedback
                    </button>
                  </div>`
              : html`<p class="community-muted">
                  This submission is ${this.selected.status}.
                </p>`}
          </section>`
        : nothing}
      <section class="community-panel">
        <h2>Accounts</h2>
        <div class="account-list">
          ${this.accounts.map(
            (account) =>
              html`<div>
                <span
                  ><strong>${account.username}</strong
                  ><small
                    >${account.role}${account.disabled
                      ? " · disabled"
                      : ""}</small
                  ></span
                >${account.role === "player"
                  ? html`<button
                      class="community-button small"
                      ?disabled=${this.busy}
                      @click=${() =>
                        void this.work(async () => {
                          await communityRequest(`/admin/users/${account.id}`, {
                            disabled: !account.disabled,
                          });
                          await this.loadDashboard();
                          this.message = "Account updated.";
                        })}
                    >
                      ${account.disabled ? "Enable account" : "Disable account"}
                    </button>`
                  : html`<span class="community-muted">Management only</span>`}
              </div>`,
          )}
        </div>
      </section>`;
  }
  render() {
    return html`<div class="community-shell">
      ${this.user
        ? html`<header class="community-heading">
            <div>
              <span class="eyebrow"
                >${this.user.role === "admin"
                  ? "SERVER MANAGEMENT"
                  : "COMMUNITY MAP STUDIO"}</span
              >
              <h1>
                ${this.user.role === "admin"
                  ? "Admin panel"
                  : "Build a world worth conquering."}
              </h1>
              <p>
                ${this.user.role === "admin"
                  ? "Review maps and manage accounts. This account cannot play games."
                  : `Signed in as ${this.user.username}. Create, submit, and track your maps.`}
              </p>
            </div>
            <button
              class="community-button"
              ?disabled=${this.busy}
              @click=${() => void this.work(() => signOutCommunity())}
            >
              Sign out
            </button>
          </header>`
        : nothing}${this.error
        ? html`<div class="community-alert error" role="alert">
            ${this.error}
          </div>`
        : nothing}${this.message
        ? html`<div class="community-alert" role="status">${this.message}</div>`
        : nothing}${!this.user
        ? this.authentication()
        : this.user.role === "admin"
          ? this.admin()
          : this.editor()}${this.user ? this.security() : nothing}
    </div>`;
  }
}
