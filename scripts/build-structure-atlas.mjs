import { readFile, writeFile } from "node:fs/promises";

// Keep the existing six atlas columns pixel-identical and append the vector
// pumpjack. SVG composition needs no native image tools on hosting services.
const original = await readFile(
  new URL("../resources/atlases/icon-atlas.png", import.meta.url),
);
const oil = await readFile(
  new URL("../resources/images/OilFactoryIconWhite.svg", import.meta.url),
  "utf8",
);
const oilBody = oil
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");
await writeFile(
  new URL("../resources/atlases/structure-atlas.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="448" height="64" viewBox="0 0 448 64"><image width="384" height="64" href="data:image/png;base64,${original.toString("base64")}"/><svg x="384" width="64" height="64" viewBox="0 0 64 64">${oilBody}</svg></svg>\n`,
);
