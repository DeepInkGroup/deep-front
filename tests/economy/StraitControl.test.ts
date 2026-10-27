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
import { StraitTollIntentSchema } from "@openfront/engine-api/Schemas";
import { GameMapImpl } from "@openfront/engine-lib/game/GameMapImpl";
import { createGame } from "@openfront/engine/game/GameImpl";
import {
  straitAt,
  activeStraits,
  passageToll,
} from "@openfront/engine/game/StraitControl";
import {
  newTollVoyage,
  restrictedWaterPath,
  tradePassageNext,
} from "@openfront/engine/game/StraitTradeRoute";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { PlayerExecution } from "@openfront/engine/execution/PlayerExecution";
import { StraitControlExecution } from "@openfront/engine/execution/StraitControlExecution";
import { TradeShipExecution } from "@openfront/engine/execution/TradeShipExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { WaterPathFinder } from "@openfront/engine/pathfinding/PathFinder";
import { PathStatus } from "@openfront/engine/pathfinding/types";
import {
  restoreGame,
  snapshotGame,
} from "@openfront/engine/snapshot/GameSnapshot";
import { TestConfig } from "../util/TestConfig";
import { executeTicks } from "../util/utils";

const S = UnitType.StraitControlStation,
  W = 240,
  H = 240;
type Water = (x: number, y: number) => boolean;
const canal: Water = (x) => x >= 110 && x <= 119;
function maps(water: Water = canal) {
  function make(scale: number) {
    const w = W / scale,
      h = H / scale,
      bytes = new Uint8Array(w * h);
    let land = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const wet = water(x * scale, y * scale);
        let value = wet ? 33 : 130;
        if (!wet) land++;
        if (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(
            ([dx, dy]) =>
              x + dx >= 0 &&
              y + dy >= 0 &&
              x + dx < w &&
              y + dy < h &&
              water((x + dx) * scale, (y + dy) * scale) !== wet,
          )
        )
          value |= 64;
        bytes[y * w + x] = value;
      }
    return new GameMapImpl(w, h, bytes, land);
  }
  return { gameMap: make(1), miniGameMap: make(2) };
}
function fixture(
  type = GameType.Singleplayer,
  water: Water = canal,
  instantBuild = true,
) {
  const config = new TestConfig(
    {
      gameMap: GameMapType.Asia,
      gameMapSize: GameMapSize.Normal,
      gameMode: GameMode.FFA,
      gameType: type,
      difficulty: Difficulty.Medium,
      bots: 0,
      nations: "default",
      donateGold: false,
      donateTroops: false,
      infiniteGold: false,
      infiniteTroops: false,
      randomSpawn: false,
      instantBuild,
      disableNavMesh: true,
    },
    false,
  );
  const terrain = maps(water);
  const game = createGame(
    ["a", "b", "c"].map((id) => new PlayerInfo(id, PlayerType.Human, id, id)),
    [],
    terrain.gameMap,
    terrain.miniGameMap,
    config,
  );
  game.endSpawnPhase();
  const owner = game.player("a"),
    sender = game.player("b"),
    receiver = game.player("c");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (game.isLand(game.ref(x, y))) owner.conquer(game.ref(x, y));
  sender.conquer(game.ref(109, 20));
  receiver.conquer(game.ref(109, game.isLand(game.ref(109, 220)) ? 220 : 210));
  for (const p of [owner, sender, receiver]) p.addGold(100_000_000n);
  return { game, owner, sender, receiver, config };
}
function enable(
  f: ReturnType<typeof fixture>,
  unit: ReturnType<typeof f.owner.buildUnit>,
  rate = 10,
  exemptAllies = false,
) {
  new StraitControlExecution(f.owner, unit.id(), {
    type: "strait_toll",
    stationId: unit.id(),
    revision: unit.straitState()!.revision,
    action: "configure",
    rate,
    enabled: true,
    exemptAllies,
  }).init(f.game);
}
function reply(
  f: ReturnType<typeof fixture>,
  unit: ReturnType<typeof f.owner.buildUnit>,
  action: "accept" | "reject",
  revision = unit.straitState()!.revision,
) {
  new StraitControlExecution(f.sender, unit.id(), {
    type: "strait_toll",
    stationId: unit.id(),
    revision,
    action,
  }).init(f.game);
}

describe("Strait Control Station", () => {
  it("snaps clicks on water and inland to the closest valid bank and previews the entire gate", () => {
    const f = fixture();
    const bank = f.game.ref(109, 120),
      water = f.game.ref(113, 120);
    expect(f.owner.canBuild(S, water)).toBe(bank);
    expect(f.owner.canBuild(S, f.game.ref(105, 120))).toBe(bank);
    const preview = f.owner.buildableUnits(water, [S])[0];
    expect(preview.canBuild).toBe(bank);
    expect(preview.straitGate).toEqual([
      bank,
      ...Array.from({ length: 10 }, (_, i) => f.game.ref(110 + i, 120)),
      f.game.ref(120, 120),
    ]);
    expect(f.owner.canBuild(S, f.game.ref(80, 120))).toBe(false);
  });
  it("allows bank placement eight tiles from another building and never snaps onto occupied sites", () => {
    const f = fixture();
    f.owner.buildUnit(UnitType.City, f.game.ref(101, 120), {});
    expect(f.owner.canBuild(S, f.game.ref(109, 120))).toBe(
      f.game.ref(109, 120),
    );
    f.owner.buildUnit(UnitType.City, f.game.ref(109, 120), {});
    const snapped = f.owner.canBuild(S, f.game.ref(109, 120));
    expect(snapped).not.toBe(false);
    expect(
      f.game.euclideanDistSquared(snapped as number, f.game.ref(109, 120)),
    ).toBeGreaterThanOrEqual(64);
  });
  it("recognizes one-cell canals and diagonal straits", () => {
    const narrow = fixture(GameType.Singleplayer, (x) => x === 115);
    expect(
      straitAt(narrow.game, narrow.owner, narrow.game.ref(114, 120))?.gate,
    ).toHaveLength(1);
    const diagonal = fixture(
      GameType.Singleplayer,
      (x, y) => x - y >= -5 && x - y <= 4,
    );
    expect(
      straitAt(diagonal.game, diagonal.owner, diagonal.game.ref(109, 115))
        ?.gate,
    ).toHaveLength(10);
  });
  it("detects a real waterway, requires both owned banks, and rejects ocean, bays and ponds", () => {
    const f = fixture();
    const tile = f.game.ref(109, 120);
    expect(straitAt(f.game, f.owner, tile)?.gate).toHaveLength(10);
    f.sender.conquer(f.game.ref(120, 120));
    expect(straitAt(f.game, f.owner, tile)).toBeUndefined();
    expect(straitAt(f.game, f.owner, f.game.ref(80, 120))).toBeUndefined();
    for (const shape of [
      (x: number) => x >= 110,
      (x: number, y: number) => canal(x, y) && y >= 105 && y <= 135,
      (x: number, y: number) => canal(x, y) && y >= 105,
    ] as Water[]) {
      const bay = fixture(GameType.Singleplayer, shape);
      expect(
        straitAt(bay.game, bay.owner, bay.game.ref(109, 120)),
      ).toBeUndefined();
    }
  });
  it("charges 3.5M then 5M including unfinished stations, caps at two L1 buildings, and prevents overlapping claims", () => {
    const f = fixture();
    const before = f.owner.gold();
    const first = f.owner.buildUnit(S, f.game.ref(109, 60), {});
    first.setUnderConstruction(true);
    expect(before - f.owner.gold()).toBe(3_500_000n);
    const second = f.owner.buildUnit(S, f.game.ref(109, 180), {});
    expect(before - f.owner.gold()).toBe(8_500_000n);
    expect(f.owner.canUpgradeUnit(second)).toBe(false);
    second.increaseLevel();
    expect(second.level()).toBe(1);
    expect(() => f.owner.buildUnit(S, f.game.ref(109, 120), {})).toThrow(
      /Maximum/,
    );
    expect(f.owner.canBuild(S, f.game.ref(109, 120))).toBe(false);
    first.delete(false);
    expect(straitAt(f.game, f.owner, f.game.ref(109, 181))).toBeUndefined();
  });
  it("takes exactly 90 seconds to finish", () => {
    const f = fixture(GameType.Singleplayer, canal, false);
    const exec = new ConstructionExecution(f.owner, S, f.game.ref(109, 120));
    exec.init(f.game, 0);
    exec.tick(0);
    const unit = f.owner.units(S)[0];
    expect(unit.isUnderConstruction()).toBe(true);
    for (let t = 1; t < 900; t++) exec.tick(t);
    expect(unit.isUnderConstruction()).toBe(true);
    exec.tick(900);
    expect(unit.isUnderConstruction()).toBe(false);
    expect(unit.straitState()?.enabled).toBe(false);
  });
  for (const type of [GameType.Singleplayer, GameType.Private])
    it(`enforces consent and charges a separate exact toll in ${type}`, () => {
      const f = fixture(type);
      const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
      enable(f, station);
      const targetPort = f.receiver.buildUnit(
        UnitType.Port,
        f.game.ref(109, 220),
        {},
      );
      const ship = f.sender.buildUnit(
        UnitType.TradeShip,
        f.game.ref(115, 119),
        { targetUnit: targetPort },
      );
      const pf = new WaterPathFinder(f.game);
      const voyage = newTollVoyage();
      voyage.cargo = 100_000n;
      const goal = f.game.ref(115, 121);
      expect(
        tradePassageNext(
          f.game,
          f.sender,
          ship,
          goal,
          pf,
          activeStraits(f.game),
          voyage,
          0,
        ).status,
      ).toBe(PathStatus.NOT_FOUND);
      reply(f, station, "accept");
      const before = f.sender.gold(),
        earned = f.owner.gold();
      for (let i = 0; i < 12 && !voyage.paid.length; i++) {
        const step = tradePassageNext(
          f.game,
          f.sender,
          ship,
          goal,
          pf,
          activeStraits(f.game),
          voyage,
          0,
        );
        expect(step.status).toBe(PathStatus.NEXT);
        if (step.status === PathStatus.NEXT) ship.move(step.node);
      }
      expect(before - f.sender.gold()).toBe(10_000n);
      expect(f.owner.gold() - earned).toBe(10_000n);
      expect(voyage.cargo).toBe(100_000n);
      expect(station.straitState()?.collectedGold).toBe(10_000n);
      expect(station.straitState()?.passages).toBe(1);
      const saved = snapshotGame(f.game);
      const resumed = restoreGame(saved, {
        ...maps(),
        config: (gc) => new TestConfig(gc, false),
      });
      expect(resumed.unit(station.id())?.straitState()?.collectedGold).toBe(
        10_000n,
      );
      expect(snapshotGame(resumed)).toEqual(saved);
      tradePassageNext(
        f.game,
        f.sender,
        ship,
        goal,
        pf,
        activeStraits(f.game),
        voyage,
        0,
      );
      expect(before - f.sender.gold()).toBe(10_000n);
    });
  it("delivers the full fixed cargo payout to the destination after paying a toll", () => {
    const f = fixture();
    const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
    enable(f, station);
    reply(f, station, "accept");
    const source = f.sender.buildUnit(UnitType.Port, f.game.ref(109, 20), {}),
      destination = f.receiver.buildUnit(
        UnitType.Port,
        f.game.ref(109, 220),
        {},
      );
    const before = f.receiver.gold(),
      ownerBefore = f.owner.gold();
    f.game.addExecution(new TradeShipExecution(f.sender, source, destination));
    executeTicks(f.game, 500);
    const received = f.receiver.gold() - before;
    expect(received).toBeGreaterThan(0n);
    expect(f.owner.gold() - ownerBefore).toBe(passageToll(received, 10));
  });
  it("routes around a rejected passage and stops at a closed sole connection", () => {
    const alternate: Water = (x, y) =>
      canal(x, y) ||
      (x >= 50 && x <= 59) ||
      (x >= 50 && x <= 119 && ((y >= 10 && y <= 19) || (y >= 220 && y <= 229)));
    const f = fixture(GameType.Singleplayer, alternate);
    const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
    enable(f, station);
    reply(f, station, "reject");
    const blocked = new Set(station.straitState()!.gate),
      start = f.game.ref(115, 40),
      end = f.game.ref(115, 190);
    const route = restrictedWaterPath(f.game, start, end, blocked)!;
    expect(route.length).toBeGreaterThan(200);
    expect(route.every((t) => !blocked.has(t))).toBe(true);
    const sole = fixture();
    const gate = straitAt(sole.game, sole.owner, sole.game.ref(109, 120))!;
    expect(
      restrictedWaterPath(sole.game, start, end, new Set(gate.gate)),
    ).toBeNull();
  });
  it("invalidates old acceptance on rate changes, rejects forged owner settings and invalid rates", () => {
    const f = fixture();
    const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
    enable(f, station);
    const old = station.straitState()!.revision;
    reply(f, station, "accept");
    enable(f, station, 5);
    reply(f, station, "accept", old);
    expect(station.straitState()!.accepted).toEqual([]);
    new StraitControlExecution(f.sender, station.id(), {
      type: "strait_toll",
      stationId: station.id(),
      revision: station.straitState()!.revision,
      action: "configure",
      rate: 1,
      enabled: false,
      exemptAllies: true,
    }).init(f.game);
    expect(station.straitState()!.rate).toBe(5);
    expect(station.straitState()!.enabled).toBe(true);
    expect(
      StraitTollIntentSchema.safeParse({
        type: "strait_toll",
        stationId: 1,
        revision: 0,
        action: "configure",
        rate: 11,
      }).success,
    ).toBe(false);
  });
  it("lets the owner exempt allies and never grants unpaid passage when the sender cannot afford the toll", () => {
    const f = fixture();
    const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
    f.owner.createAllianceRequest(f.sender)!.accept();
    enable(f, station, 10, true);
    const target = f.receiver.buildUnit(
      UnitType.Port,
      f.game.ref(109, 220),
      {},
    );
    const ship = f.sender.buildUnit(UnitType.TradeShip, f.game.ref(115, 119), {
      targetUnit: target,
    });
    const voyage = newTollVoyage();
    voyage.cargo = 100_000n;
    const before = f.sender.gold();
    for (let i = 0; i < 12 && ship.tile() !== f.game.ref(115, 121); i++) {
      const result = tradePassageNext(
        f.game,
        f.sender,
        ship,
        f.game.ref(115, 121),
        new WaterPathFinder(f.game),
        activeStraits(f.game),
        voyage,
        0,
      );
      if (result.status === PathStatus.NEXT) ship.move(result.node);
    }
    expect(f.sender.gold()).toBe(before);
    expect(voyage.paid).toEqual([]);
    enable(f, station, 10, false);
    reply(f, station, "accept");
    f.sender.removeGold(f.sender.gold());
    ship.move(f.game.ref(115, 119));
    const poor = newTollVoyage();
    poor.cargo = 100_000n;
    expect(
      tradePassageNext(
        f.game,
        f.sender,
        ship,
        f.game.ref(115, 121),
        new WaterPathFinder(f.game),
        activeStraits(f.game),
        poor,
        0,
      ).status,
    ).toBe(PathStatus.NOT_FOUND);
    expect(f.sender.gold()).toBe(0n);
    expect(poor.paid).toEqual([]);
    station.delete(true, f.sender);
    expect(
      tradePassageNext(
        f.game,
        f.sender,
        ship,
        f.game.ref(115, 121),
        new WaterPathFinder(f.game),
        activeStraits(f.game),
        poor,
        0,
      ).status,
    ).toBe(PathStatus.NEXT);
  });
  it("honors the disabled-unit lobby setting in solo and multiplayer", () => {
    for (const type of [GameType.Singleplayer, GameType.Private]) {
      const f = fixture(type);
      f.config.gameConfig().disabledUnits = [S];
      expect(f.owner.canBuild(S, f.game.ref(109, 120))).toBe(false);
      expect(() => f.owner.buildUnit(S, f.game.ref(109, 120), {})).toThrow(
        /disabled/,
      );
    }
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "cancels bank tolls and destroys the station when its own tile is conquered in %s",
    (gameType) => {
      const f = fixture(gameType);
      const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
      enable(f, station);
      reply(f, station, "accept");
      const lifecycle = new StraitControlExecution(f.owner, station.id());
      lifecycle.init(f.game);
      f.sender.conquer(f.game.ref(120, 120));
      expect(activeStraits(f.game)).toHaveLength(0);
      lifecycle.tick();
      expect(station.straitState()!.enabled).toBe(false);
      expect(station.straitState()!.accepted).toEqual([]);
      f.owner.conquer(f.game.ref(120, 120));
      enable(f, station);
      f.sender.conquer(station.tile());
      const ownerExecution = new PlayerExecution(f.owner);
      ownerExecution.init(f.game, f.game.ticks());
      ownerExecution.tick(f.game.ticks());
      expect(station.isActive()).toBe(false);
      expect(f.sender.units(S)).toHaveLength(0);
      expect(station.straitState()!.enabled).toBe(false);
      expect(activeStraits(f.game)).toHaveLength(0);
      expect(activeStraits(f.game)).toHaveLength(0);
    },
  );
  it.each([
    UnitType.AtomBomb,
    UnitType.HydrogenBomb,
    UnitType.MIRVWarhead,
  ] as const)(
    "removes the toll when the station is destroyed by %s",
    (bomb) => {
      const f = fixture();
      const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
      enable(f, station);
      const source = f.game.ref(109, 20);
      f.sender.buildUnit(UnitType.BunkerMissileSite, source, {});
      f.config.setDefaultNukeSpeed(100);
      f.game.addExecution(
        new NukeExecution(bomb, f.sender, station.tile(), source),
      );
      executeTicks(f.game, 30);
      expect(station.isActive()).toBe(false);
      expect(activeStraits(f.game)).toHaveLength(0);
    },
  );
  it("snapshots active stations, consent, held voyages and construction lifecycle", () => {
    const f = fixture();
    const station = f.owner.buildUnit(S, f.game.ref(109, 120), {});
    enable(f, station);
    reply(f, station, "reject");
    const source = f.sender.buildUnit(UnitType.Port, f.game.ref(109, 20), {}),
      destination = f.receiver.buildUnit(
        UnitType.Port,
        f.game.ref(109, 220),
        {},
      );
    f.game.addExecution(new StraitControlExecution(f.owner, station.id()));
    f.game.addExecution(new TradeShipExecution(f.sender, source, destination));
    executeTicks(f.game, 5);
    const bytes = snapshotGame(f.game);
    const restored = restoreGame(bytes, {
      ...maps(),
      config: (gc) => new TestConfig(gc, false),
    });
    expect(restored.unit(station.id())!.straitState()).toEqual(
      station.straitState(),
    );
    expect(snapshotGame(restored)).toEqual(bytes);
  });
});
