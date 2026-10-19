import { describe, expect, it } from "vitest";
import {
  paintBrush,
  paintShape,
} from "../../src/client/community/MapEditorTools";
import {
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
} from "@openfront/engine-api/game/CommunityMaps";
describe("Map drawing tools", () => {
  it("makes rectangles and ellipses in either drag direction", () => {
    const tiles = Array(W * H).fill(0);
    paintShape(tiles, { x: 20, y: 20 }, { x: 10, y: 10 }, "rectangle", 1, 1);
    expect(tiles.filter((x) => x === 1)).toHaveLength(121);
    tiles.fill(0);
    paintShape(tiles, { x: 10, y: 10 }, { x: 20, y: 20 }, "ellipse", 2, 1);
    expect(tiles[15 * W + 15]).toBe(2);
    expect(tiles[10 * W + 10]).toBe(0);
  });
  it("paints continuous lines and single-cell canals without leaving the draft bounds", () => {
    const tiles = Array(W * H).fill(1);
    paintShape(tiles, { x: 0, y: 0 }, { x: 15, y: 15 }, "line", 0, 1);
    for (let i = 0; i <= 15; i++) expect(tiles[i * W + i]).toBe(0);
    paintBrush(tiles, { x: 0, y: 0 }, 2, 12, true);
    expect(tiles).toHaveLength(W * H);
    expect(tiles.some((x) => x === undefined)).toBe(false);
  });
});
