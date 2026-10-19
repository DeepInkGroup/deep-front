import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.BASE_URL || "http://localhost:9000";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function player(name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addInitScript((name) => {
    localStorage.setItem("username", name);
    localStorage.setItem("settings.tutorialDismissed", "true");
  }, name);
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  return p;
}
async function api(page, path, body) {
  return page.request.fetch(base + "/api/community" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-DeepFront": "1", Origin: new URL(base).origin },
    data: body,
  });
}
async function select(page, map) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill(map.name);
  await page.getByRole("button", { name: map.name, exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("single-player-modal:visible,host-lobby-modal:visible")
        .evaluate((m) => m.defaultNationCount),
    )
    .toBe(8);
  await page.getByRole("button", { name: /^random spawn$/i }).click();
}
async function running(page, key) {
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
    key,
  );
  await expect(
    page.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
}
try {
  const owner = await player("ImageMaker");
  await owner.getByRole("button", { name: "Log in", exact: true }).click();
  await owner.getByRole("button", { name: "Sign up", exact: true }).click();
  await owner
    .getByLabel("Username", { exact: true })
    .fill("Image_" + Date.now().toString(36));
  await owner.getByLabel("Password", { exact: true }).fill("ImageMapTest123!");
  await owner
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const studio = owner.locator("community-page");
  await expect(studio.locator(".terrain-editor")).toBeVisible({
    timeout: 20000,
  });
  await studio.locator(".image-map-import summary").click();
  const upload = owner.getByLabel("Upload map image", { exact: true });
  await upload.setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a map"),
  });
  await expect(owner.locator(".import-error")).toContainText("PNG");
  const png = await owner.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 400;
    const x = c.getContext("2d");
    x.fillStyle = "#328bc3";
    x.fillRect(0, 0, 600, 400);
    x.fillStyle = "#8db36f";
    x.beginPath();
    x.moveTo(80, 60);
    x.bezierCurveTo(240, 10, 420, 35, 510, 120);
    x.bezierCurveTo(560, 240, 490, 330, 350, 355);
    x.bezierCurveTo(200, 370, 60, 300, 70, 180);
    x.closePath();
    x.fill();
    x.fillStyle = "#b98c60";
    x.beginPath();
    x.ellipse(330, 160, 95, 40, 0.6, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = "#328bc3";
    x.lineWidth = 9;
    x.beginPath();
    x.moveTo(270, 60);
    x.bezierCurveTo(220, 140, 320, 220, 280, 370);
    x.stroke();
    return c.toDataURL("image/png").split(",")[1];
  });
  const fixture = Buffer.from(png, "base64");
  fs.writeFileSync("artifacts/image-import-fixture.png", fixture);
  await upload.setInputFiles({
    name: "River Country.png",
    mimeType: "image/png",
    buffer: fixture,
  });
  await expect(studio.locator(".import-terrain-preview")).toBeVisible();
  const result = await studio.evaluate((p) => ({
    land: p.importResult.landPercent,
    size: p.importResult.tiles.length,
  }));
  assert.equal(result.size, 512 * 384);
  assert.ok(result.land > 30 && result.land < 85);
  await owner.screenshot({
    path: "artifacts/image-import-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await owner.setViewportSize({ width, height: 1000 });
    await studio.locator(".image-map-import").scrollIntoViewIfNeeded();
    assert.equal(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await owner.screenshot({
      path: `artifacts/image-import-${width}.png`,
      fullPage: true,
    });
  }
  await owner.setViewportSize({ width: 1440, height: 1100 });
  await owner
    .getByRole("combobox", { name: "Water detection", exact: true })
    .selectOption("land");
  await expect
    .poll(() => studio.evaluate((p) => p.importResult.landPercent))
    .toBeGreaterThan(85);
  await owner
    .getByRole("combobox", { name: "Water detection", exact: true })
    .selectOption("auto");
  await owner
    .getByRole("button", { name: "Use generated map", exact: true })
    .click();
  assert.equal(await studio.evaluate((p) => p.draft.gridWidth), 512);
  assert.equal(await studio.evaluate((p) => p.draft.tiles.length), 512 * 384);
  await owner.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await studio.evaluate((p) => p.draft.gridWidth ?? 128), 128);
  assert.equal(
    await studio.evaluate((p) => p.draft.tiles.some((x) => x > 0)),
    false,
  );
  await owner.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(await studio.evaluate((p) => p.draft.gridWidth), 512);
  // Paint, undo and redo on the imported fine grid.
  await owner.getByRole("button", { name: "Water", exact: true }).click();
  const canvas = studio.locator(".terrain-editor");
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  const count = () =>
    studio.evaluate((p) => p.draft.tiles.filter((t) => t > 0).length);
  const before = await count();
  await owner.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.5);
  assert.ok((await count()) < before);
  await owner.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await count(), before);
  await owner
    .getByRole("button", { name: "Randomize spawns", exact: true })
    .click();
  assert.equal(await studio.evaluate((p) => p.draft.nations.length), 8);
  const name = "Image River " + Date.now().toString(36);
  await owner.getByLabel("Map name", { exact: true }).fill(name);
  await owner.reload();
  await expect(studio.locator(".terrain-editor")).toBeVisible();
  assert.equal(await studio.evaluate((p) => p.draft.gridWidth), 512);
  assert.equal(await studio.evaluate((p) => p.draft.nations.length), 8);
  await owner
    .getByRole("button", { name: "Show map full screen", exact: true })
    .click();
  await expect
    .poll(() => owner.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await owner.screenshot({ path: "artifacts/image-import-fullscreen.png" });
  await owner
    .getByRole("button", { name: "Exit full screen map", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Publish for review", exact: true })
    .click();
  await expect(owner.getByRole("status")).toContainText("Map submitted");
  const map = (await (await api(owner, "/my-maps")).json()).maps.find(
    (m) => m.name === name,
  );
  assert.equal(map.status, "pending");
  assert.equal((await api(owner, `/maps/${map.id}/map.bin`)).status(), 404);
  console.log(
    "Image upload, classification controls, desktop/mobile preview, fine-grid painting, undo/redo, spawns, fullscreen, persistence and pending review passed",
  );
  const admin = await player("AdminReview");
  await api(admin, "/login", { username: "Admin", password: "Admin123" });
  const approval = await api(admin, `/admin/maps/${map.id}/review`, {
    action: "approve",
    notes: "Image import browser QA",
  });
  assert.equal(approval.status(), 200);
  const manifest = await (
    await api(owner, `/maps/${map.id}/manifest.json`)
  ).json();
  assert.equal(manifest.map.width, 2048);
  assert.equal(manifest.nations.length, 8);
  const key = "Community:" + map.id;
  const guest = await player("ImageGuest");
  await guest.getByRole("button", { name: "Play solo", exact: true }).click();
  await select(guest, map);
  await guest.getByRole("button", { name: /^start game$/i }).click();
  await running(guest, key);
  await guest.screenshot({ path: "artifacts/image-import-solo.png" });
  await guest.goto(base);
  await owner.getByRole("button", { name: "Play", exact: true }).click();
  await owner.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => owner.url()).toMatch(/\/game\//);
  await select(owner, map);
  await guest.goto(owner.url());
  await expect(owner.locator("host-lobby-modal")).toContainText("ImageGuest");
  await owner.getByRole("button", { name: /^start game$/i }).click();
  await running(owner, key);
  await running(guest, key);
  await owner.screenshot({ path: "artifacts/image-import-multiplayer.png" });
  await api(admin, `/admin/maps/${map.id}/withdraw`, {});
  assert.deepEqual(errors, []);
  console.log(
    "Imported image map: approval, real solo and two-client multiplayer gameplay passed; QA map unpublished",
  );
} catch (e) {
  for (const [i, c] of browser.contexts().entries())
    for (const p of c.pages())
      await p
        .screenshot({ path: `artifacts/image-import-failure-${i}.png` })
        .catch(() => {});
  console.error("Browser errors:", errors);
  throw e;
} finally {
  await browser.close();
}
