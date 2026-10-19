import { TileRef } from "@openfront/engine-api/game/GameMap";
import { Game, Unit } from "./Game";

export const WATER_TUNNEL_MIN_LEVEL = 31;

/** A bounded, cardinal staircase keeps rail sprites and train motion continuous.
 * It crosses water only when both portals qualify; impassable terrain is never drilled. */
export function waterTunnelPath(
  game: Game,
  from: Unit,
  to: Unit,
): TileRef[] | null {
  if (
    from.level() < WATER_TUNNEL_MIN_LEVEL ||
    to.level() < WATER_TUNNEL_MIN_LEVEL ||
    !from.isActive() ||
    !to.isActive() ||
    from.isUnderConstruction() ||
    to.isUnderConstruction()
  )
    return null;
  if (
    game.euclideanDistSquared(from.tile(), to.tile()) >
    game.config().trainStationMaxRange() ** 2
  )
    return null;
  if (!game.isLand(from.tile()) || !game.isLand(to.tile())) return null;
  let x = game.x(from.tile()),
    y = game.y(from.tile());
  const tx = game.x(to.tile()),
    ty = game.y(to.tile()),
    dx = Math.abs(tx - x),
    dy = Math.abs(ty - y);
  const sx = Math.sign(tx - x),
    sy = Math.sign(ty - y);
  let ix = 0,
    iy = 0,
    water = false;
  const path = [from.tile()];
  while (ix < dx || iy < dy) {
    if ((1 + 2 * ix) * dy < (1 + 2 * iy) * dx) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    const tile = game.ref(x, y);
    if (game.isImpassable(tile)) return null;
    water ||= game.isWater(tile);
    path.push(tile);
  }
  return water && path.length < game.config().railroadMaxSize() ? path : null;
}
