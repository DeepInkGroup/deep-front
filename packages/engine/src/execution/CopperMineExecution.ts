import {
  COPPER_MINE_INCOME,
  COPPER_MINE_PAYOUT_TICKS,
} from "@openfront/engine-api/game/CopperMine";
import { zInt, zRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class CopperMineExecution implements Execution {
  private active = true;
  private nextPayoutTick = 0;

  constructor(private factory: Unit) {}

  init(_game: Game, ticks: number): void {
    this.nextPayoutTick = ticks + COPPER_MINE_PAYOUT_TICKS;
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
      this.nextPayoutTick = ticks + COPPER_MINE_PAYOUT_TICKS;
      return;
    }
    if (ticks >= this.nextPayoutTick) {
      this.factory
        .owner()
        .addGold(
          COPPER_MINE_INCOME[this.factory.level() - 1],
          this.factory.tile(),
        );
      this.nextPayoutTick = ticks + COPPER_MINE_PAYOUT_TICKS;
    }
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return CopperMineExecutionSnapshot.write({
      active: this.active,
      nextPayoutTick: this.nextPayoutTick,
      factory: w.unit(this.factory),
    });
  }

  restoreSnapshot(s: CopperMineState, r: SnapshotReader): void {
    this.active = s.active;
    this.nextPayoutTick = s.nextPayoutTick;
    this.factory = r.unit(s.factory);
  }
}

const CopperMineStateSchema = z.object({
  active: z.boolean(),
  nextPayoutTick: zInt(),
  factory: zRef(),
});
type CopperMineState = z.infer<typeof CopperMineStateSchema>;
export const CopperMineExecutionSnapshot = execSnapshotType({
  name: "CopperMine",
  version: 1,
  schema: CopperMineStateSchema,
  cls: () => CopperMineExecution,
});
