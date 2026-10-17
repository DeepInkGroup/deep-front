import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

const baseUrl = process.env.BASE_URL || "http://localhost:9000";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function player(name) {
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
async function selectMap(page, compact = false) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill("DeepPlace");
  const card = page.getByRole("button", { name: "DeepPlace", exact: true });
  await card.click();
  await expect(card).toHaveAttribute("aria-selected", "true");
  await expect(card.locator("img")).toHaveJSProperty("complete", true);
  await expect(card.locator("img")).not.toHaveJSProperty("naturalWidth", 0);
  await page.getByRole("button", { name: /^random spawn$/i }).click();
  await page.getByRole("button", { name: /^instant build$/i }).click();
  await page.getByRole("button", { name: /^infinite troops$/i }).click();
  const starting = page
    .locator("toggle-input-card:visible")
    .filter({ hasText: /Starting Gold \(Millions\)/i });
  await starting.getByRole("button").click();
  await starting.getByRole("spinbutton").fill("6");
  if (compact)
    await page.getByRole("button", { name: /^compact map$/i }).click();
}
async function running(page, width) {
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
  assert.equal(
    await page.evaluate(() =>
      document.querySelector("control-panel").game.width(),
    ),
    width,
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector("control-panel").game.config().gameConfig()
          .gameMap,
    ),
    "DeepPlace",
  );
}
async function buildResources(page) {
  await page.waitForTimeout(2000);
  // Expand from the tiny starting territory through the regular attack hotkey.
  const neutral = await page.evaluate(() => {
    const game = document.querySelector("control-panel").game;
    const center = game.myPlayer().nameLocation();
    for (let radius = 5; radius < 30; radius++)
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = Math.round(center.x) + dx,
            y = Math.round(center.y) + dy;
          if (!game.isValidCoord(x, y)) continue;
          const tile = game.ref(x, y);
          if (game.isLand(tile) && !game.hasOwner(tile)) {
            const menu = document.querySelector("build-menu");
            return menu.transformHandler.worldToScreenCoordinates({
              x: x + 0.5,
              y: y + 0.5,
            });
          }
        }
    throw new Error("No neutral expansion tile");
  });
  await page.mouse.move(neutral.x, neutral.y);
  await page.keyboard.press("g");
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document
            .querySelector("control-panel")
            .game.myPlayer()
            .numTilesOwned(),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(2500);
  for (const [type, icon] of [
    ["Oil Factory", "oil_factory"],
    ["Copper Mine", "copper_mine"],
  ]) {
    const tile = await page.evaluate(async (type) => {
      const game = document.querySelector("control-panel").game;
      const player = game.myPlayer(),
        center = player.nameLocation();
      const existing = [
        ...player.units("Oil Factory"),
        ...player.units("Copper Mine"),
      ];
      for (let radius = 0; radius <= 35; radius += 3) {
        for (let dy = -radius; dy <= radius; dy += 3)
          for (let dx = -radius; dx <= radius; dx += 3) {
            const x = Math.round(center.x) + dx,
              y = Math.round(center.y) + dy;
            if (!game.isValidCoord(x, y)) continue;
            const tile = game.ref(x, y);
            if (game.owner(tile).id() !== player.id()) continue;
            if (
              existing.some(
                (u) =>
                  (game.x(u.tile()) - x) ** 2 + (game.y(u.tile()) - y) ** 2 <
                  20 ** 2,
              )
            )
              continue;
            const [buildable] = await player.buildables(tile, [type]);
            if (buildable.canBuild !== false) return buildable.canBuild;
          }
      }
      throw new Error(`No build site for ${type}`);
    }, type);
    await page.locator(`unit-display img[alt="${icon}"]`).click();
    const position = await page.evaluate((tile) => {
      const menu = document.querySelector("build-menu");
      return menu.transformHandler.worldToScreenCoordinates({
        x: menu.game.x(tile) + 0.5,
        y: menu.game.y(tile) + 0.5,
      });
    }, tile);
    await page.mouse.move(position.x, position.y);
    await page.waitForTimeout(500);
    await page.mouse.click(position.x, position.y);
    await expect
      .poll(
        () =>
          page.evaluate(
            (type) =>
              document
                .querySelector("control-panel")
                .game.myPlayer()
                .units(type).length,
            type,
          ),
        { timeout: 15000 },
      )
      .toBe(1);
  }
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const game = document.querySelector("control-panel").game;
          const player = game.myPlayer();
          return ["Oil Factory", "Copper Mine"].every((type) =>
            player.units(type)[0]?.hasTrainStation(),
          );
        }),
      { timeout: 10000 },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const game = document.querySelector("control-panel").game;
          const [oil] = game.myPlayer().units("Oil Factory");
          const [mine] = game.myPlayer().units("Copper Mine");
          const near = (a, b) =>
            (game.x(a) - game.x(b)) ** 2 + (game.y(a) - game.y(b)) ** 2 <
            8 ** 2;
          return [...game.railroadCache.getRailroads().values()].some(
            (tiles) =>
              tiles.some((t) => near(t, oil.tile())) &&
              tiles.some((t) => near(t, mine.tile())),
          );
        }),
      { timeout: 15000 },
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await page.mouse.move(1400, 800);
  await page.waitForTimeout(1500);
}
try {
  const solo = await player("DeepSolo");
  await solo.goto(baseUrl);
  await expect(solo.locator(".server-lobbies")).toHaveCount(0);
  await expect(
    solo.getByRole("button", { name: /join.*(code|game)/i }),
  ).toHaveCount(0);
  await solo.getByRole("button", { name: "Play solo", exact: true }).click();
  await selectMap(solo);
  await solo.screenshot({ path: "artifacts/deepplace-picker.png" });
  await solo.getByRole("button", { name: /^start game$/i }).click();
  await running(solo, 2048);
  await buildResources(solo);
  await solo.screenshot({ path: "artifacts/deepplace-resource-roads.png" });
  console.log(
    "DeepPlace normal solo: real UI map selection, both resource buildings and visible railroads passed",
  );
  await solo.context().close();

  const host = await player("DeepHost");
  await host.goto(baseUrl);
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  await selectMap(host, true);
  const guest = await player("DeepGuest");
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("DeepGuest");
  await expect
    .poll(() =>
      guest
        .locator("join-lobby-modal")
        .evaluate((modal) => modal.gameConfig?.gameMap),
    )
    .toBe("DeepPlace");
  await host.getByRole("button", { name: /^start game$/i }).click();
  await running(host, 1024);
  await running(guest, 1024);
  await buildResources(host);
  await expect
    .poll(
      () =>
        guest.evaluate(() => {
          const game = document.querySelector("control-panel").game;
          return ["Oil Factory", "Copper Mine"].every((type) =>
            game
              .units(type)
              .some(
                (u) => u.owner().name() === "DeepHost" && u.hasTrainStation(),
              ),
          );
        }),
      { timeout: 15000 },
    )
    .toBe(true);
  await host.screenshot({ path: "artifacts/deepplace-multiplayer.png" });
  await guest.waitForTimeout(4000);
  await expect(
    guest.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "DeepPlace compact multiplayer: invite links, two running clients and resource railroad synchronization passed",
  );
} finally {
  await browser.close();
}
