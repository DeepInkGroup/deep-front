import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  EMP_COST,
  EMP_RADIUS,
  EMP_DISABLE_TICKS,
  empSAMCapacity,
} from "@openfront/engine-api/game/AdvancedDefense";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { SAMLauncherExecution } from "@openfront/engine/execution/SAMLauncherExecution";
import { detectEMPBySAM, applyEMP } from "@openfront/engine/game/EMPMissile";
import { interceptWithCIWS } from "@openfront/engine/game/CIWSDefense";
import { canSAMDetectAdvancedMissile } from "@openfront/engine/game/AdvancedMissiles";
import { Game, Player, Unit } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { executeTicks } from "../util/utils";
import { expectSnapshotRoundTrip } from "../util/Snapshot";

const EMP = UnitType.EMPMissile,
  CIWS = UnitType.CIWSDefense;
const humans = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game, alice: Player, bob: Player;
function own(p: Player, x: number, y = 100) {
  const t = game.ref(x, y);
  p.conquer(t);
  return t;
}
function buildCIWS(x = 170, y = 100) {
  return bob.buildUnit(CIWS, own(bob, x, y), {});
}
function empUnit(tile = own(bob, 170)) {
  return alice.buildUnit(EMP, tile, {
    trajectory: [],
    targetTile: own(bob, 170),
    targetPlayer: bob,
  });
}
beforeEach(async () => {
  game = await setup(
    "big_plains",
    { instantBuild: true, spawnImmunityDuration: 0 },
    humans,
    undefined,
    EngineConfig,
  );
  alice = game.player("a");
  bob = game.player("b");
  for (const p of [alice, bob]) p.addGold(1_000_000_000n);
  alice.buildUnit(UnitType.BunkerMissileSite, own(alice, 15), {});
  for (let x = 140; x < 199; x++)
    for (let y = 60; y < 140; y++) bob.conquer(game.ref(x, y));
});
function launch() {
  const e = new NukeExecution(EMP, alice, game.ref(170, 100));
  game.addExecution(e);
  return e;
}
function detectingSAM(missile: Unit) {
  for (let i = 0; i < 8; i++) {
    const sam = bob.buildUnit(UnitType.SAMLauncher, game.ref(171, 101), {});
    if (canSAMDetectAdvancedMissile(sam, missile)) return sam;
  }
  throw Error("No detecting SAM fixture");
}
describe("EMP and unified bunker missiles", () => {
  it.each([
    UnitType.AtomBomb,
    UnitType.HydrogenBomb,
    UnitType.MIRV,
    UnitType.StealthMissile,
    UnitType.HypersonicMissile,
    EMP,
  ] as const)(
    "launches %s exclusively from the bunker and shares its loaded tubes",
    (type) => {
      const bank = game.ref(170, 100),
        bunker = alice.units(UnitType.BunkerMissileSite)[0];
      expect(alice.canBuild(type, bank)).toBe(bunker.tile());
      bunker.launch();
      expect(alice.canBuild(type, bank)).toBe(false);
      expect(alice.canBuild(UnitType.MissileSilo, own(alice, 50))).toBe(false);
    },
  );
  it("uses the selected EMP cost and exposes its effect radius", () => {
    expect(EMP_COST).toBe(750_000);
    expect(game.unitInfo(EMP).cost(game, alice)).toBe(BigInt(EMP_COST));
    expect(game.config().nukeMagnitudes(EMP)).toEqual({
      inner: 0,
      outer: EMP_RADIUS,
    });
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "temporarily removes one SAM slot per hit, stacking with independent five-second recovery in %s",
    async (gameType) => {
      game.config().gameConfig().gameType = gameType;
      const sam = bob.buildUnit(UnitType.SAMLauncher, own(bob, 170), {});
      while (sam.level() < 20) sam.increaseLevel();
      while (sam.missileTimerQueue().length) sam.reloadMissile();
      game.addExecution(new SAMLauncherExecution(bob, null, sam));
      const capacity = () =>
        empSAMCapacity(sam.level(), sam.empSuppressionExpiries(), game.ticks());
      const pulse = () => {
        const m = empUnit();
        applyEMP(game, m, sam.tile());
        m.delete(false);
      };
      pulse();
      expect(capacity()).toBe(19);
      expect(sam.level()).toBe(20);
      executeTicks(game, 10);
      pulse();
      expect(capacity()).toBe(18);
      for (let i = 0; i < 18; i++) sam.launch();
      expect(sam.isInCooldown()).toBe(true);
      await expectSnapshotRoundTrip(game, "big_plains", 0);
      executeTicks(game, 39);
      expect(capacity()).toBe(18);
      executeTicks(game, 1);
      expect(capacity()).toBe(19);
      expect(sam.isInCooldown()).toBe(false);
      expect(
        sam.empSuppressionExpiries().filter((t) => t > game.ticks()),
      ).toHaveLength(1);
      executeTicks(game, 10);
      expect(capacity()).toBe(20);
      executeTicks(game, 1);
      expect(sam.empSuppressionExpiries()).toHaveLength(0);
    },
  );
  it("blocks firing at zero effective capacity, never changes purchased levels, and expires while no missiles are in flight", () => {
    const sam = bob.buildUnit(UnitType.SAMLauncher, own(bob, 170), {});
    game.addExecution(new SAMLauncherExecution(bob, null, sam));
    sam.suppressSAMByEMP(game.ticks() + 50);
    sam.suppressSAMByEMP(game.ticks() + 50);
    expect(sam.isInCooldown()).toBe(true);
    expect(empSAMCapacity(1, sam.empSuppressionExpiries(), game.ticks())).toBe(
      0,
    );
    sam.increaseLevel();
    expect(sam.level()).toBe(2);
    expect(sam.isInCooldown()).toBe(true);
    executeTicks(game, 49);
    expect(sam.isInCooldown()).toBe(true);
    executeTicks(game, 1);
    expect(sam.isInCooldown()).toBe(false);
    expect(sam.level()).toBe(2);
  });
  it("limits a level-20 SAM to 19 simultaneous interceptions after one EMP", () => {
    const sam = bob.buildUnit(UnitType.SAMLauncher, own(bob, 170), {});
    while (sam.level() < 20) sam.increaseLevel();
    while (sam.missileTimerQueue().length) sam.reloadMissile();
    sam.suppressSAMByEMP(game.ticks() + 50);
    const execution = new SAMLauncherExecution(bob, null, sam);
    execution.init(game, game.ticks());
    const bombs = Array.from({ length: 20 }, () =>
      alice.buildUnit(UnitType.AtomBomb, sam.tile(), {
        targetTile: game.ref(172, 100),
        trajectory: [
          { tile: sam.tile(), targetable: true },
          { tile: game.ref(171, 100), targetable: true },
          { tile: game.ref(172, 100), targetable: true },
        ],
      }),
    );
    execution.tick(game.ticks());
    expect(bombs.filter((b) => b.targetedBySAM())).toHaveLength(19);
    expect(sam.missileTimerQueue()).toHaveLength(19);
    expect(sam.level()).toBe(20);
    expect(sam.isInCooldown()).toBe(true);
  });
  it("retains independent SAM timers across reconnect and their exact expiry", async () => {
    const sam = bob.buildUnit(UnitType.SAMLauncher, own(bob, 170), {});
    sam.increaseLevel();
    sam.suppressSAMByEMP(game.ticks() + 50);
    sam.suppressSAMByEMP(game.ticks() + 60);
    game.addExecution(new SAMLauncherExecution(bob, null, sam));
    await expectSnapshotRoundTrip(game, "big_plains", 65);
    expect(sam.empSuppressionExpiries()).toHaveLength(0);
    expect(sam.level()).toBe(2);
  });
  it("applies SAM suppression on a detected missile's arrival but keeps CIWS protected by detection", () => {
    const site = buildCIWS(),
      missile = empUnit();
    const sam = bob.buildUnit(UnitType.SAMLauncher, game.ref(171, 101), {});
    missile.updateNukeState({ detectedBySAM: true });
    const e = new NukeExecution(EMP, alice, site.tile()) as any;
    e.init(game, 0);
    e.nuke = missile;
    e.detonate();
    expect(sam.empSuppressionExpiries()).toEqual([game.ticks() + 50]);
    expect(site.empDisabledUntil()).toBe(0);
    expect(sam.isActive()).toBe(true);
  });
  it("excludes friendly, allied, immune and out-of-range SAMs without affecting health or terrain", () => {
    const hostile = bob.buildUnit(UnitType.SAMLauncher, own(bob, 170), {}),
      far = bob.buildUnit(UnitType.SAMLauncher, own(bob, 60), {});
    const friendly = alice.buildUnit(UnitType.SAMLauncher, own(alice, 169), {});
    const health = hostile.health(),
      ownership = game.owner(hostile.tile()),
      missile = empUnit();
    applyEMP(game, missile, hostile.tile());
    expect(hostile.empSuppressionExpiries()).toHaveLength(1);
    expect(hostile.health()).toBe(health);
    expect(game.owner(hostile.tile())).toBe(ownership);
    expect(far.empSuppressionExpiries()).toHaveLength(0);
    expect(friendly.empSuppressionExpiries()).toHaveLength(0);
    const immune = vi.spyOn(bob, "isImmune").mockReturnValue(true);
    applyEMP(game, missile, hostile.tile());
    expect(hostile.empSuppressionExpiries()).toHaveLength(1);
    immune.mockRestore();
    vi.spyOn(alice, "isFriendly").mockImplementation(
      (owner) => owner === bob || owner === alice,
    );
    applyEMP(game, missile, hostile.tile());
    expect(hostile.empSuppressionExpiries()).toHaveLength(1);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "delivers a non-damaging five-second shutdown in %s and recovers exactly on time",
    async (gameType) => {
      game.config().gameConfig().gameType = gameType;
      const site = buildCIWS(),
        far = buildCIWS(60, 100);
      const city = bob.buildUnit(UnitType.City, game.ref(169, 100), {}),
        beforeTroops = bob.troops();
      const target = game.ref(170, 100),
        ownership = game.owner(target),
        waterVersion = game.map().waterVersion();
      const e = launch();
      for (let i = 0; i < 100 && !e.getNuke()?.reachedTarget(); i++)
        executeTicks(game, 1);
      expect(e.getNuke()?.reachedTarget()).toBe(true);
      expect(site.empDisabledUntil() - game.ticks()).toBe(
        EMP_DISABLE_TICKS - 1,
      );
      expect(far.empDisabledUntil()).toBe(0);
      expect(city.isActive()).toBe(true);
      expect(site.isActive()).toBe(true);
      expect(game.owner(target)).toBe(ownership);
      expect(game.map().waterVersion()).toBe(waterVersion);
      expect(bob.troops()).toBeGreaterThanOrEqual(beforeTroops);
      const bomb = alice.buildUnit(UnitType.AtomBomb, target, {
        trajectory: [],
        targetTile: target,
      });
      expect(interceptWithCIWS(game, bomb, target, target)).toBe(false);
      executeTicks(game, EMP_DISABLE_TICKS - 2);
      expect(interceptWithCIWS(game, bomb, target, target)).toBe(false);
      executeTicks(game, 1);
      expect(interceptWithCIWS(game, bomb, target, target)).toBe(true);
    },
  );
  it("stays hidden until the target border", () => {
    const e = launch();
    executeTicks(game, 2);
    expect(e.getNuke()?.isTargetable()).toBe(false);
    for (let i = 0; i < 100 && e.isActive(); i++) {
      executeTicks(game, 1);
      const missile = e.getNuke()!;
      if (missile.isActive() && game.owner(missile.tile()) !== bob)
        expect(missile.isTargetable()).toBe(false);
    }
    expect(e.getNuke()?.reachedTarget()).toBe(true);
  });
  it("does not trigger after SAM detection even if the SAM was reloading and then destroyed", () => {
    const site = buildCIWS(),
      missile = empUnit();
    missile.setTargetable(true);
    const sam = detectingSAM(missile);
    sam.launch();
    detectEMPBySAM(game, missile);
    expect(missile.nukeState().detectedBySAM).toBe(true);
    sam.delete(false);
    const e = new NukeExecution(EMP, alice, site.tile()) as any;
    e.init(game, 0);
    e.nuke = missile;
    e.detonate();
    expect(site.empDisabledUntil()).toBe(0);
    expect(site.isActive()).toBe(true);
  });
  it("permits active CIWS to intercept a detected EMP and preserves the detection through snapshots", async () => {
    buildCIWS();
    const missile = empUnit();
    missile.setTargetable(true);
    detectingSAM(missile);
    detectEMPBySAM(game, missile);
    expect(missile.nukeState().detectedBySAM).toBe(true);
    await expectSnapshotRoundTrip(game, "big_plains", 0);
    expect(
      interceptWithCIWS(game, missile, missile.tile(), missile.tile()),
    ).toBe(true);
  });
  it("lets Hydrogen Bombs bypass CIWS and destroy it with an actual blast", () => {
    const site = buildCIWS(),
      e = new NukeExecution(UnitType.HydrogenBomb, alice, site.tile());
    game.addExecution(new SAMLauncherExecution(bob, null, site));
    game.addExecution(e);
    executeTicks(game, 100);
    expect(e.getNuke()?.reachedTarget()).toBe(true);
    expect(site.isActive()).toBe(false);
  });
  it("retains a live shutdown across save/reconnect", async () => {
    const site = buildCIWS();
    site.disableByEMP(game.ticks() + EMP_DISABLE_TICKS);
    await expectSnapshotRoundTrip(game, "big_plains", 60);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "honors lobby EMP disabling in %s",
    async (gameType) => {
      game.config().gameConfig().gameType = gameType;
      game.config().gameConfig().disabledUnits = [EMP];
      game.addExecution(
        new ConstructionExecution(alice, EMP, game.ref(170, 100)),
      );
      executeTicks(game, 5);
      expect(alice.units(EMP)).toHaveLength(0);
    },
  );
});
