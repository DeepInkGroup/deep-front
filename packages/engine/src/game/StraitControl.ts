import {
  STRAIT_MAX_WIDTH,
  StraitState,
} from "@openfront/engine-api/game/StraitControl";
import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import type { Game, Player, Unit } from "./Game";

export type StraitGeometry = Pick<StraitState, "bankA" | "bankB" | "gate">;

const bankIndexes = new WeakMap<Game, Map<TileRef, Unit[]>>();
export function invalidateStraitBanks(game: Game) {
  bankIndexes.delete(game);
}

/** Ownership changes cancel terms at the same instant as a bank is lost. */
export function onStraitBankChanged(game: Game, tile: TileRef) {
  if (game.unitCount(UnitType.StraitControlStation) === 0) return;
  let index = bankIndexes.get(game);
  if (!index) {
    index = new Map();
    for (const station of game.units(UnitType.StraitControlStation)) {
      const s = station.straitState();
      if (!s) continue;
      for (const bank of [s.bankA, s.bankB])
        index.set(bank, [...(index.get(bank) ?? []), station]);
    }
    bankIndexes.set(game, index);
  }
  for (const station of index.get(tile) ?? []) {
    const s = station.straitState();
    if (
      !s ||
      !station.isActive() ||
      game.owner(tile) === station.owner() ||
      !(s.enabled || s.accepted.length || s.rejected.length)
    )
      continue;
    station.setStraitState({
      ...s,
      enabled: false,
      accepted: [],
      rejected: [],
      revision: s.revision + 1,
    });
    game.displayMessage(
      "events_display.strait_toll_cancelled",
      MessageType.CHAT,
      station.owner().id(),
      undefined,
      {},
      station.id(),
    );
  }
}

/** A bank-to-bank cut must separate two waterways that both leave the local area.
 * This rejects open coasts, small ponds, dead ends, and gaps around a headland. */
export function straitAt(
  game: Game,
  player: Player,
  tile: TileRef,
  excludeStation?: number,
): StraitGeometry | undefined {
  if (
    !game.isValidRef(tile) ||
    !game.isLand(tile) ||
    game.isImpassable(tile) ||
    game.owner(tile) !== player
  )
    return;
  const x = game.x(tile),
    y = game.y(tile);
  const choices: StraitGeometry[] = [];
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]) {
    const gate: TileRef[] = [];
    let bankB: TileRef | undefined;
    for (let d = 1; d <= STRAIT_MAX_WIDTH + 1; d++) {
      const px = x + dx * d,
        py = y + dy * d;
      if (px < 0 || py < 0 || px >= game.width() || py >= game.height()) break;
      const ref = game.ref(px, py);
      if (game.isLand(ref)) {
        if (
          gate.length &&
          !game.isImpassable(ref) &&
          game.owner(ref) === player
        )
          bankB = ref;
        break;
      }
      gate.push(ref);
    }
    if (bankB === undefined || gate.length > STRAIT_MAX_WIDTH) continue;
    const center = gate[Math.floor(gate.length / 2)];
    const cx = game.x(center),
      cy = game.y(center);
    const radius = Math.max(24, gate.length * 2);
    const cut = new Set(gate);
    const seen = new Set<TileRef>();
    const mouths: { cells: Set<TileRef>; exits: number }[] = [];
    for (const sign of [-1, 1]) {
      const sx = cx - dy * sign,
        sy = cy + dx * sign;
      if (sx < 0 || sy < 0 || sx >= game.width() || sy >= game.height())
        continue;
      const start = game.ref(sx, sy);
      if (!game.isWater(start) || cut.has(start) || seen.has(start)) continue;
      const queue = [start],
        cells = new Set<TileRef>([start]);
      seen.add(start);
      let exits = 0;
      for (let i = 0; i < queue.length; i++) {
        const ref = queue[i],
          px = game.x(ref),
          py = game.y(ref);
        // Touching the map edge is not an exit into another waterway.
        if (Math.abs(px - cx) === radius || Math.abs(py - cy) === radius) {
          exits++;
          continue;
        }
        game.forEachNeighbor(ref, (n) => {
          if (
            !seen.has(n) &&
            !cut.has(n) &&
            game.isWater(n) &&
            Math.abs(game.x(n) - cx) <= radius &&
            Math.abs(game.y(n) - cy) <= radius
          ) {
            seen.add(n);
            cells.add(n);
            queue.push(n);
          }
        });
      }
      mouths.push({ cells, exits });
    }
    if (
      mouths.length !== 2 ||
      mouths.some(
        (m) =>
          m.exits < Math.min(2, gate.length) ||
          m.cells.size < Math.max(16, gate.length * 2),
      )
    )
      continue;
    // Two stations cannot charge the same local waterway twice.
    if (
      game
        .units(UnitType.StraitControlStation)
        .some(
          (s) =>
            s.id() !== excludeStation &&
            s.isActive() &&
            s
              .straitState()
              ?.gate.some(
                (t) =>
                  cut.has(t) ||
                  game.euclideanDistSquared(t, center) < radius * radius,
              ),
        )
    )
      continue;
    choices.push({ bankA: tile, bankB, gate });
  }
  return choices.sort(
    (a, b) => a.gate.length - b.gate.length || a.bankB - b.bankB,
  )[0];
}

const gateChecks = new WeakMap<
  Unit,
  { version: number; gate: TileRef[]; valid: boolean }
>();
export function controlsStrait(game: Game, station: Unit): boolean {
  const s = station.straitState();
  if (!s) return false;
  const version = game.map().waterVersion();
  let cached = gateChecks.get(station);
  if (!cached || cached.version !== version || cached.gate !== s.gate) {
    cached = {
      version,
      gate: s.gate,
      valid: s.gate.every((t) => game.isWater(t)),
    };
    gateChecks.set(station, cached);
  }
  return (
    !!s &&
    station.isActive() &&
    !station.isUnderConstruction() &&
    game.isLand(s.bankA) &&
    game.isLand(s.bankB) &&
    game.owner(s.bankA) === station.owner() &&
    game.owner(s.bankB) === station.owner() &&
    cached.valid
  );
}

export function activeStraits(game: Game): Unit[] {
  if (game.unitCount(UnitType.StraitControlStation) === 0) return [];
  return game
    .units(UnitType.StraitControlStation)
    .filter((s) => s.straitState()?.enabled && controlsStrait(game, s));
}

export function freeStraitPassage(station: Unit, traveler: Player): boolean {
  return (
    station.owner() === traveler ||
    !!(
      station.straitState()?.exemptAllies &&
      station.owner().isFriendly(traveler)
    )
  );
}

export function acceptedStraitPassage(
  station: Unit,
  traveler: Player,
): boolean {
  // AI nations respond by accepting commercial passage. Humans explicitly consent.
  return (
    traveler.type() !== PlayerType.Human ||
    !!station.straitState()?.accepted.includes(traveler.smallID())
  );
}

/** Grid line, including endpoints: smoothed ship movement cannot jump a gate. */
export function segmentTiles(
  game: Game,
  from: TileRef,
  to: TileRef,
): TileRef[] {
  let x = game.x(from),
    y = game.y(from);
  const tx = game.x(to),
    ty = game.y(to),
    dx = Math.abs(tx - x),
    dy = Math.abs(ty - y);
  const sx = x < tx ? 1 : -1,
    sy = y < ty ? 1 : -1;
  let error = dx - dy;
  const result: TileRef[] = [];
  for (;;) {
    result.push(game.ref(x, y));
    if (x === tx && y === ty) return result;
    const e = error * 2;
    if (e > -dy) {
      error -= dy;
      x += sx;
    }
    if (e < dx) {
      error += dx;
      y += sy;
    }
  }
}

export function passageToll(cargo: bigint, rate: number): bigint {
  return (cargo * BigInt(rate)) / 100n;
}
