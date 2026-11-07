import {
  UnitType,
  type BuildableUnit,
} from "@openfront/engine-api/game/GameTypes";
import {
  MISSILE_TYPES,
  MISSILE_PRODUCTION_LIMIT,
  MISSILE_PRODUCTION_TICKS,
  missileStock,
  type ManufacturedMissile,
} from "@openfront/engine-api/game/MissileProduction";
import { renderNumber } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import type { EventBus } from "@openfront/shared/EventBus";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { SendProduceMissilesIntentEvent } from "../../Transport";
import { GoToUnitEvent } from "../../TransformHandler";
import type { GameView } from "../../view";

const missiles: Record<
  ManufacturedMissile,
  { name: string; icon: string; role: string }
> = {
  [UnitType.AtomBomb]: {
    name: "Atom Bomb",
    icon: "NukeIconWhite.svg",
    role: "Nuclear strike",
  },
  [UnitType.HydrogenBomb]: {
    name: "Hydrogen Bomb",
    icon: "MushroomCloudIconWhite.svg",
    role: "Heavy nuclear strike",
  },
  [UnitType.MIRV]: {
    name: "MIRV",
    icon: "MIRVIcon.svg",
    role: "Multiple warheads",
  },
  [UnitType.StealthMissile]: {
    name: "Stealth Missile",
    icon: "StealthMissileIconWhite.svg",
    role: "Concealed approach",
  },
  [UnitType.HypersonicMissile]: {
    name: "Hypersonic Missile",
    icon: "HypersonicMissileIconWhite.svg",
    role: "High-speed strike",
  },
  [UnitType.EMPMissile]: {
    name: "EMP Missile",
    icon: "EMPMissileIconWhite.svg",
    role: "Disables air defense",
  },
  [UnitType.SAMMissile]: {
    name: "Air-defense interceptor",
    icon: "SamLauncherIconWhite.svg",
    role: "Shared by SAM + CIWS",
  },
};
const icon = assetUrl("images/MissileFactoryIconWhite.svg");
function duration(ticks: number): string {
  const seconds = Math.ceil(ticks / 10);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${seconds}s`;
}

@customElement("missile-production-panel")
export class MissileProductionPanel extends LitElement {
  @property({ attribute: false }) game: GameView;
  @property({ attribute: false }) eventBus: EventBus;
  @property({ type: Number }) tick = 0;
  @state() private buildables: BuildableUnit[] | null = null;
  @state() private open = false;
  @state() private factoryId = 0;
  @state() private tab: "missiles" | "queue" = "missiles";
  private lastPriceTick = -10;
  private pricePending = false;
  private priceGame: GameView | undefined;

  protected willUpdate(): void {
    if (this.priceGame !== this.game) {
      this.priceGame = this.game;
      this.buildables = null;
      this.lastPriceTick = -10;
      this.factoryId = 0;
      this.open = false;
    }
    const me = this.game?.myPlayer();
    if (
      !me?.isAlive() ||
      this.pricePending ||
      this.game.config().isUnitDisabled(UnitType.MissileFactory)
    )
      return;
    if (this.tick >= this.lastPriceTick && this.tick - this.lastPriceTick < 10)
      return;
    this.lastPriceTick = this.tick;
    this.pricePending = true;
    const game = this.game;
    me.buildables(
      undefined,
      MISSILE_TYPES.filter((t) => t !== UnitType.SAMMissile),
    )
      .then((buildables) => {
        if (this.game === game) this.buildables = buildables;
      })
      .catch(() => {
        if (this.game === game) this.buildables = null;
      })
      .finally(() => {
        this.pricePending = false;
      });
  }

  static styles = css`
    :host {
      display: block;
      color: #edf0eb;
      font: 12px system-ui;
    }
    * {
      box-sizing: border-box;
    }
    button {
      font: inherit;
      color: inherit;
      background: #202523;
      border: 1px solid #3e4942;
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: #303a32;
      border-color: #9daf91;
    }
    button:focus-visible {
      outline: 2px solid #c0d8a4;
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 5px auto;
    }
    .entry img {
      width: 17px;
      height: 17px;
    }
    section {
      position: fixed;
      bottom: 120px;
      right: 14px;
      z-index: 1250;
      width: 540px;
      max-width: calc(100vw - 24px);
      max-height: 72dvh;
      overflow: auto;
      background: #111613fc;
      border: 1px solid #4a554b;
      border-radius: 16px;
      box-shadow: 0 16px 50px #000a;
      text-align: left;
      scrollbar-width: thin;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 17px 18px;
      background: #151b17;
      border-bottom: 1px solid #30392f;
    }
    .heading {
      display: flex;
      align-items: center;
      gap: 11px;
    }
    .heading img {
      width: 28px;
      height: 28px;
    }
    .eyebrow {
      display: block;
      color: #a6b695;
      font-size: 9px;
      letter-spacing: 1.8px;
      font-weight: 700;
    }
    h3 {
      margin: 3px 0 0;
      font-size: 18px;
      letter-spacing: -0.4px;
    }
    .content {
      padding: 16px 18px;
    }
    p {
      color: #a8b3a8;
      line-height: 1.5;
      margin: 0 0 14px;
    }
    .summary {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 14px;
      font-size: 11px;
      color: #bfceaf;
    }
    .factory-picker {
      display: flex;
      gap: 7px;
      overflow-x: auto;
      padding: 2px 2px 8px;
    }
    .factory-choice {
      text-align: left;
      flex: 0 0 auto;
      min-width: 124px;
      background: #191f1a;
    }
    .factory-choice[aria-pressed="true"] {
      border-color: #b7cd9e;
      background: #2a3527;
    }
    .factory-choice small {
      display: block;
      margin-top: 5px;
    }
    small {
      color: #a5b2a4;
      font-size: 10px;
      line-height: 1.4;
    }
    .current {
      background: #1e291d;
      border: 1px solid #526449;
      border-radius: 10px;
      padding: 12px;
      margin: 6px 0 14px;
    }
    .current.paused {
      background: #29251a;
      border-color: #766139;
    }
    .current-top,
    .line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .current strong {
      display: block;
      margin-top: 5px;
      font-size: 13px;
    }
    .time {
      font-size: 21px;
      color: #deebc5;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    progress {
      display: block;
      width: 100%;
      height: 5px;
      accent-color: #bdd89e;
      margin: 10px 0;
    }
    .warn {
      color: #f1ca7c;
    }
    .idle {
      padding: 13px;
      border: 1px dashed #495447;
      border-radius: 10px;
      margin: 6px 0 14px;
      color: #b7c2b0;
      line-height: 1.5;
    }
    .tabs {
      display: flex;
      gap: 5px;
      border-bottom: 1px solid #30392f;
      margin-bottom: 13px;
      padding-bottom: 8px;
    }
    .tabs button {
      flex: 1;
      background: transparent;
      border-color: transparent;
      color: #9faa9f;
    }
    .tabs button[aria-pressed="true"] {
      color: #e3eddb;
      background: #2a3426;
      border-color: #506146;
    }
    .missile-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }
    .missile-card {
      min-width: 0;
      padding: 12px;
      background: #1b211c;
      border: 1px solid #374032;
      border-radius: 10px;
    }
    .card-heading {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-height: 43px;
    }
    .card-heading img {
      width: 23px;
      height: 23px;
      flex-shrink: 0;
      object-fit: contain;
      margin-top: 2px;
    }
    .name {
      font-weight: 650;
      font-size: 12px;
      line-height: 1.35;
    }
    .card-heading small {
      display: block;
      margin-top: 3px;
    }
    .price {
      margin: 12px 0;
      color: #d3dabd;
      font-size: 11px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 9px;
    }
    .card-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
    }
    .stock {
      font-size: 17px;
      color: #deebc5;
      line-height: 1;
    }
    .stock small {
      display: block;
      font-size: 8px;
      letter-spacing: 1px;
      margin-top: 3px;
    }
    .buy {
      display: flex;
      gap: 4px;
    }
    .buy button {
      padding: 7px 9px;
      background: #2a3825;
    }
    ol {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .queued {
      display: flex;
      gap: 10px;
      padding: 12px 0;
      border-bottom: 1px solid #30392f;
    }
    .position {
      width: 25px;
      height: 25px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      border-radius: 7px;
      background: #2d362a;
      color: #bdcdae;
    }
    .queued .details {
      flex: 1;
      min-width: 0;
    }
    .queued small {
      display: block;
      margin-top: 4px;
    }
    .note {
      display: block;
      margin-top: 15px;
      padding-top: 12px;
      border-top: 1px solid #30392f;
    }
    @media (max-width: 400px) {
      section {
        max-width: calc(100vw - 16px);
        bottom: 125px;
        right: 8px;
        max-height: 70dvh;
      }
      header {
        padding: 12px;
      }
      .content {
        padding: 12px;
      }
      h3 {
        font-size: 16px;
      }
      .missile-grid {
        gap: 7px;
      }
      .missile-card {
        padding: 9px;
      }
      .card-heading {
        min-height: 58px;
        display: block;
      }
      .card-heading img {
        float: left;
        margin: 0 6px 5px 0;
        width: 19px;
        height: 19px;
      }
      .card-bottom {
        gap: 4px;
      }
      .buy button {
        padding: 7px;
      }
      .stock {
        font-size: 15px;
      }
    }
  `;

  private price(type: ManufacturedMissile): bigint {
    if (type !== UnitType.SAMMissile)
      return (
        this.buildables?.find((b) => b.type === type)?.productionCost ?? 0n
      );
    const config = this.game.config().gameConfig();
    return config.infiniteGold ||
      (config.hostCheats?.infiniteGold &&
        this.game.myPlayer()?.isLobbyCreator())
      ? 0n
      : 25_000n;
  }
  private queue(
    type: ManufacturedMissile,
    factoryId: number,
    amount: number,
  ): void {
    this.eventBus.emit(
      new SendProduceMissilesIntentEvent({
        type: "produce_missiles",
        factoryId,
        missile: type,
        amount,
      }),
    );
  }
  render() {
    const me = this.game?.myPlayer();
    if (
      !me?.isAlive() ||
      this.game.config().isUnitDisabled(UnitType.MissileFactory)
    )
      return nothing;
    const arsenal = me.state.missileArsenal;
    const jobs = arsenal?.jobs ?? [];
    const factories = me
      .units(UnitType.MissileFactory)
      .filter((f) => f.isActive());
    const selected =
      factories.find((f) => f.id() === this.factoryId) ??
      factories.find(
        (f) => !f.isUnderConstruction() && this.game.config().isPowered(f),
      ) ??
      factories[0];
    const ready = !!selected && !selected.isUnderConstruction();
    const powered = ready && this.game.config().isPowered(selected);
    const orders = jobs.filter((j) => j.factoryId === selected?.id());
    const current = orders[0];
    const available = MISSILE_TYPES.filter((type) =>
      type === UnitType.SAMMissile
        ? !this.game.config().isUnitDisabled(UnitType.SAMLauncher) ||
          !this.game.config().isUnitDisabled(UnitType.CIWSDefense)
        : !this.game.config().isUnitDisabled(type),
    );
    const canOrder = (type: ManufacturedMissile, amount: number) =>
      ready &&
      !!this.buildables &&
      jobs.length + amount <= MISSILE_PRODUCTION_LIMIT &&
      me.gold() >= this.price(type) * BigInt(amount);
    let ahead = 0;
    const timeline = orders.map((job) => {
      const starts = ahead;
      ahead += job.remainingTicks;
      return { job, starts };
    });
    return html`<button
        class="entry"
        @click=${() => (this.open = !this.open)}
        aria-expanded=${this.open}
      >
        <img src=${icon} alt="" /> Missiles ·
        ${arsenal?.stock.reduce((a, b) => a + b, 0) ?? 0}
        ready${jobs.length ? ` · ${jobs.length}/20 queued` : ""}</button
      >${this.open
        ? html`<section
            aria-label="Missile production"
            @pointerdown=${(e: Event) => e.stopPropagation()}
            @click=${(e: Event) => e.stopPropagation()}
            @contextmenu=${(e: Event) => e.preventDefault()}
            @keydown=${(e: KeyboardEvent) => {
              e.stopPropagation();
              if (e.key === "Escape") this.open = false;
            }}
          >
            <header>
              <div class="heading">
                <img src=${icon} alt="" />
                <div>
                  <span class="eyebrow">ARSENAL</span>
                  <h3>Missile production</h3>
                </div>
              </div>
              <button
                aria-label="Close missile production"
                @click=${() => (this.open = false)}
              >
                Close
              </button>
            </header>
            <div class="content">
              <p>
                Choose a factory, then add missiles to its queue. Each factory
                produces one missile at a time, in the order you place them.
              </p>
              <div class="summary">
                <span>${jobs.length} / 20 orders across all factories</span
                ><span
                  >${factories.length}
                  ${factories.length === 1 ? "factory" : "factories"} · 30 MW
                  each</span
                >
              </div>
              <div
                class="factory-picker"
                role="group"
                aria-label="Production factory"
              >
                ${factories.map(
                  (f, i) =>
                    html`<button
                      class="factory-choice"
                      aria-label=${`Select Factory ${i + 1}`}
                      aria-pressed=${f === selected}
                      @click=${() => (this.factoryId = f.id())}
                    >
                      Factory ${String(i + 1).padStart(2, "0")}<small
                        >${f.isUnderConstruction()
                          ? "Building"
                          : this.game.config().isPowered(f)
                            ? "● Powered"
                            : "● No power"}
                        · ${jobs.filter((j) => j.factoryId === f.id()).length}
                        orders</small
                      >
                    </button>`,
                )}
              </div>
              ${current
                ? html`<article
                    class="current ${powered ? "" : "paused"}"
                    aria-label="Current production"
                  >
                    <div class="current-top">
                      <div>
                        <span class="eyebrow"
                          >${powered
                            ? "IN PRODUCTION"
                            : "PAUSED · NO POWER"}</span
                        ><strong>${missiles[current.missile].name}</strong>
                      </div>
                      <span class="time"
                        >${duration(current.remainingTicks)}</span
                      >
                    </div>
                    <progress
                      max=${MISSILE_PRODUCTION_TICKS[current.missile]}
                      value=${MISSILE_PRODUCTION_TICKS[current.missile] -
                      current.remainingTicks}
                    ></progress>
                    <div class="line">
                      <small
                        >${orders[1]
                          ? `Next: ${missiles[orders[1].missile].name}`
                          : "No waiting orders"}</small
                      ><button
                        @click=${() =>
                          this.eventBus.emit(new GoToUnitEvent(selected!))}
                      >
                        Locate
                      </button>
                    </div>
                  </article>`
                : html`<div class="idle">
                    ${!selected
                      ? "Build a Missile Factory (Shift+M): 1M · 40 seconds · 30 MW."
                      : !ready
                        ? "Factory under construction. Orders unlock when it is complete."
                        : !powered
                          ? "No electricity. You can queue orders; production starts when power returns."
                          : "Production line ready. Choose a missile below to begin."}
                  </div>`}
              ${ready && !powered
                ? html`<p class="warn">
                    No electricity. Queue order and progress are preserved until
                    power returns.
                  </p>`
                : nothing}
              <div class="tabs" role="group" aria-label="Production view">
                <button
                  aria-pressed=${this.tab === "missiles"}
                  @click=${() => (this.tab = "missiles")}
                >
                  Missile types</button
                ><button
                  aria-pressed=${this.tab === "queue"}
                  @click=${() => (this.tab = "queue")}
                >
                  Queue (${orders.length})
                </button>
              </div>
              ${this.tab === "missiles"
                ? html`<div class="missile-grid">
                    ${available.map(
                      (type) =>
                        html`<article class="missile-card">
                          <div class="card-heading">
                            <img
                              src=${assetUrl("images/" + missiles[type].icon)}
                              alt=""
                            />
                            <div>
                              <div class="name">${missiles[type].name}</div>
                              <small>${missiles[type].role}</small>
                            </div>
                          </div>
                          <div class="price">
                            <span
                              >${this.buildables
                                ? `${renderNumber(this.price(type))} gold`
                                : "Loading price…"}</span
                            ><span
                              >◷
                              ${duration(MISSILE_PRODUCTION_TICKS[type])}</span
                            >
                          </div>
                          <div class="card-bottom">
                            <div class="stock">
                              ${missileStock(arsenal, type)}<small>READY</small>
                            </div>
                            <div class="buy">
                              <button
                                aria-label=${`Produce 1 ${missiles[type].name}`}
                                ?disabled=${!canOrder(type, 1)}
                                @click=${() =>
                                  this.queue(type, selected!.id(), 1)}
                              >
                                +1</button
                              ><button
                                aria-label=${`Produce 5 ${missiles[type].name}`}
                                ?disabled=${!canOrder(type, 5)}
                                @click=${() =>
                                  this.queue(type, selected!.id(), 5)}
                              >
                                +5
                              </button>
                            </div>
                          </div>
                        </article>`,
                    )}
                  </div>`
                : html`<ol aria-label="Factory production queue">
                      ${timeline.map(
                        ({ job, starts }, i) =>
                          html`<li class="queued" data-job-id=${job.id}>
                            <span class="position">${i + 1}</span>
                            <div class="details">
                              <div class="name">
                                ${missiles[job.missile].name}
                              </div>
                              <small
                                >${i === 0
                                  ? powered
                                    ? "Producing now"
                                    : "Paused · waiting for electricity"
                                  : powered
                                    ? `Starts in ${duration(starts)}`
                                    : "Waiting · starts after previous orders"}</small
                              >
                            </div>
                            <small
                              >${duration(job.remainingTicks)}${i === 0
                                ? " left"
                                : " production"}</small
                            >
                          </li>`,
                      )}
                    </ol>
                    ${!orders.length
                      ? html`<p>
                          No orders for this factory yet. Add missiles from
                          Missile types.
                        </p>`
                      : nothing}`}
              <small class="note"
                >One production line per factory. Pay once when ordering;
                finished missiles enter your inventory. Unfinished orders are
                lost if the factory is destroyed or captured.</small
              >
            </div>
          </section>`
        : nothing}`;
  }
}
