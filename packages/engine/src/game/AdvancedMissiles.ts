import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { simpleHash } from "@openfront/engine-lib/Util";
import { Unit } from "./Game";

export function isBunkerMissile(type: UnitType): boolean {
  return (
    type === UnitType.StealthMissile || type === UnitType.HypersonicMissile
  );
}

// A fixed per-launcher/per-missile detection result prevents repeated rolls
// every tick and gives exactly the same result on all clients and in replays.
export function canSAMDetectAdvancedMissile(sam: Unit, missile: Unit): boolean {
  if (missile.type() === UnitType.HypersonicMissile) {
    return sam.owner() === missile.targetPlayer();
  }
  if (missile.type() === UnitType.StealthMissile) {
    return (
      missile.isTargetable() &&
      simpleHash(`${sam.id()}:${missile.id()}:stealth`) % 4 !== 0
    );
  }
  return true;
}
