import { STEALTH_BLAST } from "@openfront/engine-api/game/AdvancedDefense";
/**
 * Canonical unit type string constants.
 *
 * These match the strings the upstream game sends in UnitEventUpdate.unitType.
 * Use these instead of raw string literals to prevent typos and enable
 * find-all-references.
 */

// ---------------------------------------------------------------------------
// Individual unit type constants
// ---------------------------------------------------------------------------

// Mobile units
export const UT_TRANSPORT = "Transport" as const;
export const UT_TRADE_SHIP = "Trade Ship" as const;
export const UT_WARSHIP = "Warship" as const;
export const UT_ATOM_BOMB = "Atom Bomb" as const;
export const UT_HYDROGEN_BOMB = "Hydrogen Bomb" as const;
export const UT_MIRV = "MIRV" as const;
export const UT_SAM_MISSILE = "SAMMissile" as const;
export const UT_SHELL = "Shell" as const;
export const UT_MIRV_WARHEAD = "MIRV Warhead" as const;
export const UT_TRAIN = "Train" as const;

// Structures
export const UT_CITY = "City" as const;
export const UT_PORT = "Port" as const;
export const UT_FACTORY = "Factory" as const;
export const UT_OIL_FACTORY = "Oil Factory" as const;
export const UT_COPPER_MINE = "Copper Mine" as const;
export const UT_LOGISTICS_CENTER = "Logistics Center" as const;
export const UT_STRAIT_CONTROL_STATION = "Strait Control Station" as const;
export const UT_CIWS_DEFENSE = "CIWS Defense" as const;
export const UT_BUNKER_MISSILE_SITE = "Bunker Missile Site" as const;
export const UT_STEALTH_MISSILE = "Stealth Missile" as const;
export const UT_HYPERSONIC_MISSILE = "Hypersonic Missile" as const;
export const UT_CUSTOMS_OFFICE = "Customs Office" as const;
export const UT_DEFENSE_POST = "Defense Post" as const;
export const UT_SAM_LAUNCHER = "SAM Launcher" as const;
export const UT_MISSILE_SILO = "Missile Silo" as const;

// ---------------------------------------------------------------------------
// Derived sets
// ---------------------------------------------------------------------------

export const STRUCTURE_TYPES: ReadonlySet<string> = new Set([
  UT_STRAIT_CONTROL_STATION,
  UT_CIWS_DEFENSE,
  UT_COPPER_MINE,
  UT_LOGISTICS_CENTER,
  UT_CUSTOMS_OFFICE,
  UT_BUNKER_MISSILE_SITE,
  UT_OIL_FACTORY,
  UT_CITY,
  UT_PORT,
  UT_FACTORY,
  UT_DEFENSE_POST,
  UT_SAM_LAUNCHER,
  UT_MISSILE_SILO,
]);

export const NUKE_TYPES: ReadonlySet<string> = new Set([
  UT_ATOM_BOMB,
  UT_STEALTH_MISSILE,
  UT_HYPERSONIC_MISSILE,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
]);

/** Nuke types whose rendered position is interpolated lastPos→pos each render
 *  frame (UnitPass). Their trails stamp only up to lastPos so the tail never
 *  leads the smoothly-moving missile. */
export const SMOOTHED_NUKE_TYPES: ReadonlySet<string> = new Set([
  UT_ATOM_BOMB,
  UT_STEALTH_MISSILE,
  UT_HYPERSONIC_MISSILE,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_MIRV_WARHEAD,
]);

/** Units that leave a trail on the map (TrailManager). */
export const TRAIL_TYPES: ReadonlySet<string> = new Set([
  UT_TRANSPORT,
  UT_ATOM_BOMB,
  UT_STEALTH_MISSILE,
  UT_HYPERSONIC_MISSILE,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_MIRV_WARHEAD,
]);

/** Blast radii (in tiles) matching upstream DefaultConfig.nukeMagnitudes(). */
export const NUKE_MAGNITUDES: Readonly<
  Record<string, { inner: number; outer: number }>
> = {
  [UT_STEALTH_MISSILE]: STEALTH_BLAST,
  [UT_HYPERSONIC_MISSILE]: { inner: 12, outer: 30 },
  [UT_ATOM_BOMB]: { inner: 12, outer: 30 },
  [UT_HYDROGEN_BOMB]: { inner: 80, outer: 100 },
  [UT_MIRV_WARHEAD]: { inner: 12, outer: 18 },
};

// ---------------------------------------------------------------------------
// Ordered lists (atlas column order — used by GPU passes + header)
// ---------------------------------------------------------------------------

/** All unit type strings in the canonical order used by RendererConfig.unitTypes. */
export const ALL_UNIT_TYPES = [
  UT_TRANSPORT,
  UT_TRADE_SHIP,
  UT_WARSHIP,
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_SAM_MISSILE,
  UT_SHELL,
  UT_MIRV_WARHEAD,
  UT_CITY,
  UT_PORT,
  UT_FACTORY,
  UT_DEFENSE_POST,
  UT_SAM_LAUNCHER,
  UT_MISSILE_SILO,
  UT_TRAIN,
  UT_OIL_FACTORY,
  UT_COPPER_MINE,
  UT_LOGISTICS_CENTER,
  UT_CUSTOMS_OFFICE,
  UT_BUNKER_MISSILE_SITE,
  UT_STEALTH_MISSILE,
  UT_HYPERSONIC_MISSILE,
  UT_CIWS_DEFENSE,
  UT_STRAIT_CONTROL_STATION,
] as const;
