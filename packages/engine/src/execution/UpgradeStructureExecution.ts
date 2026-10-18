import { UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  zNum,
  zPlayerRef,
  zRef,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class UpgradeStructureExecution implements Execution {
  private structure: Unit | undefined;
  private cost: bigint;
  private pendingBunkerUpgrade = false;

  constructor(
    private player: Player,
    private unitId: number,
    private amount: number = 1,
  ) {}

  init(mg: Game, ticks: number): void {
    this.structure = mg.unit(this.unitId);
    if (this.structure && this.structure.owner() !== this.player) {
      console.warn(`structure not owned by player`);
      this.structure = undefined;
    }

    if (this.structure === undefined) {
      console.warn(`structure is undefined`);
      return;
    }

    if (this.structure.type() === UnitType.BunkerMissileSite) {
      this.pendingBunkerUpgrade = true;
      return;
    }
    for (let i = 0; i < this.amount; i++) {
      if (!this.player.canUpgradeUnit(this.structure)) {
        if (i === 0) {
          console.warn(
            `[UpgradeStructureExecution] unit type ${this.structure.type()} cannot be upgraded`,
          );
        }
        break;
      }
      this.player.upgradeUnit(this.structure);
    }
    return;
  }

  tick(ticks: number): void {
    // Schedule the timed upgrade from tick(), where nested executions are
    // retained, instead of the engine?s initialization queue traversal.
    if (this.pendingBunkerUpgrade && this.structure)
      this.player.upgradeUnit(this.structure);
    this.pendingBunkerUpgrade = false;
    return;
  }

  isActive(): boolean {
    return this.pendingBunkerUpgrade;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return UpgradeStructureExecutionSnapshot.write({
      structure: this.structure === undefined ? null : w.unit(this.structure),
      player: w.player(this.player),
      unitId: this.unitId,
      amount: this.amount,
      pendingBunkerUpgrade: this.pendingBunkerUpgrade,
    });
  }

  restoreSnapshot(s: UpgradeStructureState, r: SnapshotReader): void {
    if (s.structure !== null) this.structure = r.unit(s.structure);
    this.player = r.player(s.player);
    this.unitId = s.unitId;
    this.amount = s.amount;
    this.pendingBunkerUpgrade = s.pendingBunkerUpgrade ?? false;
  }
}

// cost is declared but never assigned, so there is nothing to store for it.
const UpgradeStructureStateSchema = z.object({
  structure: zRef().nullable(),
  player: zPlayerRef(),
  unitId: zNum(),
  amount: zNum(),
  pendingBunkerUpgrade: z.boolean().optional(),
});
type UpgradeStructureState = z.infer<typeof UpgradeStructureStateSchema>;

export const UpgradeStructureExecutionSnapshot = execSnapshotType({
  name: "UpgradeStructure",
  version: 1,
  schema: UpgradeStructureStateSchema,
  cls: () => UpgradeStructureExecution,
});
