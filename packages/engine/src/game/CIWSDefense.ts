import {
  GameType,
  MessageType,
  Nukes,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { TileRef } from "@openfront/engine-api/game/GameMap";
import { NukeType } from "@openfront/engine-api/StatsSchemas";
import { Game, Unit } from "./Game";

/** Test the complete swept flight segment, so fast missiles cannot skip coverage. */
export function interceptWithCIWS(
  game: Game,
  missile: Unit,
  from: TileRef,
  to: TileRef,
): boolean {
  if (game.unitCount(UnitType.CIWSDefense) === 0) return false;
  if (!missile.isActive() || !Nukes.has(missile.type())) return false;
  if (missile.type() !== UnitType.MIRV && missile.nukeState().waitTicks > 0)
    return false;
  const x = game.x(from),
    y = game.y(from),
    dx = game.x(to) - x,
    dy = game.y(to) - y;
  const lengthSquared = dx * dx + dy * dy;
  for (const site of game.units(UnitType.CIWSDefense)) {
    if (
      !site.isActive() ||
      site.isUnderConstruction() ||
      site.owner() === missile.owner()
    )
      continue;
    if (site.owner().isFriendly(missile.owner())) {
      const aftergame =
        game.getWinner() !== null &&
        game.config().gameConfig().gameType !== GameType.Singleplayer;
      if (!aftergame || !site.owner().isOnSameTeam(missile.owner())) continue;
    }
    const sx = game.x(site.tile()) - x,
      sy = game.y(site.tile()) - y;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (sx * dx + sy * dy) / lengthSquared));
    const ex = sx - t * dx,
      ey = sy - t * dy;
    const range = game.config().dynamicSamRange(site, game.ticks());
    if (ex * ex + ey * ey > range * range) continue;
    missile.move(game.ref(Math.round(x + t * dx), Math.round(y + t * dy)));
    missile.delete(true, site.owner());
    game.stats().bombIntercept(site.owner(), missile.type() as NukeType, 1);
    game.displayMessage(
      "events_display.missile_intercepted",
      MessageType.SAM_HIT,
      site.owner().id(),
      undefined,
      { unit: missile.type() },
    );
    return true;
  }
  return false;
}
