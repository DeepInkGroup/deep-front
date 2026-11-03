import { readFile, writeFile } from "node:fs/promises";

// Keep the existing six atlas columns pixel-identical and append the vector
// economy icons. SVG composition needs no native image tools on hosting services.
const original = await readFile(
  new URL("../resources/atlases/icon-atlas.png", import.meta.url),
);
const icons = [
  "OilFactory",
  "CopperMine",
  "LogisticsCenter",
  "CustomsOffice",
  "BunkerMissileSite",
  "CIWSDefense",
  "StraitControlStation",
  "PowerPlant",
  "MissileFactory",
];
let appended = "";
for (const [index, name] of icons.entries()) {
  const icon = await readFile(
    new URL(`../resources/images/${name}IconWhite.svg`, import.meta.url),
    "utf8",
  );
  const body = icon
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  appended += `<svg x="${384 + index * 64}" width="64" height="64" viewBox="0 0 64 64">${body}</svg>`;
}
const width = 384 + icons.length * 64;
await writeFile(
  new URL("../resources/atlases/structure-atlas.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64" viewBox="0 0 ${width} 64"><image width="384" height="64" href="data:image/png;base64,${original.toString("base64")}"/>${appended}</svg>\n`,
);
// Append a 6px tanker to the 5px regular boats, preserving existing columns.
const unitAtlas = await readFile(
  new URL("../resources/atlases/unit-atlas.png", import.meta.url),
);
const tanker = await readFile(
  new URL("../resources/sprites/oiltanker.svg", import.meta.url),
  "utf8",
);
const tankerBody = tanker
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");
await writeFile(
  new URL("../resources/atlases/mobile-atlas.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="169" height="13"><image width="156" height="13" href="data:image/png;base64,${unitAtlas.toString("base64")}"/><svg x="159" y="3" width="6" height="6" viewBox="0 0 6 6">${tankerBody}</svg></svg>\n`,
);
