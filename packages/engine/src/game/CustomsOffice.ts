import { UnitType } from "@openfront/engine-api/game/GameTypes";
import type { TileRef } from "@openfront/engine-api/game/GameMap";
import type { Game, Player, Unit } from "./Game";

export function customsPartner(office: Unit): Player | undefined {
  const partner = office.targetPlayer();
  return partner?.isPlayer() ? partner : undefined;
}

/** A fixed bilateral agreement, including unfinished offices. */
export function hasCustomsOffice(player: Player, partner: Player): boolean {
  return player
    .units(UnitType.CustomsOffice)
    .some((office) => office.isActive() && customsPartner(office) === partner);
}

/** Only owned, passable land with a cardinal land border qualifies. */
export function customsPartnerAt(
  game: Game,
  player: Player,
  tile: TileRef,
): Player | undefined {
  if (
    !game.isValidRef(tile) ||
    !game.isLand(tile) ||
    game.isImpassable(tile) ||
    game.owner(tile) !== player
  )
    return undefined;
  const neighbors = new Map<number, Player>();
  game.forEachNeighbor(tile, (neighbor) => {
    if (!game.isLand(neighbor)) return;
    const owner = game.owner(neighbor);
    if (
      owner.isPlayer() &&
      owner !== player &&
      !hasCustomsOffice(player, owner)
    )
      neighbors.set(owner.smallID(), owner);
  });
  // Stable tie-break at a junction; no client-supplied partner can bypass caps.
  return [...neighbors.values()].sort((a, b) => a.smallID() - b.smallID())[0];
}
