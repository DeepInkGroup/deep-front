import { deflateSync } from "node:zlib";

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function chunk(name: string, bytes: Buffer) {
  const data = Buffer.concat([Buffer.from(name), bytes]);
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const header = Buffer.alloc(4),
    footer = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, data, footer]);
}

/** Compact shaded-relief overview, generated from the actual playable terrain. */
export function terrainThumbnail(
  terrain: Uint8Array,
  width: number,
  height: number,
) {
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  const level = (x: number, y: number) =>
    terrain[
      Math.max(0, Math.min(height - 1, y)) * width +
        Math.max(0, Math.min(width - 1, x))
    ] & 31;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const tile = terrain[y * width + x],
        h = tile & 31;
      const land = !!(tile & 128);
      let color: number[];
      if (!land) {
        const depth = Math.min(1, h / 16);
        color = [53 - depth * 30, 124 - depth * 60, 145 - depth * 52];
      } else if (tile & 64) color = [208, 202, 156];
      else {
        const stops = [
          [121, 156, 100],
          [153, 168, 112],
          [171, 157, 121],
          [211, 207, 191],
          [238, 236, 226],
        ];
        const v = Math.min(3.999, (h / 31) * 4),
          i = Math.floor(v),
          t = v - i;
        color = stops[i].map(
          (value, c) => value + (stops[i + 1][c] - value) * t,
        );
        const shade = (level(x - 1, y - 1) - level(x + 1, y + 1)) * 2.2;
        const grain =
          (((Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0) % 7) - 3;
        color = color.map((c) => Math.max(0, Math.min(255, c + shade + grain)));
      }
      const index = y * (width * 3 + 1) + 1 + x * 3;
      color.forEach((c, i) => {
        pixels[index + i] = Math.round(c);
      });
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString("base64")}"/></svg>`;
}
