import {
  OIL_TANKERS_BY_LEVEL,
  OIL_TANKER_REPLACEMENT_TICKS,
} from "@openfront/engine-api/game/OilFactory";
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  zInt,
  zRef,
  zPlayerRef,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Unit, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import { connectRailHub } from "./RailHub";
import { OilTankerExecution } from "./OilTankerExecution";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

type FleetSlot = { ship: Unit | null; readyAt: number };
export class OilFactoryExecution implements Execution {
  private active = true;
  private game: Game;
  private owner: Player | null = null;
  private fleet: FleetSlot[] = [];
  constructor(private factory: Unit) {}

  init(game: Game, _ticks: number): void {
    this.game = game;
    this.owner = this.factory.owner();
  }
  tick(ticks: number): void {
    if (!this.factory.isActive()) {
      for (const { ship } of this.fleet)
        if (ship?.isActive()) ship.delete(false);
      this.active = false;
      return;
    }
    if (this.owner !== this.factory.owner()) {
      this.owner = this.factory.owner();
      for (const slot of this.fleet) {
        if (slot.ship?.isActive()) slot.ship.delete(false);
        slot.ship = null;
        slot.readyAt = ticks + OIL_TANKER_REPLACEMENT_TICKS;
      }
    }
    if (
      this.factory.isUnderConstruction() ||
      this.factory.isMarkedForDeletion()
    )
      return;
    connectRailHub(this.game, this.factory);
    // Legacy inland factories keep their rail connection, but cannot launch ships.
    if (
      !this.game.isShore(this.factory.tile()) ||
      this.game.config().isUnitDisabled(UnitType.OilFactory)
    )
      return;
    const capacity =
      OIL_TANKERS_BY_LEVEL[Math.min(3, this.factory.level()) - 1];
    while (this.fleet.length < capacity)
      this.fleet.push({ ship: null, readyAt: ticks });
    for (const slot of this.fleet) {
      if (
        slot.ship &&
        (!slot.ship.isActive() || slot.ship.owner() !== this.owner)
      ) {
        if (slot.ship.isActive()) slot.ship.delete(false);
        slot.ship = null;
        slot.readyAt = ticks + OIL_TANKER_REPLACEMENT_TICKS;
      }
      if (slot.ship || ticks < slot.readyAt) continue;
      const ship = this.owner.buildUnit(
        UnitType.OilTanker,
        this.factory.tile(),
        { targetUnit: this.factory },
      );
      slot.ship = ship;
      this.game.addExecution(new OilTankerExecution(this.factory, ship));
    }
  }
  isActive() {
    return this.active;
  }
  activeDuringSpawnPhase() {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return OilFactoryExecutionSnapshot.write({
      active: this.active,
      factory: w.unit(this.factory),
      owner: this.owner ? w.player(this.owner) : null,
      fleet: this.fleet.map((s) => ({
        ship: s.ship ? w.unit(s.ship) : null,
        readyAt: s.readyAt,
      })),
    });
  }
  restoreSnapshot(s: OilFactoryState, r: SnapshotReader): void {
    this.game = r.game;
    this.active = s.active;
    this.factory = r.unit(s.factory);
    // Referenced unit shells are populated after execution restoration.
    this.owner = s.owner === null ? null : r.player(s.owner);
    this.fleet = s.fleet.map((s) => ({
      ship: s.ship === null ? null : r.unit(s.ship),
      readyAt: s.readyAt,
    }));
  }
}
const OilFactoryStateSchema = z.object({
  active: z.boolean(),
  factory: zRef(),
  owner: zPlayerRef().nullable(),
  fleet: z.array(z.object({ ship: zRef().nullable(), readyAt: zInt() })),
});
type OilFactoryState = z.infer<typeof OilFactoryStateSchema>;
export const OilFactoryExecutionSnapshot = execSnapshotType({
  name: "OilFactory",
  version: 2,
  schema: OilFactoryStateSchema,
  migrations: {
    1: (old: any) => ({
      active: old.active,
      factory: old.factory,
      owner: null,
      fleet: [],
    }),
  },
  cls: () => OilFactoryExecution,
});
