import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

const OIL = "Oil Factory";
const baseUrl = process.env.BASE_URL || "http://localhost:9000";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function newPage(name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript((name) => {
    localStorage.setItem("username", name);
    localStorage.setItem("settings.tutorialDismissed", "true");
  }, name);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}
async function configureEconomy(page) {
  await page.getByRole("button", { name: /^random spawn$/i }).click();
  await page.getByRole("button", { name: /^instant build$/i }).click();
  const starting = page
    .locator("toggle-input-card")
    .filter({ hasText: /Starting Gold \(Millions\)/i });
  await starting.getByRole("button").click();
  await starting.getByRole("spinbutton").fill("6");
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
async function factoryLevel(page, ownerID) {
  return page.evaluate(
    ({ ownerID, OIL }) => {
      const game = document.querySelector("control-panel")?.game;
      const units = game
        ?.units(OIL)
        .filter((unit) => !ownerID || unit.owner().id() === ownerID);
      return units?.[0]?.level() ?? 0;
    },
    { ownerID, OIL },
  );
}
async function buildAndUpgrade(page, prefix) {
  await page.waitForTimeout(2000); // Let the spawn camera settle before placing a building.
  const hotbar = page.locator('unit-display img[alt="oil_factory"]');
  await expect(hotbar).toBeVisible();
  await expect(hotbar).toHaveJSProperty("complete", true);
  await expect(hotbar).not.toHaveJSProperty("naturalWidth", 0);
  const target = await page.evaluate(async (OIL) => {
    const game = document.querySelector("control-panel").game;
    const player = game.myPlayer();
    const center = player.nameLocation();
    for (let radius = 0; radius < 20; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = Math.round(center.x) + dx,
            y = Math.round(center.y) + dy;
          if (!game.isValidCoord(x, y)) continue;
          const tile = game.ref(x, y);
          if (game.owner(tile).id() !== player.id()) continue;
          const [candidate] = await player.buildables(tile, [OIL]);
          if (candidate.canBuild !== false)
            return { tile: candidate.canBuild, ownerID: player.id() };
        }
      }
    }
    throw new Error("No valid oil factory site in the player's territory");
  }, OIL);
  for (const level of [1, 2, 3]) {
    await hotbar.click();
    const position = await page.evaluate((tile) => {
      const menu = document.querySelector("build-menu");
      return menu.transformHandler.worldToScreenCoordinates({
        x: menu.game.x(tile) + 0.5,
        y: menu.game.y(tile) + 0.5,
      });
    }, target.tile);
    await page.mouse.move(position.x, position.y);
    await page.waitForTimeout(700);
    await page.mouse.click(position.x, position.y);
    try {
      await expect
        .poll(() => factoryLevel(page, target.ownerID), { timeout: 12000 })
        .toBe(level);
    } catch (error) {
      await page.screenshot({
        path: `artifacts/oil-factory-${prefix}-failure.png`,
      });
      console.log(
        "PLACEMENT",
        { target, position, errors },
        await page.evaluate(
          ({ position, OIL }) => {
            const display = document.querySelector("unit-display");
            const game = display.game;
            const cursor = document
              .querySelector("build-menu")
              .transformHandler.screenToWorldCoordinates(
                position.x,
                position.y,
              );
            return {
              uiState: display.uiState,
              cursor,
              gold: String(game.myPlayer().gold()),
              underneath: document
                .elementFromPoint(position.x, position.y)
                ?.outerHTML.slice(0, 500),
              units: game.units(OIL).length,
            };
          },
          { position, OIL },
        ),
      );
      throw error;
    }
  }
  const preview = await page.evaluate(
    async ({ tile, OIL }) => {
      const game = document.querySelector("control-panel").game;
      const [result] = await game.myPlayer().buildables(tile, [OIL]);
      return {
        canUpgrade: result.canUpgrade,
        gold: String(game.myPlayer().gold()),
      };
    },
    { tile: target.tile, OIL },
  );
  assert.equal(preview.canUpgrade, false);
  assert.ok(
    BigInt(preview.gold) < 3_000_000n,
    "The 4M total build and upgrade cost should be charged",
  );
  await expect
    .poll(
      async () =>
        BigInt(
          await page.evaluate(() =>
            String(
              document.querySelector("control-panel").game.myPlayer().gold(),
            ),
          ),
        ),
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(BigInt(preview.gold) + 150_000n);
  await page.screenshot({ path: `artifacts/oil-factory-${prefix}.png` });
  await page.setViewportSize({ width: 390, height: 950 });
  // Mobile uses the build menu rather than the desktop hotbar.
  await page
    .locator("build-menu")
    .evaluate((menu, tile) => menu.showMenu(tile), target.tile);
  const mobileOil = page
    .locator("build-menu")
    .getByRole("button", { name: /Oil Factory/ });
  await expect(mobileOil).toBeVisible();
  await expect(mobileOil).toBeDisabled(); // The selected factory is already level three.
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `artifacts/oil-factory-${prefix}-mobile.png` });
  await page.locator("build-menu").evaluate((menu) => menu.hideMenu());
  await page.setViewportSize({ width: 1440, height: 1000 });
  return target.ownerID;
}

try {
  const disabled = await newPage("OilDisabled");
  await disabled.goto(baseUrl);
  await disabled
    .getByRole("button", { name: "Play solo", exact: true })
    .click();
  const disableOption = disabled.getByRole("button", {
    name: OIL,
    exact: true,
  });
  await expect(disableOption).toHaveAttribute("aria-pressed", "true");
  await disableOption.click();
  await expect(disableOption).toHaveAttribute("aria-pressed", "false");
  await disabled.getByRole("button", { name: /^random spawn$/i }).click();
  await disabled.getByRole("button", { name: /^start game$/i }).click();
  await running(disabled);
  assert.equal(
    await disabled.evaluate(
      (OIL) =>
        document
          .querySelector("control-panel")
          .game.config()
          .isUnitDisabled(OIL),
      OIL,
    ),
    true,
  );
  await expect(
    disabled.locator('unit-display img[alt="oil_factory"]'),
  ).toHaveCount(0);
  await disabled.context().close();
  console.log("Solo Disable Units: Oil Factory excluded from the game");

  const solo = await newPage("OilSolo");
  await solo.goto(baseUrl);
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await configureEconomy(solo);
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await running(solo);
  await buildAndUpgrade(solo, "solo");
  await solo.context().close();
  console.log(
    "Solo Oil Factory: icon, construction, prices, income, level-three cap and mobile HUD passed",
  );

  const host = await newPage("OilHost");
  await host.goto(baseUrl);
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  const guest = await newPage("OilGuest");
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("OilGuest");
  const multiplayerOption = host.getByRole("button", {
    name: OIL,
    exact: true,
  });
  await multiplayerOption.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((modal) =>
          modal.gameConfig?.disabledUnits?.includes("Oil Factory"),
        ),
    )
    .toBe(true);
  await multiplayerOption.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((modal) =>
          modal.gameConfig?.disabledUnits?.includes("Oil Factory"),
        ),
    )
    .toBe(false);
  await configureEconomy(host);
  await host.getByRole("button", { name: /^start game$/i }).click();
  await running(host);
  await running(guest);
  const ownerID = await buildAndUpgrade(host, "multiplayer");
  await expect.poll(() => factoryLevel(guest, ownerID)).toBe(3);
  await guest.waitForTimeout(11000);
  await expect(
    guest.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => factoryLevel(guest, ownerID)).toBe(3);
  console.log(
    "Multiplayer Oil Factory: disable option synchronized, construction/upgrades synchronized, payout ticks remain connected",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
