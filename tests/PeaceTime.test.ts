import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";
import { executeTicks } from "./util/utils";

const humans = [
  new PlayerInfo("Alice", PlayerType.Human, "alice", "alice"),
  new PlayerInfo("Bob", PlayerType.Human, "bob", "bob"),
];

describe("Peace time", () => {
  it.each([0, 3, 5, 10])(
    "ends precisely after %i minutes of game time",
    async (minutes) => {
      // Use production configuration, including its distinct nation immunity.
      const game = await setup(
        "ocean_and_land",
        {
          gameType: GameType.Private,
          spawnImmunityDuration: minutes * 600,
        },
        humans,
        undefined,
        EngineConfig,
      );
      const alice = game.player("alice");
      const bob = game.player("bob");
      const bot = game.addPlayer(
        new PlayerInfo("Bot", PlayerType.Bot, null, "bot"),
      );
      const nation = game.addPlayer(
        new PlayerInfo("Nation", PlayerType.Nation, null, "nation"),
      );
      const clock = vi.spyOn(game, "ticks");
      if (minutes > 0) {
        clock.mockReturnValue(minutes * 600 - 1);
        expect(alice.canAttackPlayer(bob)).toBe(false);
        expect(bob.canAttackPlayer(alice)).toBe(false);
        expect(alice.canAttackPlayer(bot)).toBe(true);
        expect(alice.canAttackPlayer(nation)).toBe(true);
        expect(bot.canAttackPlayer(alice)).toBe(true);
        expect(nation.canAttackPlayer(alice)).toBe(true);
      }
      clock.mockReturnValue(minutes * 600);
      expect(alice.canAttackPlayer(bob)).toBe(true);
      expect(bob.canAttackPlayer(alice)).toBe(true);
      clock.mockRestore();
    },
  );

  it.each([false, true])(
    "protects humans from nuclear splash (water nukes: %s) while damaging bots",
    async (waterNukes) => {
      const game = await setup(
        "plains",
        {
          infiniteGold: true,
          instantBuild: true,
          waterNukes,
        },
        humans,
      );
      const config = game.config() as TestConfig;
      config.setSpawnImmunityDuration(6000);
      config.setDefaultNukeSpeed(50);
      config.nukeMagnitudes = () => ({ inner: 4, outer: 4 });
      const alice = game.player("alice");
      const bob = game.player("bob");
      const bot = game.addPlayer(
        new PlayerInfo("Bot", PlayerType.Bot, null, "bot"),
      );
      alice.conquer(game.ref(1, 1));
      alice.buildUnit(UnitType.BunkerMissileSite, game.ref(1, 1), {});
      const target = game.ref(10, 10);
      bot.conquer(target);
      const protectedTile = game.ref(11, 10);
      bob.conquer(protectedTile);
      const city = bob.buildUnit(UnitType.City, protectedTile, {});
      const botCity = bot.buildUnit(UnitType.City, target, {});
      const troopsBefore = bob.troops();
      expect(alice.canBuild(UnitType.AtomBomb, protectedTile)).toBe(false);
      expect(alice.canBuild(UnitType.AtomBomb, target)).not.toBe(false);
      const nuke = new NukeExecution(UnitType.AtomBomb, alice, target);
      game.addExecution(nuke);
      executeTicks(game, 40);
      expect(nuke.isActive()).toBe(false);
      expect(botCity.isActive()).toBe(false);
      expect(game.owner(protectedTile)).toBe(bob);
      expect(game.isLand(protectedTile)).toBe(true);
      expect(game.hasFallout(protectedTile)).toBe(false);
      expect(city.isActive()).toBe(true);
      expect(bob.troops()).toBeGreaterThanOrEqual(troopsBefore);
      expect(game.owner(target)).not.toBe(bot);
    },
  );
});
