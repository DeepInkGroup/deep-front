import { Config } from "@openfront/engine-lib/configuration/Config";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { STEALTH_BLAST } from "@openfront/engine-api/game/AdvancedDefense";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { SAMLauncherExecution } from "@openfront/engine/execution/SAMLauncherExecution";
import { BunkerAIExecution } from "@openfront/engine/execution/BunkerAIExecution";
import { interceptWithCIWS } from "@openfront/engine/game/CIWSDefense";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { executeTicks } from "../util/utils";
import { expectSnapshotRoundTrip } from "../util/Snapshot";

const CIWS = UnitType.CIWSDefense;
const humans = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game, alice: Player, bob: Player;
function owned(player: Player, x: number, y = 100) {
  const tile = game.ref(x, y);
  player.conquer(tile);
  return tile;
}
beforeEach(async () => {
  game = await setup("big_plains", { instantBuild: true }, humans);
  alice = game.player("a");
  bob = game.player("b");
  alice.addGold(1_000_000_000n);
  bob.addGold(1_000_000_000n);
});
describe("CIWS Defense", () => {
  it("charges per-building level costs, permits multiple sites, and caps upgrades at L5", () => {
    const start = bob.gold(),
      site = bob.buildUnit(CIWS, owned(bob, 130), {});
    const costs = [3_000_000n, 3_500_000n, 3_500_000n, 3_500_000n];
    for (const cost of costs) {
      const before = bob.gold();
      bob.upgradeUnit(site);
      expect(before - bob.gold()).toBe(cost);
    }
    expect(site.level()).toBe(5);
    expect(start - bob.gold()).toBe(15_500_000n);
    expect(bob.canUpgradeUnit(site)).toBe(false);
    site.increaseLevel();
    expect(site.level()).toBe(5);
    expect(bob.buildableUnits(site.tile(), [CIWS])[0].canUpgrade).toBe(false);
    const second = bob.buildUnit(CIWS, owned(bob, 170), {});
    expect(second.level()).toBe(1);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "destroys interceptable types in a simultaneous wave without detection misses in %s",
    async (gameType) => {
      game = await setup(
        "big_plains",
        { instantBuild: true, gameType },
        humans,
      );
      alice = game.player("a");
      bob = game.player("b");
      alice.addGold(1_000_000_000n);
      bob.addGold(1_000_000_000n);
      const tile = owned(bob, 130),
        site = bob.buildUnit(CIWS, tile, {});
      game.addExecution(new SAMLauncherExecution(bob, null, site));
      const missiles = [];
      for (let wave = 0; wave < 6; wave++)
        for (const type of [
          UnitType.AtomBomb,
          UnitType.StealthMissile,
          UnitType.HypersonicMissile,
          UnitType.MIRVWarhead,
        ] as const)
          missiles.push(
            alice.buildUnit(type, tile, {
              trajectory: [],
              targetTile: owned(bob, 145),
            }),
          );
      missiles.push(
        alice.buildUnit(UnitType.MIRV, tile, {
          targetPlayer: bob,
          targetTile: game.ref(145, 100),
        }),
      );
      executeTicks(game, 2);
      expect(missiles.every((m) => !m.isActive())).toBe(true);
      expect(site.isActive()).toBe(true);
      expect(site.missileTimerQueue()).toHaveLength(0);
      await expectSnapshotRoundTrip(game, "big_plains", 15);
    },
  );
  it("intercepts a swept hypersonic flight segment even when both endpoints lie outside range", () => {
    bob.buildUnit(CIWS, owned(bob, 110), {});
    const missile = alice.buildUnit(
      UnitType.HypersonicMissile,
      owned(alice, 40),
      { trajectory: [], targetTile: owned(bob, 180), targetPlayer: bob },
    );
    expect(
      interceptWithCIWS(game, missile, game.ref(40, 100), game.ref(180, 100)),
    ).toBe(true);
    expect(missile.isActive()).toBe(false);
  });
  it("does not protect before construction finishes, outside range, or against friendly missiles", () => {
    const site = bob.buildUnit(CIWS, owned(bob, 130), {});
    const missile = alice.buildUnit(UnitType.StealthMissile, owned(alice, 15), {
      trajectory: [],
      targetTile: game.ref(180, 100),
    });
    site.setUnderConstruction(true);
    expect(
      interceptWithCIWS(game, missile, game.ref(120, 100), game.ref(140, 100)),
    ).toBe(false);
    site.setUnderConstruction(false);
    expect(
      interceptWithCIWS(game, missile, game.ref(20, 100), game.ref(50, 100)),
    ).toBe(false);
    const friendly = bob.buildUnit(UnitType.AtomBomb, site.tile(), {
      trajectory: [],
      targetTile: game.ref(180, 100),
    });
    expect(interceptWithCIWS(game, friendly, site.tile(), site.tile())).toBe(
      false,
    );
  });
  it("protects buildings before a real missile can detonate, independent of execution order", () => {
    const target = owned(bob, 170);
    bob.buildUnit(UnitType.City, target, {});
    bob.buildUnit(CIWS, owned(bob, 165), {});
    alice.buildUnit(UnitType.BunkerMissileSite, owned(alice, 15), {});
    const execution = new NukeExecution(
      UnitType.HypersonicMissile,
      alice,
      target,
    );
    game.addExecution(execution);
    executeTicks(game, 100);
    expect(execution.getNuke()?.isActive()).toBe(false);
    expect(execution.getNuke()?.reachedTarget()).toBe(false);
    expect(game.owner(target)).toBe(bob);
    expect(bob.units(UnitType.City)).toHaveLength(1);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "honors disabled units in %s",
    async (gameType) => {
      game = await setup(
        "big_plains",
        { gameType, disabledUnits: [CIWS] },
        humans,
      );
      bob = game.player("b");
      bob.addGold(10_000_000n);
      const tile = owned(bob, 130);
      const before = bob.gold();
      game.addExecution(new ConstructionExecution(bob, CIWS, tile));
      executeTicks(game, 400);
      expect(bob.units(CIWS)).toHaveLength(0);
      expect(bob.gold()).toBe(before);
    },
  );
  it("gives stealth exactly half the atom blast area and supports fractional radii with water nukes", async () => {
    const config = new Config(game.config().gameConfig(), false);
    const atom = config.nukeMagnitudes(UnitType.AtomBomb),
      stealth = config.nukeMagnitudes(UnitType.StealthMissile);
    expect(stealth).toEqual(STEALTH_BLAST);
    expect(stealth.outer ** 2 / atom.outer ** 2).toBeCloseTo(0.5);
    expect(stealth.inner ** 2 / atom.inner ** 2).toBeCloseTo(0.5);
    game = await setup(
      "big_plains",
      { instantBuild: true, waterNukes: true, spawnImmunityDuration: 0 },
      humans,
      undefined,
      EngineConfig,
    );
    alice = game.player("a");
    bob = game.player("b");
    alice.addGold(10_000_000n);
    alice.buildUnit(UnitType.BunkerMissileSite, owned(alice, 15), {});
    const near = bob.buildUnit(UnitType.City, owned(bob, 177), {}),
      far = bob.buildUnit(UnitType.CopperMine, owned(bob, 150), {});
    const execution = new NukeExecution(
      UnitType.StealthMissile,
      alice,
      owned(bob, 180),
    );
    game.addExecution(execution);
    executeTicks(game, 100);
    expect(execution.getNuke()?.reachedTarget()).toBe(true);
    expect(near.isActive()).toBe(false);
    expect(far.isActive()).toBe(true);
  });
  it.each([PlayerType.Bot, PlayerType.Nation])(
    "lets %s AI build CIWS and honors its disable option",
    async (type) => {
      for (const disabled of [false, true]) {
        const info = new PlayerInfo("AI", type, null, "ai");
        game = await setup(
          "big_plains",
          { instantBuild: true, disabledUnits: disabled ? [CIWS] : [] },
          [...humans, info],
        );
        const ai = game.player("ai");
        bob = game.player("b");
        ai.addGold(50_000_000n);
        for (let y = 10; y < 100; y++)
          for (let x = 10; x < 100; x++) ai.conquer(game.ref(x, y));
        owned(bob, 180);
        game.addExecution(new BunkerAIExecution(ai));
        executeTicks(game, 350);
        expect(ai.units(CIWS).length).toBe(disabled ? 0 : 1);
      }
    },
  );
});
