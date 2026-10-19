import { describe, expect, it } from "vitest";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { GameMapImpl } from "@openfront/engine-lib/game/GameMapImpl";
import { createGame } from "@openfront/engine/game/GameImpl";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { TrainStation } from "@openfront/engine/game/TrainStation";
import { waterTunnelPath } from "@openfront/engine/game/WaterTunnel";
import { TrainExecution } from "@openfront/engine/execution/TrainExecution";
import { RecomputeRailClusterExecution } from "@openfront/engine/execution/RecomputeRailClusterExecution";
import {
  restoreGame,
  snapshotGame,
} from "@openfront/engine/snapshot/GameSnapshot";
import { executeTicks } from "../util/utils";

function maps(narrow = false) {
  const create = (scale: number) => {
    const w = 200 / scale,
      bytes = new Uint8Array(w * w);
    let land = 0;
    const wet = (x: number) => (narrow ? x === 100 : x >= 90 && x <= 110);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const water = wet(x * scale);
        let b = water ? 33 : 130;
        if (!water) land++;
        if (wet((x - 1) * scale) !== water || wet((x + 1) * scale) !== water)
          b |= 64;
        bytes[y * w + x] = b;
      }
    return new GameMapImpl(w, w, bytes, land);
  };
  return { gameMap: create(1), miniGameMap: create(2) };
}
function fixture(gameType = GameType.Singleplayer, narrow = false) {
  const config = new EngineConfig(
    {
      gameMap: GameMapType.Asia,
      gameMapSize: GameMapSize.Normal,
      gameMode: GameMode.FFA,
      gameType,
      difficulty: Difficulty.Medium,
      nations: "default",
      bots: 0,
      donateGold: false,
      donateTroops: false,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: true,
      randomSpawn: false,
      disableNavMesh: true,
    },
    false,
  );
  const game = createGame(
    [new PlayerInfo("Alice", PlayerType.Human, "a", "a")],
    [],
    ...([maps(narrow).gameMap, maps(narrow).miniGameMap] as const),
    config,
  );
  game.endSpawnPhase();
  const owner = game.player("a");
  owner.addGold(1_000_000_000n);
  for (let y = 40; y < 160; y++)
    for (let x = 20; x < 180; x++)
      if (game.isLand(game.ref(x, y))) owner.conquer(game.ref(x, y));
  const factory = owner.buildUnit(UnitType.Factory, game.ref(60, 100), {}),
    city = owner.buildUnit(UnitType.City, game.ref(140, 100), {});
  factory.setTrainStation(true);
  city.setTrainStation(true);
  const a = new TrainStation(game, factory),
    b = new TrainStation(game, city),
    rail = game.railNetwork();
  rail.connectStation(a);
  rail.connectStation(b);
  game.addExecution(new RecomputeRailClusterExecution(rail));
  const level = (unit: typeof city, n: number) => {
    while (unit.level() < n) unit.increaseLevel();
  };
  return { game, owner, factory, city, a, b, rail, level };
}
describe("Underwater rail tunnels", () => {
  it.each([GameType.Singleplayer, GameType.Private])(
    "requires both endpoints above level 30 and automatically joins the network in %s",
    (type) => {
      const f = fixture(type);
      f.level(f.factory, 31);
      f.level(f.city, 30);
      executeTicks(f.game, 21);
      expect(f.a.getRailroadTo(f.b)).toBeNull();
      f.city.increaseLevel();
      executeTicks(f.game, 20);
      const tunnel = f.a.getRailroadTo(f.b)!;
      expect(tunnel.tunnel).toBe(true);
      expect(tunnel.tiles.some((t) => f.game.isWater(t))).toBe(true);
      expect(f.rail.findStationsPath(f.a, f.b)).toEqual([f.a, f.b]);
      expect(f.a.getCluster()).toBe(f.b.getCluster());
      expect(waterTunnelPath(f.game, f.factory, f.city)).toEqual(tunnel.tiles);
    },
  );
  it("carries actual trains across deep water and awards normal destination income", () => {
    const f = fixture();
    f.level(f.factory, 31);
    f.level(f.city, 31);
    f.rail.refreshWaterTunnels();
    const before = f.owner.gold();
    const trip = new TrainExecution(f.rail, f.owner, f.a, f.b, 2);
    f.game.addExecution(trip);
    executeTicks(f.game, 23);
    expect(
      f.game.units(UnitType.Train).some((u) => f.game.isWater(u.tile())),
    ).toBe(true);
    executeTicks(f.game, 50);
    expect(trip.isActive()).toBe(false);
    expect(f.owner.gold()).toBeGreaterThan(before);
  });
  it("preserves an active tunnel and in-flight train through canonical snapshots", () => {
    const f = fixture();
    f.level(f.factory, 31);
    f.level(f.city, 31);
    f.rail.refreshWaterTunnels();
    f.game.addExecution(new TrainExecution(f.rail, f.owner, f.a, f.b, 2));
    executeTicks(f.game, 23);
    const bytes = snapshotGame(f.game),
      restored = restoreGame(bytes, {
        ...maps(),
        config: (gc) => new EngineConfig(gc, false),
      });
    expect(snapshotGame(restored)).toEqual(bytes);
    executeTicks(f.game, 50);
    executeTicks(restored, 50);
    expect(restored.player("a").gold()).toBe(f.owner.gold());
    expect(snapshotGame(restored)).toEqual(snapshotGame(f.game));
  });
  it("closes tunnels on downgrade or endpoint destruction and stops in-flight trains", () => {
    const f = fixture();
    f.level(f.factory, 31);
    f.level(f.city, 31);
    f.rail.refreshWaterTunnels();
    const trip = new TrainExecution(f.rail, f.owner, f.a, f.b, 2);
    f.game.addExecution(trip);
    executeTicks(f.game, 10);
    f.city.decreaseLevel();
    executeTicks(f.game, 1);
    expect(trip.isActive()).toBe(false);
    f.rail.refreshWaterTunnels();
    expect(f.a.getRailroadTo(f.b)).toBeNull();
    f.city.increaseLevel();
    f.rail.refreshWaterTunnels();
    expect(f.a.getRailroadTo(f.b)).not.toBeNull();
    f.city.delete(true);
    expect(f.a.getRailroadTo(f.b)).toBeNull();
  });
  it("upgrades an existing shallow-water bridge without duplicate links", () => {
    const f = fixture(GameType.Singleplayer, true);
    expect(f.a.getRailroadTo(f.b)?.tunnel).toBe(false);
    f.level(f.factory, 31);
    f.level(f.city, 31);
    f.rail.refreshWaterTunnels();
    expect(f.a.getRailroadTo(f.b)?.tunnel).toBe(true);
    expect(f.a.getRailroads().size).toBe(1);
  });
  it("does not drill through impassable terrain, connect dry pairs, or exceed the normal range", () => {
    const f = fixture();
    f.level(f.factory, 31);
    f.level(f.city, 31);
    const dry = f.owner.buildUnit(UnitType.City, f.game.ref(60, 130), {});
    f.level(dry, 31);
    expect(waterTunnelPath(f.game, f.factory, dry)).toBeNull();
    const far = f.owner.buildUnit(UnitType.City, f.game.ref(190, 100), {});
    f.level(far, 31);
    expect(waterTunnelPath(f.game, f.factory, far)).toBeNull();
    const spy = vi
      .spyOn(f.game, "isImpassable")
      .mockImplementation((tile) => tile === f.game.ref(100, 100));
    expect(waterTunnelPath(f.game, f.factory, f.city)).toBeNull();
    spy.mockRestore();
  });
});
