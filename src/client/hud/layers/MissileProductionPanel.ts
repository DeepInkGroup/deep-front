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

const names: Record<ManufacturedMissile, string> = {
  [UnitType.AtomBomb]: "Atom Bomb",
  [UnitType.HydrogenBomb]: "Hydrogen Bomb",
  [UnitType.MIRV]: "MIRV",
  [UnitType.StealthMissile]: "Stealth Missile",
  [UnitType.HypersonicMissile]: "Hypersonic Missile",
  [UnitType.EMPMissile]: "EMP Missile",
  [UnitType.SAMMissile]: "Air-defense interceptor",
};
const icon = assetUrl("images/MissileFactoryIconWhite.svg");

@customElement("missile-production-panel")
export class MissileProductionPanel extends LitElement {
  @property({ attribute: false }) game: GameView;
  @property({ attribute: false }) eventBus: EventBus;
  @state() private buildables: BuildableUnit[] | null = null;
  @property({ type: Number }) tick = 0;
  @state() private open = false;
  @state() private factoryId = 0;
  private lastPriceTick = -10;
  private pricePending = false;

  protected willUpdate(): void {
    const me = this.game?.myPlayer();
    if (
      !me ||
      this.pricePending ||
      this.game.config().isUnitDisabled(UnitType.MissileFactory)
    )
      return;
    if (this.tick >= this.lastPriceTick && this.tick - this.lastPriceTick < 10)
      return;
    this.lastPriceTick = this.tick;
    this.pricePending = true;
    me.buildables(
      undefined,
      MISSILE_TYPES.filter((t) => t !== UnitType.SAMMissile),
    )
      .then((buildables) => {
        this.buildables = buildables;
      })
      .catch(() => {
        this.buildables = null;
      })
      .finally(() => {
        this.pricePending = false;
      });
  }

  static styles = css`
    :host {
      display: block;
      color: #e8edf2;
      font: 12px system-ui;
    }
    button,
    select {
      font: inherit;
      color: inherit;
      background: #202731;
      border: 1px solid #485463;
      border-radius: 7px;
      padding: 8px 10px;
      cursor: pointer;
    }
    button:hover {
      background: #303b49;
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
      width: 16px;
      height: 16px;
    }
    section {
      position: fixed;
      bottom: 120px;
      right: 14px;
      z-index: 1250;
      width: 460px;
      max-width: calc(100vw - 24px);
      max-height: 68dvh;
      overflow: auto;
      padding: 16px;
      box-sizing: border-box;
      background: #10151dfc;
      border: 1px solid #4b596b;
      border-radius: 14px;
      box-shadow: 0 10px 40px #000a;
      text-align: left;
    }
    header,
    .row,
    .factory,
    .summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    header h3 {
      font-size: 17px;
      margin: 0;
    }
    p,
    small {
      color: #a7b5c8;
      line-height: 1.5;
    }
    .summary {
      margin: 12px 0;
      color: #a4d9c1;
      flex-wrap: wrap;
    }
    .factory {
      margin: 12px 0;
      flex-wrap: wrap;
    }
    select {
      flex: 1;
      min-width: 0;
      max-width: 100%;
    }
    .row {
      border-top: 1px solid #2b3542;
      padding: 10px 0;
    }
    .name {
      font-weight: 600;
    }
    .details {
      flex: 1;
      min-width: 0;
    }
    small {
      display: block;
      margin-top: 3px;
      font-size: 11px;
    }
    .stock {
      font-size: 15px;
      color: #d6eac0;
      text-align: center;
      min-width: 30px;
    }
    .stock small {
      font-size: 9px;
    }
    .buy {
      display: flex;
      gap: 4px;
    }
    .buy button {
      padding: 7px 8px;
    }
    .warn {
      color: #f3c46c;
    }
    h4 {
      margin: 16px 0 8px;
      font-size: 13px;
    }
    .job {
      padding: 6px 0;
    }
    .job .row {
      border: 0;
      padding: 0;
      font-size: 11px;
    }
    progress {
      width: 100%;
      height: 5px;
      accent-color: #9ccfb0;
    }
    @media (max-width: 400px) {
      section {
        padding: 12px;
        bottom: 140px;
        max-height: 60dvh;
      }
      .row {
        gap: 6px;
      }
      .buy button {
        padding: 7px;
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
    return html`<button
        class="entry"
        @click=${() => (this.open = !this.open)}
        aria-expanded=${this.open}
      >
        <img src=${icon} alt="" /> Missiles ·
        ${arsenal?.stock.reduce((a, b) => a + b, 0) ?? 0}
        ready${jobs.length ? ` · ${jobs.length}/20 producing` : ""}</button
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
              <h3>Missile production</h3>
              <button
                aria-label="Close missile production"
                @click=${() => (this.open = false)}
              >
                Close
              </button>
            </header>
            <p>
              Manufacture first, launch from your Bunker Missile Site when
              ready. SAM and CIWS use the same interceptor stock. Pay once when
              ordering.
            </p>
            <div class="summary">
              <span>${jobs.length} / 20 production slots</span
              ><span
                >${factories.length}
                ${factories.length === 1 ? "factory" : "factories"} · 30 MW
                each</span
              >
            </div>
            ${selected
              ? html`<div class="factory">
                    <select
                      aria-label="Production factory"
                      .value=${String(selected.id())}
                      @change=${(e: Event) =>
                        (this.factoryId = Number(
                          (e.target as HTMLSelectElement).value,
                        ))}
                    >
                      ${factories.map(
                        (f, i) =>
                          html`<option value=${f.id()}>
                            Factory ${i + 1} ·
                            ${f.isUnderConstruction()
                              ? "Building"
                              : this.game.config().isPowered(f)
                                ? "Powered"
                                : "No power"}
                          </option>`,
                      )}</select
                    ><button
                      @click=${() =>
                        this.eventBus.emit(new GoToUnitEvent(selected))}
                    >
                      Locate
                    </button>
                  </div>
                  ${!ready
                    ? html`<p class="warn">
                        Finish construction before ordering.
                      </p>`
                    : !powered
                      ? html`<p class="warn">
                          No electricity. Orders can be placed, but production
                          is paused until power returns.
                        </p>`
                      : nothing}`
              : html`<p class="warn">
                  Build a Missile Factory (Shift+M): 1M, 40 seconds, 30 MW.
                  Factories have one level and no building limit.
                </p>`}
            ${available.map(
              (type) =>
                html`<div class="row">
                  <div class="details">
                    <div class="name">${names[type]}</div>
                    <small
                      >${renderNumber(this.price(type))} gold ·
                      ${MISSILE_PRODUCTION_TICKS[type] / 10}s${type ===
                      UnitType.SAMMissile
                        ? " · SAM + CIWS"
                        : ""}</small
                    >
                  </div>
                  <div class="stock">
                    ${missileStock(arsenal, type)}<small>READY</small>
                  </div>
                  <div class="buy">
                    <button
                      aria-label=${`Produce 1 ${names[type]}`}
                      ?disabled=${!canOrder(type, 1)}
                      @click=${() => this.queue(type, selected!.id(), 1)}
                    >
                      +1</button
                    ><button
                      aria-label=${`Produce 5 ${names[type]}`}
                      ?disabled=${!canOrder(type, 5)}
                      @click=${() => this.queue(type, selected!.id(), 5)}
                    >
                      +5
                    </button>
                  </div>
                </div>`,
            )}
            ${jobs.length
              ? html`<h4>Production queue</h4>
                  ${jobs.map((job) => {
                    const f = factories.find((f) => f.id() === job.factoryId);
                    const paused =
                      !f ||
                      f.isUnderConstruction() ||
                      !this.game.config().isPowered(f);
                    return html`<div class="job">
                      <div class="row">
                        <span
                          >${names[job.missile]} · Factory
                          ${factories.indexOf(f!) + 1}</span
                        ><span class=${paused ? "warn" : ""}
                          >${paused ? "Paused · " : ""}${Math.ceil(
                            job.remainingTicks / 10,
                          )}s</span
                        >
                      </div>
                      <progress
                        max=${MISSILE_PRODUCTION_TICKS[job.missile]}
                        value=${MISSILE_PRODUCTION_TICKS[job.missile] -
                        job.remainingTicks}
                      ></progress>
                    </div>`;
                  })}<small
                    >Orders run in parallel. Unfinished missiles are lost if
                    their factory is destroyed or captured. Finished inventory
                    stays with you.</small
                  >`
              : nothing}
          </section>`
        : nothing}`;
  }
}
