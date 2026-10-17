import {
  Gold,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { COPPER_MINE_INCOME } from "@openfront/engine-api/game/CopperMine";
import { OIL_FACTORY_INCOME } from "@openfront/engine-api/game/OilFactory";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  zInt,
  zPlayerRef,
  zRandom,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { simpleHash } from "@openfront/engine-lib/Util";
import { z } from "zod";
import { Execution, Game, Player, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { ConstructionExecution } from "./ConstructionExecution";
import { randTerritoryTileArray } from "./nation/NationUtils";
import { UpgradeStructureExecution } from "./UpgradeStructureExecution";

export const ECONOMY_BUILDINGS: readonly UnitType[] = [
  UnitType.OilFactory,
  UnitType.CopperMine,
];
const CHECK_INTERVAL = 50;
type Investment = { type: UnitType; unit?: Unit; cost: Gold; income: Gold };

// Both tribes and nations invest real gold. A separate deterministic PRNG
// preserves their existing attack decisions and can be restored from a save.
export class EconomyAIExecution implements Execution {
  private active = true;
  private game: Game;
  private nextCheckTick = 0;
  private random: PseudoRandom;

  constructor(private player: Player) {
    this.random = new PseudoRandom(simpleHash(`${player.id()}:economy`));
  }

  init(game: Game, ticks: number): void {
    this.game = game;
    this.active = this.player.type() !== PlayerType.Human;
    this.nextCheckTick =
      ticks + CHECK_INTERVAL + (this.player.smallID() % CHECK_INTERVAL);
  }

  tick(ticks: number): void {
    if (!this.player.isAlive()) {
      this.active = false;
      return;
    }
    if (ticks < this.nextCheckTick) return;
    this.nextCheckTick = ticks + CHECK_INTERVAL;
    if (this.player.gold() < 650_000n) return;

    const investments: Investment[] = [];
    for (const type of ECONOMY_BUILDINGS) {
      if (this.game.config().isUnitDisabled(type)) continue;
      const info = this.game.unitInfo(type);
      const income =
        type === UnitType.OilFactory ? OIL_FACTORY_INCOME : COPPER_MINE_INCOME;
      const owned = this.player.units(type);
      const cost = info.cost(this.game, this.player);
      if (owned.length < info.maxCount! && this.player.gold() >= cost) {
        investments.push({ type, cost, income: income[0] });
      }
      for (const unit of owned) {
        if (!this.player.canUpgradeUnit(unit)) continue;
        investments.push({
          type,
          unit,
          cost: info.cost(this.game, this.player, 0, unit.level()),
          income: income[unit.level()] - income[unit.level() - 1],
        });
      }
    }
    // Prefer the fastest return, using integer cross-products for lockstep.
    investments.sort((a, b) => {
      const difference = a.cost * b.income - b.cost * a.income;
      return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    });
    let candidates: ReturnType<typeof randTerritoryTileArray> | undefined;
    for (const investment of investments) {
      if (investment.unit) {
        this.game.addExecution(
          new UpgradeStructureExecution(this.player, investment.unit.id()),
        );
        return;
      }
      candidates ??= randTerritoryTileArray(
        this.random,
        this.game,
        this.player,
        8,
      );
      for (const tile of candidates) {
        const spawn = this.player.canBuild(investment.type, tile);
        if (spawn !== false) {
          this.game.addExecution(
            new ConstructionExecution(this.player, investment.type, spawn),
          );
          return;
        }
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return EconomyAIExecutionSnapshot.write({
      active: this.active,
      initialized: this.game !== undefined,
      player: w.player(this.player),
      nextCheckTick: this.nextCheckTick,
      random: w.random(this.random),
    });
  }

  restoreSnapshot(s: EconomyAIState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.game = r.game;
    this.player = r.player(s.player);
    this.nextCheckTick = s.nextCheckTick;
    this.random = r.random(s.random);
  }
}

const EconomyAIStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  player: zPlayerRef(),
  nextCheckTick: zInt(),
  random: zRandom(),
});
type EconomyAIState = z.infer<typeof EconomyAIStateSchema>;
export const EconomyAIExecutionSnapshot = execSnapshotType({
  name: "EconomyAI",
  version: 1,
  schema: EconomyAIStateSchema,
  cls: () => EconomyAIExecution,
});
