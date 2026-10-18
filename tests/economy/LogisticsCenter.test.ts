import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { logisticsTrainIncome } from "@openfront/engine-api/game/LogisticsCenter";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { PlayerExecution } from "@openfront/engine/execution/PlayerExecution";
import { TrainExecution } from "@openfront/engine/execution/TrainExecution";
import { TrainStation } from "@openfront/engine/game/TrainStation";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { executeTicks } from "../util/utils";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { TestConfig } from "../util/TestConfig";

const LOGISTICS = UnitType.LogisticsCenter;
const humans = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game, alice: Player, bob: Player;
function build(owner = alice, x = 10, y = 10) {
  const tile = game.ref(x, y);
  owner.conquer(tile);
  return owner.buildUnit(LOGISTICS, tile, {});
}
beforeEach(async () => {
  game = await setup("big_plains", { instantBuild: true }, humans);
  alice = game.player("a");
  bob = game.player("b");
  alice.addGold(100_000_000n);
  bob.addGold(100_000_000n);
});

describe("Logistics Center", () => {
  it("costs 1M gold, has one level and one building, including construction", () => {
    const before = alice.gold(),
      center = build();
    expect(before - alice.gold()).toBe(1_000_000n);
    center.setUnderConstruction(true);
    expect(() => build(alice, 80)).toThrow(/Maximum/);
    expect(alice.canBuild(LOGISTICS, game.ref(80, 10))).toBe(false);
    center.setUnderConstruction(false);
    expect(alice.canUpgradeUnit(center)).toBe(false);
    alice.upgradeUnit(center);
    center.increaseLevel();
    expect(center.level()).toBe(1);
    expect(alice.buildableUnits(center.tile(), [LOGISTICS])[0].canUpgrade).toBe(
      false,
    );
    const captured = build(bob, 120);
    alice.captureUnit(captured);
    expect(captured.isActive()).toBe(false);
    expect(alice.units(LOGISTICS)).toEqual([center]);
    center.delete(false);
    expect(alice.canBuild(LOGISTICS, game.ref(80, 10))).not.toBe(false);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "takes 35 seconds to construct and only then enables its bonus in %s",
    async (gameType) => {
      game = await setup("big_plains", { gameType }, humans);
      alice = game.player("a");
      alice.addGold(10_000_000n);
      const tile = game.ref(10, 10);
      alice.conquer(tile);
      expect(game.unitInfo(LOGISTICS).constructionDuration).toBe(350);
      const execution = new ConstructionExecution(alice, LOGISTICS, tile);
      execution.init(game, 0);
      execution.tick(0);
      const center = alice.units(LOGISTICS)[0];
      expect(center.isUnderConstruction()).toBe(true);
      expect(logisticsTrainIncome(alice, 10_000n)).toBe(10_000n);
      for (let tick = 1; tick <= 349; tick++) execution.tick(tick);
      expect(center.isUnderConstruction()).toBe(true);
      execution.tick(350);
      expect(center.isUnderConstruction()).toBe(false);
      expect(logisticsTrainIncome(alice, 10_000n)).toBe(11_500n);
      expect(logisticsTrainIncome(alice, 25_000n)).toBe(28_750n);
      expect(logisticsTrainIncome(alice, 35_000n)).toBe(40_250n);
      expect(logisticsTrainIncome(alice, 5_001n)).toBe(5_751n);
    },
  );
  it.each([GameType.Singleplayer, GameType.Private])(
    "honors Disabled Units in %s",
    async (gameType) => {
      game = await setup(
        "big_plains",
        { gameType, disabledUnits: [LOGISTICS] },
        humans,
      );
      alice = game.player("a");
      alice.addGold(10_000_000n);
      alice.conquer(game.ref(10, 10));
      const before = alice.gold();
      expect(alice.canBuild(LOGISTICS, game.ref(10, 10))).toBe(false);
      expect(() => build()).toThrow(/disabled/);
      game.addExecution(
        new ConstructionExecution(alice, LOGISTICS, game.ref(10, 10)),
      );
      executeTicks(game, 400);
      expect(alice.units(LOGISTICS)).toHaveLength(0);
      expect(alice.gold()).toBe(before);
    },
  );
  it("boosts each train-income recipient independently and records the actual gold", () => {
    const center = build();
    const tile = game.ref(80, 80);
    bob.conquer(tile);
    const station = new TrainStation(
      game,
      bob.buildUnit(UnitType.City, tile, {}),
    );
    const train = {
      owner: () => alice,
      tradeStopsVisited: () => 0,
    } as TrainExecution;
    const aliceBefore = alice.gold(),
      bobBefore = bob.gold();
    station.onTrainStop(train);
    expect(alice.gold() - aliceBefore).toBe(28_750n);
    expect(bob.gold() - bobBefore).toBe(25_000n);
    expect(alice.trainGold()).toBe(28_750n);
    expect(bob.trainGold()).toBe(25_000n);
    bob.captureUnit(center);
    const nextAlice = alice.gold(),
      nextBob = bob.gold();
    station.onTrainStop(train);
    expect(alice.gold() - nextAlice).toBe(25_000n);
    expect(bob.gold() - nextBob).toBe(28_750n);
    center.delete(false);
    expect(logisticsTrainIncome(bob, 10_000n)).toBe(10_000n);
    expect(game.stats().getPlayerStats(alice)?.gold?.[4]).toBe(53_750n);
    expect(game.stats().getPlayerStats(bob)?.gold?.[5]).toBe(53_750n);
  });
  it("connects to nearby buildings, matches rail previews, and removes rails on destruction", () => {
    const cityTile = game.ref(55, 10);
    alice.conquer(cityTile);
    const city = alice.buildUnit(UnitType.City, cityTile, {});
    const centerTile = game.ref(10, 10);
    alice.conquer(centerTile);
    const preview = game
      .railNetwork()
      .computeGhostRailPaths(LOGISTICS, centerTile)[0];
    expect(preview).toBeDefined();
    game.addExecution(new ConstructionExecution(alice, LOGISTICS, centerTile));
    executeTicks(game, 5);
    const center = alice.units(LOGISTICS)[0],
      manager = game.railNetwork().stationManager();
    const centerStation = manager.findStation(center)!,
      cityStation = manager.findStation(city)!;
    expect(centerStation).not.toBeNull();
    expect(cityStation).not.toBeNull();
    const tiles = centerStation.getRailroadTo(cityStation)!.tiles;
    expect(tiles).toEqual(expect.arrayContaining(preview));
    expect(game.units(UnitType.Train)).toHaveLength(0);
    center.delete(false);
    executeTicks(game, 5);
    expect(manager.findStation(center)).toBeNull();
    expect(cityStation.getRailroads().size).toBe(0);
  });
  it("restores its construction and completed rail station without changing the bonus", async () => {
    game = await setup("big_plains", {}, humans);
    alice = game.player("a");
    alice.addGold(10_000_000n);
    alice.conquer(game.ref(10, 10));
    game.addExecution(
      new ConstructionExecution(alice, LOGISTICS, game.ref(10, 10)),
    );
    executeTicks(game, 100);
    await expectSnapshotRoundTrip(game, "big_plains", 300);
  });
  it.each([
    UnitType.AtomBomb,
    UnitType.HydrogenBomb,
    UnitType.MIRVWarhead,
  ] as const)("is destroyed by %s and stops boosting income", (bomb) => {
    const center = build(bob, 50, 50),
      source = game.ref(10, 10);
    alice.conquer(source);
    alice.buildUnit(UnitType.BunkerMissileSite, source, {});
    expect(logisticsTrainIncome(bob, 10_000n)).toBe(11_500n);
    (game.config() as TestConfig).setDefaultNukeSpeed(100);
    game.addExecution(new NukeExecution(bomb, alice, center.tile(), source));
    executeTicks(game, 30);
    expect(center.isActive()).toBe(false);
    expect(logisticsTrainIncome(bob, 10_000n)).toBe(10_000n);
  });
});

describe.each([GameType.Singleplayer, GameType.Private])(
  "Capped buildings during full conquest in %s",
  (gameType) => {
    it.each([
      [UnitType.OilFactory, 5],
      [UnitType.CopperMine, 2],
      [LOGISTICS, 1],
    ] as const)(
      "destroys overflow %s while retaining existing and unfinished buildings",
      async (type, cap) => {
        for (const freeSlots of [0, 1]) {
          game = await setup("big_plains", { gameType }, humans);
          alice = game.player("a");
          bob = game.player("b");
          alice.addGold(100_000_000n);
          bob.addGold(100_000_000n);
          // Keep the captor alive even if they have no buildings yet.
          alice.conquer(game.ref(1, 1));
          const existing = Array.from({ length: cap - freeSlots }, (_, i) => {
            const tile = game.ref(10 + i * 40, 10);
            alice.conquer(tile);
            const unit = alice.buildUnit(type, tile, {});
            unit.setUnderConstruction(true);
            return unit;
          });
          const enemy = Array.from({ length: cap }, (_, i) => {
            const tile = game.ref(10 + i * 40, 80);
            bob.conquer(tile);
            const unit = bob.buildUnit(type, tile, {});
            unit.setUnderConstruction(i === 0);
            return unit;
          });
          enemy.forEach((unit) => alice.conquer(unit.tile()));
          const execution = new PlayerExecution(bob);
          execution.init(game, game.ticks());
          execution.tick(game.ticks());
          expect(alice.units(type)).toHaveLength(cap);
          expect(
            existing.every((unit) => unit.isActive() && unit.owner() === alice),
          ).toBe(true);
          expect(enemy.filter((unit) => unit.isActive())).toHaveLength(
            freeSlots,
          );
          expect(enemy.slice(freeSlots).every((unit) => !unit.isActive())).toBe(
            true,
          );
          expect(bob.units(type)).toHaveLength(0);
          expect(game.units(type)).toHaveLength(cap);
        }
      },
    );
  },
);
