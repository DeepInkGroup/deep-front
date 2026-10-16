import { GameMode } from "@openfront/engine-api/game/GameTypes";
import { EventBus, GameEvent } from "@openfront/shared/EventBus";
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { Controller } from "../../Controller";
import { renderDuration, translateText } from "../../Utils";
import { GameView } from "../../view";

export class ImmunityBarVisibleEvent implements GameEvent {
  constructor(public readonly visible: boolean) {}
}

@customElement("immunity-timer")
export class ImmunityTimer extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  private isVisible = false;
  private _barVisible = false;
  private isActive = false;
  private progressRatio = 0;
  private remainingSeconds = 0;

  createRenderRoot() {
    this.style.position = "fixed";
    this.style.top = "0";
    this.style.left = "0";
    this.style.width = "100%";
    this.style.height = "7px";
    this.style.zIndex = "1000";
    this.style.pointerEvents = "none";
    return this;
  }

  init() {
    this.isVisible = true;
  }

  tick() {
    if (!this.game || !this.isVisible) {
      return;
    }

    const showTeamOwnershipBar =
      this.game.config().gameConfig().gameMode === GameMode.Team &&
      !this.game.inSpawnPhase();

    this.style.top = showTeamOwnershipBar ? "7px" : "0px";

    const immunityDuration = this.game.config().spawnImmunityDuration();
    const elapsedSeconds = this.game.elapsedGameSeconds();

    if (
      !this.game.config().hasExtendedSpawnImmunity() ||
      this.game.inSpawnPhase() ||
      elapsedSeconds >= immunityDuration / 10
    ) {
      this.setInactive();
    } else {
      this.remainingSeconds = Math.ceil(immunityDuration / 10 - elapsedSeconds);
      this.progressRatio = Math.min(
        1,
        Math.max(0, (elapsedSeconds * 10) / immunityDuration),
      );
      this.isActive = true;
      this.requestUpdate();
    }

    this.emitBarVisibility();
  }

  private setInactive() {
    if (this.isActive) {
      this.isActive = false;
      this.requestUpdate();
    }
  }

  private emitBarVisibility() {
    const nowVisible = this.isVisible && this.isActive;
    if (nowVisible !== this._barVisible) {
      this._barVisible = nowVisible;
      this.eventBus?.emit(new ImmunityBarVisibleEvent(this._barVisible));
    }
  }

  render() {
    if (!this.isVisible || !this.isActive) {
      return html``;
    }

    const widthPercent = this.progressRatio * 100;

    return html`
      <div class="w-full h-full flex z-999">
        <div
          class="h-full transition-all duration-100 ease-in-out"
          style="width: ${widthPercent}%; background-color: rgba(255, 165, 0, 0.9);"
        ></div>
        <span
          role="timer"
          class="absolute right-3 top-14 rounded bg-black/80 px-3 py-1 text-xs font-bold text-white"
          title=${translateText("host_modal.peace_time_description")}
          >${translateText("host_modal.peace_time_remaining", {
            time: renderDuration(this.remainingSeconds),
          })}</span
        >
      </div>
    `;
  }
}
