import {
  MapDraft,
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
} from "@openfront/engine-api/game/CommunityMaps";

export const WORLD_TEMPLATES = [
  {
    id: "islands",
    name: "Archipelago",
    idea: "Island chains, sheltered bays and open shipping lanes. Build ports to connect your empire.",
  },
  {
    id: "continents",
    name: "Continents",
    idea: "Broad fertile interiors, mountain borders and a winding ocean passage for long campaigns.",
  },
  {
    id: "straits",
    name: "Twin Straits",
    idea: "Four rival shores meet at narrow sea crossings. Control the channels to control trade.",
  },
  {
    id: "inland",
    name: "Inland Sea",
    idea: "A central sea links coastal nations. Cut new canals through the surrounding land bridge.",
  },
  {
    id: "caldera",
    name: "Caldera",
    idea: "A broken volcanic ring with a central island, rugged highlands and several naval gateways.",
  },
  {
    id: "blank",
    name: "Blank ocean",
    idea: "Start from open water. Paint continents, carve rivers and place your own nations.",
  },
] as const;

export function blankDraft(scale: MapDraft["scale"] = 16): MapDraft {
  return {
    name: "",
    description: "",
    scale,
    tiles: Array(W * H).fill(0),
    nations: [],
  };
}

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix),
    fy = smooth(y - iy);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return mix(
    mix(hash(ix, iy, seed), hash(ix + 1, iy, seed), fx),
    mix(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), fx),
    fy,
  );
}

/** Repeatable geography with coastal detail, natural ridges and playable channels. */
export function worldTemplate(kind = "islands", seed = 42): MapDraft {
  const tiles: number[] = Array(W * H).fill(0);
  const island = (
    x: number,
    y: number,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ) => 1 - Math.hypot((x - cx) / rx, (y - cy) / ry);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (kind === "blank") continue;
      const warp = (noise(x / 18, y / 18, seed) - 0.5) * 9;
      const detail =
        (noise(x / 7, y / 7, seed + 9) - 0.5) * 0.18 +
        (noise(x / 3, y / 3, seed + 20) - 0.5) * 0.07;
      const nx = x + warp,
        ny = y + (noise(x / 22, y / 22, seed + 3) - 0.5) * 7;
      let shape: number;
      if (kind === "continents") {
        shape = Math.max(
          island(nx, ny, 31, 47, 29, 40),
          island(nx, ny, 96, 48, 29, 38),
        );
      } else if (kind === "straits") {
        shape = Math.max(
          island(nx, ny, 32, 25, 30, 22),
          island(nx, ny, 94, 25, 29, 22),
          island(nx, ny, 32, 74, 30, 21),
          island(nx, ny, 96, 73, 28, 22),
        );
        if (
          Math.abs(x - 64 - 2 * Math.sin(y / 10)) < 2 ||
          Math.abs(y - 49 - 2 * Math.sin(x / 14)) < 2
        )
          continue;
      } else if (kind === "inland") {
        shape = Math.min(
          island(nx, ny, 64, 48, 59, 44),
          Math.hypot((nx - 64) / 28, (ny - 48) / 23) - 1,
        );
        if (x > 90 && Math.abs(y - 49 - Math.sin(x / 6) * 3) < 2) continue;
      } else if (kind === "caldera") {
        const r = Math.hypot((nx - 64) / 50, (ny - 48) / 37);
        shape = Math.max(
          Math.min(1 - r, r - 0.57),
          island(nx, ny, 64, 48, 12, 9),
        );
        if (
          (x > 75 && Math.abs(y - 53 - (x - 75) * 0.25) < 2) ||
          (y < 35 && Math.abs(x - 48 + (y - 35) * 0.4) < 2)
        )
          continue;
      } else {
        shape = Math.max(
          island(nx, ny, 34, 37, 25, 28),
          island(nx, ny, 91, 59, 25, 26),
          island(nx, ny, 82, 20, 14, 9),
          island(nx, ny, 36, 80, 14, 8),
          island(nx, ny, 113, 25, 8, 10),
          island(nx, ny, 58, 65, 8, 10),
        );
      }
      if (shape + detail < 0 || x < 3 || y < 3 || x >= W - 3 || y >= H - 3)
        continue;
      const ridge = 1 - Math.abs(noise(nx / 16, ny / 16, seed + 81) * 2 - 1);
      const highland = noise(x / 26, y / 26, seed + 57);
      tiles[y * W + x] =
        ridge > 0.88 && highland > 0.46 && shape > 0.1
          ? 3
          : highland > 0.54 && shape > 0.06
            ? 2
            : 1;
    }
  return { name: "", description: "", scale: 16, tiles, nations: [] };
}

export function terrainStats(draft: MapDraft) {
  const cells = [0, 0, 0, 0];
  for (const type of draft.tiles) cells[type]++;
  const land = cells[1] + cells[2] + cells[3];
  return {
    cells,
    landPercent: Math.round((land / draft.tiles.length) * 100),
    landTiles: Math.round(
      (land / draft.tiles.length) * W * H * draft.scale ** 2,
    ),
  };
}
