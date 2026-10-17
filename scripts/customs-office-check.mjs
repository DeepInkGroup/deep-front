import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Run against an isolated COMMUNITY_DATA_DIR: this creates a private test map.
const base = process.env.BASE_URL || "http://localhost:9000";
const mapName = `Customs Lab ${Date.now().toString(36)}`;
const TYPE = "Customs Office";
fs.mkdirSync("artifacts", { recursive: true });
for (const deadline = Date.now() + 45000; ; ) {
  try {
    const health = await fetch(`${base}/api/health`);
    if (health.ok) break;
  } catch {}
  if (Date.now() > deadline)
    throw new Error("Game server did not become ready");
  await new Promise((resolve) => setTimeout(resolve, 500));
}
async function api(route, body, cookie = "") {
  const response = await fetch(`${base}/api/community${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DeepFront": "1",
      Origin: new URL(base).origin,
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert(
    response.ok,
    `${route}: ${response.status} ${response.ok ? "" : await response.text()}`,
  );
  return response;
}
const author = await api("/signup", {
  username: `Customs_${Date.now().toString(36)}`,
  password: "MapMaker123!",
});
const authorCookie = author.headers.get("set-cookie").split(";")[0];
const tiles = Array(128 * 96).fill(0);
for (let y = 30; y < 42; y++)
  for (let x = 20; x < 32; x++) tiles[y * 128 + x] = 1;
const submitted = await (
  await api(
    "/maps",
    {
      name: mapName,
      description: "Compact land for border trade verification",
      scale: 8,
      tiles,
      nations: [],
    },
    authorCookie,
  )
).json();
const admin = await api("/login", { username: "Admin", password: "Admin123" });
await api(
  `/admin/maps/${submitted.map.id}/review`,
  { action: "approve", notes: "Browser fixture" },
  admin.headers.get("set-cookie").split(";")[0],
);
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
async function configure(page, bots) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill(mapName);
  await page.getByRole("button", { name: mapName, exact: true }).click();
  const slider = page.locator(
    'fluent-slider[labelkey="game_settings.bots"] input[type="range"]:visible',
  );
  await slider.evaluate((input, bots) => {
    input.value = String(bots);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, bots);
  for (const option of [
    /^random spawn$/i,
    /^instant build$/i,
    /^infinite troops$/i,
  ])
    await page.getByRole("button", { name: option }).click();
  const starting = page
    .locator("toggle-input-card:visible")
    .filter({ hasText: /Starting Gold \(Millions\)/i });
  await starting.getByRole("button").click();
  await starting.getByRole("spinbutton").fill("10");
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
async function borderSites(page) {
  return page.evaluate(async () => {
    const game = document.querySelector("control-panel").game,
      player = game.myPlayer(),
      sites = [];
    const candidates = [];
    game.forEachTile((tile) => {
      if (!game.isLand(tile) || game.owner(tile).id() !== player.id()) return;
      const neighbors = [];
      game.forEachNeighbor(tile, (n) => {
        const owner = game.owner(n);
        if (game.isLand(n) && owner.isPlayer() && owner.id() !== player.id())
          neighbors.push(owner);
      });
      if (neighbors.length)
        candidates.push({
          tile,
          partner: neighbors.sort((a, b) => a.smallID() - b.smallID())[0].id(),
        });
    });
    for (const candidate of candidates) {
      const [buildable] = await player.buildables(candidate.tile, [
        "Customs Office",
      ]);
      if (buildable.canBuild !== false) sites.push(candidate);
      if (sites.length >= 12) break;
    }
    return sites;
  });
}
async function expand(page) {
  await page.waitForTimeout(1500);
  const neutral = await page.evaluate(() => {
    const game = document.querySelector("control-panel").game,
      player = game.myPlayer(),
      center = player.nameLocation();
    for (let radius = 2; radius < 70; radius++)
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
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
  if (neutral) {
    await page.mouse.move(neutral.x, neutral.y);
    await page.keyboard.press("g");
  }
}
async function clickBuild(page, type, tile, icon) {
  const hotbar = page.locator(`unit-display img[alt="${icon}"]`);
  await expect(hotbar).toHaveJSProperty("complete", true);
  await expect(hotbar).not.toHaveJSProperty("naturalWidth", 0);
  await hotbar.click();
  const pos = await page.evaluate((tile) => {
    const menu = document.querySelector("build-menu");
    return menu.transformHandler.worldToScreenCoordinates({
      x: menu.game.x(tile) + 0.5,
      y: menu.game.y(tile) + 0.5,
    });
  }, tile);
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(400);
  await page.mouse.click(pos.x, pos.y);
  await expect
    .poll(
      () =>
        page.evaluate(
          (type) =>
            document.querySelector("control-panel").game.myPlayer().units(type)
              .length,
          type,
        ),
      { timeout: 15000 },
    )
    .toBe(1);
}
async function checkPlacement(page, prefix) {
  const interior = await page.evaluate(() => {
    const game = document.querySelector("control-panel").game,
      player = game.myPlayer();
    let interior = null;
    game.forEachTile((tile) => {
      if (interior !== null || game.owner(tile).id() !== player.id()) return;
      let own = true;
      game.forEachNeighbor(tile, (n) => {
        if (game.owner(n).id() !== player.id()) own = false;
      });
      if (own) interior = tile;
    });
    return interior;
  });
  assert.notEqual(interior, null);
  const interiorBuildable = await page.evaluate(async (tile) => {
    const game = document.querySelector("control-panel").game;
    return (await game.myPlayer().buildables(tile, ["Customs Office"]))[0]
      .canBuild;
  }, interior);
  assert.equal(interiorBuildable, false, "Interior placement must be rejected");
  await expect
    .poll(async () => (await borderSites(page)).length, { timeout: 45000 })
    .toBeGreaterThan(0);
  const [site] = await borderSites(page);
  await clickBuild(page, TYPE, site.tile, "customs_office");
  const own = await page.evaluate(() => {
    const game = document.querySelector("control-panel").game;
    return {
      id: game.myPlayer().id(),
      level: game.myPlayer().units("Customs Office")[0].level(),
    };
  });
  assert.equal(own.level, 1);
  await page.keyboard.press("Escape");
  await page.mouse.move(1400, 800);
  await page.screenshot({ path: `artifacts/customs-${prefix}.png` });
  await page.setViewportSize({ width: 390, height: 950 });
  await page
    .locator("build-menu")
    .evaluate((menu, tile) => menu.showMenu(tile), site.tile);
  const card = page
    .locator("build-menu")
    .getByRole("button", { name: /Customs Office/ });
  await expect(card).toBeDisabled();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/customs-${prefix}-mobile.png` });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("build-menu").evaluate((menu) => menu.hideMenu());
  await page.setViewportSize({ width: 1440, height: 1000 });
  return own.id;
}
try {
  const disabled = await pageFor("CustomsDisabled");
  await disabled.goto(base);
  await disabled
    .getByRole("button", { name: "Play solo", exact: true })
    .click();
  await configure(disabled, 3);
  const option = disabled.getByRole("button", { name: TYPE, exact: true });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "false");
  await disabled.getByRole("button", { name: /^start game$/i }).click();
  await running(disabled);
  await expect(
    disabled.locator('unit-display img[alt="customs_office"]'),
  ).toHaveCount(0);
  assert(
    await disabled.evaluate(() =>
      document
        .querySelector("control-panel")
        .game.config()
        .isUnitDisabled("Customs Office"),
    ),
  );
  await disabled.context().close();
  console.log("Solo Customs Office Disable Units passed");

  const solo = await pageFor("CustomsSolo");
  await solo.goto(base);
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await configure(solo, 3);
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await running(solo);
  await expand(solo);
  await checkPlacement(solo, "solo");
  await solo.context().close();
  console.log(
    "Solo border-only Customs Office construction, icon and mobile menu passed",
  );

  const host = await pageFor("CustomsHost");
  await host.goto(base);
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  await configure(host, 0);
  const guest = await pageFor("CustomsGuest");
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("CustomsGuest");
  const multiplayerOption = host.getByRole("button", {
    name: TYPE,
    exact: true,
  });
  await multiplayerOption.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((modal) =>
          modal.gameConfig?.disabledUnits?.includes("Customs Office"),
        ),
    )
    .toBe(true);
  await multiplayerOption.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((modal) =>
          modal.gameConfig?.disabledUnits?.includes("Customs Office"),
        ),
    )
    .toBe(false);
  await host.getByRole("button", { name: /^start game$/i }).click();
  await running(host);
  await running(guest);
  await expand(host);
  const ownerID = await checkPlacement(host, "multiplayer");
  await expect
    .poll(
      () =>
        guest.evaluate(
          (owner) =>
            document
              .querySelector("control-panel")
              .game.units("Customs Office")
              .filter((u) => u.owner().id() === owner).length,
          ownerID,
        ),
      { timeout: 15000 },
    )
    .toBe(1);
  await guest.waitForTimeout(5000);
  await expect(
    guest.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Multiplayer Customs Office border placement, lobby settings and two-client synchronization passed",
  );
} catch (error) {
  for (const [i, context] of browser.contexts().entries())
    for (const page of context.pages())
      await page
        .screenshot({ path: `artifacts/customs-failure-${i}.png` })
        .catch(() => {});
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
