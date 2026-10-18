import { UnitType } from "@openfront/engine-api/game/GameTypes";
import type { StraitTollIntent } from "@openfront/engine-api/Schemas";
import type { EventBus } from "@openfront/shared/EventBus";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { SendStraitTollIntentEvent } from "../../Transport";
import { GoToUnitEvent } from "../../TransformHandler";
import type { GameView, UnitView } from "../../view";

@customElement("strait-toll-panel")
export class StraitTollPanel extends LitElement {
  @property({ attribute: false }) game: GameView;
  @property({ attribute: false }) eventBus: EventBus;
  @property({ type: Number }) tick = 0;
  @state() private open = false;
  private seen = new Set<string>();
  private drafts = new Map<number, { rate: number; exemptAllies: boolean }>();
  static styles = css`
    :host {
      display: block;
      color: #e5edf3;
      font: 12px system-ui;
    }
    button,
    select {
      font: inherit;
      color: inherit;
      background: #1c2935;
      border: 1px solid #526576;
      border-radius: 6px;
      padding: 7px 10px;
      cursor: pointer;
    }
    button:hover {
      background: #304557;
    }
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .entry {
      margin: 4px auto;
      display: block;
    }
    .pending {
      border-color: #edc45c;
      color: #ffdc87;
    }
    section {
      position: fixed;
      bottom: 110px;
      right: 18px;
      z-index: 1200;
      width: 380px;
      max-width: calc(100vw - 24px);
      max-height: 70vh;
      overflow: auto;
      padding: 16px;
      box-sizing: border-box;
      background: #101922f7;
      border: 1px solid #526576;
      border-radius: 12px;
      box-shadow: 0 10px 40px #0009;
      text-align: left;
    }
    header,
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    h3 {
      margin: 0;
      font-size: 16px;
    }
    p {
      color: #b6c6d3;
      line-height: 1.45;
    }
    article {
      border-top: 1px solid #344554;
      margin-top: 12px;
      padding-top: 12px;
    }
    label {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 10px 0;
    }
    label input {
      accent-color: #e5b351;
    }
    .rate {
      flex: 1;
    }
    strong {
      color: #fff0ba;
    }
    .accept {
      background: #24583e;
    }
    .reject {
      background: #593039;
    }
    small {
      color: #a8bbc9;
      display: block;
      margin: 8px 0;
    }
    @media (max-width: 600px) {
      section {
        bottom: 90px;
        right: 12px;
        max-height: 64vh;
      }
    }
  `;
  private stations() {
    const me = this.game?.myPlayer();
    return (
      this.game
        ?.units(UnitType.StraitControlStation)
        .filter(
          (u) => u.isActive() && (u.owner() === me || u.straitState()?.enabled),
        ) ?? []
    );
  }
  private pending(unit: UnitView) {
    const me = this.game.myPlayer(),
      s = unit.straitState();
    return (
      !!me &&
      !!s?.enabled &&
      unit.owner() !== me &&
      !s.accepted.includes(me.smallID()) &&
      !s.rejected.includes(me.smallID()) &&
      !(s.exemptAllies && unit.owner().isFriendly(me))
    );
  }
  protected willUpdate() {
    for (const u of this.stations()) {
      const key = `${u.id()}:${u.straitState()?.revision}`;
      if (this.pending(u) && !this.seen.has(key)) {
        this.seen.add(key);
        this.open = true;
      }
    }
  }
  private send(
    unit: UnitView,
    action: StraitTollIntent["action"],
    enabled?: boolean,
  ) {
    const s = unit.straitState();
    if (!s) return;
    const draft = this.drafts.get(unit.id()) ?? s;
    this.eventBus.emit(
      new SendStraitTollIntentEvent({
        type: "strait_toll",
        stationId: unit.id(),
        revision: s.revision,
        action,
        ...(action === "configure"
          ? {
              enabled: enabled ?? true,
              rate: draft.rate,
              exemptAllies: draft.exemptAllies,
            }
          : {}),
      }),
    );
  }
  render() {
    const stations = this.stations(),
      me = this.game?.myPlayer();
    if (!me || !stations.length) return nothing;
    const pending = stations.filter((u) => this.pending(u)).length;
    return html`<button
        class="entry ${pending ? "pending" : ""}"
        @click=${() => (this.open = !this.open)}
      >
        Strait
        tolls${pending
          ? ` · ${pending} request${pending === 1 ? "" : "s"}`
          : ""}
      </button>
      ${this.open
        ? html`<section
            aria-label="Strait toll agreements"
            @pointerdown=${(e: Event) => e.stopPropagation()}
            @click=${(e: Event) => e.stopPropagation()}
            @keydown=${(e: Event) => {
              e.stopPropagation();
              if ((e as KeyboardEvent).key === "Escape") this.open = false;
            }}
          >
            <header>
              <h3>Strait control</h3>
              <button
                aria-label="Close toll panel"
                @click=${() => (this.open = false)}
              >
                Close
              </button>
            </header>
            <p>
              Accept a toll to allow commercial passage. The sender pays the fee
              separately; the destination receives the full cargo value.
            </p>
            ${stations.map((unit) => {
              const s = unit.straitState();
              if (!s) return nothing;
              const draft = this.drafts.get(unit.id()) ?? {
                rate: s.rate,
                exemptAllies: s.exemptAllies,
              };
              const mine = unit.owner() === me;
              return html`<article>
                <div class="actions">
                  <b
                    >${mine ? "Your station" : unit.owner().displayName()} ·
                    #${unit.id()}</b
                  ><button
                    @click=${() => this.eventBus.emit(new GoToUnitEvent(unit))}
                  >
                    Locate
                  </button>
                </div>
                ${unit.isUnderConstruction()
                  ? html`<p>Under construction · 90 seconds</p>`
                  : mine
                    ? html`
                        <label
                          >Toll
                          <input
                            class="rate"
                            aria-label="Toll percentage"
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            .value=${String(draft.rate)}
                            @input=${(e: Event) => {
                              this.drafts.set(unit.id(), {
                                ...draft,
                                rate: Number(
                                  (e.target as HTMLInputElement).value,
                                ),
                              });
                              this.requestUpdate();
                            }}
                          /><strong>${draft.rate}%</strong></label
                        >
                        <label
                          ><input
                            type="checkbox"
                            .checked=${draft.exemptAllies}
                            @change=${(e: Event) => {
                              this.drafts.set(unit.id(), {
                                ...draft,
                                exemptAllies: (e.target as HTMLInputElement)
                                  .checked,
                              });
                              this.requestUpdate();
                            }}
                          />Allies pass for free</label
                        >
                        <div class="actions">
                          <button
                            class="accept"
                            @click=${() => this.send(unit, "configure", true)}
                          >
                            Apply toll</button
                          ><button
                            @click=${() => this.send(unit, "configure", false)}
                            ?disabled=${!s.enabled}
                          >
                            Open free passage
                          </button>
                        </div>
                        <small
                          >${s.enabled
                            ? `Active: ${s.rate}% · ${s.accepted.length} accepted · ${s.rejected.length} rejected`
                            : "Tolls are off. Both banks must be yours to enable them."}
                          Changes require fresh consent.</small
                        >
                      `
                    : html`<p>
                          <strong>${s.rate}% toll</strong> ·
                          ${s.exemptAllies && unit.owner().isFriendly(me)
                            ? "You are exempt as an ally."
                            : s.accepted.includes(me.smallID())
                              ? "Accepted — passage allowed."
                              : s.rejected.includes(me.smallID())
                                ? "Rejected — this trade passage is closed to you."
                                : "Passage awaits your decision."}
                        </p>
                        <div class="actions">
                          <button
                            class="accept"
                            @click=${() => this.send(unit, "accept")}
                          >
                            Accept toll</button
                          ><button
                            class="reject"
                            @click=${() => this.send(unit, "reject")}
                          >
                            Reject passage
                          </button>
                        </div>`}
              </article>`;
            })}
          </section>`
        : nothing}`;
  }
}
