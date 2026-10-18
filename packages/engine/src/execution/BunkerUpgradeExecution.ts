import {
  zInt,
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

// Payment and the construction lock are applied together by Player.upgradeUnit.
export class BunkerUpgradeExecution implements Execution {
  private active = true;
  private completeAt = 0;
  constructor(
    private player: Player,
    private site: Unit,
  ) {}
  init(game: Game, ticks: number): void {
    this.completeAt = ticks + 50;
  }
  tick(ticks: number): void {
    if (!this.site.isActive()) {
      this.active = false;
      return;
    }
    if (this.site.owner() !== this.player) {
      this.site.setUnderConstruction(false);
      this.active = false;
      return;
    }
    if (ticks < this.completeAt) return;
    this.site.increaseLevel();
    this.site.setUnderConstruction(false);
    this.active = false;
  }
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return BunkerUpgradeExecutionSnapshot.write({
      active: this.active,
      completeAt: this.completeAt,
      player: w.player(this.player),
      site: w.unit(this.site),
    });
  }
  restoreSnapshot(s: BunkerUpgradeState, r: SnapshotReader): void {
    this.active = s.active;
    this.completeAt = s.completeAt;
    this.player = r.player(s.player);
    this.site = r.unit(s.site);
  }
}
const State = z.object({
  active: z.boolean(),
  completeAt: zInt(),
  player: zPlayerRef(),
  site: zRef(),
});
type BunkerUpgradeState = z.infer<typeof State>;
export const BunkerUpgradeExecutionSnapshot = execSnapshotType({
  name: "BunkerUpgrade",
  version: 1,
  schema: State,
  cls: () => BunkerUpgradeExecution,
});
