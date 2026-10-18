import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { CopperMineExecution } from "@openfront/engine/execution/CopperMineExecution";
import { OilFactoryExecution } from "@openfront/engine/execution/OilFactoryExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { NukeType } from "@openfront/engine-api/StatsSchemas";
import { setup } from "../util/Setup";
import { TestConfig } from "../util/TestConfig";
import { executeTicks } from "../util/utils";

describe.each([UnitType.OilFactory, UnitType.CopperMine])(
  "Bomb damage to %s",
  (buildingType) => {
    it.each([UnitType.AtomBomb, UnitType.HydrogenBomb, UnitType.MIRVWarhead])(
      "%s destroys the entire upgraded building and stops income",
      async (bomb) => {
        const game = await setup("big_plains", { instantBuild: true }, [
          new PlayerInfo("attacker", PlayerType.Human, "a", "a"),
          new PlayerInfo("owner", PlayerType.Human, "b", "b"),
        ]);
        const attacker = game.player("a"),
          owner = game.player("b");
        attacker.addGold(100_000_000n);
        owner.addGold(100_000_000n);
        const target = game.ref(50, 50),
          source = game.ref(10, 10);
        attacker.conquer(source);
        owner.conquer(target);
        attacker.buildUnit(UnitType.BunkerMissileSite, source, {});
        const building = owner.buildUnit(buildingType, target, {});
        while (owner.canUpgradeUnit(building)) owner.upgradeUnit(building);
        expect(building.level()).toBe(game.unitInfo(buildingType).maxLevel);
        const income =
          buildingType === UnitType.OilFactory
            ? new OilFactoryExecution(building)
            : new CopperMineExecution(building);
        game.addExecution(income);
        (game.config() as TestConfig).setDefaultNukeSpeed(100);
        const nuke = new NukeExecution(
          bomb as NukeType,
          attacker,
          target,
          source,
        );
        game.addExecution(nuke);
        executeTicks(game, 30);
        expect(nuke.isActive()).toBe(false);
        expect(building.isActive()).toBe(false);
        expect(owner.units(buildingType)).toHaveLength(0);
        const afterExplosion = owner.gold();
        executeTicks(game, 210);
        expect(owner.gold()).toBe(afterExplosion);
        expect(income.isActive()).toBe(false);
      },
    );
  },
);
