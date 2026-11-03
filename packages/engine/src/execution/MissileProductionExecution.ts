import type { ManufacturedMissile } from "@openfront/engine-api/game/MissileProduction";
import { MISSILE_TYPES } from "@openfront/engine-api/game/MissileProduction";
import { zInt, zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import type { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  SnapshotReader,
  SnapshotWriter,
  ExecRecord,
} from "../snapshot/SnapshotContext";

export class MissileProductionExecution implements Execution {
  private active = true;
  constructor(
    private player: Player,
    private factoryId: number,
    private missile: ManufacturedMissile,
    private amount: number,
  ) {}
  init(_game: Game): void {}
  tick(): void {
    this.player.queueMissiles(this.factoryId, this.missile, this.amount);
    this.active = false;
  }
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return MissileProductionExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      factoryId: this.factoryId,
      missile: this.missile,
      amount: this.amount,
    });
  }
  restoreSnapshot(s: State, r: SnapshotReader): void {
    this.active = s.active;
    this.player = r.player(s.player);
    this.factoryId = s.factoryId;
    this.missile = s.missile;
    this.amount = s.amount;
  }
}
const Schema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  factoryId: zInt(),
  missile: z.enum(MISSILE_TYPES),
  amount: zInt(),
});
type State = z.infer<typeof Schema>;
export const MissileProductionExecutionSnapshot = execSnapshotType({
  name: "MissileProduction",
  version: 1,
  schema: Schema,
  cls: () => MissileProductionExecution,
});
