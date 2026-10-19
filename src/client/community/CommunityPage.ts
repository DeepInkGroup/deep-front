import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { z } from "zod";
import {
  CommunityMapSummary,
  CommunityUser,
  CommunityAdminData,
  CommunityAdminUser,
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
import { blankDraft, terrainStats } from "./MapDesign";
import {
  paintBrush,
  paintShape,
  type PaintMode,
  type EditorPoint,
} from "./MapEditorTools";
import { accountDate } from "./ProfilePage";

const COLORS = ["#315a70", "#a9bb7d", "#b6a477", "#d3d0c2"];
@customElement("community-page")
export class CommunityPage extends LitElement {
  @state() private user: CommunityUser | null = communityUser();
  @state() private signUp = false;
  @state() private busy = false;
  @state() private message = "";
  @state() private error = "";
  @state() private draft: MapDraft = blankDraft();
  @state() private zoom = 1;
  @state() private mapFullscreen = false;
  @state() private grid = false;
  @state() private paintMode: PaintMode = "brush";
  @state() private squareBrush = false;
  @state() private tool = 1;
  @state() private brush = 4;
  @state() private spawnCount = 8;
  @state() private nationName = "";
  @state() private maps: CommunityMapSummary[] = [];
  @state() private accounts: CommunityAdminUser[] = [];
  @state() private dashboard: CommunityAdminData | null = null;
  @state() private mapSearch = "";
  @state() private accountSearch = "";
  @state() private accountFilter = "all";
  @state() private mapSort = "newest";
  @state() private selected: CommunityMapSummary | null = null;
  @state() private selectedDraft: MapDraft | null = null;
  @state() private filter = "pending";
  private painting = false;
  private hoverPoint: EditorPoint | null = null;
  private shapeStart: EditorPoint | null = null;
  private shapeBase: number[] | null = null;
  private spaceHeld = false;
  private pan: { x: number; y: number; left: number; top: number } | null =
    null;
  private dashboardTimer: ReturnType<typeof setInterval> | undefined;
  private undo: { tiles: number[]; nations: MapDraft["nations"] }[] = [];
  private redo: { tiles: number[]; nations: MapDraft["nations"] }[] = [];
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
  private onFullscreenChange = () => {
    this.mapFullscreen =
      document.fullscreenElement ===
      this.querySelector<HTMLElement>(".terrain-panel");
  };
  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("community-session", this.onSession);
    window.addEventListener("showPage", this.onPage);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    window.addEventListener("keydown", this.editorKeyDown);
    window.addEventListener("keyup", this.editorKeyUp);
    window.addEventListener("blur", this.editorKeyUp);
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
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    window.removeEventListener("keydown", this.editorKeyDown);
    window.removeEventListener("keyup", this.editorKeyUp);
    window.removeEventListener("blur", this.editorKeyUp);
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
        const result = await communityRequest<CommunityAdminData>("/admin");
        this.dashboard = result;
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
    this.redo = [];
    this.undo.push({
      tiles: [...this.draft.tiles],
      nations: this.draft.nations.map((n) => ({ ...n })),
    });
    if (this.undo.length > 30) this.undo.shift();
  }
  private undoTerrain() {
    const previous = this.undo.pop();
    if (!previous) return;
    this.redo.push({
      tiles: [...this.draft.tiles],
      nations: this.draft.nations.map((n) => ({ ...n })),
    });
    this.draft = {
      ...this.draft,
      tiles: previous.tiles,
      nations: previous.nations,
    };
    this.saveDraft();
  }
  private redoTerrain() {
    const next = this.redo.pop();
    if (!next) return;
    this.undo.push({
      tiles: [...this.draft.tiles],
      nations: this.draft.nations.map((n) => ({ ...n })),
    });
    this.draft = { ...this.draft, ...next };
    this.saveDraft();
  }
  private clearMapToWater() {
    this.remember();
    this.draft = {
      ...this.draft,
      tiles: Array(W * H).fill(0),
      nations: [],
    };
    this.error = "";
    this.message = "Map cleared to blank water. Use Undo to restore it.";
    this.saveDraft();
  }
  private async toggleMapFullscreen() {
    const panel = this.querySelector<HTMLElement>(".terrain-panel");
    if (!panel) return;
    try {
      if (document.fullscreenElement === panel) await document.exitFullscreen();
      else await panel.requestFullscreen();
    } catch {
      this.error = "Full screen mode is unavailable in this browser.";
    }
  }
  private randomizeNationSpawns() {
    const candidates = this.draft.tiles.flatMap((terrain, index) =>
      terrain === 0 ? [] : [index],
    );
    if (candidates.length === 0) {
      this.error = "Paint some land first, then randomize the nation spawns.";
      this.message = "";
      return;
    }

    const target = Math.min(this.spawnCount, candidates.length);
    const selected = [
      candidates[Math.floor(Math.random() * candidates.length)],
    ];
    while (selected.length < target) {
      let best = -1;
      let bestDistance = -1;
      let ties = 0;
      for (const candidate of candidates) {
        if (selected.includes(candidate)) continue;
        const x = candidate % W;
        const y = Math.floor(candidate / W);
        let nearest = Number.POSITIVE_INFINITY;
        for (const chosen of selected) {
          const dx = x - (chosen % W);
          const dy = y - Math.floor(chosen / W);
          nearest = Math.min(nearest, dx * dx + dy * dy);
        }
        if (nearest > bestDistance) {
          best = candidate;
          bestDistance = nearest;
          ties = 1;
        } else if (nearest === bestDistance && Math.random() < 1 / ++ties) {
          best = candidate;
        }
      }
      if (best < 0) break;
      selected.push(best);
    }

    this.remember();
    this.draft = {
      ...this.draft,
      nations: selected.map((index, i) => ({
        x: index % W,
        y: Math.floor(index / W),
        name: `Nation ${i + 1}`,
      })),
    };
    this.error = "";
    this.message =
      selected.length < this.spawnCount
        ? `Added ${selected.length} spawns; the map has fewer land cells than requested.`
        : `Added ${selected.length} random nation spawns.`;
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
        const terrain = this.draft.tiles[y * W + x];
        const adjacent = (dx: number, dy: number) =>
          x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H
            ? this.draft.tiles[(y + dy) * W + x + dx]
            : 0;
        const shore =
          terrain === 0 &&
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => adjacent(dx, dy) > 0);
        ctx.fillStyle =
          terrain === 0 ? (shore ? "#32758b" : "#173d59") : COLORS[terrain];
        ctx.fillRect(x * s, y * s, s, s);
        if (terrain > 0) {
          const grain = ((x * 17 + y * 31) % 11) / 11;
          ctx.fillStyle = grain > 0.5 ? "#ffffff09" : "#00000008";
          ctx.fillRect(x * s, y * s, s, s);
          ctx.strokeStyle = "#e0ce93";
          ctx.lineWidth = Math.max(1, s * 0.22);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (adjacent(dx, dy) === 0) {
              ctx.beginPath();
              if (dx) {
                const px = (x + (dx > 0 ? 1 : 0)) * s;
                ctx.moveTo(px, y * s);
                ctx.lineTo(px, (y + 1) * s);
              } else {
                const py = (y + (dy > 0 ? 1 : 0)) * s;
                ctx.moveTo(x * s, py);
                ctx.lineTo((x + 1) * s, py);
              }
              ctx.stroke();
            }
        }
      }
    ctx.strokeStyle = "#ffffff0a";
    ctx.lineWidth = 1;
    for (let x = 0; this.grid && x <= W; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x * s, 0);
      ctx.lineTo(x * s, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; this.grid && y <= H; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y * s);
      ctx.lineTo(canvas.width, y * s);
      ctx.stroke();
    }
    if (this.hoverPoint && this.tool !== 7 && this.tool !== 4) {
      const p = this.hoverPoint,
        r = ((this.tool === 6 ? 1 : this.brush) * s) / 2;
      ctx.strokeStyle = "#ffffffcc";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      if (this.squareBrush)
        ctx.rect((p.x + 0.5) * s - r, (p.y + 0.5) * s - r, r * 2, r * 2);
      else ctx.arc((p.x + 0.5) * s, (p.y + 0.5) * s, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
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
    paintBrush(
      this.draft.tiles,
      { x, y },
      this.tool === 6 ? 0 : this.tool,
      this.tool === 6 ? 1 : this.brush,
      this.squareBrush,
    );
  }
  private editorKeyDown = (event: KeyboardEvent) => {
    if (
      !this.getClientRects().length ||
      (event.target as HTMLElement)?.closest(
        "input,textarea,select,[contenteditable]",
      )
    )
      return;
    if (event.code === "Space") {
      event.preventDefault();
      this.spaceHeld = true;
      return;
    }
    if (this.painting) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? this.redoTerrain() : this.undoTerrain();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const modes: Record<string, PaintMode> = {
      b: "brush",
      f: "fill",
      l: "line",
      r: "rectangle",
      e: "ellipse",
    };
    const mode = modes[event.key.toLowerCase()];
    if (mode) {
      this.paintMode = mode;
      event.preventDefault();
    }
  };
  private editorKeyUp = () => {
    this.spaceHeld = false;
  };
  private zoomAt = async (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const viewport = event.currentTarget as HTMLElement;
    const rect = viewport.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const old = this.zoom,
      next = Math.max(0.25, Math.min(4, old * (event.deltaY < 0 ? 1.25 : 0.8)));
    const left = ((viewport.scrollLeft + x) * next) / old - x,
      top = ((viewport.scrollTop + y) * next) / old - y;
    this.zoom = Number(next.toFixed(3));
    await this.updateComplete;
    viewport.scrollLeft = left;
    viewport.scrollTop = top;
  };
  private pointerLeave = () => {
    if (!this.painting && !this.pan) {
      this.hoverPoint = null;
      this.draw();
    }
  };
  private pointerCancel = () => {
    if (this.shapeBase) this.draft = { ...this.draft, tiles: this.shapeBase };
    this.pan = null;
    this.painting = false;
    this.shapeBase = null;
    this.shapeStart = null;
    this.lastPoint = null;
    this.draw();
  };
  private fillTerrain(x: number, y: number) {
    const original = this.draft.tiles[y * W + x];
    if (original === this.tool) return;
    const queue = [y * W + x];
    this.draft.tiles[queue[0]] = this.tool;
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i],
        px = t % W,
        py = Math.floor(t / W);
      const visit = (n: number) => {
        if (this.draft.tiles[n] === original) {
          this.draft.tiles[n] = this.tool;
          queue.push(n);
        }
      };
      if (px > 0) visit(t - 1);
      if (px < W - 1) visit(t + 1);
      if (py > 0) visit(t - W);
      if (py < H - 1) visit(t + W);
    }
  }
  private pointerDown = (event: PointerEvent) => {
    if (this.busy || this.user?.role !== "player") return;
    event.preventDefault();
    if (event.button === 1 || this.spaceHeld || this.tool === 7) {
      const viewport = this.querySelector<HTMLElement>(".terrain-viewport")!;
      this.pan = {
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      (event.currentTarget as HTMLCanvasElement).setPointerCapture(
        event.pointerId,
      );
      return;
    }
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
      this.remember();
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
    if (this.paintMode === "fill" && this.tool < 4) {
      this.fillTerrain(point.x, point.y);
      this.draft = {
        ...this.draft,
        nations: this.draft.nations.filter(
          (n) => this.draft.tiles[n.y * W + n.x] !== 0,
        ),
      };
      this.saveDraft();
      return;
    }
    this.painting = true;
    this.shapeStart = point;
    this.shapeBase = [...this.draft.tiles];
    this.lastPoint = point;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(
      event.pointerId,
    );
    this.paint(point.x, point.y);
    this.draw();
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.pan) {
      const viewport = this.querySelector<HTMLElement>(".terrain-viewport")!;
      viewport.scrollLeft = this.pan.left + this.pan.x - event.clientX;
      viewport.scrollTop = this.pan.top + this.pan.y - event.clientY;
      return;
    }
    this.hoverPoint = this.point(event);
    if (!this.painting) {
      this.draw();
      return;
    }
    if (
      this.shapeBase &&
      this.shapeStart &&
      this.paintMode !== "brush" &&
      this.paintMode !== "fill"
    ) {
      this.draft.tiles = [...this.shapeBase];
      paintShape(
        this.draft.tiles,
        this.shapeStart,
        this.hoverPoint,
        this.paintMode,
        this.tool === 6 ? 0 : this.tool,
        this.tool === 6 ? 1 : this.brush,
        this.squareBrush,
      );
      this.draw();
      return;
    }
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
    if (this.pan) {
      this.pan = null;
      return;
    }
    if (!this.painting) return;
    this.shapeBase = null;
    this.shapeStart = null;
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
      this.redo = [];
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
            <li>Shape coastlines, plains, hills and rivers.</li>
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
    const stats = terrainStats(this.draft);
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
              aria-label="Map size"
              .value=${String(this.draft.scale)}
              @change=${(e: Event) => {
                this.draft = {
                  ...this.draft,
                  scale: Number((e.target as HTMLSelectElement).value) as
                    | 8
                    | 12
                    | 16
                    | 24
                    | 32,
                };
                this.saveDraft();
              }}
            >
              <option value="8" ?selected=${this.draft.scale === 8}>
                Standard · 1024 × 768
              </option>
              <option value="12" ?selected=${this.draft.scale === 12}>
                Large · 1536 × 1152
              </option>
              <option value="16" ?selected=${this.draft.scale === 16}>
                Grand · 2048 × 1536
              </option>
              <option value="24" ?selected=${this.draft.scale === 24}>
                Massive · 3072 × 2304
              </option>
              <option value="32" ?selected=${this.draft.scale === 32}>
                Titan · 4096 × 3072
              </option>
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
              ${this.busy ? "Submitting…" : "Publish for review"}</button
            ><button
              type="button"
              class="community-button"
              @click=${() => this.clearMapToWater()}
            >
              Start with blank water
            </button>
          </div>
          <p class="community-muted">
            Drafts save on this device. Only approved submissions appear in the
            game.
          </p>
        </div>
        <div class="community-panel terrain-panel">
          <div class="studio-canvas-heading">
            <div>
              <span class="studio-eyebrow">WORLD BUILDER</span>
              <h2>${this.draft.name || "Your blank canvas"}</h2>
            </div>
            <span class="studio-live-badge">Local draft</span>
          </div>
          <div class="map-metrics" aria-label="Map statistics">
            <span
              ><strong
                >${W * this.draft.scale} × ${H * this.draft.scale}</strong
              >
              world size</span
            ><span><strong>${stats.landPercent}%</strong> land</span
            ><span
              ><strong>${this.draft.nations.length}/24</strong> nations</span
            >
          </div>
          <div class="editor-toolbar">
            <div role="group" aria-label="Terrain brush">
              ${[
                { name: "Water", type: 0 },
                { name: "Plains", type: 1 },
                { name: "Hills", type: 2 },
                { name: "Nation spawn", type: 4 },
                { name: "River / canal", type: 6 },
                { name: "Pan", type: 7 },
              ].map(
                ({ name, type }) =>
                  html`<button
                    type="button"
                    aria-pressed=${this.tool === type}
                    @click=${() => (this.tool = type)}
                  >
                    <span
                      class="terrain-swatch"
                      style=${`background:${COLORS[type === 6 ? 0 : type] || "#ffe399"}`}
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
                    html`<option value=${n} ?selected=${this.brush === n}>
                      ${n} ${n === 1 ? "cell" : "cells"}
                    </option>`,
                )}
              </select></label
            >
          </div>
          <div class="editor-view-controls">
            <label
              >Paint mode<select
                aria-label="Paint mode"
                .value=${this.paintMode}
                @change=${(e: Event) =>
                  (this.paintMode = (e.target as HTMLSelectElement)
                    .value as PaintMode)}
              >
                <option value="brush">Brush</option>
                <option value="fill">Fill connected terrain</option>
                <option value="line">Line</option>
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse / island</option>
              </select></label
            ><label
              >Brush shape<select
                aria-label="Brush shape"
                .value=${this.squareBrush ? "square" : "round"}
                @change=${(e: Event) =>
                  (this.squareBrush =
                    (e.target as HTMLSelectElement).value === "square")}
              >
                <option value="round">Round</option>
                <option value="square">Square</option>
              </select></label
            >
            <label
              >Zoom <span>${Math.round(this.zoom * 100)}%</span
              ><input
                aria-label="Editor zoom"
                type="range"
                min="0.25"
                max="4"
                step="0.05"
                .value=${String(this.zoom)}
                @input=${(e: Event) =>
                  (this.zoom = Number((e.target as HTMLInputElement).value))}
            /></label>
            <button
              type="button"
              class="community-button small"
              @click=${() => (this.zoom = 16 / this.draft.scale)}
            >
              Fit canvas
            </button>
            <label class="grid-toggle"
              ><input
                type="checkbox"
                .checked=${this.grid}
                @change=${(e: Event) =>
                  (this.grid = (e.target as HTMLInputElement).checked)}
              />
              Grid</label
            ><button
              type="button"
              class="community-button small fullscreen-map-button"
              aria-label=${this.mapFullscreen
                ? "Exit full screen map"
                : "Show map full screen"}
              @click=${() => void this.toggleMapFullscreen()}
            >
              ${this.mapFullscreen ? "Exit full screen" : "Full screen map"}
            </button>
          </div>
          <div class="spawn-randomizer">
            <label
              >Nation spawns<select
                aria-label="Number of random nation spawns"
                .value=${String(this.spawnCount)}
                @change=${(e: Event) =>
                  (this.spawnCount = Number(
                    (e.target as HTMLSelectElement).value,
                  ))}
              >
                ${Array.from({ length: 12 }, (_, i) => (i + 1) * 2).map(
                  (count) =>
                    html`<option
                      value=${count}
                      ?selected=${this.spawnCount === count}
                    >
                      ${count} nations
                    </option>`,
                )}
              </select></label
            ><button
              type="button"
              class="community-button small"
              @click=${() => this.randomizeNationSpawns()}
            >
              Randomize spawns
            </button>
            <span class="community-muted"
              >Replaces current spawns and spreads them across land.</span
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
            : nothing}
          <div
            class="terrain-viewport"
            tabindex="0"
            aria-label="Map canvas. Scroll to pan when zoomed."
            @wheel=${this.zoomAt}
          >
            <canvas
              class="terrain-editor"
              style=${this.mapFullscreen
                ? `height:${(this.zoom * this.draft.scale * 100) / 16}%;width:auto;max-width:none`
                : `width:${(this.zoom * this.draft.scale * 100) / 16}%;max-width:none`}
              width="1024"
              height="768"
              aria-label="Map terrain editor. Drag to paint terrain."
              @pointerdown=${this.pointerDown}
              @pointermove=${this.pointerMove}
              @pointerup=${this.pointerUp}
              @pointercancel=${this.pointerCancel}
              @pointerleave=${this.pointerLeave}
            ></canvas>
          </div>
          <div class="editor-bottom">
            <span class="community-muted"
              >Drag to paint · Space + drag to pan · Ctrl + scroll to zoom</span
            ><button
              type="button"
              class="community-button small"
              ?disabled=${!this.undo.length}
              @click=${() => this.undoTerrain()}
            >
              Undo
            </button>
            <button
              type="button"
              class="community-button small"
              ?disabled=${!this.redo.length}
              @click=${() => this.redoTerrain()}
            >
              Redo
            </button>
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
                          this.remember();
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
              <p class="community-muted">
                Submitted
                ${accountDate(map.createdAt)}${map.reviewedAt
                  ? ` · Reviewed ${accountDate(map.reviewedAt)}`
                  : ""}
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
              ${admin && map.status === "withdrawn"
                ? html`<button
                    class="community-button small"
                    ?disabled=${this.busy}
                    @click=${() =>
                      void this.work(async () => {
                        await communityRequest(
                          `/admin/maps/${map.id}/republish`,
                          {},
                        );
                        await this.loadDashboard();
                        this.message = "Map republished.";
                        window.dispatchEvent(
                          new Event("community-maps-changed"),
                        );
                      })}
                  >
                    Republish
                  </button>`
                : nothing}
            </div>
          </article>`,
      )}
    </div>`;
  }
  private admin() {
    const stats = this.dashboard?.stats;
    const list = this.maps
      .filter(
        (m) =>
          (this.filter === "all" || m.status === this.filter) &&
          `${m.name} ${m.author} ${m.description} ${m.id}`
            .toLowerCase()
            .includes(this.mapSearch.toLowerCase().trim()),
      )
      .sort((a, b) =>
        this.mapSort === "oldest"
          ? a.createdAt - b.createdAt
          : this.mapSort === "largest"
            ? b.width * b.height - a.width * a.height
            : b.createdAt - a.createdAt,
      );
    const accounts = this.accounts.filter(
      (u) =>
        `${u.username} ${u.id}`
          .toLowerCase()
          .includes(this.accountSearch.toLowerCase().trim()) &&
        (this.accountFilter === "all" ||
          (this.accountFilter === "disabled"
            ? u.disabled
            : this.accountFilter === "active"
              ? u.sessions > 0
              : u.submissions > 0)),
    );
    return html`<div class="admin-stats">
        ${[
          [stats?.pending ?? 0, "Awaiting review"],
          [stats?.approved ?? 0, "Published maps"],
          [stats?.accounts ?? 0, "Player accounts"],
          [stats?.sessions ?? 0, "Signed-in sessions"],
          [stats?.disabled ?? 0, "Disabled accounts"],
          [
            `${((stats?.assetBytes ?? 0) / 1048576).toFixed(1)} MB`,
            "Stored map assets",
          ],
        ].map(
          ([n, label]) =>
            html`<div class="community-panel">
              <strong>${n}</strong><span>${label}</span>
            </div>`,
        )}
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
        <div class="admin-filters">
          <label
            >Search maps<input
              type="search"
              placeholder="Name, creator or map ID"
              .value=${this.mapSearch}
              @input=${(e: Event) =>
                (this.mapSearch = (
                  e.target as HTMLInputElement
                ).value)} /></label
          ><label
            >Sort maps<select
              .value=${this.mapSort}
              @change=${(e: Event) =>
                (this.mapSort = (e.target as HTMLSelectElement).value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="largest">Largest first</option>
            </select></label
          >
        </div>
        <div class="community-tabs">
          ${["pending", "approved", "rejected", "withdrawn", "all"].map(
            (status) =>
              html`<button
                aria-pressed=${this.filter === status}
                @click=${() => (this.filter = status)}
              >
                ${status[0].toUpperCase() + status.slice(1)}
                ${status === "all"
                  ? this.maps.length
                  : (stats?.[
                      status as
                        | "pending"
                        | "approved"
                        | "rejected"
                        | "withdrawn"
                    ] ?? 0)}
              </button>`,
          )}
        </div>
        <p class="community-muted">
          Showing ${list.length} of ${this.maps.length} loaded maps (latest
          1,000). Dashboard totals include every record. Sessions count
          signed-in devices, including admin, rather than players currently in a
          game.
        </p>
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
            <dl class="review-metadata">
              <div>
                <dt>Map ID</dt>
                <dd>${this.selected.id}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>${accountDate(this.selected.createdAt)}</dd>
              </div>
              <div>
                <dt>Reviewed</dt>
                <dd>
                  ${this.selected.reviewedAt
                    ? accountDate(this.selected.reviewedAt)
                    : "Awaiting review"}
                </dd>
              </div>
              <div>
                <dt>Terrain</dt>
                <dd>
                  ${terrainStats(this.selectedDraft).landPercent}% land ·
                  ${terrainStats(this.selectedDraft).landTiles.toLocaleString()}
                  approximate land tiles
                </dd>
              </div>
              <div>
                <dt>Elevation</dt>
                <dd>
                  ${Math.round(
                    (terrainStats(this.selectedDraft).cells[2] / (W * H)) * 100,
                  )}%
                  hills ·
                  ${Math.round(
                    (terrainStats(this.selectedDraft).cells[3] / (W * H)) * 100,
                  )}%
                  mountains
                </dd>
              </div>
            </dl>
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
        <div class="admin-filters">
          <label
            >Search accounts<input
              type="search"
              placeholder="Username or account ID"
              .value=${this.accountSearch}
              @input=${(e: Event) =>
                (this.accountSearch = (
                  e.target as HTMLInputElement
                ).value)} /></label
          ><label
            >Account filter<select
              .value=${this.accountFilter}
              @change=${(e: Event) =>
                (this.accountFilter = (e.target as HTMLSelectElement).value)}
            >
              <option value="all">All accounts</option>
              <option value="active">With signed-in sessions</option>
              <option value="disabled">Disabled accounts</option>
              <option value="creators">Map creators</option>
            </select></label
          >
        </div>
        <p class="community-muted">
          ${accounts.length} matching accounts (latest 1,000). Disabling an
          account also signs out all its devices.
        </p>
        <div class="account-list">
          ${accounts.map(
            (account) =>
              html`<div>
                <span
                  ><strong>${account.username}</strong
                  ><small
                    >${account.role}${account.disabled
                      ? " · disabled"
                      : ""}</small
                  ></span
                >
                <div class="account-details">
                  <span>Joined ${accountDate(account.createdAt)}</span
                  ><span>Last sign-in ${accountDate(account.lastLoginAt)}</span
                  ><span
                    >${account.submissions} submitted · ${account.published}
                    published · ${account.sessions} sessions</span
                  ><code>${account.id}</code>
                </div>
                ${account.role === "player"
                  ? html`<div class="account-actions">
                      <button
                        class="community-button small"
                        ?disabled=${this.busy || !account.sessions}
                        @click=${() =>
                          void this.work(async () => {
                            await communityRequest(
                              `/admin/users/${account.id}/revoke-sessions`,
                              {},
                            );
                            await this.loadDashboard();
                            this.message = `${account.username} signed out on all devices.`;
                          })}
                      >
                        Sign out devices</button
                      ><button
                        class="community-button small"
                        ?disabled=${this.busy}
                        @click=${() =>
                          void this.work(async () => {
                            await communityRequest(
                              `/admin/users/${account.id}`,
                              {
                                disabled: !account.disabled,
                              },
                            );
                            await this.loadDashboard();
                            this.message = "Account updated.";
                          })}
                      >
                        ${account.disabled
                          ? "Enable account"
                          : "Disable account"}
                      </button>
                    </div>`
                  : html`<span class="community-muted">Management only</span>`}
              </div>`,
          )}
        </div>
      </section>
      <section class="community-panel">
        <h2>Activity history</h2>
        <p class="community-muted">
          The latest 100 account, map and moderation actions. Times use your
          device timezone.
        </p>
        <div class="activity-list">
          ${this.dashboard?.activity.length
            ? this.dashboard.activity.map(
                (entry) =>
                  html`<article>
                    <time datetime=${new Date(entry.at).toISOString()}
                      >${accountDate(entry.at)}</time
                    ><strong>${entry.action}</strong><span>${entry.target}</span
                    ><small>by ${entry.actor}</small>
                  </article>`,
              )
            : html`<p class="community-muted">
                New actions will appear here.
              </p>`}
        </div>
      </section>`;
  }
  render() {
    return html`<div
      class=${this.user?.role === "player"
        ? "community-shell map-editor-shell"
        : "community-shell"}
    >
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
