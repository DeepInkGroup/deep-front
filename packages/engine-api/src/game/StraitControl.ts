import { z } from "zod";

export const STRAIT_BUILD_TICKS = 900;
export const STRAIT_MAX_WIDTH = 80;
export const STRAIT_COSTS = [3_500_000n, 5_000_000n] as const;

/** Agreement IDs are player small IDs. A revision change requires fresh consent. */
export const StraitStateSchema = z.object({
  collectedGold: z.bigint().optional(),
  passages: z.number().int().nonnegative().optional(),
  bankA: z.number().int(),
  bankB: z.number().int(),
  gate: z.array(z.number().int()),
  enabled: z.boolean(),
  rate: z.number().int().min(1).max(10),
  exemptAllies: z.boolean(),
  revision: z.number().int(),
  accepted: z.array(z.number().int()),
  rejected: z.array(z.number().int()),
});
export type StraitState = z.infer<typeof StraitStateSchema>;

export function copyStraitState(state: StraitState): StraitState {
  return {
    ...(state.collectedGold === undefined
      ? {}
      : { collectedGold: state.collectedGold }),
    ...(state.passages === undefined ? {} : { passages: state.passages }),
    bankA: state.bankA,
    bankB: state.bankB,
    gate: [...state.gate],
    enabled: state.enabled,
    rate: state.rate,
    exemptAllies: state.exemptAllies,
    revision: state.revision,
    accepted: [...state.accepted],
    rejected: [...state.rejected],
  };
}
