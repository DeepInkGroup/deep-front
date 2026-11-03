import { UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  OIL_TANKER_CYCLE_TICKS,
  OIL_TANKER_STEP_TICKS,
  oilShipmentGold,
} from "@openfront/engine-api/game/OilFactory";
import {
  zInt,
  zRef,
  zPlayerRef,
  zTile,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Unit, Player } from "../game/Game";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathStatus } from "../pathfinding/types";
import { activeStraits } from "../game/StraitControl";
import {
  newTollVoyage,
  TollVoyageSchema,
  tradePassageNext,
  tradeRouteAvailable,
} from "../game/StraitTradeRoute";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import {
  restoreWaterPathFinder,
  WaterPathFinderSchema,
  waterPathFinderState,
} from "../snapshot/PathfinderSnapshots";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

/** A reusable hull. Delivery earns gold once; the return leg is empty. */
export class OilTankerExecution implements Execution {
  private active = true;
  private game: Game;
  private owner: Player;
  private path: WaterPathFinder;
  private destination: Unit | null = null;
  private returning = false;
  private nextDeparture = 0;
  private nextMove = 0;
  private voyage = 0;
  private cargo = 0n;
  private toll = newTollVoyage();
  private planId = 0;
  private planDestination: number | null = null;
  constructor(
    private factory: Unit,
    private ship: Unit,
  ) {}
  init(game: Game): void {
    this.game = game;
    this.owner = this.ship.owner();
    // Keep individual hulls visible instead of stacking an entire fleet on
    // the same route. Deterministic loading offsets survive multiplayer sync.
    this.nextDeparture = game.ticks() + (this.ship.id() % 5) * 20;
    this.path = new WaterPathFinder(
      game,
      game.nextShipStagger("tradeShip"),
      true,
    );
  }
  private ports(): Unit[] {
    const components = new Set(
      this.game
        .neighbors(this.factory.tile())
        .filter((t) => this.game.isWater(t))
        .map((t) => this.game.getWaterComponent(t)),
    );
    return this.game
      .players()
      .filter((p) => p !== this.owner && p.canTrade(this.owner))
      .flatMap((p) => p.units(UnitType.Port))
      .filter(
        (p) =>
          p.isActive() &&
          !p.isUnderConstruction() &&
          !p.isMarkedForDeletion() &&
          [...components].some(
            (c) => c !== null && this.game.hasWaterComponent(p.tile(), c),
          ),
      )
      .sort((a, b) => a.id() - b.id());
  }
  private stopPlan(ticks: number) {
    if (this.planDestination === this.ship.tile()) return;
    this.game.recordMotionPlan({
      kind: "grid",
      unitId: this.ship.id(),
      planId: ++this.planId,
      startTick: ticks + 1,
      ticksPerStep: OIL_TANKER_STEP_TICKS,
      path: [this.ship.tile()],
    });
    this.planDestination = this.ship.tile();
  }
  private returnHome(ticks: number) {
    this.returning = true;
    this.destination = this.factory;
    this.ship.setTargetUnit(this.factory);
    this.ship.touch();
    this.toll = { ...newTollVoyage(), cargo: 0n };
    this.path.invalidate();
    this.planDestination = null;
    this.stopPlan(ticks);
  }
  tick(ticks: number): void {
    if (!this.ship.isActive()) {
      this.active = false;
      return;
    }
    if (
      !this.factory.isActive() ||
      this.factory.owner() !== this.owner ||
      this.ship.owner() !== this.owner
    ) {
      this.ship.delete(false);
      this.active = false;
      return;
    }
    if (this.path.rebuilt) this.planDestination = null;
    if (!this.destination) {
      if (!this.game.config().isPowered(this.factory)) return;
      if (ticks < this.nextDeparture || ticks % 10 !== this.ship.id() % 10)
        return;
      const ports = this.ports();
      for (let i = 0; i < ports.length; i++) {
        const port = ports[(this.ship.id() + this.voyage + i) % ports.length];
        const distance = this.game.manhattanDist(
          this.factory.tile(),
          port.tile(),
        );
        const cargo = oilShipmentGold(distance);
        if (
          !tradeRouteAvailable(
            this.game,
            this.owner,
            this.factory.tile(),
            port.tile(),
            activeStraits(this.game),
            cargo,
          ) ||
          !this.path.findPath(this.ship.tile(), port.tile())
        )
          continue;
        this.cargo = cargo;
        this.toll = { ...newTollVoyage(), cargo };
        this.destination = port;
        this.returning = false;
        this.voyage++;
        this.nextDeparture = ticks + OIL_TANKER_CYCLE_TICKS;
        this.planDestination = null;
        this.ship.setTargetUnit(port);
        this.ship.touch();
        this.game.stats().boatSendTrade(this.owner, port.owner());
        break;
      }
      if (!this.destination) return;
    }
    if (
      !this.returning &&
      (!this.destination.isActive() ||
        this.destination.isMarkedForDeletion() ||
        this.destination.owner() === this.owner ||
        !this.owner.canTrade(this.destination.owner()))
    )
      this.returnHome(ticks);
    if (this.ship.tile() === this.destination!.tile()) {
      if (this.returning) {
        this.destination = null;
        this.returning = false;
        this.stopPlan(ticks);
      } else {
        // No payment for sinking, capture, route failure, departure or return.
        this.owner.addGold(this.cargo, this.factory.tile());
        this.owner.addTradeGold(this.cargo);
        const importer = this.destination!.owner();
        const importGold = this.cargo / 4n;
        importer.addGold(importGold, this.destination!.tile());
        importer.addTradeGold(importGold);
        this.game
          .stats()
          .boatArriveTrade(this.owner, importer, this.cargo, importGold);
        this.returnHome(ticks);
      }
      return;
    }
    if (ticks < this.nextMove) return;
    this.nextMove = ticks + OIL_TANKER_STEP_TICKS;
    const dst = this.destination!.tile(),
      stations = activeStraits(this.game);
    const signature = this.toll.signature;
    const usingTolls = stations.length > 0 || this.toll.route !== null;
    const result = usingTolls
      ? tradePassageNext(
          this.game,
          this.owner,
          this.ship,
          dst,
          this.path,
          stations,
          this.toll,
          0,
        )
      : this.path.next(this.ship.tile(), dst);
    if (signature !== this.toll.signature) this.planDestination = null;
    if (result.status === PathStatus.NEXT) {
      if (this.planDestination !== dst) {
        const path = usingTolls
          ? [result.node, ...(this.toll.route?.slice(this.toll.index) ?? [])]
          : this.path.pathForTraversal(result.node, dst);
        this.game.recordMotionPlan({
          kind: "grid",
          unitId: this.ship.id(),
          planId: ++this.planId,
          // Client updates describe the completed tick (+1), independently
          // of the two-tick interval between subsequent tanker movements.
          startTick: ticks + 1,
          ticksPerStep: OIL_TANKER_STEP_TICKS,
          path,
        });
        this.planDestination = dst;
      }
      this.ship.move(result.node);
    } else if (result.status === PathStatus.COMPLETE) {
      this.ship.move(dst);
    } else {
      // A closed strait pauses the voyage until policy or territory changes.
      this.stopPlan(ticks);
      if (!usingTolls && !this.returning) this.returnHome(ticks);
    }
  }
  isActive() {
    return this.active;
  }
  activeDuringSpawnPhase() {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return OilTankerExecutionSnapshot.write({
      active: this.active,
      factory: w.unit(this.factory),
      ship: w.unit(this.ship),
      owner: this.owner ? w.player(this.owner) : null,
      destination: this.destination ? w.unit(this.destination) : null,
      returning: this.returning,
      nextDeparture: this.nextDeparture,
      nextMove: this.nextMove,
      voyage: this.voyage,
      cargo: this.cargo,
      toll: this.toll,
      planId: this.planId,
      planDestination: this.planDestination,
      path: this.path ? waterPathFinderState(this.path) : null,
    });
  }
  restoreSnapshot(s: OilTankerState, r: SnapshotReader): void {
    this.game = r.game;
    this.active = s.active;
    this.factory = r.unit(s.factory);
    this.ship = r.unit(s.ship);
    this.owner = s.owner === null ? undefined! : r.player(s.owner);
    this.destination = s.destination === null ? null : r.unit(s.destination);
    this.returning = s.returning;
    this.nextDeparture = s.nextDeparture;
    this.nextMove = s.nextMove;
    this.voyage = s.voyage;
    this.cargo = s.cargo;
    this.toll = s.toll;
    this.planId = s.planId;
    this.planDestination = s.planDestination;
    this.path =
      s.path === null ? undefined! : restoreWaterPathFinder(r.game, s.path);
  }
}
const State = z.object({
  active: z.boolean(),
  factory: zRef(),
  ship: zRef(),
  owner: zPlayerRef().nullable(),
  destination: zRef().nullable(),
  returning: z.boolean(),
  nextDeparture: zInt(),
  nextMove: zInt(),
  voyage: zInt(),
  cargo: z.bigint(),
  toll: TollVoyageSchema,
  planId: zInt(),
  planDestination: zTile().nullable(),
  path: WaterPathFinderSchema.nullable(),
});
type OilTankerState = z.infer<typeof State>;
export const OilTankerExecutionSnapshot = execSnapshotType({
  name: "OilTanker",
  version: 1,
  schema: State,
  cls: () => OilTankerExecution,
});
