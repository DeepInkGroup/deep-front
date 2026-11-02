// Economy values are per building, independent of the number already owned.
export const OIL_FACTORY_COSTS = [1_200_000n, 1_300_000n, 1_500_000n] as const;
export const OIL_FACTORY_MAX_LEVEL = 3;
export const OIL_FACTORY_MAX_BUILDINGS = 3;
export const OIL_TANKERS_BY_LEVEL = [2, 3, 5] as const;
export const OIL_TANKER_REPLACEMENT_TICKS = 1500; // 150 simulation seconds.
export const OIL_TANKER_STEP_TICKS = 2; // Half the regular trade-ship speed.
export const OIL_TANKER_CYCLE_TICKS = 600; // At least 60s between departures.
export function oilShipmentGold(distance: number): bigint {
  // Direct distance prevents toll detours from inflating the cargo value.
  return BigInt(Math.min(250_000, 100_000 + Math.floor(distance) * 250));
}
