// Economy values are per building, independent of the number already owned.
export const OIL_FACTORY_COSTS = [1_200_000n, 1_300_000n, 1_500_000n] as const;
export const OIL_FACTORY_INCOME = [50_000n, 75_000n, 90_000n] as const;
export const OIL_FACTORY_MAX_LEVEL = 3;
export const OIL_FACTORY_MAX_BUILDINGS = 5;
export const OIL_FACTORY_PAYOUT_TICKS = 100; // Ten seconds of simulation time.
