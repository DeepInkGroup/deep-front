import { UnitType } from "./GameTypes";

export const MISSILE_FACTORY_COST = 1_000_000;
export const MISSILE_FACTORY_BUILD_TICKS = 400;
export const MISSILE_PRODUCTION_LIMIT = 20;
export const MISSILE_TYPES = [
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.StealthMissile,
  UnitType.HypersonicMissile,
  UnitType.EMPMissile,
  UnitType.SAMMissile,
] as const;
export type ManufacturedMissile = (typeof MISSILE_TYPES)[number];
export const MISSILE_PRODUCTION_TICKS: Record<ManufacturedMissile, number> = {
  [UnitType.AtomBomb]: 600,
  [UnitType.HydrogenBomb]: 900,
  [UnitType.MIRV]: 1200,
  [UnitType.StealthMissile]: 350,
  [UnitType.HypersonicMissile]: 300,
  [UnitType.EMPMissile]: 200,
  [UnitType.SAMMissile]: 50,
};
export interface MissileProductionJob {
  id: number;
  factoryId: number;
  missile: ManufacturedMissile;
  remainingTicks: number;
}
export interface MissileArsenalState {
  stock: number[];
  jobs: MissileProductionJob[];
  nextId: number;
}
export function emptyMissileArsenal(): MissileArsenalState {
  return { stock: MISSILE_TYPES.map(() => 0), jobs: [], nextId: 1 };
}
export function isManufacturedMissile(
  type: UnitType,
): type is ManufacturedMissile {
  return (MISSILE_TYPES as readonly UnitType[]).includes(type);
}
export function missileStock(
  state: MissileArsenalState | undefined,
  type: UnitType,
): number {
  return state?.stock[MISSILE_TYPES.indexOf(type as ManufacturedMissile)] ?? 0;
}
