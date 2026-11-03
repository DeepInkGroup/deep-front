import {
  emptyMissileArsenal,
  ManufacturedMissile,
  MissileArsenalState,
  MISSILE_PRODUCTION_LIMIT,
  MISSILE_PRODUCTION_TICKS,
  MISSILE_TYPES,
  missileStock,
} from "@openfront/engine-api/game/MissileProduction";
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { z } from "zod";
import type { Game, Player } from "./Game";

export const MissileArsenalSchema = z.object({
  stock: z.array(z.number().int().nonnegative()).length(MISSILE_TYPES.length),
  jobs: z
    .array(
      z.object({
        id: z.number().int().positive(),
        factoryId: z.number().int().nonnegative(),
        missile: z.enum(MISSILE_TYPES),
        remainingTicks: z.number().int().positive(),
      }),
    )
    .max(MISSILE_PRODUCTION_LIMIT),
  nextId: z.number().int().positive(),
});

/** Copy-on-write state keeps worker diffs and saved games independent of mutations. */
export class MissileArsenal {
  constructor(public state: MissileArsenalState = emptyMissileArsenal()) {}

  queue(
    game: Game,
    player: Player,
    factoryId: number,
    missile: ManufacturedMissile,
    amount: number,
  ): boolean {
    if (
      !player.isAlive() ||
      game.inSpawnPhase() ||
      game.config().isUnitDisabled(UnitType.MissileFactory) ||
      game.config().isUnitDisabled(missile) ||
      !MISSILE_TYPES.includes(missile) ||
      !Number.isInteger(amount) ||
      amount < 1 ||
      this.state.jobs.length + amount > MISSILE_PRODUCTION_LIMIT
    )
      return false;
    if (
      missile === UnitType.SAMMissile &&
      game.config().isUnitDisabled(UnitType.SAMLauncher) &&
      game.config().isUnitDisabled(UnitType.CIWSDefense)
    )
      return false;
    const factory = player
      .units(UnitType.MissileFactory)
      .find((u) => u.id() === factoryId);
    if (!factory?.isActive() || factory.isUnderConstruction()) return false;
    const cost =
      game.config().missileProductionCost(game, player, missile) *
      BigInt(amount);
    if (player.gold() < cost) return false;
    player.removeGold(cost);
    const jobs = [...this.state.jobs];
    let nextId = this.state.nextId;
    for (let i = 0; i < amount; i++)
      jobs.push({
        id: nextId++,
        factoryId,
        missile,
        remainingTicks: MISSILE_PRODUCTION_TICKS[missile],
      });
    this.state = { ...this.state, jobs, nextId };
    return true;
  }

  consume(game: Game, type: ManufacturedMissile): boolean {
    if (game.config().isUnitDisabled(UnitType.MissileFactory)) return true;
    if (missileStock(this.state, type) <= 0) return false;
    const stock = [...this.state.stock];
    stock[MISSILE_TYPES.indexOf(type)]--;
    this.state = { ...this.state, stock };
    return true;
  }

  tick(game: Game, player: Player): void {
    if (!this.state.jobs.length) return;
    const factories = new Map(
      player.units(UnitType.MissileFactory).map((u) => [u.id(), u]),
    );
    const stock = [...this.state.stock];
    let changed = false;
    const jobs = this.state.jobs.flatMap((job) => {
      const factory = factories.get(job.factoryId);
      // Unfinished munitions are lost when their factory is destroyed or captured.
      if (!factory?.isActive() || game.owner(factory.tile()) !== player) {
        changed = true;
        return [];
      }
      if (
        factory.isUnderConstruction() ||
        !game.config().isPowered(factory) ||
        game.config().isUnitDisabled(UnitType.MissileFactory)
      )
        return [job];
      changed = true;
      if (job.remainingTicks === 1) {
        stock[MISSILE_TYPES.indexOf(job.missile)]++;
        return [];
      }
      return [{ ...job, remainingTicks: job.remainingTicks - 1 }];
    });
    if (changed) this.state = { ...this.state, stock, jobs };
  }
}
