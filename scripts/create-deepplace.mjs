import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// Original, deterministic terrain. Blue values follow map-generator's PNG protocol.
// Rebuild: node scripts/create-deepplace.mjs
// Then: cd map-generator && go run -tags nodynamic . --maps=deepplace
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "map-generator/assets/maps/deepplace");
const width = 2048,
  height = 1440;
function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, scale) {
  x /= scale;
  y /= scale;
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u;
  const b = hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u;
  return a * (1 - v) + b * v;
}
const continents = [
  [530, 420, 440, 295],
  [725, 510, 310, 340],
  [485, 1060, 365, 245],
  [765, 1040, 255, 275],
  [1490, 430, 370, 290],
  [1450, 710, 400, 335],
  [1530, 1080, 350, 240],
  [1260, 1070, 230, 260],
];
const islands = [
  [240, 710, 60, 87],
  [100, 900, 42, 74],
  [1000, 220, 64, 44],
  [1100, 470, 38, 70],
  [1030, 1130, 38, 62],
  [940, 1310, 69, 38],
  [1860, 750, 57, 87],
  [1910, 930, 48, 62],
  [1750, 1320, 74, 42],
  [1220, 130, 80, 42],
  [1660, 110, 83, 38],
];
function ellipse(x, y, [cx, cy, rx, ry]) {
  return 1 - Math.hypot((x - cx) / rx, (y - cy) / ry);
}
const blue = new Uint8Array(width * height);
const pixels = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const wx = x + (noise(x + 500, y, 150) - 0.5) * 105;
    const wy = y + (noise(x, y + 300, 130) - 0.5) * 90;
    const coast =
      (noise(x, y, 70) - 0.5) * 0.13 + (noise(x, y, 19) - 0.5) * 0.055;
    let field = Math.max(...continents.map((e) => ellipse(wx, wy, e))) + coast;
    field = Math.max(field, ...islands.map((e) => ellipse(wx, wy, e) + coast));
    // Deep Strait divides the eastern and western continents from ocean to ocean.
    const straitX = 1070 + 52 * Math.sin(y / 150) + 25 * Math.sin(y / 73);
    const straitHalfWidth = 28 + 14 * (1 + Math.sin(y / 170));
    if (Math.abs(x - straitX) < straitHalfWidth) field = -1;
    // Two cross passages make four continental shores and defensible headlands.
    const westPassage = 800 + 32 * Math.sin(x / 130);
    const eastPassage = 900 + 40 * Math.sin(x / 180);
    if (x < straitX && Math.abs(y - westPassage) < 22 + 5 * Math.sin(x / 80))
      field = -1;
    if (x > straitX && Math.abs(y - eastPassage) < 25 + 6 * Math.sin(x / 95))
      field = -1;
    // Sheltered inland seas and a long western gulf, connected to the open sea.
    const gulf = Math.hypot((x - 335) / 100, (y - 410) / 125);
    if (gulf < 1 || (x < 335 && Math.abs(y - 420) < 28)) field = -1;
    const bay = Math.hypot((x - 1600) / 95, (y - 520) / 130);
    if (bay < 1 || (x > 1600 && Math.abs(y - 540) < 35)) field = -1;
    const land = field > 0;
    const ridge = Math.max(
      0,
      1 - Math.abs(Math.sin(x / 180 + y / 210 + noise(x, y, 240) * 2)) * 5,
    );
    const inland = Math.min(1, Math.max(0, field) * 7);
    const elevation = Math.min(
      30,
      Math.round(inland * (3 + 8 * noise(x, y, 110) + 21 * ridge)),
    );
    const b = land ? 140 + 2 * elevation : 106;
    blue[y * width + x] = b;
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    pixels[offset] = land ? 90 + elevation * 2 : 24;
    pixels[offset + 1] = land ? 125 + elevation : 66;
    pixels[offset + 2] = b;
  }
}
const nations = [
  ["Northreach", 470, 260],
  ["Veyra", 780, 360],
  ["Westhaven", 470, 600],
  ["Stonegate", 830, 665],
  ["Ember Coast", 330, 1030],
  ["Alderfall", 730, 1110],
  ["Dawnspire", 1410, 300],
  ["Eastwatch", 1720, 390],
  ["Copper Vale", 1370, 690],
  ["Tidehold", 1710, 760],
  ["Southdeep", 1250, 1130],
  ["Ashen Reach", 1610, 1140],
].map(([name, x, y]) => {
  if (blue[y * width + x] === 106) throw new Error(`Nation ${name} is at sea`);
  return { name, coordinates: [x, y], flag: "" };
});
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const b of body) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(body.length + 8);
  result.writeUInt32BE(data.length);
  body.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "image.png"), png);
fs.writeFileSync(
  path.join(out, "info.json"),
  JSON.stringify(
    {
      id: "DeepPlace",
      name: "DeepPlace",
      translation_key: "map.deepplace",
      categories: ["fictional", "new"],
      multiplayer_frequency: 4,
      nations,
      custom_tribes: [
        "Straitwardens",
        "Cinder Isles",
        "Deepwater",
        "Mist Coast",
        "Ironwood",
        "Saltmarch",
        "Highwind",
        "Moonharbor",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `DeepPlace: ${width} × ${height}, ${blue.filter((b) => b !== 106).length.toLocaleString()} land tiles; ${out}`,
);
