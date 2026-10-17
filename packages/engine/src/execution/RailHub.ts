import { RailStructures } from "@openfront/engine-api/game/GameTypes";
import { Game, Unit } from "../game/Game";
import { TrainStationExecution } from "./TrainStationExecution";

/** Promote a completed hub and its neighbors to stations. Only factories spawn trains. */
export function connectRailHub(
  game: Game,
  hub: Unit,
  spawnTrains = false,
): void {
  // A factory promoted by another hub still needs its own train spawner.
  if (hub.hasTrainStation() && !spawnTrains) return;
  game.addExecution(new TrainStationExecution(hub, spawnTrains));
  for (const { unit } of game.nearbyUnits(
    hub.tile(),
    game.config().trainStationMaxRange(),
    RailStructures.types,
  )) {
    if (!unit.hasTrainStation() && !unit.isUnderConstruction()) {
      game.addExecution(new TrainStationExecution(unit));
    }
  }
}
