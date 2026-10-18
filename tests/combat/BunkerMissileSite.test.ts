import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { NukeType } from "@openfront/engine-api/StatsSchemas";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { BunkerAIExecution } from "@openfront/engine/execution/BunkerAIExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { SAMLauncherExecution } from "@openfront/engine/execution/SAMLauncherExecution";
import { UpgradeStructureExecution } from "@openfront/engine/execution/UpgradeStructureExecution";
import { canSAMDetectAdvancedMissile } from "@openfront/engine/game/AdvancedMissiles";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";
import { TestConfig } from "../util/TestConfig";

const SITE = UnitType.BunkerMissileSite,
  STEALTH = UnitType.StealthMissile,
  HYPER = UnitType.HypersonicMissile;
const humans = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
  new PlayerInfo("Carol", PlayerType.Human, "c", "c"),
];
let game: Game, alice: Player, bob: Player, carol: Player;
function territory(player: Player, x0: number, x1: number) {
  for (let y = 1; y < 190; y++)
    for (let x = x0; x < x1; x++) player.conquer(game.ref(x, y));
}
function site() {
  return alice.buildUnit(SITE, game.ref(15, 100), {});
}
beforeEach(async () => {
  game = await setup("big_plains", { instantBuild: true }, humans);
  alice = game.player("a");
  bob = game.player("b");
  carol = game.player("c");
  for (const p of [alice, bob, carol]) p.addGold(3_000_000_000n);
  territory(alice, 1, 45);
  territory(carol, 45, 125);
  territory(bob, 125, 199);
});

describe("Bunker Missile Site", () => {
  it.each([STEALTH, HYPER])(
    "preserves human peace protection including %s splash",
    async (type) => {
      game = await setup("big_plains", { instantBuild: true }, humans);
      (game.config() as TestConfig).setSpawnImmunityDuration(6000);
      alice = game.player("a");
      bob = game.player("b");
      const bot = game.addPlayer(
        new PlayerInfo("Bot", PlayerType.Bot, null, "bot"),
      );
      alice.addGold(3_000_000_000n);
      alice.conquer(game.ref(15, 100));
      site();
      const target = game.ref(150, 100),
        protectedTile = game.ref(151, 100);
      bot.conquer(target);
      bob.conquer(protectedTile);
      bob.addGold(5_000_000n);
      const protectedBuilding = bob.buildUnit(
        UnitType.CopperMine,
        protectedTile,
        {},
      );
      expect(alice.canBuild(type, protectedTile)).toBe(false);
      expect(alice.canBuild(type, target)).not.toBe(false);
      const missile = new NukeExecution(type as NukeType, alice, target);
      game.addExecution(missile);
      executeTicks(game, 100);
      expect(missile.isActive()).toBe(false);
      expect(game.owner(protectedTile)).toBe(bob);
      expect(protectedBuilding.isActive()).toBe(true);
      expect(game.owner(target)).not.toBe(bot);
    },
  );
  it("flies substantially faster with production hypersonic speed", async () => {
    const flightTicks = [];
    for (const type of [STEALTH, HYPER] as const) {
      game = await setup(
        "big_plains",
        { instantBuild: true, spawnImmunityDuration: 0 },
        humans,
        undefined,
        EngineConfig,
      );
      alice = game.player("a");
      bob = game.player("b");
      alice.addGold(3_000_000_000n);
      alice.conquer(game.ref(15, 100));
      bob.conquer(game.ref(180, 100));
      site();
      const missile = new NukeExecution(type, alice, game.ref(180, 100));
      missile.init(game, 0);
      missile.tick(0);
      let ticks = 0;
      while (missile.isActive() && ticks < 100) missile.tick(++ticks);
      expect(missile.getNuke()?.reachedTarget()).toBe(true);
      flightTicks.push(ticks);
    }
    expect(flightTicks[1]).toBeLessThan(flightTicks[0] / 2);
  });
  it("charges the specified level prices without capping higher levels", () => {
    const info = game.unitInfo(SITE);
    expect(info.cost(game, alice)).toBe(1_000_000n);
    expect(info.cost(game, alice, 0, 1)).toBe(1_300_000n);
    for (const level of [2, 3, 10, 99])
      expect(info.cost(game, alice, 0, level)).toBe(1_500_000n);
    expect(info.maxLevel).toBeUndefined();
    expect(game.unitInfo(STEALTH).cost(game, alice)).toBe(1_000_000n);
    expect(game.unitInfo(HYPER).cost(game, alice)).toBe(950_000_000n);
    expect(
      new EngineConfig(game.config().gameConfig(), false).nukeSpeed(HYPER),
    ).toBe(40);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "takes exactly 50 seconds to construct in %s",
    async (gameType) => {
      game = await setup("big_plains", { gameType }, humans);
      alice = game.player("a");
      alice.addGold(5_000_000n);
      alice.conquer(game.ref(15, 100));
      const execution = new ConstructionExecution(
        alice,
        SITE,
        game.ref(15, 100),
      );
      execution.init(game, 0);
      execution.tick(0);
      const bunker = alice.units(SITE)[0];
      expect(bunker.isUnderConstruction()).toBe(true);
      expect(alice.canBuild(STEALTH, game.ref(180, 100))).toBe(false);
      for (let t = 1; t < 500; t++) execution.tick(t);
      expect(bunker.isUnderConstruction()).toBe(true);
      execution.tick(500);
      expect(bunker.isUnderConstruction()).toBe(false);
    },
  );
  it("locks upgrades for 5 seconds, charges once and rejects bulk bypass", async () => {
    const bunker = site(),
      before = alice.gold();
    game.addExecution(new UpgradeStructureExecution(alice, bunker.id(), 50));
    executeTicks(game, 2);
    expect(bunker.isUnderConstruction()).toBe(true);
    expect(bunker.level()).toBe(1);
    expect(before - alice.gold()).toBe(1_300_000n);
    expect(alice.canUpgradeUnit(bunker)).toBe(false);
    expect(alice.canBuild(STEALTH, game.ref(180, 100))).toBe(false);
    executeTicks(game, 49);
    expect(bunker.level()).toBe(1);
    executeTicks(game, 2);
    expect(bunker.level()).toBe(2);
    expect(bunker.isUnderConstruction()).toBe(false);
    game.addExecution(new UpgradeStructureExecution(alice, bunker.id()));
    executeTicks(game, 10);
    await expectSnapshotRoundTrip(game, "big_plains", 60);
    executeTicks(game, 42);
    expect(bunker.level()).toBe(3);
  });
  it("does not grant a purchased upgrade after capture or destruction", () => {
    const bunker = site();
    alice.upgradeUnit(bunker);
    executeTicks(game, 10);
    bob.captureUnit(bunker);
    executeTicks(game, 60);
    expect(bunker.level()).toBe(1);
    expect(bunker.isUnderConstruction()).toBe(false);
  });
  it("requires a completed bunker, not a normal missile silo; uses its capacity", () => {
    const destination = game.ref(180, 100);
    alice.buildUnit(UnitType.MissileSilo, game.ref(15, 100), {});
    expect(alice.canBuild(STEALTH, destination)).toBe(false);
    const bunker = alice.buildUnit(SITE, game.ref(15, 145), {});
    expect(alice.canBuild(STEALTH, destination)).toBe(bunker.tile());
    const nuke = new NukeExecution(STEALTH, alice, destination);
    nuke.init(game, 0);
    nuke.tick(0);
    expect(bunker.isInCooldown()).toBe(true);
    expect(alice.canBuild(STEALTH, destination)).toBe(false);
    expect(nuke.getNuke()?.type()).toBe(STEALTH);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "respects disabled units in %s",
    async (gameType) => {
      game = await setup(
        "big_plains",
        { gameType, instantBuild: true, disabledUnits: [SITE, STEALTH, HYPER] },
        humans,
      );
      alice = game.player("a");
      bob = game.player("b");
      alice.addGold(3_000_000_000n);
      alice.conquer(game.ref(15, 100));
      bob.conquer(game.ref(180, 100));
      const before = alice.gold();
      for (const t of [SITE, STEALTH, HYPER]) {
        expect(alice.canBuild(t, game.ref(15, 100))).toBe(false);
        game.addExecution(
          new ConstructionExecution(alice, t, game.ref(15, 100)),
        );
      }
      executeTicks(game, 600);
      expect(alice.units()).toHaveLength(0);
      expect(alice.gold()).toBe(before);
    },
  );
  it.each([STEALTH, HYPER])(
    "destroys buildings on impact and saves in-flight %s deterministically",
    async (type) => {
      site();
      const target = bob.buildUnit(UnitType.OilFactory, game.ref(180, 100), {});
      const missile = new NukeExecution(type as NukeType, alice, target.tile());
      game.addExecution(missile);
      executeTicks(game, 3);
      expect(missile.getNuke()).not.toBeNull();
      await expectSnapshotRoundTrip(game, "big_plains", 100);
      executeTicks(game, 100);
      expect(target.isActive()).toBe(false);
      expect(missile.getNuke()?.reachedTarget()).toBe(true);
    },
  );
  it("keeps stealth hidden and silent until it reaches the target country", () => {
    site();
    const missile = new NukeExecution(STEALTH, alice, game.ref(180, 100));
    missile.init(game, 0);
    missile.tick(0);
    const unit = missile.getNuke()!;
    expect(unit.isTargetable()).toBe(false);
    let revealed = false;
    for (let tick = 1; tick < 100 && unit.isActive(); tick++) {
      missile.tick(tick);
      if (!revealed && unit.isTargetable()) {
        expect(game.owner(unit.tile())).toBe(bob);
        revealed = true;
      }
      if (game.owner(unit.tile()) === carol)
        expect(unit.isTargetable()).toBe(false);
    }
    expect(revealed).toBe(true);
  });
  it("gives SAMs a deterministic chance to miss stealth detection", () => {
    const missile = alice.buildUnit(STEALTH, game.ref(140, 100), {
      targetTile: game.ref(180, 100),
      targetPlayer: bob,
      trajectory: [],
    });
    const results = [];
    for (let i = 0; i < 24; i++) {
      const sam = bob.buildUnit(
        UnitType.SAMLauncher,
        game.ref(140 + i, 100),
        {},
      );
      expect(canSAMDetectAdvancedMissile(sam, missile)).toBe(false);
      missile.setTargetable(true);
      results.push(canSAMDetectAdvancedMissile(sam, missile));
      expect(canSAMDetectAdvancedMissile(sam, missile)).toBe(
        results[results.length - 1],
      );
      missile.setTargetable(false);
    }
    expect(results).toContain(true);
    expect(results).toContain(false);
  });
  it("only allows the original target country to intercept hypersonic missiles", () => {
    const ownSam = bob.buildUnit(UnitType.SAMLauncher, game.ref(140, 100), {}),
      foreignSam = carol.buildUnit(
        UnitType.SAMLauncher,
        game.ref(100, 100),
        {},
      );
    const missile = alice.buildUnit(HYPER, game.ref(100, 100), {
      targetTile: game.ref(180, 100),
      targetPlayer: bob,
      trajectory: [],
    });
    expect(canSAMDetectAdvancedMissile(foreignSam, missile)).toBe(false);
    expect(canSAMDetectAdvancedMissile(ownSam, missile)).toBe(true);
  });
  it.each([true, false])(
    "runs actual SAM interception with target ownership eligible=%s",
    (eligible) => {
      const defender = eligible ? bob : carol;
      const sam = defender.buildUnit(
        UnitType.SAMLauncher,
        game.ref(160, 100),
        {},
      );
      game.addExecution(new SAMLauncherExecution(defender, null, sam));
      const missile = alice.buildUnit(HYPER, game.ref(160, 100), {
        targetTile: game.ref(180, 100),
        targetPlayer: bob,
        trajectory: Array.from({ length: 21 }, (_, i) => ({
          tile: game.ref(160 + i, 100),
          targetable: true,
        })),
      });
      executeTicks(game, 8);
      expect(missile.isActive()).toBe(!eligible);
    },
  );
});

describe.each([PlayerType.Bot, PlayerType.Nation])("%s bunker AI", (type) => {
  it.each([GameType.Singleplayer, GameType.Private])(
    "builds and launches real missiles in %s",
    async (gameType) => {
      const aiInfo = new PlayerInfo("AI", type, null, "ai");
      game = await setup("big_plains", { instantBuild: true, gameType }, [
        ...humans,
        aiInfo,
      ]);
      const ai = game.player("ai");
      bob = game.player("b");
      ai.addGold(3_000_000_000n);
      territory(ai, 1, 95);
      territory(bob, 125, 199);
      game.addExecution(new BunkerAIExecution(ai));
      executeTicks(game, 120);
      expect(ai.units(SITE)).toHaveLength(1);
      await expectSnapshotRoundTrip(game, "big_plains", 120);
      executeTicks(game, 120);
      expect(ai.gold()).toBeLessThan(2_999_000_000n);
      expect(ai.units(HYPER).length + ai.units(STEALTH).length).toBeGreaterThan(
        0,
      );
    },
  );
  it("honors disabled buildings and missiles", async () => {
    const aiInfo = new PlayerInfo("AI", type, null, "ai");
    game = await setup(
      "big_plains",
      { instantBuild: true, disabledUnits: [SITE, STEALTH, HYPER] },
      [aiInfo],
    );
    const ai = game.player("ai");
    ai.addGold(3_000_000_000n);
    territory(ai, 1, 95);
    game.addExecution(new BunkerAIExecution(ai));
    executeTicks(game, 600);
    expect(ai.units()).toHaveLength(0);
    expect(ai.gold()).toBe(3_000_000_000n);
  });
});
