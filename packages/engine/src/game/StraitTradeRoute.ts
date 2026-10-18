import { z } from "zod";
import { TileRef } from "@openfront/engine-api/game/GameMap";
import { Game, Player, Unit } from "./Game";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathResult, PathStatus } from "../pathfinding/types";
import {
  acceptedStraitPassage,
  controlsStrait,
  freeStraitPassage,
  passageToll,
  segmentTiles,
} from "./StraitControl";

export const TollVoyageSchema = z.object({
  cargo: z.bigint().nullable(),
  paid: z.array(z.number().int()),
  signature: z.string(),
  route: z.array(z.number().int()).nullable(),
  index: z.number().int(),
});
export type TollVoyage = z.infer<typeof TollVoyageSchema>;
export function newTollVoyage(): TollVoyage {
  return { cargo: null, paid: [], signature: "", route: null, index: 0 };
}

const routeCaches = new WeakMap<
  Game,
  { version: string; paths: Map<string, TileRef[] | null> }
>();
function findTollRoute(
  game: Game,
  from: TileRef,
  to: TileRef,
  normal: WaterPathFinder,
  closed: Unit[],
) {
  if (!closed.length) return normal.findPath(from, to);
  const version = `${game.map().waterVersion()}/${game.waterGraphVersion()}`;
  let cache = routeCaches.get(game);
  if (!cache || cache.version !== version) {
    cache = { version, paths: new Map() };
    routeCaches.set(game, cache);
  }
  const key = `${from}/${to}/${closed.map((s) => `${s.id()}:${s.straitState()!.revision}`).join(";")}`;
  if (cache.paths.has(key)) return cache.paths.get(key)!;
  const blocked = new Set(closed.flatMap((s) => s.straitState()!.gate));
  let path = normal.findPath(from, to);
  if (
    path?.some(
      (t, i) =>
        i > 0 &&
        segmentTiles(game, path![i - 1], t).some((p) => blocked.has(p)),
    )
  )
    path = restrictedWaterPath(game, from, to, blocked);
  cache.paths.set(key, path);
  if (cache.paths.size > 64)
    cache.paths.delete(cache.paths.keys().next().value!);
  return path;
}

export function tradeRouteAvailable(
  game: Game,
  sender: Player,
  from: TileRef,
  to: TileRef,
  stations: Unit[],
) {
  if (!stations.length) return true;
  const normal = new WaterPathFinder(game, 0, true);
  const route = normal.findPath(from, to);
  if (!route) return false;
  const cargo = game
    .config()
    .tradeShipGold(Math.max(0, route.length - 1), sender);
  const closed = stations.filter(
    (s) =>
      !freeStraitPassage(s, sender) &&
      (!acceptedStraitPassage(s, sender) ||
        sender.gold() < passageToll(cargo, s.straitState()!.rate)),
  );
  return findTollRoute(game, from, to, normal, closed) !== null;
}

/** Sparse, deterministic A*: policy obstacles must survive every smoothing layer.
 * Used only when the normal memoized route crosses a closed strait. */
export function restrictedWaterPath(
  game: Game,
  start: TileRef,
  goal: TileRef,
  blocked: ReadonlySet<TileRef>,
): TileRef[] | null {
  const heap: { tile: TileRef; f: number; g: number }[] = [];
  const score = new Map<TileRef, number>([[start, 0]]),
    parent = new Map<TileRef, TileRef>();
  const less = (a: (typeof heap)[number], b: (typeof heap)[number]) =>
    a.f < b.f || (a.f === b.f && a.tile < b.tile);
  const push = (v: (typeof heap)[number]) => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0],
      end = heap.pop()!;
    if (heap.length) {
      heap[0] = end;
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++;
        if (!less(heap[c], heap[i])) break;
        [heap[i], heap[c]] = [heap[c], heap[i]];
        i = c;
      }
    }
    return top;
  };
  push({ tile: start, f: game.manhattanDist(start, goal), g: 0 });
  // Same upper bound as the existing water A*; a failed route stays blocked.
  let remaining = 1_000_000;
  while (heap.length && remaining-- > 0) {
    const { tile, g } = pop();
    if (score.get(tile) !== g) continue;
    if (tile === goal) {
      const path = [goal];
      while (path[path.length - 1] !== start)
        path.push(parent.get(path[path.length - 1])!);
      return path.reverse();
    }
    game.forEachNeighbor(tile, (n) => {
      if (blocked.has(n) || (n !== goal && !game.isWater(n))) return;
      const next = g + 1;
      if (next >= (score.get(n) ?? Infinity)) return;
      score.set(n, next);
      parent.set(n, tile);
      push({ tile: n, g: next, f: next + game.manhattanDist(n, goal) });
    });
  }
  return null;
}

export function tradePassageNext(
  game: Game,
  sender: Player,
  ship: Unit,
  destination: TileRef,
  normal: WaterPathFinder,
  stations: Unit[],
  state: TollVoyage,
  tilesTraveled: number,
): PathResult<TileRef> {
  const from = ship.tile();
  if (from === destination) return { status: PathStatus.COMPLETE, node: from };
  if (state.cargo === null) {
    const path = normal.findPath(from, destination);
    if (!path) return { status: PathStatus.NOT_FOUND };
    state.cargo = game
      .config()
      .tradeShipGold(tilesTraveled + Math.max(0, path.length - 1), sender);
  }
  const closed = stations.filter(
    (s) =>
      !state.paid.includes(s.id()) &&
      !freeStraitPassage(s, sender) &&
      (!acceptedStraitPassage(s, sender) ||
        sender.gold() < passageToll(state.cargo!, s.straitState()!.rate)),
  );
  const signature = `${sender.smallID()}/${destination}/${game.map().waterVersion()}/${game.waterGraphVersion()}/${stations.map((s) => `${s.id()}:${s.owner().smallID()}:${s.straitState()!.revision}:${closed.includes(s) ? 0 : 1}`).join(";")}`;
  if (state.signature !== signature) {
    state.signature = signature;
    const route = findTollRoute(game, from, destination, normal, closed);
    state.route = route;
    state.index = route?.[0] === from ? 1 : 0;
  }
  if (!state.route || state.index >= state.route.length)
    return { status: PathStatus.NOT_FOUND };
  const next = state.route[state.index];
  // Recheck live ownership, diplomacy and money immediately before passage.
  const crossed = new Set(segmentTiles(game, from, next));
  const due = stations.filter(
    (s) =>
      controlsStrait(game, s) &&
      s.straitState()?.enabled &&
      !state.paid.includes(s.id()) &&
      !freeStraitPassage(s, sender) &&
      s.straitState()!.gate.some((t) => crossed.has(t)),
  );
  if (due.some((s) => !acceptedStraitPassage(s, sender))) {
    state.signature = "";
    return { status: PathStatus.NOT_FOUND };
  }
  const total = due.reduce(
    (sum, s) => sum + passageToll(state.cargo!, s.straitState()!.rate),
    0n,
  );
  if (sender.gold() < total) {
    state.signature = "";
    return { status: PathStatus.NOT_FOUND };
  }
  for (const station of due) {
    const toll = passageToll(state.cargo, station.straitState()!.rate);
    sender.removeGold(toll);
    station.owner().addGold(toll, station.tile());
    station.owner().addTradeGold(toll);
    state.paid.push(station.id());
  }
  state.index++;
  return { status: PathStatus.NEXT, node: next };
}
