import {
  GameMapSize,
  GameMapType,
  maps,
} from "@openfront/engine-api/game/GameTypes";
import { MapManifest } from "@openfront/engine-api/game/MapFiles";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import fs from "node:fs";
import path from "node:path";

const folder = path.resolve("resources/maps/deepplace");

describe("DeepPlace", () => {
  it("is available in the Fictional map category", () => {
    const map = maps.find((m) => m.type === GameMapType.DeepPlace)!;
    expect(map.id).toBe("DeepPlace");
    expect(map.categories).toContain("fictional");
  });

  it.each([GameMapSize.Normal, GameMapSize.Compact])(
    "loads %s terrain with land spawns and navigable straits",
    async (mapSize) => {
      const manifest: MapManifest = JSON.parse(
        fs.readFileSync(path.join(folder, "manifest.json"), "utf8"),
      );
      const { gameMap, miniGameMap, nations } = await loadTerrainMap({
        map: GameMapType.DeepPlace,
        mapSize,
        manifest,
        mapBin: fs.readFileSync(path.join(folder, "map.bin")),
        map4xBin: fs.readFileSync(path.join(folder, "map4x.bin")),
        map16xBin: fs.readFileSync(path.join(folder, "map16x.bin")),
      });
      const scale = mapSize === GameMapSize.Normal ? 1 : 2;
      expect(gameMap.width()).toBe(2048 / scale);
      expect(gameMap.height()).toBe(1440 / scale);
      expect(miniGameMap.width()).toBe(gameMap.width() / 2);
      expect(gameMap.numLandTiles()).toBeGreaterThan(
        1_500_000 / (scale * scale),
      );
      expect(nations).toHaveLength(12);
      for (const nation of nations) {
        const [x, y] = nation.coordinates!;
        expect(gameMap.isLand(gameMap.ref(x, y)), nation.name).toBe(true);
      }
      // These centerlines form an uninterrupted north/south passage and two
      // cross passages. Check at both playable sizes so compact scaling cannot close them.
      for (let y = 0; y < 1440; y += scale) {
        const x = Math.floor(
          1070 + 52 * Math.sin(y / 150) + 25 * Math.sin(y / 73),
        );
        expect(
          gameMap.isWater(
            gameMap.ref(Math.floor(x / scale), Math.floor(y / scale)),
          ),
        ).toBe(true);
      }
      for (let x = 0; x < 2048; x += scale) {
        const y =
          x < 1070
            ? 800 + 32 * Math.sin(x / 130)
            : 900 + 40 * Math.sin(x / 180);
        // At the central junction use Deep Strait, not the land between the passages.
        if (x > 990 && x < 1160) continue;
        expect(
          gameMap.isWater(
            gameMap.ref(Math.floor(x / scale), Math.floor(y / scale)),
          ),
        ).toBe(true);
      }
    },
  );
});
