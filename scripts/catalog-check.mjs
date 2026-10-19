import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.BASE_URL || "http://localhost:9000";
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
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("error creating"))
      console.error("Console:", m.text());
  });
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Browser error:", e.message);
  });
  await page.goto(base);
  return page;
}
async function select(page, map) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill(map.name);
  const card = page.getByRole("button", { name: map.name, exact: true });
  await expect(card).toContainText("Build By Artin Zomorodian");
  await card.click();
  await expect
    .poll(() =>
      page
        .locator("single-player-modal:visible, host-lobby-modal:visible")
        .evaluate((modal) => modal.defaultNationCount),
    )
    .toBe(12);
  await page.getByRole("button", { name: /^random spawn$/i }).click();
}
async function running(page, map) {
  await expect(page.locator("body")).toHaveClass(/in-game/, { timeout: 60000 });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.querySelector("control-panel")?.game?.ticks(),
        ),
      { timeout: 60000 },
    )
    .toBeGreaterThan(10);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector("control-panel").game.config().gameConfig()
          .gameMap,
    ),
    "Community:" + map.id,
  );
  assert.equal(
    await page.evaluate(() =>
      document.querySelector("control-panel").game.width(),
    ),
    2048,
  );
  await expect(
    page.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
}
try {
  const page = await player("CatalogScout");
  const maps = (
    await (await page.request.get(base + "/api/community/maps")).json()
  ).maps.filter((m) => m.author === "Artin Zomorodian");
  assert.equal(maps.length, 3);
  for (const map of maps) {
    assert.equal(map.width, 2048);
    assert.equal(map.height, 1536);
    assert.match(map.description, /Build By Artin Zomorodian/);
    const manifest = await (
      await page.request.get(
        `${base}/api/community/maps/${map.id}/manifest.json`,
      )
    ).json();
    assert.equal(manifest.nations.length, 12);
  }
  // Header guest access, plain text guide, and responsive layout.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base);
    await expect(
      page.getByRole("button", { name: "Log in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create map", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".terrain-editor")).toHaveCount(0);
    await expect(page.locator('a[href="/source.zip"]')).toHaveCount(0);
    await page
      .locator("page-footer")
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await expect(page.locator(".game-guide")).toBeVisible();
    await expect(page.locator(".game-guide")).toContainText("40 tiles apart");
    await expect(page.locator(".game-guide iframe")).toHaveCount(0);
    const before = page.url();
    await page
      .getByRole("link", { name: "Trade & tunnels", exact: true })
      .click();
    assert.equal(
      page.url(),
      before,
      "Guide anchors must not change the game router hash",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: `artifacts/guide-${width}.png` });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.locator(".auth-form")).toBeVisible();
    await expect(page.locator(".terrain-editor")).toHaveCount(0);
    await page.screenshot({ path: `artifacts/login-${width}.png` });
  }
  assert.equal((await page.request.head(base + "/source.zip")).status(), 404);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const username = "Catalog_" + Date.now().toString(36),
    password = "CatalogTest123!";
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create map", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".terrain-editor")).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create map", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .locator(".auth-form")
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Profile", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  console.log(
    "Guest gating, signup, logout, login, text guide, retired download and 1440/390/320 layouts passed",
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Play solo", exact: true }).click();
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill("");
  await page.locator(".approved-map-section:visible").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/catalog-maps.png" });
  // Inspect all three original map thumbnails at a useful scale.
  const atlas = await browser.newPage({
    viewport: { width: 1440, height: 650 },
  });
  await atlas.goto(base);
  await atlas.setContent(
    `<html style="background:#080d10;color:#dce9e2;font-family:Arial"><body style="margin:30px"><h1>Build By Artin Zomorodian</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">${maps.map((m) => `<article><h2 style="font-size:18px">${m.name}</h2><img style="width:100%;border-radius:8px" src="${base}/api/community/maps/${m.id}/thumbnail.svg"><p style="line-height:1.6;font-size:13px">${m.description}</p></article>`).join("")}</div></body></html>`,
  );
  await expect(atlas.locator("img").first()).toHaveJSProperty("complete", true);
  await atlas.screenshot({ path: "artifacts/catalog-atlas.png" });
  await atlas.close();
  for (const map of maps) {
    console.log("Starting solo: " + map.name);
    const solo = await player("SoloScout");
    await solo.getByRole("button", { name: "Play solo", exact: true }).click();
    await select(solo, map);
    await solo.getByRole("button", { name: /^start game$/i }).click();
    await running(solo, map);
    await solo.screenshot({
      path: `artifacts/catalog-solo-${map.id.slice(0, 8)}.png`,
    });
    await solo.context().close();
    console.log(map.name + ": actual solo game passed");
  }
  const host = await player("CatalogHost"),
    guest = await player("CatalogGuest"),
    map = maps.find((m) => m.name === "Shattered Crown");
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  await select(host, map);
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("CatalogGuest");
  await expect(guest.locator("join-lobby-modal")).toContainText(map.name);
  await host.getByRole("button", { name: /^start game$/i }).click();
  await running(host, map);
  await running(guest, map);
  await expect
    .poll(() =>
      guest.evaluate(() =>
        document.querySelector("control-panel").game.ticks(),
      ),
    )
    .toBeGreaterThan(40);
  await host.screenshot({ path: "artifacts/catalog-multiplayer.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Shattered Crown: two-client multiplayer game and synchronization passed",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  for (const [i, c] of browser.contexts().entries())
    for (const p of c.pages()) {
      console.error(
        "Page " + i + ":",
        await p
          .locator("body")
          .innerText()
          .catch(() => ""),
      );
      await p
        .screenshot({ path: "artifacts/catalog-failure-" + i + ".png" })
        .catch(() => {});
    }
  throw error;
} finally {
  await browser.close();
}
