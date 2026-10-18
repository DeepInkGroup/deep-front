import { UnitInfo } from "@openfront/engine-api/game/GameTypes";
import { UnitLike } from "@openfront/engine-api/game/ReadViews";

/** A capped blueprint remains useful for upgrading existing buildings. */
export function hasBuildOrUpgradeCapacity(
  info: UnitInfo,
  owned: readonly Pick<UnitLike, "level" | "isUnderConstruction">[],
): boolean {
  return (
    info.maxCount === undefined ||
    owned.length < info.maxCount ||
    (info.upgradable === true &&
      owned.some(
        (unit) =>
          !unit.isUnderConstruction() &&
          (info.maxLevel === undefined || unit.level() < info.maxLevel),
      ))
  );
}
