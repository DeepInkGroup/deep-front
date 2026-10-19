import { describe, expect, it } from "vitest";
import {
  GameType,
  PlayerInfo,
  PlayerType,
  TrainType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { setup } from "../util/Setup";
import { executeTicks } from "../util/utils";

describe.each([GameType.Singleplayer, GameType.Private])(
  "Conventional building strikes in %s",
  (gameType) => {
    it.each([UnitType.StealthMissile, UnitType.HypersonicMissile] as const)(
      "destroys buildings with %s and preserves land, ownership, troops and mobile units even with water nukes enabled",
      async (type) => {
        const game = await setup(
          "big_plains",
          {
            instantBuild: true,
            spawnImmunityDuration: 0,
            gameType,
            waterNukes: true,
          },
          [
            new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
            new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
          ],
          undefined,
          EngineConfig,
        );
        const a = game.player("a"),
          b = game.player("b");
        a.addGold(100_000_000n);
        b.addGold(100_000_000n);
        b.addTroops(10_000);
        a.conquer(game.ref(15, 100));
        a.buildUnit(UnitType.BunkerMissileSite, game.ref(15, 100), {});
        for (let y = 65; y < 135; y++)
          for (let x = 140; x < 199; x++) b.conquer(game.ref(x, y));
        const target = game.ref(175, 100),
          building = b.buildUnit(UnitType.City, target, {});
        const train = b.buildUnit(UnitType.Train, game.ref(174, 100), {
          trainType: TrainType.Engine,
        });
        const troopCount = b.troops(),
          tileCount = b.numTilesOwned(),
          waterVersion = game.map().waterVersion();
        const execution = new NukeExecution(type, a, target);
        game.addExecution(execution);
        executeTicks(game, 100);
        expect(execution.getNuke()?.reachedTarget()).toBe(true);
        expect(building.isActive()).toBe(false);
        expect(train.isActive()).toBe(true);
        expect(b.troops()).toBe(troopCount);
        expect(b.numTilesOwned()).toBe(tileCount);
        expect(game.owner(target)).toBe(b);
        expect(game.isLand(target)).toBe(true);
        expect(game.map().waterVersion()).toBe(waterVersion);
        for (let y = 75; y < 125; y++)
          for (let x = 150; x < 198; x++)
            expect(game.hasFallout(game.ref(x, y))).toBe(false);
      },
    );
  },
);
