import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.BASE_URL || "http://localhost:9000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Run this fixture-publishing check against a local server.");
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let map, admin;
async function pageFor(name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript((name) => {
    localStorage.setItem("username", name);
    localStorage.setItem("settings.tutorialDismissed", "true");
  }, name);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  return page;
}
async function api(page, route, body) {
  const r = await page.request.fetch(base + "/api/community" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-DeepFront": "1", Origin: new URL(base).origin },
    data: body,
  });
  assert.ok(r.ok(), route + ": " + (await r.text()));
  return r.json();
}
async function configure(page) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill(map.name);
  await page.getByRole("button", { name: map.name, exact: true }).click();
  await page.getByRole("button", { name: /^instant build$/i }).click();
  for (const key of ["bots", "nations"]) {
    const slider = page.locator(
      `fluent-slider[labelkey="game_settings.${key}"] input[type="range"]:visible`,
    );
    await slider.evaluate((input) => {
      input.value = "0";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  const starting = page
    .locator("toggle-input-card")
    .filter({ hasText: /Starting Gold \(Millions\)/i });
  await starting.getByRole("button").click();
  await starting.getByRole("spinbutton").fill("20");
}
async function spawn(page, y) {
  await expect(page.locator("body")).toHaveClass(/in-game/, { timeout: 60000 });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => !!document.querySelector("build-menu")?.transformHandler,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.waitForTimeout(800);
  const p = await page.evaluate(
    (y) =>
      document
        .querySelector("build-menu")
        .transformHandler.worldToScreenCoordinates({ x: 559.5, y: y + 0.5 }),
    y,
  );
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.querySelector("control-panel").game.myPlayer()?.isAlive(),
        ),
      { timeout: 15000 },
    )
    .toBe(true);
}
async function running(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.querySelector("control-panel").game.inSpawnPhase(),
        ),
      { timeout: 60000 },
    )
    .toBe(false);
}
async function build(page, type, level = 1) {
  const tile = await page.evaluate(
    async ({ type, level }) => {
      const menu = document.querySelector("build-menu"),
        game = menu.game,
        me = game.myPlayer();
      const owned = me.units(type)[0];
      const tile =
        owned?.tile() ??
        game.ref(
          Math.round(me.nameLocation().x),
          Math.round(me.nameLocation().y),
        );
      const [candidate] = await me.buildables(tile, [type]);
      if (level === 1) {
        if (candidate.canBuild === false)
          throw new Error("No coastal " + type + " site");
        if (!game.isShore(candidate.canBuild))
          throw new Error("Factory/port is not on shore");
      } else if (candidate.canUpgrade === false)
        throw new Error("Upgrade unavailable");
      menu.sendBuildOrUpgrade(
        candidate,
        candidate.canBuild === false ? tile : candidate.canBuild,
      );
      return candidate.canBuild === false ? tile : candidate.canBuild;
    },
    { type, level },
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          (type) =>
            document
              .querySelector("control-panel")
              .game.myPlayer()
              .units(type)[0]
              ?.level(),
          type,
        ),
      { timeout: 15000 },
    )
    .toBe(level);
  return tile;
}
async function count(page, owner) {
  return page.evaluate(
    (owner) =>
      document
        .querySelector("control-panel")
        .game.units("Oil Tanker")
        .filter((s) => !owner || s.owner().id() === owner).length,
    owner,
  );
}
try {
  const maker = await pageFor("TankerMaker");
  await api(maker, "/signup", {
    username: "Tanker_" + Date.now().toString(36),
    password: "TankerCheck123!",
  });
  const tiles = Array.from({ length: 128 * 96 }, (_, i) =>
    i % 128 < 70 ? 1 : 0,
  );
  ({ map } = await api(maker, "/maps", {
    name: "Oil Coast " + Date.now().toString(36),
    description: "Local tanker QA coastline",
    scale: 8,
    tiles,
    nations: [],
  }));
  admin = await pageFor("TankerReview");
  await api(admin, "/login", { username: "Admin", password: "Admin123" });
  await api(admin, `/admin/maps/${map.id}/review`, {
    action: "approve",
    notes: "Local tanker shipping check",
  });
  const solo = await pageFor("TankerSolo");
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await configure(solo);
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await spawn(solo, 240);
  await running(solo);
  await expect(
    solo.locator('unit-display img[alt="oil_factory"]'),
  ).toBeVisible();
  for (let level = 1; level <= 3; level++) {
    await build(solo, "Oil Factory", level);
    await expect.poll(() => count(solo)).toBe([2, 3, 5][level - 1]);
  }
  await solo.screenshot({ path: "artifacts/oil-tanker-solo.png" });
  await solo.context().close();
  console.log(
    "Solo coastal placement, real purchases/upgrades and 2/3/5 tankers passed",
  );
  const host = await pageFor("TankerHost"),
    guest = await pageFor("TankerGuest");
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  await configure(host);
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("TankerGuest");
  const toggle = host.getByRole("button", { name: "Oil Factory", exact: true });
  await toggle.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((m) => m.gameConfig?.disabledUnits?.includes("Oil Factory")),
    )
    .toBe(true);
  await toggle.click();
  await host.getByRole("button", { name: /^start game$/i }).click();
  await Promise.all([spawn(host, 240), spawn(guest, 480)]);
  await Promise.all([running(host), running(guest)]);
  await build(guest, "Port");
  const factoryTile = await build(host, "Oil Factory");
  const owner = await host.evaluate(() =>
    document.querySelector("control-panel").game.myPlayer().id(),
  );
  await expect.poll(() => count(host, owner)).toBe(2);
  await expect.poll(() => count(guest, owner)).toBe(2);
  await expect
    .poll(
      () =>
        host.evaluate(
          (tile) =>
            document
              .querySelector("control-panel")
              .game.units("Oil Tanker")
              .some((s) => s.tile() !== tile),
          factoryTile,
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        host.evaluate((tile) => {
          const g = document.querySelector("control-panel").game;
          return g
            .units("Oil Tanker")
            .some((s) => g.manhattanDist(s.tile(), tile) > 12);
        }, factoryTile),
      { timeout: 15000 },
    )
    .toBe(true);
  await host.screenshot({ path: "artifacts/oil-tanker-multiplayer.png" });
  await expect
    .poll(
      () =>
        host.evaluate(() =>
          document.querySelector("control-panel").game.myPlayer().tradeGold(),
        ),
      { timeout: 90000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        guest.evaluate(() =>
          document.querySelector("control-panel").game.myPlayer().tradeGold(),
        ),
      { timeout: 10000 },
    )
    .toBeGreaterThan(0);
  assert.equal(await count(host, owner), 2);
  assert.equal(await count(guest, owner), 2);
  assert.deepEqual(errors, []);
  console.log(
    "Two-client paid construction, lobby disable sync, tanker motion, fleet sync and delivery income passed",
  );
} catch (e) {
  for (const [i, context] of browser.contexts().entries())
    for (const page of context.pages()) {
      console.error(
        "Page",
        i,
        (await page.locator("body").innerText()).slice(-2500),
      );
      await page
        .screenshot({ path: `artifacts/oil-tanker-failure-${i}.png` })
        .catch(() => {});
    }
  throw e;
} finally {
  if (admin && map)
    await api(admin, `/admin/maps/${map.id}/withdraw`, {}).catch(() => {});
  await browser.close();
}
