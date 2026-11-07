import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
  maxBulkAmount,
} from "@openfront/engine-api/game/GameTypes";
import {
  missileStock,
  MISSILE_TYPES,
  MISSILE_PRODUCTION_TICKS,
  type ManufacturedMissile,
} from "@openfront/engine-api/game/MissileProduction";
import {
  IntentSchema,
  StampedIntentSchema,
} from "@openfront/engine-api/Schemas";
import { Game, Player, Unit } from "@openfront/engine/game/Game";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { SAMLauncherExecution } from "@openfront/engine/execution/SAMLauncherExecution";
import { PlayerExecution } from "@openfront/engine/execution/PlayerExecution";
import { BunkerAIExecution } from "@openfront/engine/execution/BunkerAIExecution";
import { EconomyAIExecution } from "@openfront/engine/execution/EconomyAIExecution";
import { Executor } from "@openfront/engine/execution/ExecutionManager";
import { interceptWithCIWS } from "@openfront/engine/game/CIWSDefense";
import { setup } from "../util/Setup";
import { executeTicks } from "../util/utils";
import { roundTrip, expectSnapshotRoundTrip } from "../util/Snapshot";
import { diffPlayerUpdate } from "@openfront/engine/game/GameUpdateUtils";
import { applyStateUpdate } from "../../src/client/view/PlayerStateUpdate";
import { playerStateFromUpdate } from "../../src/client/view/EntityState";

const F = UnitType.MissileFactory;
const humans = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game, alice: Player, bob: Player;
function build(type: UnitType, x: number, y = 50, player = alice): Unit {
  const tile = game.ref(x, y);
  player.conquer(tile);
  return player.buildUnit(type, tile, {});
}
function manufacture(
  player: Player,
  factory: Unit,
  missile: ManufacturedMissile,
  amount = 1,
): void {
  expect(player.queueMissiles(factory.id(), missile, amount)).toBe(true);
  for (let i = 0; i < MISSILE_PRODUCTION_TICKS[missile] * amount; i++)
    player.advanceMissileProduction();
}
describe.each([GameType.Singleplayer, GameType.Private])(
  "Missile production in %s",
  (gameType) => {
    beforeEach(async () => {
      game = await setup(
        "big_plains",
        {
          gameType,
          instantBuild: true,
          electricity: true,
          missileProduction: true,
          spawnImmunityDuration: 0,
        },
        humans,
      );
      alice = game.player("a");
      bob = game.player("b");
      alice.addGold(2_000_000_000n);
      bob.addGold(2_000_000_000n);
    });
    it("has no building count cap, one level, and a 30 MW load", () => {
      expect(game.unitInfo(F)).toMatchObject({
        maxLevel: 1,
        upgradable: false,
      });
      expect(game.unitInfo(F).maxCount).toBeUndefined();
      const start = alice.gold();
      const factories = Array.from({ length: 8 }, (_, i) =>
        build(F, 20 + i * 20),
      );
      expect(start - alice.gold()).toBe(8_000_000n);
      expect(alice.canUpgradeUnit(factories[0])).toBe(false);
      alice.upgradeUnit(factories[0]);
      factories[0].increaseLevel();
      expect(factories[0].level()).toBe(1);
      expect(game.config().powerGrid(alice)).toMatchObject({
        demand: 240,
        offline: 8,
      });
    });
    it("blocks immediate launches and pays only once when manufacturing every offensive type", () => {
      const f = build(F, 20);
      build(UnitType.PowerPlant, 50);
      build(UnitType.BunkerMissileSite, 80);
      const target = game.ref(160, 100);
      bob.conquer(target);
      const prices = [
        750_000n,
        5_000_000n,
        25_000_000n,
        1_500_000n,
        950_000n,
        750_000n,
      ];
      for (const [i, type] of MISSILE_TYPES.slice(0, -1).entries()) {
        expect(alice.canBuild(type, target)).toBe(false);
        const start = alice.gold();
        manufacture(alice, f, type);
        expect(start - alice.gold()).toBe(prices[i]);
        expect(missileStock(alice.missileArsenal(), type)).toBe(1);
        alice.removeGold(alice.gold());
        expect(alice.canBuild(type, target)).not.toBe(false);
        const bu = alice.buildableUnits(target, [type as any])[0];
        expect(bu.cost).toBe(0n);
        expect(bu.inventory).toBe(1);
        expect(maxBulkAmount(bu, 0n)).toBe(1);
        alice.buildUnit(
          type,
          game.ref(80, 50),
          type === UnitType.MIRV
            ? { targetTile: target, targetPlayer: bob }
            : { trajectory: [], targetTile: target },
        );
        expect(missileStock(alice.missileArsenal(), type)).toBe(0);
        expect(alice.gold()).toBe(0n);
        expect(alice.canBuild(type, target)).toBe(false);
        expect(() => alice.buildUnit(type, game.ref(80, 50), {})).toThrow(
          "No manufactured missile",
        );
        alice.addGold(2_000_000_000n);
      }
      // MIRV payloads belong to the parent missile, with no additional inventory requirement.
      expect(() =>
        alice.buildUnit(UnitType.MIRVWarhead, target, {
          trajectory: [],
          targetTile: target,
        }),
      ).not.toThrow();
    });
    it("limits orders across factories to 20 and runs one production line per factory", () => {
      const a = build(F, 20),
        b = build(F, 50);
      build(UnitType.PowerPlant, 80);
      expect(alice.queueMissiles(a.id(), UnitType.SAMMissile, 12)).toBe(true);
      expect(alice.queueMissiles(b.id(), UnitType.SAMMissile, 8)).toBe(true);
      const gold = alice.gold();
      expect(alice.queueMissiles(b.id(), UnitType.SAMMissile, 1)).toBe(false);
      expect(alice.gold()).toBe(gold);
      for (let i = 0; i < 49; i++) alice.advanceMissileProduction();
      expect(missileStock(alice.missileArsenal(), UnitType.SAMMissile)).toBe(0);
      expect(alice.missileArsenal().jobs).toHaveLength(20);
      alice.advanceMissileProduction();
      expect(missileStock(alice.missileArsenal(), UnitType.SAMMissile)).toBe(2);
      expect(alice.missileArsenal().jobs).toHaveLength(18);
      expect(
        alice.missileArsenal().jobs.every((j) => j.remainingTicks === 50),
      ).toBe(true);
      for (let i = 0; i < 550; i++) alice.advanceMissileProduction();
      expect(missileStock(alice.missileArsenal(), UnitType.SAMMissile)).toBe(
        20,
      );
      expect(alice.missileArsenal().jobs).toHaveLength(0);
    });
    it("keeps a newly added missile waiting until the current missile's last 10 seconds finish", () => {
      const f = build(F, 20);
      build(UnitType.PowerPlant, 50);
      expect(alice.queueMissiles(f.id(), UnitType.EMPMissile, 1)).toBe(true);
      for (let i = 0; i < 100; i++) alice.advanceMissileProduction();
      expect(alice.missileArsenal().jobs[0].remainingTicks).toBe(100);
      expect(alice.queueMissiles(f.id(), UnitType.SAMMissile, 1)).toBe(true);
      for (let i = 0; i < 100; i++) alice.advanceMissileProduction();
      expect(missileStock(alice.missileArsenal(), UnitType.EMPMissile)).toBe(1);
      expect(missileStock(alice.missileArsenal(), UnitType.SAMMissile)).toBe(0);
      expect(alice.missileArsenal().jobs[0].remainingTicks).toBe(50);
      for (let i = 0; i < 49; i++) alice.advanceMissileProduction();
      expect(missileStock(alice.missileArsenal(), UnitType.SAMMissile)).toBe(0);
      alice.advanceMissileProduction();
      expect(missileStock(alice.missileArsenal(), UnitType.SAMMissile)).toBe(1);
    });
    it("pauses during a shortage without resetting progress or catching up", () => {
      const f = build(F, 20);
      expect(alice.queueMissiles(f.id(), UnitType.EMPMissile, 1)).toBe(true);
      for (let i = 0; i < 100; i++) alice.advanceMissileProduction();
      expect(alice.missileArsenal().jobs[0].remainingTicks).toBe(200);
      const plant = build(UnitType.PowerPlant, 50);
      for (let i = 0; i < 100; i++) alice.advanceMissileProduction();
      expect(alice.missileArsenal().jobs[0].remainingTicks).toBe(100);
      expect(alice.queueMissiles(f.id(), UnitType.SAMMissile, 1)).toBe(true);
      plant.setUnderConstruction(true);
      for (let i = 0; i < 500; i++) alice.advanceMissileProduction();
      expect(alice.missileArsenal().jobs[0].remainingTicks).toBe(100);
      expect(alice.missileArsenal().jobs[1].remainingTicks).toBe(50);
      plant.setUnderConstruction(false);
      for (let i = 0; i < 100; i++) alice.advanceMissileProduction();
      expect(missileStock(alice.missileArsenal(), UnitType.EMPMissile)).toBe(1);
      expect(alice.missileArsenal().jobs[0].remainingTicks).toBe(50);
    });
    it("loses unfinished orders on capture/destruction while retaining completed inventory", () => {
      const f = build(F, 20),
        p = build(UnitType.PowerPlant, 50);
      manufacture(alice, f, UnitType.EMPMissile);
      expect(alice.queueMissiles(f.id(), UnitType.AtomBomb, 1)).toBe(true);
      const gold = alice.gold();
      bob.conquer(f.tile());
      bob.captureUnit(f);
      alice.advanceMissileProduction();
      expect(alice.missileArsenal().jobs).toHaveLength(0);
      expect(alice.gold()).toBe(gold);
      expect(missileStock(alice.missileArsenal(), UnitType.EMPMissile)).toBe(1);
      expect(missileStock(bob.missileArsenal(), UnitType.EMPMissile)).toBe(0);
      expect(bob.queueMissiles(f.id(), UnitType.SAMMissile, 1)).toBe(true);
      f.delete(false);
      bob.advanceMissileProduction();
      expect(bob.missileArsenal().jobs).toHaveLength(0);
      p.delete(false);
      expect(alice.consumeMissile(UnitType.EMPMissile)).toBe(true);
      expect(alice.consumeMissile(UnitType.EMPMissile)).toBe(false);
    });
    it("rejects foreign factories, construction, invalid amounts, disabled missiles and unaffordable orders", () => {
      const f = build(F, 20);
      for (const amount of [0, -1, 21, NaN, 1.5])
        expect(alice.queueMissiles(f.id(), UnitType.AtomBomb, amount)).toBe(
          false,
        );
      expect(bob.queueMissiles(f.id(), UnitType.AtomBomb, 1)).toBe(false);
      f.setUnderConstruction(true);
      expect(alice.queueMissiles(f.id(), UnitType.AtomBomb, 1)).toBe(false);
      f.setUnderConstruction(false);
      game.config().gameConfig().disabledUnits!.push(UnitType.AtomBomb);
      expect(alice.queueMissiles(f.id(), UnitType.AtomBomb, 1)).toBe(false);
      alice.removeGold(alice.gold());
      expect(alice.queueMissiles(f.id(), UnitType.SAMMissile, 1)).toBe(false);
      expect(alice.missileArsenal().jobs).toHaveLength(0);
    });
    it("makes SAM firing consume stock, and cooldown recovery cannot create ammunition", () => {
      const f = build(F, 20, 20, bob);
      build(UnitType.PowerPlant, 50, 20, bob);
      const sam = build(UnitType.SAMLauncher, 150, 100, bob);
      sam.increaseLevel();
      sam.increaseLevel();
      while (sam.missileTimerQueue().length) sam.reloadMissile();
      const makeTarget = () =>
        alice.buildUnit(UnitType.MIRVWarhead, sam.tile(), {
          targetTile: game.ref(152, 100),
          trajectory: [
            { tile: sam.tile(), targetable: true },
            { tile: game.ref(151, 100), targetable: true },
            { tile: game.ref(152, 100), targetable: true },
          ],
        });
      const targets = [makeTarget(), makeTarget(), makeTarget()];
      const execution = new SAMLauncherExecution(bob, null, sam);
      execution.init(game, game.ticks());
      execution.tick(game.ticks());
      expect(targets.filter((t) => t.targetedBySAM())).toHaveLength(0);
      manufacture(bob, f, UnitType.SAMMissile, 2);
      execution.tick(game.ticks());
      expect(targets.filter((t) => t.targetedBySAM())).toHaveLength(2);
      expect(missileStock(bob.missileArsenal(), UnitType.SAMMissile)).toBe(0);
      while (sam.missileTimerQueue().length) sam.reloadMissile();
      execution.tick(game.ticks());
      expect(targets.filter((t) => t.targetedBySAM())).toHaveLength(2);
    });
    it("requires one manufactured interceptor per CIWS interception and honors EMP/bypass without wasting stock", () => {
      const f = build(F, 20, 20, bob);
      build(UnitType.PowerPlant, 50, 20, bob);
      const site = build(UnitType.CIWSDefense, 150, 100, bob);
      const missile = alice.buildUnit(UnitType.MIRVWarhead, site.tile(), {
        trajectory: [],
        targetTile: game.ref(160, 100),
      });
      expect(interceptWithCIWS(game, missile, site.tile(), site.tile())).toBe(
        false,
      );
      manufacture(bob, f, UnitType.SAMMissile, 1);
      site.disableByEMP(game.ticks() + 50);
      expect(interceptWithCIWS(game, missile, site.tile(), site.tile())).toBe(
        false,
      );
      expect(missileStock(bob.missileArsenal(), UnitType.SAMMissile)).toBe(1);
      executeTicks(game, 50);
      expect(interceptWithCIWS(game, missile, site.tile(), site.tile())).toBe(
        true,
      );
      expect(missileStock(bob.missileArsenal(), UnitType.SAMMissile)).toBe(0);
      const next = alice.buildUnit(UnitType.MIRVWarhead, site.tile(), {
        trajectory: [],
        targetTile: game.ref(160, 100),
      });
      expect(interceptWithCIWS(game, next, site.tile(), site.tile())).toBe(
        false,
      );
    });
    it("sends inventory and production deltas without mutating previously emitted state", () => {
      const f = build(F, 20);
      build(UnitType.PowerPlant, 50);
      const old = alice.toUpdate()!;
      const view = playerStateFromUpdate(old);
      expect(alice.queueMissiles(f.id(), UnitType.SAMMissile, 1)).toBe(true);
      const queued = alice.toUpdate()!;
      expect(queued.missileArsenal?.jobs).toHaveLength(1);
      expect(old.missileArsenal?.jobs).toHaveLength(0);
      applyStateUpdate(view, queued);
      alice.advanceMissileProduction();
      expect(view.missileArsenal?.jobs[0].remainingTicks).toBe(50);
      const advanced = alice.toUpdate()!;
      expect(
        diffPlayerUpdate(queued, advanced)?.missileArsenal?.jobs[0]
          .remainingTicks,
      ).toBe(49);
    });
    it("restores pending production intents, running orders, stock and power allocation after reconnect", async () => {
      const f = build(F, 20);
      build(UnitType.PowerPlant, 50);
      manufacture(alice, f, UnitType.SAMMissile, 3);
      alice.queueMissiles(f.id(), UnitType.AtomBomb, 2);
      alice.upgradeUnit(build(UnitType.BunkerMissileSite, 90));
      game.addExecution(new PlayerExecution(alice));
      const intent = {
        type: "produce_missiles" as const,
        factoryId: f.id(),
        missile: UnitType.EMPMissile as const,
        amount: 1,
        clientID: "a",
      };
      const executor = new Executor(game, "factory-test", undefined);
      game.addExecution(executor.createExec(intent));
      const { restored } = await roundTrip(game, "big_plains");
      expect(restored.player("a").missileArsenal()).toEqual(
        alice.missileArsenal(),
      );
      await expectSnapshotRoundTrip(game, "big_plains", 75);
    });
  },
);

it.each([PlayerType.Bot, PlayerType.Nation])(
  "%s AI manufactures both offensive and defensive missiles with electricity",
  async (type) => {
    game = await setup(
      "big_plains",
      {
        instantBuild: true,
        electricity: true,
        missileProduction: true,
        disabledUnits: [
          UnitType.OilFactory,
          UnitType.CopperMine,
          UnitType.CustomsOffice,
          UnitType.LogisticsCenter,
        ],
      },
      [new PlayerInfo("AI", type, null, "ai")],
    );
    alice = game.player("ai");
    alice.addGold(100_000_000n);
    for (let y = 10; y < 190; y++)
      for (let x = 10; x < 190; x++) alice.conquer(game.ref(x, y));
    build(UnitType.BunkerMissileSite, 30, 30);
    build(UnitType.SAMLauncher, 70, 30);
    game.addExecution(new PlayerExecution(alice));
    game.addExecution(new BunkerAIExecution(alice));
    game.addExecution(new EconomyAIExecution(alice));
    executeTicks(game, 1100);
    expect(alice.units(F)).toHaveLength(1);
    expect(game.config().isPowered(alice.units(F)[0])).toBe(true);
    expect(
      missileStock(alice.missileArsenal(), UnitType.SAMMissile),
    ).toBeGreaterThan(0);
    expect(
      missileStock(alice.missileArsenal(), UnitType.HypersonicMissile),
    ).toBeGreaterThan(0);
  },
);

it("keeps manufacturing timed with infinite gold and works normally when Power Plants are disabled", async () => {
  game = await setup(
    "big_plains",
    { instantBuild: true, infiniteGold: true, missileProduction: true },
    humans,
  );
  alice = game.player("a");
  const f = build(F, 20);
  manufacture(alice, f, UnitType.HypersonicMissile, 2);
  expect(alice.gold()).toBe(0n);
  expect(missileStock(alice.missileArsenal(), UnitType.HypersonicMissile)).toBe(
    2,
  );
});
it("restores old launch and defense rules when Missile Factory is disabled", async () => {
  game = await setup("big_plains", { instantBuild: true }, humans);
  alice = game.player("a");
  bob = game.player("b");
  alice.addGold(10_000_000n);
  build(UnitType.BunkerMissileSite, 20);
  const target = game.ref(150, 100);
  bob.conquer(target);
  expect(alice.canBuild(UnitType.AtomBomb, target)).not.toBe(false);
  expect(alice.consumeMissile(UnitType.SAMMissile)).toBe(true);
  expect(alice.queueMissiles(99, UnitType.AtomBomb, 1)).toBe(false);
});
it("validates and binary-roundtrips manufacturing intents", () => {
  const valid = {
    type: "produce_missiles",
    factoryId: 123,
    missile: UnitType.SAMMissile,
    amount: 20,
    clientID: "clientAA",
  };
  expect(
    StampedIntentSchema.parseBytes(
      StampedIntentSchema.serialize(StampedIntentSchema.parse(valid)),
    ),
  ).toEqual(valid);
  for (const amount of [0, 21, -1, 1.2])
    expect(IntentSchema.safeParse({ ...valid, amount }).success).toBe(false);
  expect(
    IntentSchema.safeParse({ ...valid, missile: UnitType.Warship }).success,
  ).toBe(false);
});
it("requires 40 seconds of construction before accepting orders", async () => {
  game = await setup("big_plains", { missileProduction: true }, humans);
  alice = game.player("a");
  alice.addGold(10_000_000n);
  for (let y = 10; y < 80; y++)
    for (let x = 10; x < 80; x++) alice.conquer(game.ref(x, y));
  const execution = new ConstructionExecution(alice, F, game.ref(40, 40));
  execution.init(game, 0);
  execution.tick(0);
  const factory = alice.units(F)[0];
  expect(factory.isUnderConstruction()).toBe(true);
  expect(alice.queueMissiles(factory.id(), UnitType.SAMMissile, 1)).toBe(false);
  for (let t = 1; t < 400; t++) execution.tick(t);
  expect(factory.isUnderConstruction()).toBe(true);
  execution.tick(400);
  expect(factory.isUnderConstruction()).toBe(false);
  expect(alice.queueMissiles(factory.id(), UnitType.SAMMissile, 1)).toBe(true);
});
