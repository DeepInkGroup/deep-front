import {
  EMP_DISABLE_TICKS,
  EMP_RADIUS,
} from "@openfront/engine-api/game/AdvancedDefense";
import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { canSAMDetectAdvancedMissile } from "./AdvancedMissiles";
import { Game, Unit } from "./Game";

/** Sensor detection persists even if its SAM cannot fire or is later destroyed. */
export function detectEMPBySAM(game: Game, missile: Unit): void {
  if (
    missile.type() !== UnitType.EMPMissile ||
    !missile.isTargetable() ||
    missile.nukeState().detectedBySAM
  )
    return;
  for (const sam of game.units(UnitType.SAMLauncher)) {
    if (
      !sam.isActive() ||
      sam.isUnderConstruction() ||
      sam.owner().isFriendly(missile.owner()) ||
      sam.owner() === missile.owner()
    )
      continue;
    const range = game.config().dynamicSamRange(sam, game.ticks());
    if (
      game.euclideanDistSquared(sam.tile(), missile.tile()) > range * range ||
      !canSAMDetectAdvancedMissile(sam, missile)
    )
      continue;
    missile.updateNukeState({ detectedBySAM: true });
    return;
  }
}

/** EMP affects defenses only: no territory, terrain, troops, or building damage. */
export function applyEMP(game: Game, missile: Unit, target: TileRef): void {
  const notified = new Set<number>();
  for (const site of game.units(UnitType.CIWSDefense)) {
    const owner = site.owner();
    if (
      !site.isActive() ||
      owner === missile.owner() ||
      missile.owner().isFriendly(owner) ||
      (missile.owner().type() === PlayerType.Human && owner.isImmune()) ||
      game.euclideanDistSquared(target, site.tile()) > EMP_RADIUS * EMP_RADIUS
    )
      continue;
    site.disableByEMP(game.ticks() + EMP_DISABLE_TICKS);
    if (!notified.has(owner.smallID())) {
      notified.add(owner.smallID());
      game.displayMessage(
        "events_display.emp_defense_disabled",
        MessageType.CHAT,
        owner.id(),
        undefined,
        { name: missile.owner().displayName() },
        site.id(),
        missile.owner().id(),
      );
    }
  }
}
