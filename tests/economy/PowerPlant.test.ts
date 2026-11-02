import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { allocatePower, POWER_DEMAND } from "@openfront/engine-api/game/Power";
import { Game, Player } from "@openfront/engine/game/Game";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { CopperMineExecution } from "@openfront/engine/execution/CopperMineExecution";
import { OilFactoryExecution } from "@openfront/engine/execution/OilFactoryExecution";
import { FactoryExecution } from "@openfront/engine/execution/FactoryExecution";
import { EconomyAIExecution } from "@openfront/engine/execution/EconomyAIExecution";
import { PlayerExecution } from "@openfront/engine/execution/PlayerExecution";
import { UpgradeStructureExecution } from "@openfront/engine/execution/UpgradeStructureExecution";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

const P = UnitType.PowerPlant;
const humans = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game, alice: Player, bob: Player;
function build(type: UnitType, x: number, y: number, owner = alice) {
  owner.conquer(game.ref(x, y));
  return owner.buildUnit(type, game.ref(x, y), {});
}
describe.each([GameType.Singleplayer, GameType.Private])(
  "electricity in %s",
  (gameType) => {
    beforeEach(async () => {
      game = await setup(
        "big_plains",
        { gameType, instantBuild: true, electricity: true },
        humans,
      );
      alice = game.player("a");
      bob = game.player("b");
      alice.addGold(2_000_000_000n);
      bob.addGold(2_000_000_000n);
    });
    it("has no building/level cap and charges per-building upgrade prices", () => {
      expect(game.unitInfo(P).maxCount).toBeUndefined();
      expect(game.unitInfo(P).maxLevel).toBeUndefined();
      const before = alice.gold();
      const plant = build(P, 20, 20);
      expect(before - alice.gold()).toBe(750_000n);
      alice.upgradeUnit(plant);
      expect(plant.level()).toBe(2);
      expect(before - alice.gold()).toBe(1_750_000n);
      for (let i = 0; i < 8; i++)
        build(P, 40 + (i % 4) * 30, 60 + Math.floor(i / 4) * 35);
      game.addExecution(new UpgradeStructureExecution(alice, plant.id(), 50));
      executeTicks(game, 3);
      expect(plant.level()).toBeGreaterThan(50);
      expect(alice.units(P)).toHaveLength(9);
      expect(alice.canUpgradeUnit(plant)).toBe(true);
      expect(game.config().powerGrid(alice).supply).toBe(
        alice.units(P).reduce((n, p) => n + p.level() * 100, 0),
      );
    });
    it("allocates full loads by age and immediately responds to construction, upgrades, losses and capture", () => {
      const plant = build(P, 10, 10);
      const city = build(UnitType.City, 40, 10),
        factory = build(UnitType.Factory, 70, 10);
      const oil = build(UnitType.OilFactory, 100, 10),
        copper = build(UnitType.CopperMine, 130, 10);
      const config = game.config();
      expect(config.powerGrid(alice)).toMatchObject({
        supply: 100,
        demand: 115,
        used: 90,
        offline: 1,
      });
      expect(config.isPowered(city)).toBe(true);
      expect(config.isPowered(factory)).toBe(true);
      expect(config.isPowered(oil)).toBe(true);
      expect(config.isPowered(copper)).toBe(false);
      alice.upgradeUnit(plant);
      expect(config.powerGrid(alice)).toMatchObject({
        supply: 200,
        offline: 0,
      });
      alice.upgradeUnit(oil);
      alice.upgradeUnit(oil);
      alice.upgradeUnit(factory);
      expect(config.powerGrid(alice)).toMatchObject({
        demand: 225,
        used: 200,
        offline: 1,
      });
      plant.setUnderConstruction(true);
      expect(config.powerGrid(alice)).toMatchObject({
        supply: 0,
        plannedSupply: 200,
        offline: 4,
      });
      plant.setUnderConstruction(false);
      plant.decreaseLevel();
      expect(config.powerGrid(alice)).toMatchObject({
        supply: 100,
        used: 80,
        offline: 2,
      });
      bob.captureUnit(plant);
      expect(plant.isActive()).toBe(true);
      expect(plant.owner()).toBe(bob);
      expect(config.powerGrid(alice).supply).toBe(0);
      expect(config.powerGrid(bob).supply).toBe(100);
      plant.delete(false);
      expect(config.powerGrid(bob).supply).toBe(0);
    });
    it("stops and restores the city troop-cap benefit without destroying the city", () => {
      const city = build(UnitType.City, 20, 20);
      alice.upgradeUnit(city);
      const config = game.config();
      expect(config.maxTroops(alice)).toBe(
        config.maxTroopsWithoutCities(alice),
      );
      const plant = build(P, 70, 20);
      expect(
        config.maxTroops(alice) - config.maxTroopsWithoutCities(alice),
      ).toBe(500_000);
      plant.delete(false);
      expect(config.maxTroops(alice)).toBe(
        config.maxTroopsWithoutCities(alice),
      );
      expect(city.isActive()).toBe(true);
    });
    it("stops copper income during an outage and resumes without back-paying missed ticks", () => {
      const mine = build(UnitType.CopperMine, 30, 30);
      game.addExecution(new CopperMineExecution(mine));
      const before = alice.gold();
      executeTicks(game, 200);
      expect(alice.gold()).toBe(before);
      const plant = build(P, 70, 30),
        supplied = alice.gold();
      executeTicks(game, 95);
      expect(alice.gold()).toBe(supplied);
      executeTicks(game, 10);
      expect(alice.gold() - supplied).toBe(25_000n);
      plant.delete(false);
      const outage = alice.gold();
      executeTicks(game, 200);
      expect(alice.gold()).toBe(outage);
    });
    it("keeps the rail network but pauses factory train production until electricity is available", () => {
      for (let y = 0; y < 100; y++)
        for (let x = 0; x < 130; x++) alice.conquer(game.ref(x, y));
      const factory = build(UnitType.Factory, 25, 25);
      build(UnitType.City, 70, 25);
      game.config().trainSpawnRate = () => 1;
      game.addExecution(new FactoryExecution(factory));
      executeTicks(game, 100);
      expect(factory.hasTrainStation()).toBe(true);
      expect(alice.units(UnitType.Train)).toHaveLength(0);
      build(P, 110, 60);
      executeTicks(game, 100);
      expect(alice.units(UnitType.Train).length).toBeGreaterThan(0);
    });
    it("preserves captured Power Plants and their levels during actual territory capture", () => {
      const plant = build(P, 80, 80, bob);
      bob.upgradeUnit(plant);
      bob.upgradeUnit(plant);
      alice.conquer(plant.tile());
      const capture = new PlayerExecution(bob);
      capture.init(game, game.ticks());
      capture.tick(game.ticks());
      expect(plant.isActive()).toBe(true);
      expect(plant.owner()).toBe(alice);
      expect(plant.level()).toBe(3);
      expect(game.config().powerGrid(alice).supply).toBe(300);
    });
    it("disables all electricity requirements together with the Power Plant lobby option", async () => {
      game = await setup(
        "big_plains",
        { gameType, instantBuild: true, electricity: true, disabledUnits: [P] },
        humans,
      );
      alice = game.player("a");
      alice.addGold(100_000_000n);
      const city = build(UnitType.City, 20, 20),
        mine = build(UnitType.CopperMine, 60, 20);
      expect(alice.canBuild(P, city.tile())).toBe(false);
      expect(game.config().powerGrid(alice).enabled).toBe(false);
      expect(game.config().isPowered(city)).toBe(true);
      expect(game.config().isPowered(mine)).toBe(true);
      expect(
        game.config().maxTroops(alice) -
          game.config().maxTroopsWithoutCities(alice),
      ).toBeCloseTo(250_000);
      game.addExecution(new CopperMineExecution(mine));
      const before = alice.gold();
      executeTicks(game, 110);
      expect(alice.gold() - before).toBe(25_000n);
    });
    it("restores electricity, construction and capture state across a save/reconnect", async () => {
      const plant = build(P, 20, 20);
      build(UnitType.City, 60, 20);
      const mine = build(UnitType.CopperMine, 100, 20);
      game.addExecution(new CopperMineExecution(mine));
      game.config().powerGrid(alice);
      executeTicks(game, 40);
      await expectSnapshotRoundTrip(game, "big_plains", 170, (g, t) => {
        if (t === 20) g.unit(plant.id())!.setUnderConstruction(true);
        if (t === 60) g.unit(plant.id())!.setUnderConstruction(false);
        if (t === 100) g.player("b").captureUnit(g.unit(plant.id())!);
      });
    });
  },
);
it("does not supply electricity before the 30-second build finishes", async () => {
  game = await setup(
    "big_plains",
    { electricity: true, instantBuild: false },
    humans,
  );
  alice = game.player("a");
  alice.addGold(100_000_000n);
  alice.conquer(game.ref(30, 30));
  game.addExecution(new ConstructionExecution(alice, P, game.ref(30, 30)));
  executeTicks(game, 290);
  expect(game.config().powerGrid(alice).supply).toBe(0);
  executeTicks(game, 20);
  expect(game.config().powerGrid(alice).supply).toBe(100);
});
it("powers oil production and dispatch, while loaded tankers can finish delivery during an outage", async () => {
  game = await setup(
    "half_land_half_ocean",
    { electricity: true, instantBuild: true },
    humans,
  );
  alice = game.player("a");
  bob = game.player("b");
  alice.addGold(100_000_000n);
  bob.addGold(100_000_000n);
  const oil = build(UnitType.OilFactory, 7, 1);
  build(UnitType.Port, 7, 15, bob);
  game.addExecution(new OilFactoryExecution(oil));
  executeTicks(game, 100);
  expect(alice.units(UnitType.OilTanker)).toHaveLength(0);
  const plant = build(P, 1, 1);
  executeTicks(game, 200);
  expect(alice.units(UnitType.OilTanker)).toHaveLength(2);
  plant.delete(false);
  const before = alice.gold();
  executeTicks(game, 800);
  expect(alice.gold()).toBe(before);
});
it.each([PlayerType.Bot, PlayerType.Nation])(
  "%s AI builds enough generation for its production economy",
  async (type) => {
    game = await setup(
      "big_plains",
      { electricity: true, instantBuild: true },
      [new PlayerInfo("AI", type, null, "ai")],
    );
    alice = game.player("ai");
    alice.addGold(100_000_000n);
    for (let y = 10; y < 180; y++)
      for (let x = 10; x < 180; x++) alice.conquer(game.ref(x, y));
    const city = build(UnitType.City, 30, 30),
      factory = build(UnitType.Factory, 70, 30);
    for (let i = 1; i < 5; i++) alice.upgradeUnit(city);
    for (let i = 1; i < 4; i++) alice.upgradeUnit(factory);
    game.addExecution(new EconomyAIExecution(alice));
    executeTicks(game, 1800);
    expect(alice.units(P).length).toBeGreaterThan(2);
    const grid = game.config().powerGrid(alice);
    expect(grid.offline).toBe(0);
    expect(grid.supply).toBeGreaterThanOrEqual(grid.demand);
  },
);
it("uses identical deterministic allocation for the renderer and simulation", () => {
  const a = {
    id: 1,
    unitType: UnitType.City,
    level: 4,
    active: true,
    underConstruction: false,
  };
  const b = {
    id: 2,
    unitType: UnitType.Factory,
    level: 2,
    active: true,
    underConstruction: false,
  };
  const c = {
    id: 3,
    unitType: UnitType.CopperMine,
    level: 1,
    active: true,
    underConstruction: false,
  };
  const plant = {
    id: 4,
    unitType: P,
    level: 1,
    active: true,
    underConstruction: false,
  };
  const grid = allocatePower([c, plant, b, a]);
  expect(grid.used).toBe(80);
  expect([...grid.powered]).toEqual([1]);
  expect(grid.offline).toBe(2);
  expect(POWER_DEMAND[UnitType.OilFactory]).toBe(40);
});
