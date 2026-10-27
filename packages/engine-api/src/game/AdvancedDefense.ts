// Scaling each radius by sqrt(1/2) halves the blast area, rather than its diameter.
export const STEALTH_BLAST = {
  inner: 12 * Math.SQRT1_2,
  outer: 30 * Math.SQRT1_2,
} as const;
export const CIWS_COSTS = [2_000_000n, 3_000_000n, 3_500_000n] as const;
export const CIWS_MAX_LEVEL = 5;

export const EMP_COST = 750_000;
/** Each expiry represents one temporarily suppressed SAM interception slot. */
export function empSAMCapacity(
  level: number,
  expiries: readonly number[] | undefined,
  ticks: number,
): number {
  let suppressed = 0;
  for (const expiry of expiries ?? []) if (expiry > ticks) suppressed++;
  return Math.max(0, level - suppressed);
}
export const EMP_RADIUS = 70;
export const EMP_DISABLE_TICKS = 50;
export const BUNKER_UPGRADE_TICKS = 20;
