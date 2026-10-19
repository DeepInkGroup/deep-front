import {
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
  type MapDraft,
} from "@openfront/engine-api/game/CommunityMaps";
import { refineCatalogTerrain } from "./CatalogTerrain";

type Point = readonly [number, number];

// Hand-drawn, stylized geography. These are original community maps, not
// political boundary data or replacements for the built-in regional maps.
class Atlas {
  readonly tiles: number[];
  readonly nations: MapDraft["nations"] = [];
  constructor(fill = 0) {
    this.tiles = Array(W * H).fill(fill);
  }
  polygon(points: readonly Point[], terrain: number, landOnly = false) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [ax, ay] = points[i],
            [bx, by] = points[j];
          if (
            ay > y + 0.5 !== by > y + 0.5 &&
            x + 0.5 < ((bx - ax) * (y + 0.5 - ay)) / (by - ay) + ax
          )
            inside = !inside;
        }
        if (inside && (!landOnly || this.tiles[y * W + x]))
          this.tiles[y * W + x] = terrain;
      }
    return this;
  }
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    terrain: number,
    landOnly = false,
  ) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (
          ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 &&
          (!landOnly || this.tiles[y * W + x])
        )
          this.tiles[y * W + x] = terrain;
    return this;
  }
  nation(name: string, x: number, y: number) {
    if (!this.tiles[y * W + x])
      throw new Error(`Catalog spawn on water: ${name}`);
    this.nations.push({ name, x, y });
    return this;
  }
  draft(name: string, description: string): MapDraft {
    return {
      name,
      description: `${description} Build By Artin Zomorodian.`,
      scale: 16,
      tiles: this.tiles,
      nations: this.nations,
    };
  }
}

function iran(): MapDraft {
  const a = new Atlas(1);
  // Caspian basin, Persian Gulf, Hormuz and the open Gulf of Oman.
  a.polygon(
    [
      [37, 0],
      [65, 0],
      [67, 9],
      [64, 18],
      [67, 26],
      [62, 32],
      [54, 34],
      [45, 30],
      [41, 22],
      [39, 12],
    ],
    0,
  );
  a.polygon(
    [
      [0, 53],
      [12, 55],
      [23, 59],
      [32, 65],
      [43, 69],
      [57, 75],
      [69, 78],
      [78, 73],
      [86, 74],
      [94, 79],
      [110, 78],
      [128, 74],
      [128, 96],
      [0, 96],
    ],
    0,
  );
  // Arabian coast leaves a narrow, navigable Hormuz passage near the east.
  a.polygon(
    [
      [0, 74],
      [14, 73],
      [29, 79],
      [44, 86],
      [59, 88],
      [72, 85],
      [77, 81],
      [79, 77],
      [82, 80],
      [85, 87],
      [98, 96],
      [0, 96],
    ],
    2,
  );
  a.polygon(
    [
      [9, 10],
      [22, 6],
      [31, 14],
      [34, 24],
      [43, 39],
      [53, 48],
      [66, 60],
      [69, 68],
      [61, 68],
      [49, 57],
      [40, 51],
      [29, 34],
      [21, 28],
      [15, 19],
    ],
    2,
    true,
  );
  a.polygon(
    [
      [20, 12],
      [24, 10],
      [28, 17],
      [32, 27],
      [37, 32],
      [34, 36],
      [29, 28],
      [26, 24],
    ],
    3,
    true,
  );
  a.polygon(
    [
      [43, 35],
      [57, 37],
      [67, 33],
      [80, 32],
      [86, 36],
      [80, 40],
      [67, 40],
      [55, 42],
    ],
    2,
    true,
  );
  a.ellipse(85, 48, 24, 12, 2, true).ellipse(102, 63, 19, 9, 2, true);
  a.ellipse(21, 18, 2, 4, 0).ellipse(75, 80, 4, 1, 1).ellipse(67, 82, 1, 1, 1);
  a.nation("Tabriz", 27, 17)
    .nation("Tehran", 62, 38)
    .nation("Rasht", 48, 34)
    .nation("Mashhad", 102, 27)
    .nation("Isfahan", 57, 51)
    .nation("Shiraz", 61, 65)
    .nation("Ahvaz", 30, 53)
    .nation("Kerman", 88, 64)
    .nation("Bandar Abbas", 78, 71)
    .nation("Zahedan", 111, 65)
    .nation("Baghdad", 13, 40)
    .nation("Muscat", 90, 92);
  return a.draft(
    "Iran: Caspian to Hormuz",
    "A stylized Iranian heartland, from the Caspian coast and Zagros corridors to the Persian Gulf. Secure Hormuz, link inland cities, and contest the southern islands. 12 regional spawns.",
  );
}

function middleEast(): MapDraft {
  const a = new Atlas(2);
  // Mediterranean, Black Sea and Caspian coastlines.
  a.polygon(
    [
      [0, 16],
      [17, 16],
      [20, 19],
      [31, 18],
      [35, 22],
      [34, 28],
      [38, 32],
      [38, 44],
      [33, 48],
      [28, 44],
      [23, 43],
      [0, 43],
    ],
    0,
  );
  a.polygon(
    [
      [10, 0],
      [63, 0],
      [60, 8],
      [51, 12],
      [43, 10],
      [32, 12],
      [24, 8],
      [13, 7],
    ],
    0,
  );
  a.polygon(
    [
      [72, 0],
      [85, 0],
      [84, 10],
      [87, 17],
      [83, 24],
      [77, 24],
      [73, 19],
      [74, 10],
    ],
    0,
  );
  // Red Sea connects around Bab el-Mandeb to the Gulf of Aden and Indian Ocean.
  a.polygon(
    [
      [31, 48],
      [35, 49],
      [40, 59],
      [44, 67],
      [50, 77],
      [55, 83],
      [60, 85],
      [68, 82],
      [86, 79],
      [100, 77],
      [114, 69],
      [128, 66],
      [128, 96],
      [59, 96],
      [53, 86],
      [48, 84],
      [43, 75],
      [38, 67],
      [34, 57],
    ],
    0,
  );
  a.polygon(
    [
      [61, 41],
      [64, 40],
      [69, 45],
      [73, 50],
      [80, 52],
      [86, 53],
      [90, 51],
      [94, 54],
      [100, 57],
      [110, 59],
      [128, 58],
      [128, 75],
      [115, 76],
      [107, 70],
      [98, 65],
      [93, 60],
      [87, 57],
      [79, 58],
      [72, 55],
      [67, 49],
    ],
    0,
  );
  // Fertile Crescent, Anatolia and Iranian highlands.
  a.polygon(
    [
      [14, 13],
      [31, 12],
      [44, 14],
      [51, 19],
      [60, 23],
      [62, 32],
      [59, 42],
      [52, 42],
      [48, 32],
      [40, 28],
      [36, 23],
      [22, 24],
    ],
    1,
    true,
  );
  a.polygon(
    [
      [42, 28],
      [49, 28],
      [57, 36],
      [65, 44],
      [64, 49],
      [56, 44],
      [51, 38],
      [45, 36],
    ],
    1,
    true,
  );
  a.polygon(
    [
      [62, 14],
      [69, 17],
      [73, 28],
      [82, 33],
      [89, 41],
      [85, 45],
      [74, 35],
      [68, 28],
    ],
    3,
    true,
  );
  a.ellipse(102, 35, 20, 14, 1, true).ellipse(30, 69, 5, 17, 1, true);
  a.polygon(
    [
      [28, 61],
      [32, 63],
      [34, 79],
      [29, 85],
      [27, 76],
    ],
    1,
    true,
  );
  a.ellipse(30, 29, 3, 1, 1).ellipse(79, 56, 1, 1, 1);
  a.nation("Anatolia", 33, 17)
    .nation("Levant", 40, 35)
    .nation("Mesopotamia", 54, 38)
    .nation("Iran", 82, 37)
    .nation("Caucasus", 65, 12)
    .nation("Egypt", 25, 49)
    .nation("Arabia", 56, 64)
    .nation("Yemen", 55, 79)
    .nation("Oman", 85, 67)
    .nation("Nubia", 27, 77)
    .nation("Horn of Africa", 48, 92)
    .nation("Balochistan", 112, 48);
  return a.draft(
    "Middle East: Crossroads",
    "A stylized regional campaign linking the Mediterranean, Red Sea and Persian Gulf. Three sea lanes, fertile river corridors and desert interiors reward ports, diplomacy and control of chokepoints. 12 regional spawns.",
  );
}

function fantasy(): MapDraft {
  const a = new Atlas();
  const island = (
    x: number,
    y: number,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ) => 1 - Math.hypot((x - cx) / rx, (y - cy) / ry);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = x + Math.sin(y * 0.36) * 1.3 + Math.sin(y * 0.91) * 0.45;
      const ny = y + Math.sin(x * 0.29) * 1.5 + Math.sin(x * 0.83) * 0.5;
      const shape = Math.max(
        island(nx, ny, 22, 20, 19, 14),
        island(nx, ny, 35, 29, 14, 11),
        island(nx, ny, 98, 21, 23, 14),
        island(nx, ny, 82, 27, 14, 12),
        island(nx, ny, 22, 67, 18, 22),
        island(nx, ny, 37, 56, 13, 11),
        island(nx, ny, 95, 73, 23, 18),
        island(nx, ny, 83, 54, 15, 12),
      );
      if (shape < 0) continue;
      const ridge =
        Math.sin(nx * 0.24 + Math.sin(ny * 0.25) * 2) * Math.cos(ny * 0.19);
      a.tiles[y * W + x] =
        shape > 0.2 && ridge > 0.45 ? 3 : shape > 0.08 && ridge > -0.1 ? 2 : 1;
    }
  a.ellipse(58, 48, 8, 6, 1)
    .ellipse(59, 46, 3, 2, 2)
    .ellipse(20, 64, 3, 3, 0)
    .ellipse(104, 59, 3, 4, 0);
  for (const [x, y, rx, ry] of [
    [8, 41, 3, 2],
    [57, 11, 2, 3],
    [120, 44, 3, 4],
    [59, 83, 4, 2],
    [63, 69, 2, 2],
    [59, 28, 2, 2],
    [51, 71, 2, 2],
    [68, 34, 2, 1],
    [56, 62, 1, 2],
    [70, 81, 2, 1],
    [9, 88, 2, 1],
  ])
    a.ellipse(x, y, rx, ry, 1);
  a.nation("Ashen Vale", 19, 14)
    .nation("Verdant Reach", 36, 23)
    .nation("Frostspire", 96, 21)
    .nation("Dawnwatch", 112, 26)
    .nation("Amber Coast", 19, 56)
    .nation("Duskwood", 30, 79)
    .nation("Sunken Crown", 58, 48)
    .nation("Stormhold", 83, 54)
    .nation("Emberlands", 96, 77)
    .nation("Saltwind", 110, 80)
    .nation("Tideward", 59, 83)
    .nation("Far Lantern", 120, 44);
  return a.draft(
    "Shattered Crown",
    "A remastered fantasy atlas of four rugged continents, a contested central crown and scattered outer islands. Winding rivers, sheltered bays, inland lakes and narrow sea passages reward rival rail and maritime empires. 12 fictional realms.",
  );
}

export const CATALOG_AUTHOR = "Artin Zomorodian";
export function catalogMaps() {
  return [
    {
      id: "a3700001-2026-4000-8000-000000000101",
      legacyId: "a3700001-2026-4000-8000-000000000001",
      draft: refineCatalogTerrain(iran(), 813, [
        [
          [43, 37],
          [40, 42],
          [36, 46],
          [35, 51],
          [30, 54],
          [26, 60],
        ],
        [
          [20, 29],
          [18, 36],
          [19, 43],
          [23, 50],
          [25, 58],
        ],
        [
          [50, 32],
          [49, 34],
          [48, 36],
        ],
      ]),
    },
    {
      id: "a3700002-2026-4000-8000-000000000102",
      legacyId: "a3700002-2026-4000-8000-000000000002",
      draft: refineCatalogTerrain(middleEast(), 1729, [
        [
          [31, 81],
          [29, 71],
          [31, 61],
          [29, 51],
          [29, 44],
        ],
        [
          [49, 26],
          [50, 32],
          [54, 38],
          [58, 42],
          [64, 47],
        ],
        [
          [43, 27],
          [45, 31],
          [45, 36],
          [51, 40],
          [58, 42],
        ],
      ]),
    },
    {
      id: "a3700003-2026-4000-8000-000000000103",
      legacyId: "a3700003-2026-4000-8000-000000000003",
      draft: refineCatalogTerrain(fantasy(), 9017, [
        [
          [27, 14],
          [28, 19],
          [24, 22],
          [24, 28],
          [20, 33],
        ],
        [
          [97, 16],
          [94, 23],
          [98, 27],
          [99, 34],
        ],
        [
          [25, 56],
          [25, 61],
          [29, 66],
          [28, 72],
          [32, 80],
          [33, 87],
        ],
        [
          [93, 58],
          [90, 64],
          [94, 71],
          [98, 76],
          [99, 87],
        ],
      ]),
    },
  ];
}
