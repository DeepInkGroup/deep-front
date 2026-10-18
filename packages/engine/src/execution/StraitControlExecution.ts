import {
  StraitTollIntent,
  StraitTollIntentSchema,
} from "@openfront/engine-api/Schemas";
import {
  MessageType,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { zInt, zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import {
  controlsStrait,
  freeStraitPassage,
  straitAt,
} from "../game/StraitControl";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class StraitControlExecution implements Execution {
  private mg: Game;
  private active = true;
  private waterVersion = -1;
  constructor(
    private player: Player,
    private stationId: number,
    private intent?: StraitTollIntent,
  ) {}
  init(game: Game): void {
    this.mg = game;
    if (this.intent) {
      this.applyIntent();
      this.active = false;
    }
  }
  private applyIntent() {
    if (!this.player.isAlive()) return;
    const unit = this.mg.unit(this.stationId),
      intent = this.intent!;
    const s = unit?.straitState();
    if (
      !unit ||
      unit.type() !== UnitType.StraitControlStation ||
      !s ||
      !controlsStrait(this.mg, unit) ||
      intent.revision !== s.revision
    )
      return;
    if (intent.action === "configure") {
      if (
        unit.owner() !== this.player ||
        intent.rate === undefined ||
        intent.enabled === undefined ||
        intent.exemptAllies === undefined
      )
        return;
      if (intent.rate < 1 || intent.rate > 10 || !Number.isInteger(intent.rate))
        return;
      const geometry = straitAt(this.mg, this.player, unit.tile(), unit.id());
      if (!geometry) return;
      if (
        s.enabled === intent.enabled &&
        s.rate === intent.rate &&
        s.exemptAllies === intent.exemptAllies
      )
        return;
      unit.setStraitState({
        ...s,
        ...geometry,
        rate: intent.rate,
        enabled: intent.enabled,
        exemptAllies: intent.exemptAllies,
        revision: s.revision + 1,
        accepted: [],
        rejected: [],
      });
      if (intent.enabled)
        for (const other of this.mg.players()) {
          if (
            other !== this.player &&
            other.isAlive() &&
            other.type() === PlayerType.Human &&
            !freeStraitPassage(unit, other)
          )
            this.mg.displayMessage(
              "events_display.strait_toll_request",
              MessageType.CHAT,
              other.id(),
              undefined,
              { name: this.player.displayName(), rate: String(intent.rate) },
              unit.id(),
              this.player.id(),
            );
        }
    } else {
      if (unit.owner() === this.player || !s.enabled) return;
      const id = this.player.smallID();
      unit.setStraitState({
        ...s,
        accepted: [
          ...s.accepted.filter((p) => p !== id),
          ...(intent.action === "accept" ? [id] : []),
        ].sort((a, b) => a - b),
        rejected: [
          ...s.rejected.filter((p) => p !== id),
          ...(intent.action === "reject" ? [id] : []),
        ].sort((a, b) => a - b),
      });
    }
  }
  tick(): void {
    const unit = this.mg.unit(this.stationId);
    if (!unit?.isActive()) {
      this.active = false;
      return;
    }
    const state = unit.straitState();
    if (!state) {
      this.active = false;
      return;
    }
    const version = this.mg.map().waterVersion();
    let geometry = state;
    let valid = controlsStrait(this.mg, unit);
    if (version !== this.waterVersion) {
      const current = straitAt(this.mg, unit.owner(), unit.tile(), unit.id());
      valid = valid && !!current;
      if (
        current &&
        (current.bankB !== state.bankB ||
          current.gate.join(",") !== state.gate.join(","))
      ) {
        geometry = { ...state, ...current };
        valid = false;
      }
      this.waterVersion = version;
    }
    if (
      !valid &&
      (state.enabled ||
        state.accepted.length ||
        state.rejected.length ||
        geometry !== state)
    ) {
      unit.setStraitState({
        ...geometry,
        enabled: false,
        accepted: [],
        rejected: [],
        revision: state.revision + 1,
      });
      this.mg.displayMessage(
        "events_display.strait_toll_cancelled",
        MessageType.CHAT,
        unit.owner().id(),
        undefined,
        {},
        unit.id(),
      );
    }
  }
  isActive() {
    return this.active;
  }
  activeDuringSpawnPhase() {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return StraitControlExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      player: w.player(this.player),
      stationId: this.stationId,
      intent: this.intent ?? null,
      waterVersion: this.waterVersion,
    });
  }
  restoreSnapshot(s: StraitControlState, r: SnapshotReader) {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.player = r.player(s.player);
    this.stationId = s.stationId;
    this.intent = s.intent ?? undefined;
    this.waterVersion = s.waterVersion;
  }
}
const State = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  player: zPlayerRef(),
  stationId: zInt(),
  intent: StraitTollIntentSchema.nullable(),
  waterVersion: zInt(),
});
type StraitControlState = z.infer<typeof State>;
export const StraitControlExecutionSnapshot = execSnapshotType({
  name: "StraitControl",
  version: 1,
  schema: State,
  cls: () => StraitControlExecution,
});
