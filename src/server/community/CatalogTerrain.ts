import type { MapDraft } from "@openfront/engine-api/game/CommunityMaps";

type Point = readonly [number, number];
function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix),
    fy = smooth(y - iy);
  const a = hash(ix, iy, seed) * (1 - fx) + hash(ix + 1, iy, seed) * fx;
  const b = hash(ix, iy + 1, seed) * (1 - fx) + hash(ix + 1, iy + 1, seed) * fx;
  return a * (1 - fy) + b * fy;
}
function distanceToSegment(x: number, y: number, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}

/** Four times the authored detail, with fractal shores, river valleys and ridges. */
export function refineCatalogTerrain(
  base: MapDraft,
  seed: number,
  rivers: readonly (readonly Point[])[],
): MapDraft {
  const width = 512,
    height = 384;
  const sample = (x: number, y: number) =>
    base.tiles[
      Math.max(0, Math.min(95, y)) * 128 + Math.max(0, Math.min(127, x))
    ];
  const tiles = Array<number>(width * height).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const bx = (x + 0.5) / 4 - 0.5,
        by = (y + 0.5) / 4 - 0.5;
      const gx =
        bx +
        (noise(bx / 4, by / 4, seed) - 0.5) * 0.95 +
        (noise(bx / 0.85, by / 0.85, seed + 1) - 0.5) * 0.28;
      const gy = by + (noise(bx / 4, by / 4, seed + 2) - 0.5) * 0.95;
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
      let land = 0,
        highland = 0;
      for (let i = 0; i < 4; i++) {
        if (neighbors[i]) land += weights[i];
        highland += Math.max(0, neighbors[i] - 1) * weights[i];
      }
      if (land < 0.5) continue;
      const ridge =
        noise(bx / 2.8, by / 2.8, seed + 11) * 0.5 +
        noise(bx / 8, by / 8, seed + 12) * 0.5;
      let terrain =
        highland > 1.05 && ridge > 0.39
          ? 3
          : highland > 0.35 && ridge > 0.27
            ? 2
            : ridge > 0.74
              ? 2
              : 1;
      for (const river of rivers) {
        let nearest = Infinity;
        for (let i = 1; i < river.length; i++)
          nearest = Math.min(
            nearest,
            distanceToSegment(
              bx + (noise(bx / 4, by / 4, seed + 51) - 0.5) * 0.7,
              by + (noise(bx / 4, by / 4, seed + 52) - 0.5) * 0.7,
              river[i - 1],
              river[i],
            ),
          );
        // A meandering channel surrounded by a lower, fertile floodplain.
        const bend = (noise(bx / 1.7, by / 1.7, seed + 33) - 0.5) * 0.12;
        if (nearest < 0.22 + bend) terrain = 0;
        else if (nearest < 1.3) terrain = 1;
      }
      tiles[y * width + x] = terrain;
    }
  const nations = base.nations.map((nation) => {
    const x = nation.x * 4 + 2,
      y = nation.y * 4 + 2;
    // Keep every named spawn on a broad land patch, including compact maps.
    const safe = (px: number, py: number) =>
      px >= 2 &&
      py >= 2 &&
      px < width - 2 &&
      py < height - 2 &&
      [-2, 0, 2].every((dy) =>
        [-2, 0, 2].every((dx) => tiles[(py + dy) * width + px + dx] > 0),
      );
    for (let radius = 0; radius < 30; radius++)
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++)
          if (safe(x + dx, y + dy)) return { ...nation, x: x + dx, y: y + dy };
    throw new Error(`No safe catalog spawn for ${nation.name}`);
  });
  return { ...base, gridWidth: 512, tiles, nations };
}
