import {
  PlayerType,
  Structures,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  zInt,
  zPlayerRef,
  zRandom,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { simpleHash } from "@openfront/engine-lib/Util";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { ConstructionExecution } from "./ConstructionExecution";
import { randTerritoryTileArray } from "./nation/NationUtils";
import { UpgradeStructureExecution } from "./UpgradeStructureExecution";

export class BunkerAIExecution implements Execution {
  private active = true;
  private game: Game;
  private nextCheckTick = 0;
  private random: PseudoRandom;
  constructor(private player: Player) {
    this.random = new PseudoRandom(simpleHash(`${player.id()}:bunker`));
  }
  init(game: Game, ticks: number): void {
    this.game = game;
    this.active = this.player.type() !== PlayerType.Human;
    this.nextCheckTick = ticks + 100 + (this.player.smallID() % 50);
  }
  tick(ticks: number): void {
    if (!this.player.isAlive()) {
      this.active = false;
      return;
    }
    if (ticks < this.nextCheckTick) return;
    this.nextCheckTick = ticks + 100;
    const config = this.game.config();
    if (config.isUnitDisabled(UnitType.BunkerMissileSite)) return;
    const sites = this.player.units(UnitType.BunkerMissileSite);
    if (!sites.length) {
      // Retain a reserve for the AI's normal economy and defense purchases.
      if (this.player.gold() < 2_000_000n) return;
      for (const tile of randTerritoryTileArray(
        this.random,
        this.game,
        this.player,
        12,
      )) {
        const spawn = this.player.canBuild(UnitType.BunkerMissileSite, tile);
        if (spawn !== false) {
          this.game.addExecution(
            new ConstructionExecution(
              this.player,
              UnitType.BunkerMissileSite,
              spawn,
            ),
          );
          return;
        }
      }
      return;
    }
    const ready = sites.find(
      (s) => !s.isUnderConstruction() && !s.isInCooldown(),
    );
    const enemies = this.game
      .players()
      .filter(
        (p) => p !== this.player && p.isAlive() && !this.player.isFriendly(p),
      );
    const missile = [UnitType.HypersonicMissile, UnitType.StealthMissile].find(
      (type) =>
        !config.isUnitDisabled(type) &&
        this.game.unitInfo(type).cost(this.game, this.player) <=
          this.player.gold(),
    );
    if (ready && missile && enemies.length) {
      const enemy = enemies[this.random.nextInt(0, enemies.length)];
      // Prefer valuable structures, then fall back to sampled enemy territory.
      const targets = enemy
        .units()
        .filter((u) => u.isActive() && Structures.has(u.type()));
      const tiles = targets.length
        ? targets.map((u) => u.tile())
        : randTerritoryTileArray(this.random, this.game, enemy, 8);
      for (const tile of tiles)
        if (this.player.canBuild(missile, tile) !== false) {
          this.game.addExecution(
            new ConstructionExecution(this.player, missile, tile),
          );
          return;
        }
    }
    const upgrade = sites.find(
      (s) => s.level() < 3 && this.player.canUpgradeUnit(s),
    );
    if (upgrade && this.player.gold() >= 4_000_000n)
      this.game.addExecution(
        new UpgradeStructureExecution(this.player, upgrade.id()),
      );
  }
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return BunkerAIExecutionSnapshot.write({
      active: this.active,
      initialized: this.game !== undefined,
      player: w.player(this.player),
      nextCheckTick: this.nextCheckTick,
      random: w.random(this.random),
    });
  }
  restoreSnapshot(s: BunkerAIState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.game = r.game;
    this.player = r.player(s.player);
    this.nextCheckTick = s.nextCheckTick;
    this.random = r.random(s.random);
  }
}
const State = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  player: zPlayerRef(),
  nextCheckTick: zInt(),
  random: zRandom(),
});
type BunkerAIState = z.infer<typeof State>;
export const BunkerAIExecutionSnapshot = execSnapshotType({
  name: "BunkerAI",
  version: 1,
  schema: State,
  cls: () => BunkerAIExecution,
});
