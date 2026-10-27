import fs from "node:fs";
import path from "node:path";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { CommunityStore } from "../../src/server/community/Store";
import {
  catalogMaps,
  CATALOG_AUTHOR,
} from "../../src/server/community/CatalogMaps";
import {
  createCommunityRouter,
  rejectAdminUpgrade,
} from "../../src/server/community/Routes";
import {
  compileDraft,
  validateDraft,
} from "../../src/server/community/MapCompiler";
import {
  worldTemplate,
  WORLD_TEMPLATES,
  terrainStats,
} from "../../src/client/community/MapDesign";
import {
  communityMapKey,
  MapDraft,
  MAP_EDITOR_WIDTH as W,
  MAP_EDITOR_HEIGHT as H,
} from "@openfront/engine-api/game/CommunityMaps";
import { GameMapSize } from "@openfront/engine-api/game/GameTypes";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import giantWorld from "../../resources/maps/giantworldmap/manifest.json";
import {
  encodeServerMessage,
  decodeServerMessage,
} from "@openfront/shared/ZbinWire";

function draft(): MapDraft {
  const tiles = Array(W * H).fill(0);
  for (let y = 10; y < 85; y++)
    for (let x = 10; x < 115; x++)
      if (x < 60 || x > 65) tiles[y * W + x] = x < 35 ? 1 : x < 90 ? 2 : 3;
  return {
    name: "A creator's strait",
    description: "Two continents and an open sea channel.",
    scale: 8,
    tiles,
    nations: [
      { name: "Northland", x: 30, y: 40 },
      { name: "Eastland", x: 85, y: 50 },
    ],
  };
}
let folder: string, store: CommunityStore;
beforeEach(() => {
  fs.mkdirSync(".tmp", { recursive: true });
  folder = fs.mkdtempSync(path.resolve(".tmp/community-test-"));
  store = new CommunityStore(folder);
});
afterEach(() => {
  store.close();
  if (!folder.startsWith(path.resolve(".tmp") + path.sep))
    throw new Error("Unsafe test directory");
  fs.rmSync(folder, { recursive: true, force: true });
});

describe("community accounts and durable storage", () => {
  it("installs six credited, playable release maps once and preserves moderation across restarts", () => {
    store.installCatalogMaps();
    const published = store.listMaps("published");
    expect(published).toHaveLength(6);
    expect(
      new Set(catalogMaps().map(({ draft }) => JSON.stringify(draft.tiles)))
        .size,
    ).toBe(6);
    for (const { id, draft } of catalogMaps()) {
      expect(validateDraft(draft)).toEqual(draft);
      const colossal = draft.scale === 40;
      expect(draft.nations).toHaveLength(colossal ? 24 : 12);
      expect(draft.description).toContain("Build By Artin Zomorodian");
      expect(published.find((m) => m.id === id)).toMatchObject({
        author: CATALOG_AUTHOR,
        width: colossal ? 5120 : 2048,
        height: colossal ? 3840 : 1536,
        status: "approved",
      });
      const manifest = JSON.parse(store.asset(id, "manifest.json")!.toString());
      expect(manifest.nations).toHaveLength(colossal ? 24 : 12);
      if (colossal) {
        expect(manifest.map.width).toBeGreaterThan(giantWorld.map.width);
        expect(manifest.map.height).toBeGreaterThan(giantWorld.map.height);
        expect(manifest.map.num_land_tiles).toBeGreaterThan(
          giantWorld.map.num_land_tiles,
        );
      }
      const terrain = store.asset(id, "map.bin")!;
      expect(terrain.length).toBe(manifest.map.width * manifest.map.height);
      for (const {
        coordinates: [x, y],
      } of manifest.nations)
        expect(terrain[y * manifest.map.width + x] & 128).toBe(128);
    }
    const withdrawn = published[0].id;
    store.withdraw(withdrawn, "Admin");
    store.close();
    store = new CommunityStore(folder);
    store.installCatalogMaps();
    expect(store.listMaps("published")).toHaveLength(5);
    expect(store.listMaps("admin")).toHaveLength(6);
    expect(
      store
        .dashboard()
        .activity.filter((a) => a.action === "Catalog map published"),
    ).toHaveLength(6);
    expect(store.users()).toHaveLength(1);
    store.republish(withdrawn, "Admin");
    expect(store.isPublished(withdrawn)).toBe(true);
  }, 120_000);
  it("migrates an existing database without changing accounts, sessions or drafts", () => {
    const author = store.createUser("ExistingMaker", "password123"),
      token = store.createSession(author.id);
    const map = store.submit(author, draft());
    store.db.exec(
      "ALTER TABLE users DROP COLUMN last_login_at; DROP TABLE activity;",
    );
    store.close();
    store = new CommunityStore(folder);
    expect(store.session(token)?.id).toBe(author.id);
    expect(store.draft(map.id, author)).toEqual(draft());
    expect(
      store.dashboard().users.find((u) => u.id === author.id)?.lastLoginAt,
    ).toBeNull();
    expect(store.authenticate("Admin", "Admin123")?.role).toBe("admin");
  });
  it("upgrades first-edition catalog maps without losing old replay assets or reversing moderation", () => {
    const owner = store.authenticate("Admin", "Admin123")!;
    const entries = catalogMaps().filter(
      (entry) => entry.legacyId !== undefined,
    );
    for (const [index, entry] of entries.entries()) {
      const input = draft(),
        now = Date.now();
      store.db
        .prepare(`INSERT INTO maps(id,owner_id,name,description,draft,status,created_at,scale,approved_at,author_credit)
        VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(
          entry.legacyId,
          owner.id,
          entry.draft.name,
          "First edition",
          JSON.stringify(input),
          index === 0 ? "withdrawn" : "approved",
          now,
          input.scale,
          now,
          CATALOG_AUTHOR,
        );
      store.db
        .prepare("INSERT INTO map_assets VALUES(?,?,?)")
        .run(entry.legacyId, "map.bin", Buffer.from([128, 129]));
    }
    store.installCatalogMaps();
    expect(store.listMaps("published")).toHaveLength(5);
    expect(store.listMaps("admin")).toHaveLength(9);
    for (const entry of entries) {
      expect(store.isPublished(entry.legacyId)).toBe(false);
      expect(store.asset(entry.legacyId, "map.bin")).toEqual(
        Buffer.from([128, 129]),
      );
      expect(store.draft(entry.id, owner).gridWidth).toBe(512);
    }
    expect(store.isPublished(entries[0].id)).toBe(false);
    store.installCatalogMaps();
    expect(store.listMaps("admin")).toHaveLength(9);
  }, 120_000);
  it("reports exact admin totals and profile data, revokes only the selected player's sessions, and records moderation", () => {
    const maker = store.createUser("Maker", "password123"),
      other = store.createUser("OtherMaker", "password123");
    const token = store.createSession(maker.id),
      otherToken = store.createSession(other.id);
    store.createSession(maker.id);
    const map = store.submit(maker, draft());
    expect(store.profile(maker)).toMatchObject({
      submissions: 1,
      published: 0,
      pending: 1,
      sessions: 2,
    });
    let dashboard = store.dashboard();
    expect(dashboard.stats).toMatchObject({
      accounts: 2,
      disabled: 0,
      sessions: 3,
      pending: 1,
      approved: 0,
      assetBytes: 0,
    });
    expect(dashboard.users.find((u) => u.id === maker.id)).toMatchObject({
      submissions: 1,
      sessions: 2,
      lastLoginAt: expect.any(Number),
    });
    store.revokeSessions(maker.id, "Admin");
    expect(store.session(token)).toBeNull();
    expect(store.session(otherToken)?.id).toBe(other.id);
    expect(() =>
      store.revokeSessions(
        store.authenticate("Admin", "Admin123")!.id,
        "Admin",
      ),
    ).toThrow();
    store.review(map.id, "approve", "Ready", "Admin");
    const assets = store.asset(map.id, "map.bin");
    store.withdraw(map.id, "Admin");
    expect(store.dashboard().stats.withdrawn).toBe(1);
    store.republish(map.id, "Admin");
    expect(store.asset(map.id, "map.bin")).toEqual(assets);
    expect(() => store.republish(map.id, "Admin")).toThrow();
    dashboard = store.dashboard();
    expect(dashboard.stats).toMatchObject({
      sessions: 1,
      approved: 1,
      pending: 0,
      withdrawn: 0,
    });
    expect(dashboard.stats.assetBytes).toBeGreaterThan(1024 * 768);
    expect(dashboard.activity[0]).toMatchObject({
      actor: "Admin",
      action: "Map republished",
      target: draft().name,
    });
    expect(JSON.stringify(dashboard)).not.toMatch(
      /password_hash|token_hash|salt|password123/,
    );
  });
  it("reserves the admin, hashes passwords, and keeps accounts and sessions across restart", () => {
    const admin = store.authenticate("Admin", "Admin123")!;
    expect(admin.role).toBe("admin");
    expect(() => store.createUser("ADMIN", "anotherpass")).toThrow();
    const player = store.createUser("Cartographer", "strongpass123"),
      token = store.createSession(player.id);
    const row = store.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(player.id) as any;
    expect(row.password_hash).not.toContain("strongpass123");
    expect(JSON.stringify(store.users())).not.toMatch(
      /password_hash|salt|strongpass/,
    );
    expect(store.authenticate("Cartographer", "incorrect")).toBeNull();
    expect(store.session(token)?.id).toBe(player.id);
    store.close();
    store = new CommunityStore(folder, "should-not-reset-admin");
    expect(store.session(token)?.username).toBe("Cartographer");
    expect(store.authenticate("Admin", "Admin123")?.role).toBe("admin");
    store.logout(token);
    expect(store.session(token)).toBeNull();
  });
  it("revokes sessions when an account is disabled or a password changes", () => {
    const player = store.createUser("Maker", "password123"),
      token = store.createSession(player.id);
    store.setDisabled(player.id, true);
    expect(store.session(token)).toBeNull();
    expect(store.authenticate("Maker", "password123")).toBeNull();
    store.setDisabled(player.id, false);
    const nextToken = store.createSession(player.id);
    store.changePassword(player, "password123", "replacement123");
    expect(store.session(nextToken)).toBeNull();
    expect(store.authenticate("Maker", "replacement123")?.id).toBe(player.id);
    const admin = store.authenticate("Admin", "Admin123")!;
    expect(() => store.setDisabled(admin.id, true)).toThrow();
    expect(() => store.submit(admin, draft())).toThrow(/only player/);
  });
  it("rejects administrator WebSocket upgrades and permits regular players", () => {
    const admin = store.authenticate("Admin", "Admin123")!,
      token = store.createSession(admin.id);
    const socket = { end: vi.fn() } as unknown as Duplex;
    expect(
      rejectAdminUpgrade(
        {
          headers: { cookie: `deepfront_session=${token}` },
        } as http.IncomingMessage,
        socket,
        store,
      ),
    ).toBe(true);
    expect(socket.end).toHaveBeenCalledWith(
      expect.stringContaining("403 Forbidden"),
    );
    const player = store.createUser("Player", "password123");
    expect(
      rejectAdminUpgrade(
        {
          headers: {
            cookie: `deepfront_session=${store.createSession(player.id)}`,
          },
        } as http.IncomingMessage,
        socket,
        store,
      ),
    ).toBe(false);
  });
});

describe("community map compiler and review lifecycle", () => {
  it("compiles fine image terrain at the selected world size with correct spawn coordinates and shaded previews", () => {
    const input: MapDraft = {
      name: "Image coast",
      description: "Imported map",
      gridWidth: 512,
      scale: 8,
      tiles: Array(512 * 384).fill(0),
      nations: [{ name: "Capital", x: 350, y: 200 }],
    };
    for (let y = 20; y < 360; y++)
      for (let x = 100; x < 480; x++)
        input.tiles[y * 512 + x] = x > 300 ? 2 : 1;
    const compiled = compileDraft(input);
    expect(compiled.manifest.map).toMatchObject({ width: 1024, height: 768 });
    expect(compiled.manifest.nations[0].coordinates).toEqual([701, 401]);
    expect(compiled.files["map.bin"][401 * 1024 + 701] & 128).toBe(128);
    expect(compiled.files["thumbnail.svg"].toString()).toContain(
      "data:image/png;base64,",
    );
    expect(compiled.files["thumbnail.svg"].toString()).not.toContain("<rect");
  });
  it("marks the largest sea as ocean while preserving inland lakes", () => {
    const input = draft();
    input.nations = [];
    for (let y = 30; y < 38; y++)
      for (let x = 30; x < 38; x++) input.tiles[y * W + x] = 0;
    const compiled = compileDraft(input);
    for (const [name, meta] of [
      ["map.bin", compiled.manifest.map],
      ["map4x.bin", compiled.manifest.map4x],
      ["map16x.bin", compiled.manifest.map16x],
    ] as const) {
      const data = compiled.files[name],
        cell = meta.width / W;
      expect(data[0] & (128 | 32)).toBe(32);
      expect(
        data[Math.floor(34 * cell) * meta.width + Math.floor(34 * cell)] &
          (128 | 32),
      ).toBe(0);
      expect(
        data[Math.floor(20 * cell) * meta.width + Math.floor(20 * cell)] &
          (128 | 32),
      ).toBe(128);
    }
  });
  it.each([8, 12, 16] as const)(
    "compiles %s scale terrain, accurate land counts, spawns, and open straits at both game sizes",
    async (scale) => {
      const input = { ...draft(), scale },
        compiled = compileDraft(input);
      for (const mapSize of [GameMapSize.Normal, GameMapSize.Compact]) {
        const key = communityMapKey("e12d3e3c-b485-4664-bf85-21a2e7051d91");
        const terrain = await loadTerrainMap({
          map: key,
          mapSize,
          manifest: structuredClone(compiled.manifest),
          mapBin: new Uint8Array(compiled.files["map.bin"]),
          map4xBin: new Uint8Array(compiled.files["map4x.bin"]),
          map16xBin: new Uint8Array(compiled.files["map16x.bin"]),
        });
        const expectedScale =
          mapSize === GameMapSize.Normal ? scale : scale / 2;
        expect(terrain.gameMap.width()).toBe(W * expectedScale);
        let land = 0;
        terrain.gameMap.forEachTile((t) => {
          if (terrain.gameMap.isLand(t)) land++;
        });
        expect(land).toBe(terrain.gameMap.numLandTiles());
        for (const nation of terrain.nations) {
          const [x, y] = nation.coordinates!;
          expect(terrain.gameMap.isLand(terrain.gameMap.ref(x, y))).toBe(true);
        }
        for (let y = 0; y < H * expectedScale; y++)
          expect(
            terrain.gameMap.isWater(terrain.gameMap.ref(62 * expectedScale, y)),
          ).toBe(true);
        const message = {
          type: "prestart" as const,
          gameMap: key,
          gameMapSize: mapSize,
        };
        expect(
          decodeServerMessage(
            encodeServerMessage(message, undefined),
            undefined,
          ),
        ).toEqual(message);
      }
    },
  );
  it("preserves a one-cell canal and smooths diagonal shores at Grand size", () => {
    const input = { ...draft(), scale: 16, nations: [] };
    for (let y = 0; y < H; y++) input.tiles[y * W + 45] = 0;
    const compiled = compileDraft(input);
    for (const [file, scale] of [
      ["map.bin", 16],
      ["map4x.bin", 8],
      ["map16x.bin", 4],
    ] as const) {
      const data = compiled.files[file],
        width = W * scale;
      for (let y = 0; y < H * scale; y++)
        expect(data[y * width + 45 * scale + scale / 2] & 128).toBe(0);
      // Interpolated corners no longer occupy an entire square editor cell.
      expect(data[10 * scale * width + 10 * scale] & 128).toBe(0);
      expect(
        data[(10 * scale + scale / 2) * width + 10 * scale + scale / 2] & 128,
      ).toBe(128);
    }
  });
  it("generates repeatable, varied, playable worlds for every nonblank template", () => {
    for (const preset of WORLD_TEMPLATES.filter((p) => p.id !== "blank"))
      for (const seed of [1, 42, 3571, 999999]) {
        const input = { ...worldTemplate(preset.id, seed), name: preset.name };
        expect(validateDraft(input)).toEqual(input);
        expect(input.scale).toBe(16);
        const stats = terrainStats(input);
        expect(stats.landPercent).toBeGreaterThan(15);
        expect(stats.landPercent).toBeLessThan(80);
        expect(stats.cells[2] + stats.cells[3]).toBeGreaterThan(20);
        expect(worldTemplate(preset.id, seed).tiles).toEqual(input.tiles);
        expect(worldTemplate(preset.id, seed + 1).tiles).not.toEqual(
          input.tiles,
        );
      }
  });
  it("rejects malformed terrain and invalid nation positions", () => {
    expect(() => compileDraft({ ...draft(), tiles: [1] })).toThrow();
    expect(() =>
      compileDraft({ ...draft(), tiles: Array(W * H).fill(0) }),
    ).toThrow(/connected land/);
    expect(() =>
      compileDraft({ ...draft(), nations: [{ name: "Ocean", x: 0, y: 0 }] }),
    ).toThrow(/land/);
    expect(() =>
      compileDraft({
        ...draft(),
        nations: [
          { name: "Duplicate", x: 20, y: 20 },
          { name: "duplicate", x: 30, y: 30 },
        ],
      }),
    ).toThrow(/unique/);
  });
  it("publishes only after approval, keeps immutable assets after withdrawal, and persists the catalog", () => {
    const author = store.createUser("Artist", "password123"),
      pending = store.submit(author, draft());
    expect(store.listMaps("published")).toHaveLength(0);
    expect(store.asset(pending.id, "map.bin")).toBeNull();
    expect(() => store.review(pending.id, "reject", "")).toThrow(/feedback/);
    store.review(pending.id, "approve", "Ready to play");
    const original = store.asset(pending.id, "map.bin");
    expect(original?.length).toBe(1024 * 768);
    expect(store.listMaps("published")[0].name).toBe(draft().name);
    expect(() => store.review(pending.id, "approve", "")).toThrow(/no longer/);
    store.close();
    store = new CommunityStore(folder);
    expect(store.listMaps("published")).toHaveLength(1);
    store.withdraw(pending.id);
    expect(store.isPublished(pending.id)).toBe(false);
    expect(store.asset(pending.id, "map.bin")).toEqual(original);
  });
});

describe("community HTTP authorization", () => {
  let server: http.Server, base: string;
  beforeEach(async () => {
    const app = express();
    app.use(express.json({ limit: "100kb" }));
    app.use("/api/community", createCommunityRouter(store));
    server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/community`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function request(
    route: string,
    body?: unknown,
    cookie = "",
    origin?: string,
  ) {
    return fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DeepFront": "1",
        Origin: origin || new URL(base).origin,
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function login(username: string, password: string) {
    const response = await request("/login", { username, password });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  it("uses HttpOnly sessions and rejects privilege escalation and foreign-origin mutations", async () => {
    expect(
      (
        await request("/signup", {
          username: "Hacker",
          password: "password123",
          role: "admin",
        })
      ).status,
    ).toBe(400);
    const signup = await request("/signup", {
      username: "Maker",
      password: "password123",
    });
    expect(signup.status).toBe(201);
    const header = signup.headers.get("set-cookie")!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    const cookie = header.split(";")[0];
    expect((await request("/admin", undefined, cookie)).status).toBe(403);
    expect((await request("/profile")).status).toBe(401);
    expect((await request("/profile", undefined, cookie)).status).toBe(200);
    for (const route of [
      "/admin/maps/00000000-0000-4000-8000-000000000000/republish",
      "/admin/users/00000000-0000-4000-8000-000000000000/revoke-sessions",
    ])
      expect((await request(route, {}, cookie)).status).toBe(403);
    expect(
      (await request("/maps", draft(), cookie, "https://attacker.example"))
        .status,
    ).toBe(403);
    expect((await request("/maps", draft())).status).toBe(401);
  });
  it("protects drafts and review actions and exposes approved assets to players", async () => {
    await request("/signup", { username: "Maker", password: "password123" });
    const owner = await login("Maker", "password123");
    const submitted = await request("/maps", draft(), owner),
      { map } = await submitted.json();
    expect(submitted.status).toBe(201);
    expect((await request(`/maps/${map.id}/map.bin`)).status).toBe(404);
    expect(
      (
        await request(
          `/admin/maps/${map.id}/review`,
          { action: "approve", notes: "" },
          owner,
        )
      ).status,
    ).toBe(403);
    await request("/signup", { username: "Stranger", password: "password123" });
    const stranger = await login("Stranger", "password123");
    expect(
      (await request(`/maps/${map.id}/draft`, undefined, stranger)).status,
    ).toBe(404);
    const admin = await login("Admin", "Admin123");
    expect(
      (await request(`/maps/${map.id}/preview`, undefined, admin)).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/admin/maps/${map.id}/review`,
          { action: "approve", notes: "Approved" },
          admin,
        )
      ).status,
    ).toBe(200);
    const assets = await request(`/maps/${map.id}/map.bin`);
    expect(assets.status).toBe(200);
    expect(assets.headers.get("content-type")).toContain(
      "application/vnd.deepfront.terrain",
    );
    expect(assets.headers.get("content-disposition")).toBe("inline");
    expect((await assets.arrayBuffer()).byteLength).toBe(1024 * 768);
    const manifest = await (
      await request(`/maps/${map.id}/manifest.json`)
    ).json();
    expect(manifest.name).toBe(draft().name);
    const catalog = await (await request("/maps")).json();
    expect(catalog.maps).toHaveLength(1);
    expect(JSON.stringify(catalog)).not.toContain("password_hash");
  });
});
