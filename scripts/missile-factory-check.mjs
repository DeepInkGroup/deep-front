import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.BASE_URL || "http://localhost:9000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use a local server for this fixture-publishing check.");
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let map, admin;
async function player(name) {
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
async function configure(page, disabled = false) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill(map.name);
  await page.getByRole("button", { name: map.name, exact: true }).click();
  await page.getByRole("button", { name: /^instant build$/i }).click();
  for (const key of ["bots", "nations"])
    await page
      .locator(
        `fluent-slider[labelkey="game_settings.${key}"] input[type="range"]:visible`,
      )
      .evaluate((input) => {
        input.value = "0";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
  const start = page
    .locator("toggle-input-card")
    .filter({ hasText: /Starting Gold \(Millions\)/i });
  await start.getByRole("button").click();
  await start.getByRole("spinbutton").fill("20");
  if (disabled)
    await page
      .getByRole("button", { name: "Missile Factory", exact: true })
      .click();
}
async function clickWorld(page, x, y) {
  const p = await page.evaluate(
    ({ x, y }) =>
      document
        .querySelector("build-menu")
        .transformHandler.worldToScreenCoordinates({ x: x + 0.5, y: y + 0.5 }),
    { x, y },
  );
  await page.mouse.click(p.x, p.y);
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
  await page.waitForTimeout(700);
  await clickWorld(page, 512, y);
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
async function site(page, type) {
  return page.evaluate(async (type) => {
    const g = document.querySelector("control-panel").game,
      me = g.myPlayer(),
      center = me.nameLocation();
    for (let r = 0; r <= 65; r += 5)
      for (let dy = -r; dy <= r; dy += 5)
        for (let dx = -r; dx <= r; dx += 5) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = Math.round(center.x) + dx,
            y = Math.round(center.y) + dy;
          if (!g.isValidCoord(x, y)) continue;
          const tile = g.ref(x, y);
          if (g.owner(tile).id() !== me.id()) continue;
          const [u] = await me.buildables(tile, [type]);
          if (u.canBuild !== false) return u.canBuild;
        }
    return null;
  }, type);
}
async function purchase(page, type, tile, level = 1) {
  const cost = await page.evaluate(
    async ({ type, tile, level }) => {
      const menu = document.querySelector("build-menu"),
        me = menu.game.myPlayer();
      const target = level > 1 ? me.units(type)[0].tile() : tile;
      const [candidate] = await me.buildables(target, [type]);
      if (
        (level === 1 && candidate.canBuild === false) ||
        (level > 1 && candidate.canUpgrade === false)
      )
        throw new Error("Unavailable " + type + " " + level);
      menu.sendBuildOrUpgrade(candidate, target);
      return String(candidate.cost);
    },
    { type, tile, level },
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
  return cost;
}
async function expandForBuilding(page, y, type) {
  await page
    .locator('control-panel input[type="range"]:visible')
    .evaluate((input) => {
      input.value = "80";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await page.mouse.move(900, 400);
  await page.mouse.wheel(0, 650);
  await page.waitForTimeout(500);
  for (let i = 0; i < 35; i++) {
    const tile = await site(page, type);
    if (tile !== null) return tile;
    await clickWorld(page, 440, y);
    await page.waitForTimeout(1800);
  }
  throw new Error("Expansion did not create room for building");
}
async function arsenal(page, owner) {
  return page.evaluate((owner) => {
    const g = document.querySelector("control-panel").game;
    const me = owner ? g.player(owner) : g.myPlayer();
    return me.state.missileArsenal;
  }, owner);
}
async function missileSequence(page, y, observer) {
  await purchase(page, "Missile Factory", await site(page, "Missile Factory"));
  const owner = await page.evaluate(() =>
    document.querySelector("control-panel").game.myPlayer().id(),
  );
  const panel = page.locator("missile-production-panel");
  await panel.getByRole("button", { name: /^Missiles/ }).click();
  await expect(panel.locator("section")).toBeVisible();
  await expect(panel.locator("section")).toContainText("No electricity");
  await panel
    .getByRole("button", { name: "Produce 1 EMP Missile", exact: true })
    .click();
  await expect.poll(async () => (await arsenal(page)).jobs.length).toBe(1);
  await page.waitForTimeout(1800);
  assert.equal((await arsenal(page)).jobs[0].remainingTicks, 200);
  if (observer)
    await expect
      .poll(async () => (await arsenal(observer, owner)).jobs.length)
      .toBe(1);
  await page.screenshot({
    path:
      "artifacts/missile-" +
      (observer ? "multiplayer" : "solo") +
      "-paused.png",
  });
  await panel.getByRole("button", { name: "Close missile production" }).click();
  const bunker = await expandForBuilding(page, y, "Bunker Missile Site");
  await purchase(page, "Bunker Missile Site", bunker);
  const target = await page.evaluate(() =>
    document.querySelector("control-panel").game.ref(850, 400),
  );
  assert.equal(
    await page.evaluate(async (tile) => {
      const me = document.querySelector("control-panel").game.myPlayer();
      return (await me.buildables(tile, ["EMP Missile"]))[0].canBuild;
    }, target),
    false,
  );
  const plant = await expandForBuilding(page, y, "Power Plant");
  await purchase(page, "Power Plant", plant);
  await panel.getByRole("button", { name: /^Missiles/ }).click();
  await expect
    .poll(async () => (await arsenal(page)).jobs[0]?.remainingTicks, {
      timeout: 20000,
    })
    .toBeLessThanOrEqual(100);
  await panel
    .getByRole("button", {
      name: "Produce 1 Air-defense interceptor",
      exact: true,
    })
    .click();
  await expect.poll(async () => (await arsenal(page)).jobs.length).toBe(2);
  assert.equal((await arsenal(page)).jobs[1].remainingTicks, 50);
  await panel.getByRole("button", { name: "Queue (2)", exact: true }).click();
  await expect(panel.locator("ol")).toContainText("Starts in");
  await page.waitForTimeout(1500);
  assert.equal((await arsenal(page)).jobs[1].remainingTicks, 50);
  assert.equal((await arsenal(page)).stock[6], 0);
  if (observer) {
    await expect
      .poll(async () => (await arsenal(observer, owner)).jobs.length)
      .toBe(2);
    assert.equal((await arsenal(observer, owner)).jobs[1].remainingTicks, 50);
  }
  await page.screenshot({
    path:
      "artifacts/missile-" + (observer ? "multiplayer" : "solo") + "-fifo.png",
  });
  await expect
    .poll(async () => (await arsenal(page)).stock[5], { timeout: 15000 })
    .toBe(1);
  assert.equal((await arsenal(page)).stock[6], 0);
  await expect
    .poll(async () => (await arsenal(page)).stock[6], { timeout: 10000 })
    .toBe(1);
  if (observer)
    await expect
      .poll(async () => (await arsenal(observer, owner)).stock[5])
      .toBe(1);
  await panel.getByRole("button", { name: "Close missile production" }).click();
  await page.evaluate(async (tile) => {
    const menu = document.querySelector("build-menu");
    const [bu] = await menu.game.myPlayer().buildables(tile, ["EMP Missile"]);
    if (bu.cost !== 0n || bu.inventory !== 1 || bu.canBuild === false)
      throw Error("Stored missile not launchable");
    menu.sendBuildOrUpgrade(bu, tile);
  }, target);
  await expect.poll(async () => (await arsenal(page)).stock[5]).toBe(0);
  if (observer)
    await expect
      .poll(async () => (await arsenal(observer, owner)).stock[5])
      .toBe(0);
  await panel.getByRole("button", { name: /^Missiles/ }).click();
  await panel
    .getByRole("button", { name: "Missile types", exact: true })
    .click();
  await expect(panel.locator("section")).toContainText(
    "Air-defense interceptor",
  );
  await expect(panel.locator("section")).toContainText(/25(?:\.0)?K/);
  await expect(
    page.locator('unit-display img[alt="missile_factory"]'),
  ).toHaveJSProperty("complete", true);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(panel.locator("section")).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await panel
        .locator("section")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
    );
    await page.screenshot({
      path:
        "artifacts/missile-" +
        (observer ? "multiplayer" : "solo") +
        "-" +
        width +
        ".png",
    });
  }
}
try {
  const maker = await player("MissileMaker");
  await api(maker, "/signup", {
    username: "Missiles_" + Date.now().toString(36),
    password: "MissileCheck123!",
  });
  ({ map } = await api(maker, "/maps", {
    name: "Missile Plains " + Date.now().toString(36),
    description: "Local missile production QA",
    scale: 8,
    tiles: Array(128 * 96).fill(1),
    nations: [],
  }));
  admin = await player("MissileReview");
  await api(admin, "/login", { username: "Admin", password: "Admin123" });
  await api(admin, "/admin/maps/" + map.id + "/review", {
    action: "approve",
    notes: "Local missile production checks",
  });
  const disabled = await player("MissileDisabled");
  await disabled
    .getByRole("button", { name: "Play solo", exact: true })
    .click();
  await configure(disabled, true);
  await disabled.getByRole("button", { name: /^start game$/i }).click();
  await spawn(disabled, 384);
  await running(disabled);
  await expect(
    disabled.locator('unit-display img[alt="missile_factory"]'),
  ).toHaveCount(0);
  await expect(disabled.locator("missile-production-panel button")).toHaveCount(
    0,
  );
  await disabled.context().close();
  console.log("Disabled Missile Factory hides production UI");
  const solo = await player("MissileSolo");
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await configure(solo);
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await spawn(solo, 384);
  await running(solo);
  await missileSequence(solo, 384);
  await solo.context().close();
  console.log(
    "Solo FIFO production, power pause/recovery, inventory launch and responsive UI passed",
  );
  const host = await player("MissileHost"),
    guest = await player("MissileGuest");
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  await configure(host);
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("MissileGuest");
  const toggle = host.getByRole("button", {
    name: "Missile Factory",
    exact: true,
  });
  await toggle.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((m) =>
          m.gameConfig?.disabledUnits?.includes("Missile Factory"),
        ),
    )
    .toBe(true);
  await toggle.click();
  await host.getByRole("button", { name: /^start game$/i }).click();
  await Promise.all([spawn(host, 240), spawn(guest, 600)]);
  await Promise.all([running(host), running(guest)]);
  await missileSequence(host, 240, guest);
  assert.deepEqual(errors, []);
  console.log(
    "Two clients agree on production orders, pauses, completion, inventory and consumption",
  );
} catch (e) {
  for (const [i, c] of browser.contexts().entries())
    for (const p of c.pages()) {
      console.error(
        "Page",
        i,
        (await p.locator("body").innerText()).slice(-2000),
      );
      await p
        .screenshot({ path: "artifacts/missile-failure-" + i + ".png" })
        .catch(() => {});
    }
  throw e;
} finally {
  if (admin && map)
    await api(admin, "/admin/maps/" + map.id + "/withdraw", {}).catch(() => {});
  await browser.close();
}
