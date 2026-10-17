import { Gold, UnitType } from "@openfront/engine-api/game/GameTypes";
import { CUSTOMS_OFFICE_BONUS_PERCENT } from "@openfront/engine-api/game/CustomsOffice";
import {
  hasLogisticsCenter,
  LOGISTICS_CENTER_BONUS_PERCENT,
} from "@openfront/engine-api/game/LogisticsCenter";
import { customsPartner } from "./CustomsOffice";
import type { Player } from "./Game";

export function trainTradeIncome(
  player: Player,
  other: Player,
  gold: Gold,
): Gold {
  let bonus = hasLogisticsCenter(player) ? LOGISTICS_CENTER_BONUS_PERCENT : 0n;
  if (
    other !== player &&
    player
      .units(UnitType.CustomsOffice)
      .some(
        (office) =>
          office.isActive() &&
          !office.isUnderConstruction() &&
          customsPartner(office) === other,
      )
  )
    bonus += CUSTOMS_OFFICE_BONUS_PERCENT;
  return (gold * (100n + bonus)) / 100n;
}
