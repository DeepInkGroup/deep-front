import { describe, expect, it } from "vitest";
import { RailroadCache } from "../../src/client/render/frame/RailroadCache";
import { GameUpdateType as T } from "@openfront/engine-api/game/GameUpdates";
describe("Tunnel rail rendering state", () => {
  it("marks underwater routes and preserves tunnel flags when overlapping surface rails change", () => {
    const cache = new RailroadCache(40, 40),
      tiles = [41, 42, 43, 44];
    const apply = (type: T, event: object) =>
      cache.apply({ updates: { [type]: [event] } } as never);
    apply(T.RailroadConstructionEvent, { id: 1, tiles, tunnel: true });
    for (const tile of tiles) {
      expect(cache.railroadState[tile] & 128).toBe(128);
      expect(cache.railroadState[tile] & 127).toBeGreaterThan(0);
    }
    apply(T.RailroadConstructionEvent, { id: 2, tiles });
    for (const tile of tiles) expect(cache.railroadState[tile] & 128).toBe(128);
    apply(T.RailroadDestructionEvent, { id: 1 });
    for (const tile of tiles) {
      expect(cache.railroadState[tile] & 128).toBe(0);
      expect(cache.railroadState[tile]).toBeGreaterThan(0);
    }
    apply(T.RailroadDestructionEvent, { id: 2 });
    for (const tile of tiles) expect(cache.railroadState[tile]).toBe(0);
  });
  it("replaces an upgraded bridge in place without leaking tile references", () => {
    const cache = new RailroadCache(40, 40),
      tiles = [41, 42];
    const apply = (type: T, event: object) =>
      cache.apply({ updates: { [type]: [event] } } as never);
    apply(T.RailroadConstructionEvent, { id: 1, tiles });
    apply(T.RailroadConstructionEvent, { id: 1, tiles, tunnel: true });
    apply(T.RailroadDestructionEvent, { id: 1 });
    for (const tile of tiles) expect(cache.railroadState[tile]).toBe(0);
  });
});
