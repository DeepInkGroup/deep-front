import { UnitType } from "@openfront/engine-api/game/GameTypes";

export const EXTRA_BUILD_SHORTCUTS = [
  {
    key: "buildOilFactory",
    type: UnitType.OilFactory,
    code: "Shift+Digit1",
    name: "oil_factory",
  },
  {
    key: "buildCopperMine",
    type: UnitType.CopperMine,
    code: "Shift+Digit2",
    name: "copper_mine",
  },
  {
    key: "buildLogisticsCenter",
    type: UnitType.LogisticsCenter,
    code: "Shift+Digit3",
    name: "logistics_center",
  },
  {
    key: "buildCustomsOffice",
    type: UnitType.CustomsOffice,
    code: "Shift+Digit4",
    name: "customs_office",
  },
  {
    key: "buildBunkerMissileSite",
    type: UnitType.BunkerMissileSite,
    code: "Shift+Digit5",
    name: "bunker_missile_site",
  },
  {
    key: "buildCIWSDefense",
    type: UnitType.CIWSDefense,
    code: "Shift+Digit6",
    name: "ciws_defense",
  },
  {
    key: "buildStealthMissile",
    type: UnitType.StealthMissile,
    code: "Shift+Digit8",
    name: "stealth_missile",
  },
  {
    key: "buildHypersonicMissile",
    type: UnitType.HypersonicMissile,
    code: "Shift+Digit9",
    name: "hypersonic_missile",
  },
] as const;
