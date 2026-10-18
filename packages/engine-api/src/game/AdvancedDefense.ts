// Scaling each radius by sqrt(1/2) halves the blast area, rather than its diameter.
export const STEALTH_BLAST = {
  inner: 12 * Math.SQRT1_2,
  outer: 30 * Math.SQRT1_2,
} as const;
export const CIWS_COSTS = [2_000_000n, 3_000_000n, 3_500_000n] as const;
export const CIWS_MAX_LEVEL = 5;
