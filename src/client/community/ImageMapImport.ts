import type { MapDraft } from "@openfront/engine-api/game/CommunityMaps";

export type ImageMapMode =
  | "auto"
  | "blue"
  | "dark"
  | "light"
  | "color"
  | "land";
export interface ImageMapOptions {
  mode: ImageMapMode;
  sensitivity: number;
  waterColor: string;
  elevation: boolean;
  clean: boolean;
}
export const DEFAULT_IMAGE_OPTIONS: ImageMapOptions = {
  mode: "auto",
  sensitivity: 50,
  waterColor: "#4b96bd",
  elevation: true,
  clean: true,
};
export const IMPORT_WIDTH = 512,
  IMPORT_HEIGHT = 384;
type Pixels = { width: number; height: number; data: Uint8ClampedArray };
const blue = (r: number, g: number, b: number, sensitivity: number) =>
  b > r + (100 - sensitivity) * 0.22 && g > r - 10 && b > 65 && g > 45;

/** Browser-only raster classification: never uploads the original image. */
export function imageToTerrain(image: Pixels, options: ImageMapOptions) {
  const { width, height, data } = image,
    size = width * height;
  if (data.length !== size * 4) throw new Error("Image pixels are incomplete.");
  const sensitivity = Math.max(0, Math.min(100, options.sensitivity));
  let bluePixels = 0,
    bright = 0,
    opaque = 0;
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let i = 0; i < size; i++) {
    const p = i * 4;
    if (data[p + 3] < 96) continue;
    opaque++;
    const x = i % width,
      y = Math.floor(i / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    if (blue(data[p], data[p + 1], data[p + 2], sensitivity)) bluePixels++;
    if (Math.min(data[p], data[p + 1], data[p + 2]) > 225) bright++;
  }
  let mode: ImageMapMode | "background" = options.mode;
  let edge = 0,
    whiteEdge = 0;
  const checkEdge = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    edge++;
    if (data[p + 3] >= 96 && Math.min(data[p], data[p + 1], data[p + 2]) > 225)
      whiteEdge++;
  };
  if (opaque) {
    for (let x = left; x <= right; x++) {
      checkEdge(x, top);
      checkEdge(x, bottom);
    }
    for (let y = top + 1; y < bottom; y++) {
      checkEdge(left, y);
      checkEdge(right, y);
    }
  }
  if (mode === "auto")
    mode =
      bluePixels > opaque * 0.012
        ? "blue"
        : bright > opaque * 0.45 && whiteEdge > edge * 0.75
          ? "background"
          : "land";
  const water = new Uint8Array(size),
    visited = new Uint8Array(size),
    queue = new Uint32Array(size);
  const color = /^#[0-9a-f]{6}$/i.test(options.waterColor)
    ? options.waterColor
    : "#4b96bd";
  const rgb = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  const threshold = (255 * sensitivity) / 100;
  for (let i = 0; i < size; i++) {
    const p = i * 4,
      r = data[p],
      g = data[p + 1],
      b = data[p + 2],
      luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    water[i] =
      data[p + 3] < 96 ||
      (mode === "blue" && blue(r, g, b, sensitivity)) ||
      (mode === "dark" && luma > threshold) ||
      (mode === "light" && luma < threshold) ||
      (mode === "background" && Math.min(r, g, b) > 245 - sensitivity * 0.65) ||
      (mode === "color" &&
        Math.hypot(r - rgb[0], g - rgb[1], b - rgb[2]) < 10 + sensitivity * 2.5)
        ? 1
        : 0;
  }
  if (mode === "background") {
    // An outlined country can have a white interior. Only the paper connected
    // to the frame becomes water; enclosed interiors remain playable land.
    let head = 0,
      tail = 0;
    const visit = (i: number) => {
      if (water[i] && !visited[i]) {
        visited[i] = 1;
        queue[tail++] = i;
      }
    };
    for (let x = 0; x < width; x++) {
      visit(x);
      visit((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      visit(y * width);
      visit(y * width + width - 1);
    }
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      if (x) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (y) visit(i - width);
      if (y < height - 1) visit(i + width);
    }
    water.set(visited);
  }
  if (options.clean) {
    visited.fill(0);
    for (let start = 0; start < size; start++) {
      if (visited[start]) continue;
      const value = water[start];
      let head = 0,
        tail = 1;
      queue[0] = start;
      visited[start] = 1;
      const visit = (i: number) => {
        if (!visited[i] && water[i] === value) {
          visited[i] = 1;
          queue[tail++] = i;
        }
      };
      while (head < tail) {
        const i = queue[head++],
          x = i % width,
          y = Math.floor(i / width);
        if (x) visit(i - 1);
        if (x < width - 1) visit(i + 1);
        if (y) visit(i - width);
        if (y < height - 1) visit(i + width);
      }
      if (tail < 8)
        for (let i = 0; i < tail; i++) water[queue[i]] = value ? 0 : 1;
    }
  }
  const tiles = Array<number>(size);
  let land = 0,
    largestLandArea = 0;
  for (let i = 0; i < size; i++) {
    if (water[i]) {
      tiles[i] = 0;
      continue;
    }
    land++;
    const p = i * 4,
      r = data[p],
      g = data[p + 1],
      b = data[p + 2];
    const brown = r > g * 1.08 && g > b * 1.12 && r - b > 28;
    tiles[i] = options.elevation && brown ? (r < 135 ? 3 : 2) : 1;
  }
  visited.fill(0);
  for (let start = 0; start < size; start++) {
    if (water[start] || visited[start]) continue;
    let head = 0,
      tail = 1;
    queue[0] = start;
    visited[start] = 1;
    const visit = (i: number) => {
      if (!water[i] && !visited[i]) {
        visited[i] = 1;
        queue[tail++] = i;
      }
    };
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      if (x) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (y) visit(i - width);
      if (y < height - 1) visit(i + width);
    }
    largestLandArea = Math.max(largestLandArea, tail);
  }
  return {
    tiles,
    landPercent: Math.round((land / size) * 100),
    largestLandArea,
    detectedMode: mode,
  };
}

export function resizeDraftGrid(
  draft: MapDraft,
  width: 128 | 256 | 512,
): MapDraft {
  const oldWidth = draft.gridWidth ?? 128,
    oldHeight = (oldWidth * 3) / 4,
    height = (width * 3) / 4;
  const tiles = Array.from(
    { length: width * height },
    (_, i) =>
      draft.tiles[
        Math.min(
          oldHeight - 1,
          Math.floor(((Math.floor(i / width) + 0.5) * oldWidth) / width),
        ) *
          oldWidth +
          Math.min(
            oldWidth - 1,
            Math.floor((((i % width) + 0.5) * oldWidth) / width),
          )
      ],
  );
  const nations = draft.nations
    .map((n) => ({
      ...n,
      x: Math.min(width - 1, Math.floor(((n.x + 0.5) * width) / oldWidth)),
      y: Math.min(height - 1, Math.floor(((n.y + 0.5) * width) / oldWidth)),
    }))
    .filter((n) => tiles[n.y * width + n.x] > 0);
  return { ...draft, gridWidth: width, tiles, nations };
}
