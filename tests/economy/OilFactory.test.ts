import {
  bulkCost,
  GameType,
  maxBulkAmount,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { OilFactoryExecution } from "@openfront/engine/execution/OilFactoryExecution";
import { UpgradeStructureExecution } from "@openfront/engine/execution/UpgradeStructureExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

const OIL = UnitType.OilFactory;
const players = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game;
let alice: Player;
let bob: Player;

function site(index: number) {
  return game.ref(10 + index * 30, 10);
}
function build(player = alice, index = 0) {
  player.conquer(site(index));
  return player.buildUnit(OIL, site(index), {});
}

describe("Oil Factory economy", () => {
  beforeEach(async () => {
    game = await setup("big_plains", { instantBuild: true }, players);
    alice = game.player("a");
    bob = game.player("b");
    alice.addGold(100_000_000n);
    bob.addGold(100_000_000n);
  });

  it("charges 1.2M for every new building and 1.3M / 1.5M for its upgrades", () => {
    const before = alice.gold();
    const first = build();
    expect(before - alice.gold()).toBe(1_200_000n);
    const preview = alice.buildableUnits(first.tile(), [OIL])[0];
    expect(preview.cost).toBe(1_300_000n);
    expect(preview.upgradeCosts).toEqual([1_300_000n, 2_800_000n]);
    expect(maxBulkAmount(preview, alice.gold())).toBe(2);
    expect(bulkCost(preview, 5)).toBe(2_800_000n);
    alice.upgradeUnit(first);
    expect(first.level()).toBe(2);
    expect(before - alice.gold()).toBe(2_500_000n);
    expect(alice.buildableUnits(first.tile(), [OIL])[0].cost).toBe(1_500_000n);
    alice.upgradeUnit(first);
    expect(first.level()).toBe(3);
    expect(before - alice.gold()).toBe(4_000_000n);
    const nextBefore = alice.gold();
    build(alice, 1);
    expect(nextBefore - alice.gold()).toBe(1_200_000n);
  });

  it("rejects an upgrade when only the lower build price is affordable", () => {
    const factory = build();
    alice.removeGold(alice.gold());
    alice.addGold(1_200_000n);
    expect(alice.canUpgradeUnit(factory)).toBe(false);
    expect(alice.buildableUnits(factory.tile(), [OIL])[0].canUpgrade).toBe(
      false,
    );
    alice.upgradeUnit(factory);
    expect(factory.level()).toBe(1);
    expect(alice.gold()).toBe(1_200_000n);
  });

  it("limits bulk upgrades to level three and charges only the two valid steps", () => {
    const factory = build();
    const before = alice.gold();
    game.addExecution(new UpgradeStructureExecution(alice, factory.id(), 50));
    executeTicks(game, 1);
    expect(factory.level()).toBe(3);
    expect(before - alice.gold()).toBe(2_800_000n);
    expect(alice.canUpgradeUnit(factory)).toBe(false);
    expect(alice.buildableUnits(factory.tile(), [OIL])[0].canUpgrade).toBe(
      false,
    );
    factory.increaseLevel();
    alice.upgradeUnit(factory);
    expect(factory.level()).toBe(3);
    expect(before - alice.gold()).toBe(2_800_000n);
  });

  it.each([
    [1, 100_000n],
    [2, 135_000n],
    [3, 150_000n],
  ])(
    "pays level %i income every 100 ticks without an early payment",
    (level, income) => {
      const factory = build();
      while (factory.level() < level) alice.upgradeUnit(factory);
      const execution = new OilFactoryExecution(factory);
      execution.init(game, 10);
      const before = alice.gold();
      execution.tick(109);
      expect(alice.gold()).toBe(before);
      execution.tick(110);
      expect(alice.gold() - before).toBe(income);
      execution.tick(209);
      expect(alice.gold() - before).toBe(income);
      execution.tick(210);
      expect(alice.gold() - before).toBe(income * 2n);
    },
  );

  it("uses the current level for the next payout without paying early on upgrade", () => {
    const factory = build();
    const execution = new OilFactoryExecution(factory);
    execution.init(game, 0);
    execution.tick(99);
    alice.upgradeUnit(factory);
    const before = alice.gold();
    execution.tick(99);
    expect(alice.gold()).toBe(before);
    execution.tick(100);
    expect(alice.gold() - before).toBe(135_000n);
  });

  it("allows five separate buildings regardless of levels, with upgrades still allowed at the cap", () => {
    const first = build();
    alice.upgradeUnit(first);
    alice.upgradeUnit(first);
    for (let i = 1; i < 5; i++) build(alice, i);
    alice.conquer(site(5));
    expect(alice.units(OIL)).toHaveLength(5);
    expect(alice.canBuild(OIL, site(5))).toBe(false);
    expect(() => build(alice, 5)).toThrow(/Maximum/);
    expect(alice.canUpgradeUnit(alice.units(OIL)[1])).toBe(true);
    first.delete(false);
    expect(alice.canBuild(OIL, site(5))).not.toBe(false);
  });

  it("counts simultaneous buildings under construction toward the five-building cap", async () => {
    game = await setup("big_plains", { instantBuild: false }, players);
    alice = game.player("a");
    alice.addGold(100_000_000n);
    const before = alice.gold();
    for (let i = 0; i < 6; i++) {
      alice.conquer(site(i));
      game.addExecution(new ConstructionExecution(alice, OIL, site(i)));
    }
    executeTicks(game, 2);
    expect(alice.units(OIL)).toHaveLength(5);
    expect(alice.units(OIL).every((unit) => unit.isUnderConstruction())).toBe(
      true,
    );
    expect(before - alice.gold()).toBe(6_000_000n);
    executeTicks(game, 20);
    expect(before - alice.gold()).toBe(6_000_000n);
    executeTicks(game, 101);
    expect(before - alice.gold()).toBe(5_500_000n);
  });

  it("pays the new owner after capture and stops paying after destruction", () => {
    const factory = build();
    const execution = new OilFactoryExecution(factory);
    execution.init(game, 0);
    bob.captureUnit(factory);
    const beforeAlice = alice.gold();
    const beforeBob = bob.gold();
    execution.tick(100);
    expect(alice.gold()).toBe(beforeAlice);
    expect(bob.gold() - beforeBob).toBe(100_000n);
    factory.delete(false);
    execution.tick(200);
    expect(bob.gold() - beforeBob).toBe(100_000n);
    expect(execution.isActive()).toBe(false);
  });

  it("destroys excess captured factories rather than exceeding five owned buildings", () => {
    for (let i = 0; i < 5; i++) build(alice, i);
    const enemy = build(bob, 5);
    alice.captureUnit(enemy);
    expect(enemy.isActive()).toBe(false);
    expect(alice.units(OIL)).toHaveLength(5);
    expect(bob.units(OIL)).toHaveLength(0);
  });

  it.each([GameType.Singleplayer, GameType.Private])(
    "honors Disable Units in %s",
    async (gameType) => {
      game = await setup(
        "big_plains",
        { gameType, disabledUnits: [OIL] },
        players,
      );
      alice = game.player("a");
      alice.addGold(100_000_000n);
      alice.conquer(site(0));
      const before = alice.gold();
      expect(alice.canBuild(OIL, site(0))).toBe(false);
      expect(alice.buildableUnits(site(0), [OIL])[0].canBuild).toBe(false);
      game.addExecution(new ConstructionExecution(alice, OIL, site(0)));
      executeTicks(game, 30);
      expect(alice.units(OIL)).toHaveLength(0);
      expect(alice.gold()).toBe(before);
    },
  );

  it("restores an in-progress income timer without double-paying or delaying income", async () => {
    alice.conquer(site(0));
    game.addExecution(new ConstructionExecution(alice, OIL, site(0)));
    executeTicks(game, 47);
    await expectSnapshotRoundTrip(game, "big_plains", 230);
  });
});
