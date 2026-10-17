import {
  OIL_FACTORY_INCOME,
  OIL_FACTORY_PAYOUT_TICKS,
} from "@openfront/engine-api/game/OilFactory";
import { zInt, zRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import { connectRailHub } from "./RailHub";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class OilFactoryExecution implements Execution {
  private active = true;
  private nextPayoutTick = 0;
  private game: Game;

  constructor(private factory: Unit) {}

  init(game: Game, ticks: number): void {
    this.game = game;
    this.nextPayoutTick = ticks + OIL_FACTORY_PAYOUT_TICKS;
  }

  tick(ticks: number): void {
    if (!this.factory.isActive()) {
      this.active = false;
      return;
    }
    if (
      this.factory.isUnderConstruction() ||
      this.factory.isMarkedForDeletion()
    ) {
      this.nextPayoutTick = ticks + OIL_FACTORY_PAYOUT_TICKS;
      return;
    }
    connectRailHub(this.game, this.factory);
    if (ticks >= this.nextPayoutTick) {
      this.factory
        .owner()
        .addGold(
          OIL_FACTORY_INCOME[this.factory.level() - 1],
          this.factory.tile(),
        );
      this.nextPayoutTick = ticks + OIL_FACTORY_PAYOUT_TICKS;
    }
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return OilFactoryExecutionSnapshot.write({
      active: this.active,
      nextPayoutTick: this.nextPayoutTick,
      factory: w.unit(this.factory),
    });
  }

  restoreSnapshot(s: OilFactoryState, r: SnapshotReader): void {
    this.game = r.game;
    this.active = s.active;
    this.nextPayoutTick = s.nextPayoutTick;
    this.factory = r.unit(s.factory);
  }
}

const OilFactoryStateSchema = z.object({
  active: z.boolean(),
  nextPayoutTick: zInt(),
  factory: zRef(),
});
type OilFactoryState = z.infer<typeof OilFactoryStateSchema>;
export const OilFactoryExecutionSnapshot = execSnapshotType({
  name: "OilFactory",
  version: 1,
  schema: OilFactoryStateSchema,
  cls: () => OilFactoryExecution,
});
