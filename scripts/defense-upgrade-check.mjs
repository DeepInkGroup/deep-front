import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

const base = process.env.BASE_URL || "http://localhost:9000";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
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
  return page;
}
async function configure(page) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill("DeepPlace");
  await page.getByRole("button", { name: "DeepPlace", exact: true }).click();
  for (const label of ["bots", "nations"]) {
    const slider = page.locator(
      `fluent-slider[labelkey="game_settings.${label}"] input[type="range"]:visible`,
    );
    await slider.evaluate((input) => {
      input.value = "0";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  for (const name of [
    /^random spawn$/i,
    /^instant build$/i,
    /^infinite troops$/i,
  ])
    await page.getByRole("button", { name }).click();
  const gold = page
    .locator("toggle-input-card:visible")
    .filter({ hasText: /Starting Gold \(Millions\)/i });
  await gold.getByRole("button").click();
  await gold.getByRole("spinbutton").fill("50");
}
async function running(page) {
  await expect(page.locator("body")).toHaveClass(/in-game/, { timeout: 45000 });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.querySelector("control-panel")?.game?.inSpawnPhase(),
        ),
      { timeout: 45000 },
    )
    .toBe(false);
}
async function expand(page) {
  await page.waitForTimeout(1200);
  const point = await page.evaluate(() => {
    const game = document.querySelector("control-panel").game,
      player = game.myPlayer(),
      center = player.nameLocation();
    for (let r = 2; r < 70; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.round(center.x) + dx,
            y = Math.round(center.y) + dy;
          if (!game.isValidCoord(x, y)) continue;
          const tile = game.ref(x, y);
          if (game.isLand(tile) && !game.hasOwner(tile))
            return document
              .querySelector("build-menu")
              .transformHandler.worldToScreenCoordinates({
                x: x + 0.5,
                y: y + 0.5,
              });
        }
    return null;
  });
  assert(point, "Need neutral land for expansion");
  await page.mouse.move(point.x, point.y);
  await page.keyboard.press("g");
}
async function findSite(page, type) {
  return page.evaluate(async (type) => {
    const game = document.querySelector("control-panel").game,
      player = game.myPlayer(),
      center = player.nameLocation();
    for (let r = 0; r < 140; r += 5)
      for (let dy = -r; dy <= r; dy += 5)
        for (let dx = -r; dx <= r; dx += 5) {
          const x = Math.round(center.x) + dx,
            y = Math.round(center.y) + dy;
          if (!game.isValidCoord(x, y)) continue;
          const tile = game.ref(x, y);
          if (game.ownerID(tile) !== player.smallID()) continue;
          const [u] = await player.buildables(tile, [type]);
          if (u.canBuild !== false && u.canUpgrade === false) return u.canBuild;
        }
    return null;
  }, type);
}
async function purchase(page, type, tile) {
  await page
    .locator("build-menu")
    .evaluate((menu, tile) => menu.showMenu(tile), tile);
  const button = page
    .locator("build-menu")
    .getByRole("button", { name: new RegExp(type) });
  await expect(button).toBeEnabled();
  await button.scrollIntoViewIfNeeded();
  await button.click();
}
async function units(page, type, owner) {
  return page.evaluate(
    ({ type, owner }) => {
      const game = document.querySelector("control-panel").game;
      return game
        .units(type)
        .filter((u) => u.owner().id() === (owner || game.myPlayer().id()))
        .map((u) => ({ id: u.id(), tile: u.tile(), level: u.level() }));
    },
    { type, owner },
  );
}
async function build(page, type) {
  let tile = null;
  await expect
    .poll(
      async () => {
        tile = await findSite(page, type);
        return tile !== null;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const before = (await units(page, type)).length;
  await purchase(page, type, tile);
  await expect
    .poll(async () => (await units(page, type)).length, { timeout: 15000 })
    .toBe(before + 1);
  return (
    (await units(page, type)).find((u) => u.tile === tile) ??
    (await units(page, type)).at(-1)
  );
}
async function check(page, prefix) {
  await expand(page);
  const first = await build(page, "Copper Mine"),
    second = await build(page, "Copper Mine");
  await expect(
    page.getByRole("button", { name: "Copper Mine", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Shift+2");
  await page.waitForTimeout(250);
  assert.equal(
    await page
      .locator("unit-display")
      .evaluate((display) => display.uiState.ghostStructure),
    "Copper Mine",
  );
  await page.keyboard.press("Escape");
  for (const mine of [first, second]) {
    await purchase(page, "Copper Mine", mine.tile);
    await expect
      .poll(
        async () =>
          (await units(page, "Copper Mine")).find((u) => u.id === mine.id)
            ?.level,
        { timeout: 10000 },
      )
      .toBe(2);
  }
  await expect(
    page.getByRole("button", { name: "Copper Mine", exact: true }),
  ).toBeDisabled();
  assert.equal((await units(page, "Copper Mine")).length, 2);
  await page.keyboard.press("Shift+6");
  await page.waitForTimeout(200);
  assert.equal(
    await page
      .locator("unit-display")
      .evaluate((display) => display.uiState.ghostStructure),
    "CIWS Defense",
  );
  await page.keyboard.press("Escape");
  const defense = await build(page, "CIWS Defense");
  for (let level = 2; level <= 5; level++) {
    await purchase(page, "CIWS Defense", defense.tile);
    await expect
      .poll(async () => (await units(page, "CIWS Defense"))[0]?.level, {
        timeout: 10000,
      })
      .toBe(level);
  }
  await page
    .locator("build-menu")
    .evaluate((menu, tile) => menu.showMenu(tile), defense.tile);
  await expect(
    page.locator("build-menu").getByRole("button", { name: /CIWS Defense/ }),
  ).toBeDisabled();
  await page.locator("build-menu").evaluate((menu) => menu.hideMenu());
  await build(page, "SAM Launcher");
  await build(page, "Bunker Missile Site");
  for (const [key, type] of [
    ["Shift+8", "Stealth Missile"],
    ["Shift+9", "Hypersonic Missile"],
  ]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    assert.equal(
      await page
        .locator("unit-display")
        .evaluate((display) => display.uiState.ghostStructure),
      type,
    );
    await page.screenshot({
      path: `artifacts/${prefix}-${type.split(" ")[0].toLowerCase()}-coverage.png`,
    });
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page
    .locator("build-menu")
    .evaluate((menu, tile) => menu.showMenu(tile), defense.tile);
  const mobile = page
    .locator("build-menu")
    .getByRole("button", { name: /CIWS Defense/ });
  await mobile.scrollIntoViewIfNeeded();
  await expect(mobile).toBeDisabled();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `artifacts/${prefix}-ciws-mobile.png` });
  await page.locator("build-menu").evaluate((menu) => menu.hideMenu());
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    `${prefix}: two Copper Mines upgrade at count cap, shortcuts, CIWS L5, coverage and mobile controls passed`,
  );
  return await page.evaluate(() =>
    document.querySelector("control-panel").game.myPlayer().id(),
  );
}
try {
  const solo = await pageFor("DefenseSolo");
  await solo.goto(base);
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await configure(solo);
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await running(solo);
  await check(solo, "defense-solo");
  await solo.context().close();
  const host = await pageFor("DefenseHost");
  await host.goto(base);
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  const guest = await pageFor("DefenseGuest");
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("DefenseGuest");
  const toggle = host.getByRole("button", {
    name: "CIWS Defense",
    exact: true,
  });
  await toggle.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((modal) =>
          modal.gameConfig?.disabledUnits?.includes("CIWS Defense"),
        ),
    )
    .toBe(true);
  await toggle.click();
  await configure(host);
  await host.getByRole("button", { name: /^start game$/i }).click();
  await running(host);
  await running(guest);
  const owner = await check(host, "defense-multiplayer");
  await expect
    .poll(async () => (await units(guest, "CIWS Defense", owner))[0]?.level)
    .toBe(5);
  await expect
    .poll(async () =>
      (await units(guest, "Copper Mine", owner)).map((u) => u.level),
    )
    .toEqual([2, 2]);
  await expect(
    guest.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log("CIWS disable option and two-client synchronization passed");
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page
        .screenshot({ path: `artifacts/defense-failure-${Date.now()}.png` })
        .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
