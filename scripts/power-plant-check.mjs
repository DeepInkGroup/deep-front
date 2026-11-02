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
      .getByRole("button", { name: "Power Plant", exact: true })
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
async function expandForPlant(page, y) {
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
    const tile = await site(page, "Power Plant");
    if (tile !== null) return tile;
    await clickWorld(page, 440, y);
    await page.waitForTimeout(1800);
  }
  throw new Error("Expansion did not create room for a Power Plant");
}
async function grid(page, owner) {
  return page.evaluate((owner) => {
    const g = document.querySelector("control-panel").game,
      p = owner ? g.player(owner) : g.myPlayer(),
      v = g.config().powerGrid(p);
    return {
      enabled: v.enabled,
      supply: v.supply,
      demand: v.demand,
      used: v.used,
      offline: v.offline,
    };
  }, owner);
}
async function powerSequence(page, y, observer) {
  const city = await site(page, "City");
  assert.notEqual(city, null);
  await purchase(page, "City", city);
  await expect
    .poll(() => grid(page))
    .toMatchObject({ supply: 0, demand: 20, offline: 1 });
  await expect(page.locator(".power-status")).toContainText("1 offline");
  const owner = await page.evaluate(() =>
    document.querySelector("control-panel").game.myPlayer().id(),
  );
  if (observer)
    await expect
      .poll(() => grid(observer, owner))
      .toMatchObject({ supply: 0, demand: 20, offline: 1 });
  const tile = await expandForPlant(page, y);
  assert.equal(await purchase(page, "Power Plant", tile), "750000");
  await expect
    .poll(() => grid(page))
    .toMatchObject({ supply: 100, demand: 20, offline: 0 });
  await expect(
    page.locator('unit-display img[alt="power_plant"]'),
  ).toBeVisible();
  await expect(
    page.locator('unit-display img[alt="power_plant"]'),
  ).toHaveJSProperty("complete", true);
  for (let level = 2; level <= 6; level++)
    await purchase(page, "City", city, level);
  await expect
    .poll(() => grid(page))
    .toMatchObject({ supply: 100, demand: 120, used: 0, offline: 1 });
  await page.screenshot({
    path: `artifacts/power-${observer ? "multiplayer" : "solo"}-outage.png`,
  });
  if (observer)
    await expect
      .poll(() => grid(observer, owner))
      .toMatchObject({ supply: 100, demand: 120, offline: 1 });
  assert.equal(await purchase(page, "Power Plant", tile, 2), "1000000");
  await expect
    .poll(() => grid(page))
    .toMatchObject({ supply: 200, demand: 120, used: 120, offline: 0 });
  if (observer)
    await expect
      .poll(() => grid(observer, owner))
      .toMatchObject({ supply: 200, demand: 120, offline: 0 });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".power-status")).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `artifacts/power-${observer ? "multiplayer" : "solo"}-${width}.png`,
    });
  }
}
try {
  const maker = await player("PowerMaker");
  await api(maker, "/signup", {
    username: "Power_" + Date.now().toString(36),
    password: "PowerCheck123!",
  });
  ({ map } = await api(maker, "/maps", {
    name: "Power Plains " + Date.now().toString(36),
    description: "Local power-system QA map",
    scale: 8,
    tiles: Array(128 * 96).fill(1),
    nations: [],
  }));
  admin = await player("PowerReview");
  await api(admin, "/login", { username: "Admin", password: "Admin123" });
  await api(admin, `/admin/maps/${map.id}/review`, {
    action: "approve",
    notes: "Local power checks",
  });
  const disabled = await player("PowerDisabled");
  await disabled
    .getByRole("button", { name: "Play solo", exact: true })
    .click();
  await configure(disabled, true);
  await disabled.getByRole("button", { name: /^start game$/i }).click();
  await spawn(disabled, 384);
  await running(disabled);
  await purchase(disabled, "City", await site(disabled, "City"));
  assert.equal((await grid(disabled)).enabled, false);
  await expect(disabled.locator(".power-status")).toHaveCount(0);
  await expect(
    disabled.locator('unit-display img[alt="power_plant"]'),
  ).toHaveCount(0);
  await disabled.context().close();
  console.log("Disabled Power Plant restores normal rules and hides power UI");
  const solo = await player("PowerSolo");
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await configure(solo);
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await spawn(solo, 384);
  await running(solo);
  await powerSequence(solo, 384);
  await solo.context().close();
  console.log(
    "Solo paid Power Plants, outages, upgrades, recovery and responsive power HUD passed",
  );
  const host = await player("PowerHost"),
    guest = await player("PowerGuest");
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  await configure(host);
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("PowerGuest");
  const toggle = host.getByRole("button", { name: "Power Plant", exact: true });
  await toggle.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((m) => m.gameConfig?.disabledUnits?.includes("Power Plant")),
    )
    .toBe(true);
  await toggle.click();
  await host.getByRole("button", { name: /^start game$/i }).click();
  await Promise.all([spawn(host, 240), spawn(guest, 600)]);
  await Promise.all([running(host), running(guest)]);
  await powerSequence(host, 240, guest);
  assert.deepEqual(errors, []);
  console.log(
    "Two-client power allocation, lobby disabling, outages, upgrades and recovery agree",
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
        .screenshot({ path: `artifacts/power-failure-${i}.png` })
        .catch(() => {});
    }
  throw e;
} finally {
  if (admin && map)
    await api(admin, `/admin/maps/${map.id}/withdraw`, {}).catch(() => {});
  await browser.close();
}
