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
import {
  missileStock,
  type ManufacturedMissile,
} from "@openfront/engine-api/game/MissileProduction";

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
    if (this.maintainMunitions()) return;
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
        (config.isUnitDisabled(UnitType.MissileFactory)
          ? this.game.unitInfo(type).cost(this.game, this.player) <=
            this.player.gold()
          : missileStock(this.player.missileArsenal(), type) > 0),
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
          this.investInDefense(
            config.isUnitDisabled(UnitType.MissileFactory)
              ? this.game.unitInfo(missile).cost(this.game, this.player)
              : 0n,
          );
          return;
        }
    }
    this.investInDefense(0n);
    const upgrade = sites.find(
      (s) => s.level() < 3 && this.player.canUpgradeUnit(s),
    );
    if (upgrade && this.player.gold() >= 4_000_000n)
      this.game.addExecution(
        new UpgradeStructureExecution(this.player, upgrade.id()),
      );
  }
  private maintainMunitions(): boolean {
    const config = this.game.config();
    if (config.isUnitDisabled(UnitType.MissileFactory)) return false;
    const hasOffense = this.player.units(UnitType.BunkerMissileSite).length > 0;
    const hasDefense =
      this.player.units(UnitType.SAMLauncher).length > 0 ||
      this.player.units(UnitType.CIWSDefense).length > 0;
    if (!hasOffense && !hasDefense) return false;
    const factories = this.player.units(UnitType.MissileFactory);
    if (!factories.length) {
      const cost = this.game
        .unitInfo(UnitType.MissileFactory)
        .cost(this.game, this.player);
      if (this.player.gold() < cost + 750_000n) return false;
      for (const tile of randTerritoryTileArray(
        this.random,
        this.game,
        this.player,
        24,
      )) {
        const spawn = this.player.canBuild(UnitType.MissileFactory, tile);
        if (spawn !== false) {
          this.game.addExecution(
            new ConstructionExecution(
              this.player,
              UnitType.MissileFactory,
              spawn,
            ),
          );
          return true;
        }
      }
      return false;
    }
    const factory = factories.find(
      (f) => f.isActive() && !f.isUnderConstruction() && config.isPowered(f),
    );
    if (!factory) return false;
    const orders: [ManufacturedMissile, number][] = [
      ...(hasDefense
        ? [[UnitType.SAMMissile, 20] as [ManufacturedMissile, number]]
        : []),
      ...(hasOffense
        ? ([
            [UnitType.HypersonicMissile, 2],
            [UnitType.StealthMissile, 2],
            [UnitType.AtomBomb, 2],
            [UnitType.HydrogenBomb, 1],
            [UnitType.MIRV, 1],
          ] as [ManufacturedMissile, number][])
        : []),
    ];
    for (const [type, target] of orders) {
      if (config.isUnitDisabled(type)) continue;
      const arsenal = this.player.missileArsenal();
      const pending = arsenal.jobs.filter((j) => j.missile === type).length;
      const amount = Math.min(
        type === UnitType.SAMMissile ? 5 : 1,
        target - missileStock(arsenal, type) - pending,
        20 - arsenal.jobs.length,
      );
      if (amount <= 0) continue;
      const cost =
        config.missileProductionCost(this.game, this.player, type) *
        BigInt(amount);
      if (this.player.gold() >= cost + 500_000n)
        this.player.queueMissiles(factory.id(), type, amount);
    }
    return false;
  }
  private investInDefense(reserved: bigint): void {
    if (this.game.config().isUnitDisabled(UnitType.CIWSDefense)) return;
    const owned = this.player.units(UnitType.CIWSDefense),
      info = this.game.unitInfo(UnitType.CIWSDefense);
    const upgrade = owned.find((u) => this.player.canUpgradeUnit(u));
    const cost = info.cost(this.game, this.player, 0, upgrade?.level() ?? 0);
    if (this.player.gold() < reserved + cost + 1_000_000n) return;
    if (upgrade) {
      this.game.addExecution(
        new UpgradeStructureExecution(this.player, upgrade.id()),
      );
      return;
    }
    if (owned.length) return;
    const anchor = this.player.units(UnitType.BunkerMissileSite)[0]?.tile();
    const tiles = randTerritoryTileArray(
      this.random,
      this.game,
      this.player,
      8,
    );
    if (anchor !== undefined) tiles.unshift(anchor);
    for (const tile of tiles) {
      const spawn = this.player.canBuild(UnitType.CIWSDefense, tile);
      if (spawn !== false) {
        this.game.addExecution(
          new ConstructionExecution(this.player, UnitType.CIWSDefense, spawn),
        );
        return;
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
