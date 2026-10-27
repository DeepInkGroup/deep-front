import type { MapDraft } from "@openfront/engine-api/game/CommunityMaps";
import { noise } from "./CatalogTerrain";

type Continent = readonly [number, number, number, number, number];
type Point = readonly [number, number];
interface World {
  name: string;
  description: string;
  seed: number;
  continents: readonly Continent[];
  rivers: readonly (readonly Point[])[];
  realms: string[];
}

function segmentDistance(x: number, y: number, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

/** Original continental layouts, sampled at Ultra detail with reproducible relief. */
function colossalWorld(world: World): MapDraft {
  const width = 512,
    height = 384;
  const tiles = Array<number>(width * height).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const bx = x / 4,
        by = y / 4;
      const nx = bx + (noise(bx / 9, by / 9, world.seed) - 0.5) * 5;
      const ny = by + (noise(bx / 9, by / 9, world.seed + 1) - 0.5) * 5;
      let interior = -Infinity;
      for (const [cx, cy, rx, ry, angle] of world.continents) {
        const dx = nx - cx,
          dy = ny - cy;
        const u = dx * Math.cos(angle) + dy * Math.sin(angle);
        const v = dy * Math.cos(angle) - dx * Math.sin(angle);
        interior = Math.max(interior, 1 - Math.hypot(u / rx, v / ry));
      }
      const coast =
        (noise(bx / 2.4, by / 2.4, world.seed + 2) - 0.5) * 0.14 +
        (noise(bx / 0.65, by / 0.65, world.seed + 3) - 0.5) * 0.045;
      if (interior + coast < 0) continue;
      const ridge = Math.abs(
        Math.sin(
          bx * 0.18 + noise(bx / 13, by / 13, world.seed + 4) * 6 + by * 0.12,
        ),
      );
      const highland = noise(bx / 11, by / 11, world.seed + 5);
      let terrain =
        interior > 0.15 && highland > 0.54 && ridge > 0.77
          ? 3
          : interior > 0.08 && highland > 0.42 && ridge > 0.4
            ? 2
            : 1;
      for (const river of world.rivers) {
        let distance = Infinity;
        const bend = (noise(bx / 2, by / 2, world.seed + 6) - 0.5) * 0.55;
        for (let i = 1; i < river.length; i++)
          distance = Math.min(
            distance,
            segmentDistance(bx + bend, by - bend, river[i - 1], river[i]),
          );
        if (distance < 0.23) terrain = 0;
        else if (distance < 1.1 && terrain !== 0) terrain = 1;
      }
      tiles[y * width + x] = terrain;
    }

  // Farthest-point placement gives every realm breathing room on solid land.
  const candidates: { x: number; y: number }[] = [];
  for (let y = 8; y < height - 8; y += 4)
    for (let x = 8; x < width - 8; x += 4)
      if (
        [-5, 0, 5].every((dy) =>
          [-5, 0, 5].every((dx) => tiles[(y + dy) * width + x + dx] > 0),
        )
      )
        candidates.push({ x, y });
  const nations: MapDraft["nations"] = [];
  for (const name of world.realms) {
    let best = -1,
      score = -1;
    for (let i = 0; i < candidates.length; i++) {
      const point = candidates[i];
      const spacing = nations.length
        ? Math.min(
            ...nations.map((n) => (n.x - point.x) ** 2 + (n.y - point.y) ** 2),
          )
        : 1 + noise(point.x / 31, point.y / 31, world.seed + 7);
      if (spacing > score) {
        best = i;
        score = spacing;
      }
    }
    if (best < 0) throw new Error(`No safe spawn for ${name}`);
    nations.push({ name, ...candidates.splice(best, 1)[0] });
  }
  return {
    name: world.name,
    description: `${world.description} A colossal 5120 x 3840 world with 24 named realms. Build By Artin Zomorodian.`,
    scale: 40,
    gridWidth: 512,
    tiles,
    nations,
  };
}

const WORLDS: World[] = [
  {
    name: "The Silk Road: Great Expanse",
    description:
      "A fictional continental atlas inspired by ancient trade routes: a vast northern heartland, southern peninsulas, inland seas and an eastern island arc. Unite fertile river valleys or control the ocean passages.",
    seed: 82491,
    continents: [
      [31, 29, 28, 19, -0.2],
      [66, 24, 30, 18, 0.1],
      [96, 34, 22, 22, -0.3],
      [20, 63, 15, 25, -0.25],
      [52, 63, 16, 22, 0.2],
      [83, 67, 12, 19, -0.3],
      [105, 80, 14, 10, 0.1],
      [120, 57, 3, 7, -0.3],
      [114, 67, 3, 4, 0.2],
    ],
    rivers: [
      [
        [29, 20],
        [33, 28],
        [29, 36],
        [30, 44],
        [36, 50],
      ],
      [
        [67, 16],
        [62, 27],
        [65, 37],
        [60, 44],
      ],
      [
        [96, 25],
        [101, 33],
        [97, 44],
        [100, 53],
      ],
      [
        [20, 52],
        [18, 62],
        [22, 72],
        [22, 86],
      ],
      [
        [53, 48],
        [49, 58],
        [54, 69],
        [54, 85],
      ],
    ],
    realms: [
      "Jade Court",
      "Saffron Gate",
      "Amber Steppe",
      "Silk Haven",
      "Lapis Reach",
      "Dawn Caravan",
      "Ivory Basin",
      "Cedar Crown",
      "Golden Delta",
      "Copper March",
      "Pearl Coast",
      "Indigo Vale",
      "Caspian Dream",
      "Salt Kingdom",
      "Opal Bay",
      "Sunforge",
      "Eastern Lantern",
      "River Throne",
      "High Plateau",
      "Lotus Shore",
      "Winter Gate",
      "Ember Caravan",
      "Mosaic Isle",
      "Last Oasis",
    ],
  },
  {
    name: "Leviathan Isles",
    description:
      "A sprawling maritime fantasy of rugged island kingdoms, sheltered lagoons and an open central ocean. Long shipping lanes and narrow island passages make ports and naval alliances essential.",
    seed: 39173,
    continents: [
      [20, 20, 16, 12, -0.4],
      [49, 16, 12, 9, 0.2],
      [82, 18, 15, 12, -0.1],
      [111, 24, 12, 18, -0.2],
      [19, 54, 12, 17, 0.3],
      [48, 45, 11, 12, -0.2],
      [78, 49, 12, 10, 0.4],
      [109, 66, 13, 12, 0.1],
      [26, 83, 16, 9, 0.2],
      [59, 77, 12, 12, -0.4],
      [84, 84, 9, 7, 0],
      [66, 32, 3, 3, 0],
      [96, 40, 3, 4, 0],
      [34, 38, 3, 3, 0],
      [40, 66, 3, 3, 0],
      [92, 65, 3, 3, 0],
    ],
    rivers: [
      [
        [16, 14],
        [21, 20],
        [18, 29],
      ],
      [
        [110, 11],
        [108, 21],
        [114, 30],
        [110, 42],
      ],
      [
        [17, 44],
        [21, 54],
        [18, 69],
      ],
      [
        [56, 69],
        [61, 77],
        [58, 89],
      ],
    ],
    realms: [
      "Leviathan Crown",
      "Coral Haven",
      "Whalebone Reach",
      "Sapphire Port",
      "Tempest Isle",
      "Reefwatch",
      "Saltspire",
      "Moonwake",
      "Seaglass Court",
      "Turtle Bay",
      "Pearl Dominion",
      "Wavebreaker",
      "Mariner's Rest",
      "Drowned Star",
      "Azure Lantern",
      "Foamguard",
      "Deep Anchorage",
      "Pelican Coast",
      "Mist Harbor",
      "Tideforge",
      "Emerald Sound",
      "Blue Horizon",
      "Stormglass",
      "Last Lighthouse",
    ],
  },
  {
    name: "Riftlands: Twin Horizons",
    description:
      "Two immense rival continents divided by a winding ocean rift, with southern island chains and river-cut interiors. Build continental rail empires while contesting cross-ocean trade and the rift's chokepoints.",
    seed: 71403,
    continents: [
      [27, 22, 20, 16, -0.2],
      [32, 47, 24, 23, 0.15],
      [23, 72, 18, 17, -0.2],
      [94, 21, 25, 15, 0.1],
      [96, 46, 21, 22, -0.2],
      [102, 70, 18, 16, 0.3],
      [50, 84, 8, 6, 0.2],
      [68, 78, 7, 8, -0.2],
      [80, 88, 5, 4, 0],
      [62, 18, 4, 5, 0.1],
      [63, 50, 4, 3, 0],
    ],
    rivers: [
      [
        [27, 15],
        [23, 25],
        [30, 36],
        [26, 49],
        [33, 58],
        [24, 70],
        [24, 88],
      ],
      [
        [10, 42],
        [20, 44],
        [26, 49],
        [39, 46],
        [54, 50],
      ],
      [
        [94, 12],
        [99, 22],
        [91, 35],
        [98, 48],
        [92, 62],
        [101, 72],
        [100, 86],
      ],
      [
        [77, 43],
        [85, 48],
        [98, 48],
        [109, 53],
        [119, 52],
      ],
    ],
    realms: [
      "Westreach",
      "Eastreach",
      "Iron Divide",
      "Green March",
      "Obsidian Court",
      "Silver Basin",
      "Redwater",
      "Stonehaven",
      "Frost Meridian",
      "Riftwatch",
      "Gilded Shore",
      "Wild Frontier",
      "Dawn Citadel",
      "Dusk Citadel",
      "Riverguard",
      "Cinder Plateau",
      "Willow Kingdom",
      "Cobalt Reach",
      "Crosswind",
      "Black Pearl",
      "South Lantern",
      "Far Passage",
      "Hollow Crown",
      "Twin Harbors",
    ],
  },
];

export function colossalMaps() {
  return WORLDS.map((world, index) => ({
    id: `a370000${index + 4}-2026-4000-8000-000000000001`,
    legacyId: undefined,
    draft: colossalWorld(world),
  }));
}
