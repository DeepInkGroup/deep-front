import { createHash } from "node:crypto";
import {
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
  MapDraft,
  MapDraftSchema,
  draftDimensions,
} from "@openfront/engine-api/game/CommunityMaps";
import { terrainThumbnail } from "./TerrainThumbnail";
import { noise } from "./CatalogTerrain";
import type { MapManifest } from "@openfront/engine-api/game/MapFiles";

export const TERRAIN_COLORS = ["#315a70", "#a9bb7d", "#b6a477", "#d3d0c2"];

export function validateDraft(input: unknown): MapDraft {
  const draft = MapDraftSchema.parse(input);
  const { width: W, height: H } = draftDimensions(draft);
  const seen = new Uint8Array(W * H);
  let largest = 0;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || draft.tiles[start] === 0) continue;
    const queue = [start];
    seen[start] = 1;
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i],
        x = t % W,
        y = Math.floor(t / W);
      const visit = (n: number) => {
        if (!seen[n] && draft.tiles[n] !== 0) {
          seen[n] = 1;
          queue.push(n);
        }
      };
      if (x > 0) visit(t - 1);
      if (x < W - 1) visit(t + 1);
      if (y > 0) visit(t - W);
      if (y < H - 1) visit(t + W);
    }
    largest = Math.max(largest, queue.length);
  }
  if (largest < 64 * (W / 128) ** 2)
    throw new Error(
      "Draw a larger connected land area so players have room to spawn.",
    );
  const names = new Set<string>();
  for (const nation of draft.nations) {
    if (draft.tiles[nation.y * W + nation.x] === 0)
      throw new Error("Nation spawns must be on land.");
    const name = nation.name.toLowerCase();
    if (names.has(name)) throw new Error("Nation names must be unique.");
    names.add(name);
  }
  return draft;
}

export function draftThumbnail(draft: MapDraft): string {
  const preview = terrainAtScale(draft, 4);
  return terrainThumbnail(
    preview.data,
    preview.meta.width,
    preview.meta.height,
  );
}

function terrainAtScale(draft: MapDraft, scale: number) {
  const { width: gridWidth, height: gridHeight } = draftDimensions(draft);
  const width = W * scale,
    height = H * scale,
    cellSize = width / gridWidth,
    size = width * height;
  const terrain = Buffer.alloc(size),
    distance = new Uint16Array(size);
  distance.fill(65535);
  const queue = new Uint32Array(size);
  let tail = 0,
    head = 0,
    landCount = 0;
  const levels = [0, 2, 13, 25];
  const relief = new Float32Array(gridWidth * gridHeight);
  for (let y = 0; y < gridHeight; y++)
    for (let x = 0; x < gridWidth; x++) {
      const type = draft.tiles[y * gridWidth + x];
      const variation =
        gridWidth > 128 && type > 0
          ? (noise(x / 11, y / 11, 71) - 0.5) * (type === 1 ? 3 : 12) +
            (noise(x / 3, y / 3, 911) - 0.5) * (type === 1 ? 1 : 4)
          : 0;
      relief[y * gridWidth + x] = Math.max(
        1,
        Math.min(30, levels[type] + variation),
      );
    }
  const sample = (x: number, y: number) =>
    draft.tiles[
      Math.max(0, Math.min(gridHeight - 1, y)) * gridWidth +
        Math.max(0, Math.min(gridWidth - 1, x))
    ];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      // Interpolate cell centers so coastlines and ridges curve naturally at
      // full resolution, while one-cell canals remain navigable at every size.
      const gx = (x + 0.5) / cellSize - 0.5,
        gy = (y + 0.5) / cellSize - 0.5;
      const ix = Math.floor(gx),
        iy = Math.floor(gy),
        fx = gx - ix,
        fy = gy - iy;
      const neighbors = [
        sample(ix, iy),
        sample(ix + 1, iy),
        sample(ix, iy + 1),
        sample(ix + 1, iy + 1),
      ];
      const weights = [
        (1 - fx) * (1 - fy),
        fx * (1 - fy),
        (1 - fx) * fy,
        fx * fy,
      ];
      const heights = [
        relief[
          Math.max(0, Math.min(gridHeight - 1, iy)) * gridWidth +
            Math.max(0, Math.min(gridWidth - 1, ix))
        ],
        relief[
          Math.max(0, Math.min(gridHeight - 1, iy)) * gridWidth +
            Math.max(0, Math.min(gridWidth - 1, ix + 1))
        ],
        relief[
          Math.max(0, Math.min(gridHeight - 1, iy + 1)) * gridWidth +
            Math.max(0, Math.min(gridWidth - 1, ix))
        ],
        relief[
          Math.max(0, Math.min(gridHeight - 1, iy + 1)) * gridWidth +
            Math.max(0, Math.min(gridWidth - 1, ix + 1))
        ],
      ];
      let coverage = 0,
        elevation = 0;
      for (let i = 0; i < 4; i++)
        if (neighbors[i]) {
          coverage += weights[i];
          elevation += heights[i] * weights[i];
        }
      const ref = y * width + x;
      if (coverage >= 0.5) {
        terrain[ref] = 128 | Math.round(elevation / coverage);
        distance[ref] = 0;
        queue[tail++] = ref;
        landCount++;
      }
    }
  // Distance-to-land for depth shading; the queue visits every tile once.
  const visit = (next: number, current: number) => {
    if (distance[next] === 65535) {
      distance[next] = distance[current] + 1;
      queue[tail++] = next;
    }
  };
  while (head < tail) {
    const t = queue[head++],
      x = t % width,
      y = Math.floor(t / width);
    if (x > 0) visit(t - 1, t);
    if (x < width - 1) visit(t + 1, t);
    if (y > 0) visit(t - width, t);
    if (y < height - 1) visit(t + width, t);
  }
  // Mark the largest water component as ocean, preserving inland lakes.
  const seen = new Uint8Array(size);
  let oceanStart = -1,
    oceanSize = 0;
  for (let start = 0; start < size; start++) {
    if (seen[start] || terrain[start] & 128) continue;
    head = 0;
    tail = 1;
    queue[0] = start;
    seen[start] = 1;
    const water = (n: number) => {
      if (!seen[n] && !(terrain[n] & 128)) {
        seen[n] = 1;
        queue[tail++] = n;
      }
    };
    while (head < tail) {
      const t = queue[head++],
        x = t % width,
        y = Math.floor(t / width);
      if (x > 0) water(t - 1);
      if (x < width - 1) water(t + 1);
      if (y > 0) water(t - width);
      if (y < height - 1) water(t + width);
    }
    if (tail > oceanSize) {
      oceanStart = start;
      oceanSize = tail;
    }
  }
  // Reuse the BFS queue rather than retaining another full ocean-sized array.
  // This keeps compilation of Colossal maps within small-server memory budgets.
  if (oceanStart >= 0) {
    head = 0;
    tail = 1;
    queue[0] = oceanStart;
    terrain[oceanStart] |= 32;
    const visitOcean = (n: number) => {
      if (!(terrain[n] & (128 | 32))) {
        terrain[n] |= 32;
        queue[tail++] = n;
      }
    };
    while (head < tail) {
      const t = queue[head++],
        x = t % width,
        y = Math.floor(t / width);
      if (x > 0) visitOcean(t - 1);
      if (x < width - 1) visitOcean(t + 1);
      if (y > 0) visitOcean(t - width);
      if (y < height - 1) visitOcean(t + width);
    }
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const t = y * width + x,
        land = !!(terrain[t] & 128);
      if (!land) terrain[t] |= Math.min(31, Math.ceil(distance[t] / 2));
      if (
        (x > 0 && !!(terrain[t - 1] & 128) !== land) ||
        (x < width - 1 && !!(terrain[t + 1] & 128) !== land) ||
        (y > 0 && !!(terrain[t - width] & 128) !== land) ||
        (y < height - 1 && !!(terrain[t + width] & 128) !== land)
      )
        terrain[t] |= 64;
    }
  return { data: terrain, meta: { width, height, num_land_tiles: landCount } };
}

export function compileDraft(input: unknown) {
  const draft = validateDraft(input);
  const cellSize = (W * draft.scale) / draftDimensions(draft).width;
  const normal = terrainAtScale(draft, draft.scale),
    mini = terrainAtScale(draft, draft.scale / 2),
    small = terrainAtScale(draft, draft.scale / 4);
  const manifest: MapManifest = {
    name: draft.name,
    map: normal.meta,
    map4x: mini.meta,
    map16x: small.meta,
    nations: draft.nations.map((n) => ({
      name: n.name,
      flag: "",
      coordinates: [
        Math.floor((n.x + 0.5) * cellSize),
        Math.floor((n.y + 0.5) * cellSize),
      ],
    })),
  };
  return {
    manifest,
    files: {
      "map.bin": normal.data,
      "map4x.bin": mini.data,
      "map16x.bin": small.data,
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
      "thumbnail.svg": Buffer.from(
        terrainThumbnail(small.data, small.meta.width, small.meta.height),
      ),
    },
    hash: createHash("sha256").update(normal.data).digest("hex"),
  };
}
