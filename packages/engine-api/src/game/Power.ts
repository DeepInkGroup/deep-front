import { UnitType } from "./GameTypes";
import type { PlayerLike } from "./ReadViews";

export const POWER_PLANT_BUILD_TICKS = 300;
export const POWER_PER_LEVEL = 100; // MW
export const POWER_DEMAND: Readonly<Record<string, number>> = {
  [UnitType.City]: 20,
  [UnitType.Factory]: 30,
  [UnitType.OilFactory]: 40,
  [UnitType.CopperMine]: 25,
};
export const POWER_CONSUMERS = [
  UnitType.City,
  UnitType.Factory,
  UnitType.OilFactory,
  UnitType.CopperMine,
] as const;
export function powerPlantCost(level = 0): bigint {
  return 750_000n + BigInt(level) * 250_000n;
}
export interface PowerBuilding {
  id: number;
  unitType: string;
  level: number;
  active: boolean;
  underConstruction: boolean;
}
export interface PowerGrid {
  enabled: boolean;
  supply: number;
  demand: number;
  used: number;
  offline: number;
  plannedSupply: number;
  plannedDemand: number;
  powered: ReadonlySet<number>;
}
/** Integer allocation shared by the simulation, HUD and map renderer. */
export function allocatePower(
  buildings: readonly PowerBuilding[],
  disabled = false,
): PowerGrid {
  const grid: PowerGrid = {
    enabled: !disabled,
    supply: 0,
    demand: 0,
    used: 0,
    offline: 0,
    plannedSupply: 0,
    plannedDemand: 0,
    powered: new Set(),
  };
  const consumers: PowerBuilding[] = [];
  for (const b of buildings) {
    if (!b.active) continue;
    if (b.unitType === UnitType.PowerPlant) {
      grid.plannedSupply += b.level * POWER_PER_LEVEL;
      if (!b.underConstruction) grid.supply += b.level * POWER_PER_LEVEL;
    } else if (POWER_DEMAND[b.unitType]) {
      const demand = POWER_DEMAND[b.unitType] * b.level;
      grid.plannedDemand += demand;
      if (b.underConstruction) continue;
      grid.demand += demand;
      consumers.push(b);
    }
  }
  // Oldest complete buildings have priority. Skip an oversized load so smaller
  // buildings can still use the remaining capacity; no partial production.
  consumers.sort((a, b) => a.id - b.id);
  const powered = new Set<number>();
  for (const b of consumers) {
    const load = POWER_DEMAND[b.unitType] * b.level;
    if (disabled || grid.used + load <= grid.supply) {
      powered.add(b.id);
      grid.used += load;
    } else grid.offline++;
  }
  grid.powered = powered;
  return grid;
}
export function powerUnitId(unit: {
  tile(): number;
  id?: () => number;
}): number {
  return unit.id?.() ?? unit.tile();
}
export function calculatePowerGrid(
  player: PlayerLike,
  disabled = false,
): PowerGrid {
  return allocatePower(
    [...POWER_CONSUMERS, UnitType.PowerPlant].flatMap((type) =>
      player.units(type).map((u) => ({
        id: powerUnitId(u),
        unitType: type,
        level: u.level(),
        active: u.isActive(),
        underConstruction: u.isUnderConstruction(),
      })),
    ),
    disabled,
  );
}
