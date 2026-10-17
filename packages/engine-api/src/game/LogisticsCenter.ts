import { Gold, UnitType } from "./GameTypes";
import type { PlayerLike } from "./ReadViews";

export const LOGISTICS_CENTER_COST = 1_000_000n;
export const LOGISTICS_CENTER_BUILD_TICKS = 350;
export const LOGISTICS_CENTER_BONUS_PERCENT = 15n;

export function hasLogisticsCenter(player: PlayerLike): boolean {
  return player
    .units(UnitType.LogisticsCenter)
    .some((unit) => unit.isActive() && !unit.isUnderConstruction());
}

/** Apply once per recipient, after other train-income modifiers. */
export function logisticsTrainIncome(player: PlayerLike, gold: Gold): Gold {
  const ready = hasLogisticsCenter(player);
  return ready ? (gold * (100n + LOGISTICS_CENTER_BONUS_PERCENT)) / 100n : gold;
}
