import { createHash } from "node:crypto";
import {
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
  MapDraft,
  MapDraftSchema,
} from "@openfront/engine-api/game/CommunityMaps";
import type { MapManifest } from "@openfront/engine-api/game/MapFiles";

export const TERRAIN_COLORS = ["#315a70", "#a9bb7d", "#b6a477", "#d3d0c2"];

export function validateDraft(input: unknown): MapDraft {
  const draft = MapDraftSchema.parse(input);
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
  if (largest < 64)
    throw new Error(
      "Draw at least one connected land area of 64 editor cells so players have room to spawn.",
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
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges"><rect width="${W}" height="${H}" fill="${TERRAIN_COLORS[0]}"/>`,
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; ) {
      const type = draft.tiles[y * W + x];
      let end = x + 1;
      while (end < W && draft.tiles[y * W + end] === type) end++;
      if (type)
        parts.push(
          `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${TERRAIN_COLORS[type]}"/>`,
        );
      x = end;
    }
  for (const nation of draft.nations)
    parts.push(
      `<circle cx="${nation.x + 0.5}" cy="${nation.y + 0.5}" r="1.1" fill="#fce79f" stroke="#24362c" stroke-width=".4"/>`,
    );
  return parts.join("") + "</svg>";
}

function terrainAtScale(draft: MapDraft, scale: number) {
  const width = W * scale,
    height = H * scale,
    size = width * height;
  const terrain = Buffer.alloc(size),
    distance = new Uint16Array(size);
  distance.fill(65535);
  const queue = new Uint32Array(size);
  let tail = 0,
    head = 0,
    landCount = 0;
  const levels = [0, 2, 13, 25];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const type =
          draft.tiles[Math.floor(y / scale) * W + Math.floor(x / scale)],
        ref = y * width + x;
      if (type) {
        terrain[ref] = 128 | levels[type];
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
  let ocean: Uint32Array = new Uint32Array();
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
    if (tail > ocean.length) ocean = queue.slice(0, tail);
  }
  for (const t of ocean) terrain[t] |= 32;
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
        n.x * draft.scale + Math.floor(draft.scale / 2),
        n.y * draft.scale + Math.floor(draft.scale / 2),
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
      "thumbnail.svg": Buffer.from(draftThumbnail(draft)),
    },
    hash: createHash("sha256").update(normal.data).digest("hex"),
  };
}
