import { describe, expect, it } from "vitest";
import {
  imageToTerrain,
  DEFAULT_IMAGE_OPTIONS,
  resizeDraftGrid,
} from "../../src/client/community/ImageMapImport";
import { blankDraft, terrainStats } from "../../src/client/community/MapDesign";
import { MapDraftSchema } from "@openfront/engine-api/game/CommunityMaps";
import { paintShape } from "../../src/client/community/MapEditorTools";

function pixels(
  width: number,
  height: number,
  color: (x: number, y: number) => number[],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(color(x, y), (y * width + x) * 4);
  return { width, height, data };
}
describe("Image to playable terrain", () => {
  it("recognizes blue seas, colored land, a narrow connected river and brown hills", () => {
    const image = pixels(64, 48, (x, y) =>
      x < 8 || x > 55 || y < 5 || y > 42 || x === 32
        ? [50, 130, 190, 255]
        : x > 40
          ? [173, 132, 83, 255]
          : [120, 170, 95, 255],
    );
    const result = imageToTerrain(image, DEFAULT_IMAGE_OPTIONS);
    expect(result.detectedMode).toBe("blue");
    expect(result.tiles[24 * 64 + 32]).toBe(0);
    expect(result.tiles[24 * 64 + 20]).toBe(1);
    expect(result.tiles[24 * 64 + 45]).toBe(2);
    expect(result.largestLandArea).toBeGreaterThan(500);
  });
  it("fills white interiors inside a country's outline and leaves exterior paper as water", () => {
    const image = pixels(64, 48, (x, y) =>
      ((x === 10 || x === 54) && y >= 8 && y <= 40) ||
      ((y === 8 || y === 40) && x >= 10 && x <= 54)
        ? [20, 20, 20, 255]
        : [255, 255, 255, 255],
    );
    const result = imageToTerrain(image, DEFAULT_IMAGE_OPTIONS);
    expect(result.detectedMode).toBe("background");
    expect(result.tiles[0]).toBe(0);
    expect(result.tiles[24 * 64 + 32]).toBe(1);
  });
  it("handles transparent islands, city maps, custom water colors and invertible silhouettes", () => {
    const transparent = pixels(32, 24, (x, y) =>
      x > 5 && x < 26 && y > 4 && y < 20 ? [30, 160, 90, 255] : [0, 0, 0, 0],
    );
    expect(imageToTerrain(transparent, DEFAULT_IMAGE_OPTIONS).tiles[0]).toBe(0);
    const city = pixels(32, 24, () => [230, 230, 230, 255]);
    expect(
      imageToTerrain(city, { ...DEFAULT_IMAGE_OPTIONS, mode: "land" })
        .landPercent,
    ).toBe(100);
    const purple = pixels(32, 24, (x) =>
      x < 10 ? [150, 70, 180, 255] : [130, 180, 90, 255],
    );
    expect(
      imageToTerrain(purple, {
        ...DEFAULT_IMAGE_OPTIONS,
        mode: "color",
        waterColor: "#9646b4",
        sensitivity: 10,
      }).tiles[0],
    ).toBe(0);
    const bw = pixels(32, 24, (x) =>
      x < 16 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    expect(
      imageToTerrain(bw, { ...DEFAULT_IMAGE_OPTIONS, mode: "dark" }).tiles[0],
    ).toBe(1);
    expect(
      imageToTerrain(bw, { ...DEFAULT_IMAGE_OPTIONS, mode: "light" }).tiles[0],
    ).toBe(0);
  });
  it("recognizes letterboxed outline maps without erasing white transparent cutouts", () => {
    const framed = pixels(64, 48, (x, y) => {
      if (y < 6 || y > 41) return [0, 0, 0, 0];
      return ((x === 10 || x === 54) && y >= 12 && y <= 36) ||
        ((y === 12 || y === 36) && x >= 10 && x <= 54)
        ? [0, 0, 0, 255]
        : [255, 255, 255, 255];
    });
    const result = imageToTerrain(framed, DEFAULT_IMAGE_OPTIONS);
    expect(result.detectedMode).toBe("background");
    expect(result.tiles[24 * 64 + 32]).toBe(1);
    expect(result.tiles[8 * 64 + 2]).toBe(0);
    const cutout = pixels(64, 48, (x, y) =>
      ((x - 32) / 20) ** 2 + ((y - 24) / 15) ** 2 < 1
        ? [255, 255, 255, 255]
        : [0, 0, 0, 0],
    );
    expect(
      imageToTerrain(cutout, DEFAULT_IMAGE_OPTIONS).tiles[24 * 64 + 32],
    ).toBe(1);
  });
  it("removes isolated label specks while preserving connected shipping channels", () => {
    const image = pixels(32, 24, (x, y) =>
      x === 3 && y === 3 ? [120, 180, 90, 255] : [30, 100, 180, 255],
    );
    expect(imageToTerrain(image, DEFAULT_IMAGE_OPTIONS).landPercent).toBe(0);
    expect(
      imageToTerrain(image, { ...DEFAULT_IMAGE_OPTIONS, clean: false }).tiles[
        3 * 32 + 3
      ],
    ).toBe(1);
  });
  it("resizes editable grids and nation positions without changing world dimensions", () => {
    const draft = blankDraft();
    draft.name = "Imported coast";
    paintShape(
      draft.tiles,
      { x: 20, y: 20 },
      { x: 100, y: 75 },
      "rectangle",
      1,
      1,
    );
    draft.nations = [{ name: "Capital", x: 50, y: 40 }];
    const fine = resizeDraftGrid(draft, 512);
    expect(fine.tiles).toHaveLength(512 * 384);
    expect(fine.nations[0]).toMatchObject({ x: 202, y: 162 });
    expect(MapDraftSchema.parse(fine)).toEqual(fine);
    expect(terrainStats(fine).landPercent).toBe(
      terrainStats(draft).landPercent,
    );
    paintShape(
      fine.tiles,
      { x: 400, y: 300 },
      { x: 450, y: 350 },
      "rectangle",
      2,
      1,
      false,
      512,
      384,
    );
    expect(fine.tiles[320 * 512 + 420]).toBe(2);
    expect(fine.tiles).toHaveLength(512 * 384);
    expect(() => MapDraftSchema.parse({ ...fine, gridWidth: 128 })).toThrow();
    expect(() =>
      MapDraftSchema.parse({
        ...draft,
        nations: [{ name: "Outside", x: 200, y: 10 }],
      }),
    ).toThrow();
  });
});
