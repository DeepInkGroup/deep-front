import {
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
} from "@openfront/engine-api/game/CommunityMaps";
export type EditorPoint = { x: number; y: number };
export type PaintMode = "brush" | "fill" | "line" | "rectangle" | "ellipse";
export function paintBrush(
  tiles: number[],
  point: EditorPoint,
  value: number,
  size: number,
  square = false,
) {
  const r = (size - 1) / 2;
  for (
    let y = Math.max(0, Math.floor(point.y - r));
    y <= Math.min(H - 1, Math.ceil(point.y + r));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(point.x - r));
      x <= Math.min(W - 1, Math.ceil(point.x + r));
      x++
    )
      if (square || (x - point.x) ** 2 + (y - point.y) ** 2 <= (r + 0.5) ** 2)
        tiles[y * W + x] = value;
}
export function paintShape(
  tiles: number[],
  from: EditorPoint,
  to: EditorPoint,
  mode: PaintMode,
  value: number,
  size: number,
  square = false,
) {
  if (mode === "brush" || mode === "line") {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      paintBrush(
        tiles,
        {
          x: Math.round(from.x + (to.x - from.x) * t),
          y: Math.round(from.y + (to.y - from.y) * t),
        },
        value,
        size,
        square,
      );
    }
    return;
  }
  const left = Math.min(from.x, to.x),
    right = Math.max(from.x, to.x),
    top = Math.min(from.y, to.y),
    bottom = Math.max(from.y, to.y);
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2,
    rx = (right - left + 1) / 2,
    ry = (bottom - top + 1) / 2;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++)
      if (
        mode === "rectangle" ||
        ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
      )
        tiles[y * W + x] = value;
}
