import {
  bulkCost,
  GameType,
  maxBulkAmount,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { CopperMineExecution } from "@openfront/engine/execution/CopperMineExecution";
import { UpgradeStructureExecution } from "@openfront/engine/execution/UpgradeStructureExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

const MINE = UnitType.CopperMine;
const players = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game;
let alice: Player;
let bob: Player;
const site = (index: number) => game.ref(10 + index * 40, 10);
function build(player = alice, index = 0) {
  player.conquer(site(index));
  return player.buildUnit(MINE, site(index), {});
}

describe("Copper Mine economy", () => {
  beforeEach(async () => {
    game = await setup("big_plains", { instantBuild: true }, players);
    alice = game.player("a");
    bob = game.player("b");
    alice.addGold(100_000_000n);
    bob.addGold(100_000_000n);
  });

  it("charges 650K for each building and 1M for its only upgrade", () => {
    const before = alice.gold();
    const mine = build();
    expect(before - alice.gold()).toBe(650_000n);
    const preview = alice.buildableUnits(mine.tile(), [MINE])[0];
    expect(preview.cost).toBe(1_000_000n);
    expect(preview.upgradeCosts).toEqual([1_000_000n]);
    expect(maxBulkAmount(preview, alice.gold())).toBe(1);
    expect(bulkCost(preview, 50)).toBe(1_000_000n);
    game.addExecution(new UpgradeStructureExecution(alice, mine.id(), 50));
    executeTicks(game, 1);
    expect(mine.level()).toBe(2);
    expect(before - alice.gold()).toBe(1_650_000n);
    mine.increaseLevel();
    alice.upgradeUnit(mine);
    expect(mine.level()).toBe(2);
    expect(before - alice.gold()).toBe(1_650_000n);
    const nextBefore = alice.gold();
    build(alice, 1);
    expect(nextBefore - alice.gold()).toBe(650_000n);
  });

  it("does not offer an upgrade when only the build cost is affordable", () => {
    const mine = build();
    alice.removeGold(alice.gold());
    alice.addGold(650_000n);
    expect(alice.canUpgradeUnit(mine)).toBe(false);
    expect(alice.buildableUnits(mine.tile(), [MINE])[0].canUpgrade).toBe(false);
    alice.upgradeUnit(mine);
    expect(mine.level()).toBe(1);
    expect(alice.gold()).toBe(650_000n);
  });

  it.each([
    [1, 25_000n],
    [2, 40_000n],
  ])("pays level %i income every ten seconds", (level, income) => {
    const mine = build();
    if (level === 2) alice.upgradeUnit(mine);
    const execution = new CopperMineExecution(mine);
    execution.init(game, 20);
    const before = alice.gold();
    execution.tick(119);
    expect(alice.gold()).toBe(before);
    execution.tick(120);
    expect(alice.gold() - before).toBe(income);
    execution.tick(219);
    expect(alice.gold() - before).toBe(income);
    execution.tick(220);
    expect(alice.gold() - before).toBe(income * 2n);
  });

  it("counts two separate mines regardless of levels and frees capacity on destruction", () => {
    const first = build();
    alice.upgradeUnit(first);
    build(alice, 1);
    alice.conquer(site(2));
    expect(alice.canBuild(MINE, site(2))).toBe(false);
    expect(() => build(alice, 2)).toThrow(/Maximum/);
    expect(alice.canUpgradeUnit(alice.units(MINE)[1])).toBe(true);
    first.delete(false);
    expect(alice.canBuild(MINE, site(2))).not.toBe(false);
  });

  it("includes unfinished mines in the two-building limit and does not pay during construction", async () => {
    game = await setup("big_plains", {}, players);
    alice = game.player("a");
    alice.addGold(10_000_000n);
    const before = alice.gold();
    for (let i = 0; i < 3; i++) {
      alice.conquer(site(i));
      game.addExecution(new ConstructionExecution(alice, MINE, site(i)));
    }
    executeTicks(game, 2);
    expect(alice.units(MINE)).toHaveLength(2);
    expect(alice.units(MINE).every((mine) => mine.isUnderConstruction())).toBe(
      true,
    );
    expect(before - alice.gold()).toBe(1_300_000n);
    executeTicks(game, 20);
    expect(before - alice.gold()).toBe(1_300_000n);
    executeTicks(game, 101);
    expect(before - alice.gold()).toBe(1_250_000n);
  });

  it("transfers income to the captor and destroys captures beyond their mine limit", () => {
    const mine = build();
    const execution = new CopperMineExecution(mine);
    execution.init(game, 0);
    bob.captureUnit(mine);
    const before = bob.gold();
    execution.tick(100);
    expect(bob.gold() - before).toBe(25_000n);
    build(alice, 1);
    build(alice, 2);
    alice.captureUnit(mine);
    expect(mine.isActive()).toBe(false);
    execution.tick(200);
    expect(execution.isActive()).toBe(false);
    expect(bob.gold() - before).toBe(25_000n);
    expect(alice.units(MINE)).toHaveLength(2);
  });

  it.each([GameType.Singleplayer, GameType.Private])(
    "honors Disable Units in %s",
    async (gameType) => {
      game = await setup(
        "big_plains",
        { gameType, disabledUnits: [MINE] },
        players,
      );
      alice = game.player("a");
      alice.addGold(10_000_000n);
      alice.conquer(site(0));
      const before = alice.gold();
      expect(alice.canBuild(MINE, site(0))).toBe(false);
      game.addExecution(new ConstructionExecution(alice, MINE, site(0)));
      executeTicks(game, 200);
      expect(alice.units(MINE)).toHaveLength(0);
      expect(alice.gold()).toBe(before);
    },
  );

  it("restores construction and the pending income timer", async () => {
    alice.conquer(site(0));
    game.addExecution(new ConstructionExecution(alice, MINE, site(0)));
    executeTicks(game, 47);
    await expectSnapshotRoundTrip(game, "big_plains", 230);
  });
});
