import {
  GameType,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  OIL_TANKER_REPLACEMENT_TICKS,
  oilShipmentGold,
} from "@openfront/engine-api/game/OilFactory";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { OilFactoryExecution } from "@openfront/engine/execution/OilFactoryExecution";
import { WarshipExecution } from "@openfront/engine/execution/WarshipExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";
const OIL = UnitType.OilFactory,
  TANKER = UnitType.OilTanker;
const players = [
  new PlayerInfo("Alice", PlayerType.Human, "a", "a"),
  new PlayerInfo("Bob", PlayerType.Human, "b", "b"),
];
let game: Game, alice: Player, bob: Player;
const site = (i: number) => game.ref(7, 1 + i * 4);
function build(player = alice, i = 0) {
  player.conquer(site(i));
  return player.buildUnit(OIL, site(i), {});
}
function runFactory() {
  const factory = build();
  game.addExecution(new OilFactoryExecution(factory));
  executeTicks(game, 3);
  return factory;
}
describe("coastal oil shipping", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, players);
    game.config().structureMinDist = () => 1;
    alice = game.player("a");
    bob = game.player("b");
    alice.addGold(100_000_000n);
    bob.addGold(100_000_000n);
  });
  it("uses Port coastline placement, rejects inland and respects the three-building cap", async () => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 8; x++) alice.conquer(game.ref(x, y));
    const inland = game.ref(0, 4);
    expect(alice.canBuild(OIL, inland)).toBe(
      alice.canBuild(UnitType.Port, inland),
    );
    const coast = alice.canBuild(OIL, site(0));
    expect(coast).not.toBe(false);
    expect(game.isShore(coast as number)).toBe(true);
    for (let i = 0; i < 3; i++) build(alice, i);
    expect(alice.canBuild(OIL, site(3))).toBe(false);
    expect(() => build(alice, 3)).toThrow(/Maximum/);
    expect(alice.canUpgradeUnit(alice.units(OIL)[0])).toBe(true);
    alice.units(OIL)[0].delete(false);
    expect(alice.canBuild(OIL, site(3))).not.toBe(false);
    const landlocked = await setup("big_plains", {}, players);
    const owner = landlocked.player("a");
    owner.addGold(20_000_000n);
    owner.conquer(landlocked.ref(30, 30));
    expect(owner.canBuild(OIL, landlocked.ref(30, 30))).toBe(false);
  });
  it("keeps 1.2M / 1.3M / 1.5M prices and a maximum level of three", () => {
    const before = alice.gold(),
      factory = build();
    expect(before - alice.gold()).toBe(1_200_000n);
    expect(alice.buildableUnits(factory.tile(), [OIL])[0].upgradeCosts).toEqual(
      [1_300_000n, 2_800_000n],
    );
    alice.upgradeUnit(factory);
    alice.upgradeUnit(factory);
    alice.upgradeUnit(factory);
    expect(factory.level()).toBe(3);
    expect(before - alice.gold()).toBe(4_000_000n);
  });
  it("creates 2 / 3 / 5 reusable tankers as the factory upgrades, without passive income", () => {
    const factory = runFactory(),
      gold = alice.gold();
    expect(alice.units(TANKER)).toHaveLength(2);
    executeTicks(game, 200);
    expect(alice.gold()).toBe(gold);
    alice.upgradeUnit(factory);
    executeTicks(game, 2);
    expect(alice.units(TANKER)).toHaveLength(3);
    alice.upgradeUnit(factory);
    executeTicks(game, 2);
    expect(alice.units(TANKER)).toHaveLength(5);
  });
  it.each([true, false])(
    "replaces a lost tanker after 150 seconds, including noncombat deletion (%s)",
    (destroyed) => {
      runFactory();
      const ship = alice.units(TANKER)[0],
        other = alice.units(TANKER)[1];
      ship.delete(destroyed, destroyed ? bob : undefined);
      const detected = game.ticks();
      executeTicks(game, 1);
      expect(alice.units(TANKER)).toHaveLength(1);
      executeTicks(game, OIL_TANKER_REPLACEMENT_TICKS - 1);
      expect(game.ticks()).toBe(detected + OIL_TANKER_REPLACEMENT_TICKS);
      expect(alice.units(TANKER)).toEqual([other]);
      executeTicks(game, 1);
      expect(alice.units(TANKER)).toHaveLength(2);
      expect(alice.units(TANKER)).toContain(other);
    },
  );
  it.each([GameType.Singleplayer, GameType.Private])(
    "pays only completed foreign-port deliveries, returns hulls and applies a loading cycle in %s",
    async (gameType) => {
      game = await setup(
        "half_land_half_ocean",
        { gameType, instantBuild: true },
        players,
      );
      alice = game.player("a");
      bob = game.player("b");
      alice.addGold(100_000_000n);
      bob.addGold(100_000_000n);
      bob.conquer(game.ref(7, 15));
      const port = bob.buildUnit(UnitType.Port, game.ref(7, 15), {});
      const factory = runFactory(),
        a = alice.gold(),
        b = bob.gold();
      const ships = [...alice.units(TANKER)];
      expect(alice.gold()).toBe(a);
      const expected = oilShipmentGold(
        game.manhattanDist(factory.tile(), port.tile()),
      );
      executeTicks(game, 180);
      expect(alice.gold() - a).toBe(expected * 2n);
      expect(bob.gold() - b).toBe((expected / 4n) * 2n);
      expect(alice.units(TANKER)).toEqual(ships);
      executeTicks(game, 200);
      expect(alice.gold() - a).toBe(expected * 2n);
      expect(ships.every((s) => s.tile() === factory.tile())).toBe(true);
      executeTicks(game, 400);
      expect(alice.gold() - a).toBe(expected * 4n);
    },
  );
  it("does not pay sunk tankers or deliveries to destroyed ports", () => {
    bob.conquer(game.ref(7, 15));
    const port = bob.buildUnit(UnitType.Port, game.ref(7, 15), {});
    runFactory();
    executeTicks(game, 15);
    const before = alice.gold();
    for (const ship of [...alice.units(TANKER)]) ship.delete(true, bob);
    executeTicks(game, 100);
    expect(alice.gold()).toBe(before);
    port.delete(false);
    executeTicks(game, 1600);
    expect(alice.gold()).toBe(before);
  });
  it("removes a destroyed factory's entire fleet and destroys excess captured factories", () => {
    const factory = runFactory();
    factory.delete(false);
    executeTicks(game, 2);
    expect(alice.units(TANKER)).toHaveLength(0);
    for (let i = 0; i < 3; i++) build(alice, i);
    const captured = build(bob, 3);
    alice.captureUnit(captured);
    expect(captured.isActive()).toBe(false);
    expect(alice.units(OIL)).toHaveLength(3);
  });
  it("stops the previous owner's fleet on factory capture and requires replacement time", () => {
    const factory = runFactory(),
      ships = [...alice.units(TANKER)];
    bob.captureUnit(factory);
    executeTicks(game, 1);
    expect(ships.every((s) => !s.isActive())).toBe(true);
    expect(bob.units(TANKER)).toHaveLength(0);
    executeTicks(game, 1500);
    expect(bob.units(TANKER)).toHaveLength(2);
  });
  it.each([GameType.Singleplayer, GameType.Private])(
    "honors Disable Units in %s",
    async (gameType) => {
      game = await setup(
        "half_land_half_ocean",
        { gameType, disabledUnits: [OIL] },
        players,
      );
      alice = game.player("a");
      alice.addGold(100_000_000n);
      alice.conquer(site(0));
      expect(alice.canBuild(OIL, site(0))).toBe(false);
      game.addExecution(new ConstructionExecution(alice, OIL, site(0)));
      executeTicks(game, 40);
      expect(alice.units(OIL)).toHaveLength(0);
      expect(alice.units(TANKER)).toHaveLength(0);
    },
  );
  it.each(["own port", "embargo", "captured port"])(
    "refuses oil income for an invalid destination: %s",
    (condition) => {
      bob.conquer(game.ref(7, 15));
      const port = bob.buildUnit(UnitType.Port, game.ref(7, 15), {});
      if (condition === "own port") alice.captureUnit(port);
      if (condition === "embargo") bob.addEmbargo(alice, false);
      runFactory();
      if (condition === "captured port") {
        executeTicks(game, 45);
        alice.captureUnit(port);
      }
      const before = alice.gold();
      executeTicks(game, 800);
      expect(alice.gold()).toBe(before);
      expect(alice.units(TANKER)).toHaveLength(2);
    },
  );
  it("moves tankers every other tick and records the same slower motion plan for clients", () => {
    bob.conquer(game.ref(7, 15));
    bob.buildUnit(UnitType.Port, game.ref(7, 15), {});
    const record = vi.spyOn(game, "recordMotionPlan");
    runFactory();
    const ship = alice.units(TANKER)[0];
    let previous = ship.tile(),
      lastMove = -10,
      moves = 0;
    for (let i = 0; i < 80; i++) {
      executeTicks(game, 1);
      if (ship.tile() !== previous) {
        expect(i - lastMove).toBeGreaterThanOrEqual(2);
        lastMove = i;
        previous = ship.tile();
        moves++;
      }
    }
    expect(moves).toBeGreaterThan(1);
    const plans = record.mock.calls
      .map((c) => c[0])
      .filter((p) => p.kind === "grid" && p.unitId === ship.id());
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((p) => p.kind === "grid" && p.ticksPerStep === 2)).toBe(
      true,
    );
  });
  it("lets enemy warships sink tankers without a pirate capture", () => {
    runFactory();
    bob.conquer(game.ref(7, 15));
    const ship = alice.units(TANKER)[0];
    ship.move(game.ref(9, 6));
    const warship = bob.buildUnit(UnitType.Warship, game.ref(9, 8), {
      patrolTile: game.ref(9, 8),
    });
    game.addExecution(new WarshipExecution(warship));
    executeTicks(game, 90);
    expect(ship.isActive()).toBe(false);
    expect(ship.owner()).toBe(alice);
    expect(ship.destroyer()).toBe(bob);
  });
  it("restores voyages, return legs and independent replacement deadlines without duplicate income", async () => {
    bob.conquer(game.ref(7, 15));
    bob.buildUnit(UnitType.Port, game.ref(7, 15), {});
    runFactory();
    executeTicks(game, 12);
    alice.units(TANKER)[0].delete(false);
    executeTicks(game, 1);
    await expectSnapshotRoundTrip(game, "half_land_half_ocean", 1600);
  });
});
