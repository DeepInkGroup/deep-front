import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { EconomyAIExecution } from "@openfront/engine/execution/EconomyAIExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { TribeExecution } from "@openfront/engine/execution/TribeExecution";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function aiGame(type: PlayerType, disabledUnits: UnitType[] = []) {
  const info = new PlayerInfo("AI", type, null, "ai");
  const game = await setup(
    "big_plains",
    { instantBuild: true, disabledUnits },
    [info],
  );
  const player = game.player("ai");
  player.addGold(100_000_000n);
  for (let y = 10; y < 160; y++)
    for (let x = 10; x < 160; x++) player.conquer(game.ref(x, y));
  return { game, player, info };
}

describe.each([PlayerType.Bot, PlayerType.Nation])("%s economy AI", (type) => {
  it("builds both building types, upgrades them, obeys caps and spends gold", async () => {
    const { game, player } = await aiGame(type);
    const before = player.gold();
    game.addExecution(new EconomyAIExecution(player));
    executeTicks(game, 1800);
    const oil = player.units(UnitType.OilFactory),
      copper = player.units(UnitType.CopperMine);
    expect(oil).toHaveLength(5);
    expect(copper).toHaveLength(2);
    expect(oil.every((unit) => unit.level() === 3)).toBe(true);
    expect(copper.every((unit) => unit.level() === 2)).toBe(true);
    expect(player.gold()).toBeLessThan(before);
  });

  it("respects disabled buildings independently", async () => {
    const { game, player } = await aiGame(type, [UnitType.OilFactory]);
    game.addExecution(new EconomyAIExecution(player));
    executeTicks(game, 500);
    expect(player.units(UnitType.OilFactory)).toHaveLength(0);
    expect(player.units(UnitType.CopperMine)).toHaveLength(2);
  });

  it("does not spend gold or build when both building types are disabled", async () => {
    const { game, player } = await aiGame(type, [
      UnitType.OilFactory,
      UnitType.CopperMine,
    ]);
    const before = player.gold();
    game.addExecution(new EconomyAIExecution(player));
    executeTicks(game, 300);
    expect(player.units()).toHaveLength(0);
    expect(player.gold()).toBe(before);
  });

  it("cannot build without sufficient gold", async () => {
    const { game, player } = await aiGame(type);
    player.removeGold(player.gold());
    player.addGold(649_999n);
    game.addExecution(new EconomyAIExecution(player));
    executeTicks(game, 300);
    expect(player.units()).toHaveLength(0);
    expect(player.gold()).toBe(649_999n);
  });

  it("is automatically attached on spawn and preserves its schedule across a save", async () => {
    const info = new PlayerInfo("AI", type, null, "ai");
    const game = await setup("big_plains", { instantBuild: true }, [info]);
    game.addExecution(new SpawnExecution("aTEST12345", info, game.ref(90, 90)));
    executeTicks(game, 3);
    const player = game.player("ai");
    player.addGold(20_000_000n);
    for (let y = 20; y < 160; y++)
      for (let x = 20; x < 160; x++) player.conquer(game.ref(x, y));
    executeTicks(game, 130);
    expect(
      player.units(UnitType.OilFactory).length +
        player.units(UnitType.CopperMine).length,
    ).toBeGreaterThan(0);
    await expectSnapshotRoundTrip(game, "big_plains", 160);
  });
});

it("tribes retain oil factories and copper mines", async () => {
  const { game, player } = await aiGame(PlayerType.Bot);
  player.buildUnit(UnitType.OilFactory, game.ref(30, 30), {});
  player.buildUnit(UnitType.CopperMine, game.ref(70, 70), {});
  const tribe = new TribeExecution(player) as any;
  tribe.init(game);
  tribe.deleteNextStructure();
  executeTicks(game, 30);
  expect(player.units(UnitType.OilFactory)).toHaveLength(1);
  expect(player.units(UnitType.CopperMine)).toHaveLength(1);
  expect(player.units().every((unit) => !unit.isMarkedForDeletion())).toBe(
    true,
  );
});
