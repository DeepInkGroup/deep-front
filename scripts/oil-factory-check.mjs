import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Keep the original command; --copper runs the same integration checks for mines.
const copper = process.argv.includes("--copper");
const RESOURCE = copper ? "Copper Mine" : "Oil Factory";
const ICON = copper ? "copper_mine" : "oil_factory";
const MAX_LEVEL = copper ? 2 : 3;
const PAYOUT = copper ? 40_000n : 90_000n;
const TOTAL_COST = copper ? 1_650_000n : 4_000_000n;
const ARTIFACT = copper ? "copper-mine" : "oil-factory";
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
async function buildingLevel(page, ownerID) {
  return page.evaluate(
    ({ ownerID, RESOURCE }) => {
      const game = document.querySelector("control-panel")?.game;
      const units = game
        ?.units(RESOURCE)
        .filter((unit) => !ownerID || unit.owner().id() === ownerID);
      return units?.[0]?.level() ?? 0;
    },
    { ownerID, RESOURCE },
  );
}
async function buildAndUpgrade(page, prefix) {
  await page.waitForTimeout(2000); // Let the spawn camera settle before placing a building.
  const hotbar = page.locator(`unit-display img[alt="${ICON}"]`);
  await expect(hotbar).toBeVisible();
  await expect(hotbar).toHaveJSProperty("complete", true);
  await expect(hotbar).not.toHaveJSProperty("naturalWidth", 0);
  const target = await page.evaluate(async (RESOURCE) => {
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
          const [candidate] = await player.buildables(tile, [RESOURCE]);
          if (candidate.canBuild !== false)
            return { tile: candidate.canBuild, ownerID: player.id() };
        }
      }
    }
    throw new Error("No valid oil factory site in the player's territory");
  }, RESOURCE);
  for (let level = 1; level <= MAX_LEVEL; level++) {
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
        .poll(() => buildingLevel(page, target.ownerID), { timeout: 12000 })
        .toBe(level);
    } catch (error) {
      await page.screenshot({
        path: `artifacts/${ARTIFACT}-${prefix}-failure.png`,
      });
      console.log(
        "PLACEMENT",
        { target, position, errors },
        await page.evaluate(
          ({ position, RESOURCE }) => {
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
              units: game.units(RESOURCE).length,
            };
          },
          { position, RESOURCE },
        ),
      );
      throw error;
    }
  }
  const preview = await page.evaluate(
    async ({ tile, RESOURCE }) => {
      const game = document.querySelector("control-panel").game;
      const [result] = await game.myPlayer().buildables(tile, [RESOURCE]);
      return {
        canUpgrade: result.canUpgrade,
        gold: String(game.myPlayer().gold()),
      };
    },
    { tile: target.tile, RESOURCE },
  );
  assert.equal(preview.canUpgrade, false);
  assert.ok(
    BigInt(preview.gold) < 6_000_000n - TOTAL_COST + 1_000_000n,
    "The total build and upgrade cost should be charged",
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
    .toBeGreaterThanOrEqual(BigInt(preview.gold) + PAYOUT);
  await page.screenshot({ path: `artifacts/${ARTIFACT}-${prefix}.png` });
  await page.setViewportSize({ width: 390, height: 950 });
  // Mobile uses the build menu rather than the desktop hotbar.
  await page
    .locator("build-menu")
    .evaluate((menu, tile) => menu.showMenu(tile), target.tile);
  const mobileOil = page
    .locator("build-menu")
    .getByRole("button", { name: new RegExp(RESOURCE) });
  await expect(mobileOil).toBeVisible();
  await expect(mobileOil).toBeDisabled(); // The selected building is at its level cap.
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `artifacts/${ARTIFACT}-${prefix}-mobile.png` });
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
    name: RESOURCE,
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
      (RESOURCE) =>
        document
          .querySelector("control-panel")
          .game.config()
          .isUnitDisabled(RESOURCE),
      RESOURCE,
    ),
    true,
  );
  await expect(disabled.locator(`unit-display img[alt="${ICON}"]`)).toHaveCount(
    0,
  );
  await disabled.context().close();
  console.log(`Solo Disable Units: ${RESOURCE} excluded from the game`);

  const solo = await newPage("OilSolo");
  await solo.goto(baseUrl);
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await configureEconomy(solo);
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await running(solo);
  await buildAndUpgrade(solo, "solo");
  await solo.context().close();
  console.log(
    `Solo ${RESOURCE}: icon, construction, prices, income, level cap and mobile HUD passed`,
  );

  const host = await newPage("OilHost");
  await host.goto(baseUrl);
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  const guest = await newPage("OilGuest");
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("OilGuest");
  const multiplayerOption = host.getByRole("button", {
    name: RESOURCE,
    exact: true,
  });
  await multiplayerOption.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate(
          (modal, resource) =>
            modal.gameConfig?.disabledUnits?.includes(resource),
          RESOURCE,
        ),
    )
    .toBe(true);
  await multiplayerOption.click();
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate(
          (modal, resource) =>
            modal.gameConfig?.disabledUnits?.includes(resource),
          RESOURCE,
        ),
    )
    .toBe(false);
  await configureEconomy(host);
  await host.getByRole("button", { name: /^start game$/i }).click();
  await running(host);
  await running(guest);
  const ownerID = await buildAndUpgrade(host, "multiplayer");
  await expect.poll(() => buildingLevel(guest, ownerID)).toBe(MAX_LEVEL);
  await expect
    .poll(
      () =>
        guest.evaluate(
          (resource) =>
            document
              .querySelector("control-panel")
              .game.units(resource)
              .filter((unit) => unit.owner().type() !== "HUMAN").length,
          RESOURCE,
        ),
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
  await guest.waitForTimeout(11000);
  await expect(
    guest.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => buildingLevel(guest, ownerID)).toBe(MAX_LEVEL);
  console.log(
    `Multiplayer ${RESOURCE}: disable option, construction, upgrades, income and AI building verified`,
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
