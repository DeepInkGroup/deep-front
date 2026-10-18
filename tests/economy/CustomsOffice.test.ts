import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { OilFactoryExecution } from "@openfront/engine/execution/OilFactoryExecution";
import { TrainExecution } from "@openfront/engine/execution/TrainExecution";
import { customsPartner } from "@openfront/engine/game/CustomsOffice";
import { trainTradeIncome } from "@openfront/engine/game/TrainIncome";
import { TrainStation } from "@openfront/engine/game/TrainStation";
import { Railroad } from "@openfront/engine/game/Railroad";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { executeTicks } from "../util/utils";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { TestConfig } from "../util/TestConfig";

const CUSTOMS = UnitType.CustomsOffice;
const humans = ["a", "b", "c"].map(
  (id) => new PlayerInfo(id, PlayerType.Human, id, id),
);
let game: Game, alice: Player, bob: Player, carol: Player;
function rectangle(
  player: Player,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) player.conquer(game.ref(x, y));
}
async function fixture(config: Parameters<typeof setup>[1] = {}) {
  game = await setup("big_plains", { instantBuild: true, ...config }, humans);
  alice = game.player("a");
  bob = game.player("b");
  carol = game.player("c");
  for (const player of [alice, bob, carol]) player.addGold(100_000_000n);
  rectangle(alice, 10, 10, 99, 149);
  rectangle(bob, 100, 10, 180, 180);
  rectangle(carol, 10, 150, 99, 180);
}
function office(player = alice, x = 99, y = 40) {
  return player.buildUnit(CUSTOMS, game.ref(x, y), {});
}
beforeEach(() => fixture());

describe("Customs Office border placement and limits", () => {
  it("costs 1M, has one level, and rejects interior, neutral and diagonal-only borders without charging", () => {
    const before = alice.gold();
    for (const [x, y] of [
      [40, 40],
      [90, 40],
      [10, 10],
      [0, 0],
    ]) {
      const tile = game.ref(x, y);
      expect(alice.canBuild(CUSTOMS, tile)).toBe(false);
      expect(() => alice.buildUnit(CUSTOMS, tile, {})).toThrow(/border/);
    }
    // Foreign land touching only a corner is not a shared land border.
    alice.conquer(game.ref(5, 5));
    bob.conquer(game.ref(6, 6));
    expect(alice.canBuild(CUSTOMS, game.ref(5, 5))).toBe(false);
    expect(alice.gold()).toBe(before);
    const customs = office();
    expect(before - alice.gold()).toBe(1_000_000n);
    expect(customsPartner(customs)).toBe(bob);
    expect(alice.canUpgradeUnit(customs)).toBe(false);
    alice.upgradeUnit(customs);
    customs.increaseLevel();
    expect(customs.level()).toBe(1);
  });
  it("allows one office for each neighbor, counts unfinished offices, and permits rebuilding after destruction", () => {
    const first = office();
    first.setUnderConstruction(true);
    expect(alice.canBuild(CUSTOMS, game.ref(99, 100))).toBe(false);
    expect(() => office(alice, 99, 100)).toThrow(/one office/);
    const second = office(alice, 40, 149);
    expect(customsPartner(second)).toBe(carol);
    expect(alice.units(CUSTOMS)).toHaveLength(2);
    first.delete(false);
    const replacement = office(alice, 99, 100);
    expect(customsPartner(replacement)).toBe(bob);
  });
  it("derives its counterpart instead of accepting a forged target player", () => {
    const customs = alice.buildUnit(CUSTOMS, game.ref(99, 40), {
      targetPlayer: carol,
    });
    expect(customsPartner(customs)).toBe(bob);
  });
  it("keeps its original trade partner when the border moves", () => {
    const customs = office();
    alice.conquer(game.ref(100, 40));
    expect(customsPartner(customs)).toBe(bob);
    expect(trainTradeIncome(alice, bob, 25_000n)).toBe(27_500n);
    expect(trainTradeIncome(alice, carol, 25_000n)).toBe(25_000n);
  });
  it("preserves per-neighbor limits through captures, including capture by its own trade partner", () => {
    const customs = office();
    bob.captureUnit(customs);
    expect(customsPartner(customs)).toBe(alice);
    expect(trainTradeIncome(bob, alice, 25_000n)).toBe(27_500n);
    alice.captureUnit(customs);
    expect(customsPartner(customs)).toBe(bob);
    office(carol, 99, 160); // Carol already has an office for Bob.
    carol.captureUnit(customs);
    expect(customs.isActive()).toBe(false);
    expect(carol.units(CUSTOMS)).toHaveLength(1);
    const another = office();
    office(bob, 100, 100); // Bob already has an office for Alice.
    bob.captureUnit(another);
    expect(another.isActive()).toBe(false);
    expect(bob.units(CUSTOMS)).toHaveLength(1);
  });
});

describe("Customs Office train economy", () => {
  it("boosts a real moving train crossing into the linked player's station", () => {
    office();
    const source = new TrainStation(
      game,
      alice.buildUnit(UnitType.Factory, game.ref(60, 40), {}),
    );
    const destination = new TrainStation(
      game,
      bob.buildUnit(UnitType.City, game.ref(140, 40), {}),
    );
    const manager = game.railNetwork().stationManager();
    manager.addStation(source);
    manager.addStation(destination);
    const railroad = new Railroad(
      source,
      destination,
      Array.from({ length: 81 }, (_, i) => game.ref(60 + i, 40)),
      1,
    );
    source.addRailroad(railroad);
    destination.addRailroad(railroad);
    const train = new TrainExecution(
      game.railNetwork(),
      alice,
      source,
      destination,
      1,
    );
    train.init(game, 0);
    expect(train.isActive()).toBe(true);
    for (let tick = 1; tick < 60 && train.isActive(); tick++) train.tick(tick);
    expect(alice.trainGold()).toBe(27_500n);
    expect(bob.trainGold()).toBe(25_000n);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "finishes after exactly 25 seconds and only then adds its bonus in %s",
    async (gameType) => {
      await fixture({ instantBuild: false, gameType });
      const execution = new ConstructionExecution(
        alice,
        CUSTOMS,
        game.ref(99, 40),
      );
      execution.init(game, 0);
      execution.tick(0);
      const customs = alice.units(CUSTOMS)[0];
      expect(game.unitInfo(CUSTOMS).constructionDuration).toBe(250);
      expect(trainTradeIncome(alice, bob, 25_000n)).toBe(25_000n);
      for (let tick = 1; tick < 250; tick++) execution.tick(tick);
      expect(customs.isUnderConstruction()).toBe(true);
      execution.tick(250);
      expect(customs.isUnderConstruction()).toBe(false);
      expect(trainTradeIncome(alice, bob, 25_000n)).toBe(27_500n);
    },
  );
  it("boosts only its owner's bilateral trade, adds to logistics, and records actual gold", () => {
    office();
    const bobCity = bob.buildUnit(UnitType.City, game.ref(140, 40), {});
    const station = new TrainStation(game, bobCity);
    const train = {
      owner: () => alice,
      tradeStopsVisited: () => 0,
    } as TrainExecution;
    const aBefore = alice.gold(),
      bBefore = bob.gold();
    station.onTrainStop(train);
    expect(alice.gold() - aBefore).toBe(27_500n);
    expect(bob.gold() - bBefore).toBe(25_000n);
    expect(alice.trainGold()).toBe(27_500n);
    expect(bob.trainGold()).toBe(25_000n);
    office(bob, 100, 100);
    alice.buildUnit(UnitType.LogisticsCenter, game.ref(40, 80), {});
    const aNext = alice.gold(),
      bNext = bob.gold();
    station.onTrainStop(train);
    expect(alice.gold() - aNext).toBe(31_250n);
    expect(bob.gold() - bNext).toBe(27_500n);
    expect(trainTradeIncome(alice, carol, 25_000n)).toBe(28_750n);
    expect(trainTradeIncome(alice, alice, 10_000n)).toBe(11_500n);
    expect(trainTradeIncome(bob, bob, 10_000n)).toBe(10_000n);
    expect(trainTradeIncome(alice, bob, 5_001n)).toBe(6_251n);
    expect(game.stats().getPlayerStats(alice)?.gold?.[4]).toBe(58_750n);
    expect(game.stats().getPlayerStats(bob)?.gold?.[5]).toBe(52_500n);
    const oil = alice.buildUnit(UnitType.OilFactory, game.ref(20, 80), {}),
      income = new OilFactoryExecution(oil);
    income.init(game, 0);
    const beforeOil = alice.gold();
    income.tick(100);
    expect(alice.gold() - beforeOil).toBe(50_000n);
  });
  it("connects to rail stations and cleans up its rails and bonus on destruction", () => {
    const city = alice.buildUnit(UnitType.City, game.ref(60, 40), {});
    const preview = game
      .railNetwork()
      .computeGhostRailPaths(CUSTOMS, game.ref(99, 40))[0];
    expect(preview).toBeDefined();
    game.addExecution(
      new ConstructionExecution(alice, CUSTOMS, game.ref(99, 40)),
    );
    executeTicks(game, 5);
    const customs = alice.units(CUSTOMS)[0],
      manager = game.railNetwork().stationManager();
    const customsStation = manager.findStation(customs)!,
      cityStation = manager.findStation(city)!;
    expect(customsStation.getRailroadTo(cityStation)!.tiles).toEqual(
      expect.arrayContaining(preview),
    );
    customs.delete(false);
    executeTicks(game, 5);
    expect(manager.findStation(customs)).toBeNull();
    expect(cityStation.getRailroads().size).toBe(0);
    expect(trainTradeIncome(alice, bob, 25_000n)).toBe(25_000n);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "honors Disable Units in %s",
    async (gameType) => {
      await fixture({ gameType, disabledUnits: [CUSTOMS] });
      const before = alice.gold();
      expect(alice.canBuild(CUSTOMS, game.ref(99, 40))).toBe(false);
      expect(() => office()).toThrow(/disabled/);
      game.addExecution(
        new ConstructionExecution(alice, CUSTOMS, game.ref(99, 40)),
      );
      executeTicks(game, 300);
      expect(alice.units(CUSTOMS)).toHaveLength(0);
      expect(alice.gold()).toBe(before);
    },
  );
  it.each([
    UnitType.AtomBomb,
    UnitType.HydrogenBomb,
    UnitType.MIRVWarhead,
  ] as const)("is destroyed by %s and stops boosting trade", (bomb) => {
    const customs = office(),
      source = game.ref(140, 40);
    bob.buildUnit(UnitType.BunkerMissileSite, source, {});
    (game.config() as TestConfig).setDefaultNukeSpeed(100);
    game.addExecution(new NukeExecution(bomb, bob, customs.tile(), source));
    executeTicks(game, 30);
    expect(customs.isActive()).toBe(false);
    expect(trainTradeIncome(alice, bob, 25_000n)).toBe(25_000n);
  });
  it("restores the fixed counterpart, construction countdown and completed station", async () => {
    await fixture({ instantBuild: false });
    game.addExecution(
      new ConstructionExecution(alice, CUSTOMS, game.ref(99, 40)),
    );
    executeTicks(game, 60);
    const restored = await expectSnapshotRoundTrip(game, "big_plains", 260);
    const a = restored.player("a"),
      b = restored.player("b");
    expect(customsPartner(a.units(CUSTOMS)[0])).toBe(b);
    expect(trainTradeIncome(a, b, 25_000n)).toBe(27_500n);
  });
});
