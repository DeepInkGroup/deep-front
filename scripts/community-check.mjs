import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.BASE_URL || "http://localhost:9000";
const stamp = Date.now().toString(36),
  username = `MapMaker_${stamp}`,
  name = `QA Strait ${stamp}`;
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
async function api(page, path, body) {
  return page.request.fetch(`${base}/api/community${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-DeepFront": "1", Origin: new URL(base).origin },
    data: body,
  });
}
async function openStudio(page) {
  await page.getByRole("button", { name: "Create map", exact: true }).click();
  await expect(page.locator("community-page")).toBeVisible();
}
async function chooseMap(page, mapName) {
  await page
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill(mapName);
  await page.getByRole("button", { name: mapName, exact: true }).click();
  await page.getByRole("button", { name: /^random spawn$/i }).click();
  const slider = page.locator(
    'fluent-slider[labelkey="game_settings.bots"] input[type="range"]:visible',
  );
  if (await slider.count())
    await slider.evaluate((input) => {
      input.value = "10";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
}
async function running(page, key) {
  await expect(page.locator("body")).toHaveClass(/in-game/, { timeout: 45000 });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.querySelector("control-panel")?.game?.ticks(),
        ),
      { timeout: 45000 },
    )
    .toBeGreaterThan(5);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector("control-panel").game.config().gameConfig()
          .gameMap,
    ),
    key,
  );
  assert.equal(
    await page.evaluate(() =>
      document.querySelector("control-panel").game.width(),
    ),
    1024,
  );
  await expect(
    page.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
}
async function socketOpens(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const socket = new WebSocket(
          location.origin.replace(/^http/, "ws") + "/w0",
        );
        const timer = setTimeout(() => {
          socket.close();
          resolve(false);
        }, 5000);
        socket.onopen = () => {
          clearTimeout(timer);
          socket.close();
          resolve(true);
        };
        socket.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      }),
  );
}
try {
  const owner = await pageFor(username);
  await owner.goto(base);
  await expect(
    owner.getByRole("link", { name: "Telegram", exact: true }),
  ).toHaveAttribute("href", "https://t.me/DeepFrontGame");
  await expect(
    owner.getByRole("link", { name: "GitHub", exact: true }),
  ).toHaveAttribute("href", "https://github.com/DeepInkGroup");
  await expect(owner.locator(".multiplayer-art")).toHaveJSProperty(
    "complete",
    true,
  );
  await expect(owner.locator(".multiplayer-art")).not.toHaveJSProperty(
    "naturalWidth",
    0,
  );
  await owner.screenshot({
    path: "artifacts/community-home.png",
    fullPage: true,
  });
  await openStudio(owner);
  await owner.getByRole("button", { name: "Sign up", exact: true }).click();
  await owner.getByLabel("Username", { exact: true }).fill(username);
  await owner.getByLabel("Password", { exact: true }).fill("MapMaker123!");
  await owner
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    owner.getByRole("heading", { name: "Build a world worth conquering." }),
  ).toBeVisible({ timeout: 20000 });
  const canvas = owner.locator(".terrain-editor");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  await owner.getByRole("button", { name: "Hills", exact: true }).click();
  await owner.mouse.move(box.x + box.width * 0.26, box.y + box.height * 0.35);
  await owner.mouse.down();
  await owner.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.44, {
    steps: 8,
  });
  await owner.mouse.up();
  await owner
    .getByRole("button", { name: "Nation spawn", exact: true })
    .click();
  await owner.getByLabel("Nation name", { exact: true }).fill("QA Nation");
  await owner.mouse.click(
    box.x + (box.width * 38) / 128,
    box.y + (box.height * 42) / 96,
  );
  // Unnamed painted drafts must survive a reload too.
  await owner.reload();
  await expect(owner.locator(".nation-list")).toContainText("QA Nation");
  await owner.getByLabel("Map name", { exact: true }).fill(name);
  await owner
    .getByLabel("Description", { exact: true })
    .fill(
      "A hand-painted two-island battlefield with a mountain ridge and a nation spawn.",
    );
  await owner.getByRole("button", { name: "Save draft", exact: true }).click();
  await owner.reload();
  await expect(owner.getByLabel("Map name", { exact: true })).toHaveValue(name);
  await owner.waitForTimeout(500);
  await owner.screenshot({ path: "artifacts/community-editor-desktop.png" });
  await owner.setViewportSize({ width: 390, height: 950 });
  assert.equal(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await canvas.scrollIntoViewIfNeeded();
  await owner.screenshot({ path: "artifacts/community-editor-mobile.png" });
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await owner
    .getByRole("button", { name: "Publish for review", exact: true })
    .click();
  await expect(owner.getByRole("status")).toContainText("Map submitted");
  let submissions = (await (await api(owner, "/my-maps")).json()).maps;
  const first = submissions.find((m) => m.name === name);
  assert(first);
  assert.equal(first.status, "pending");
  assert.equal(
    (await (await api(owner, "/maps")).json()).maps.some(
      (m) => m.id === first.id,
    ),
    false,
  );
  console.log(
    "Signup, real terrain painting, nation spawns, persisted drafts, private pending submission, and mobile editor passed",
  );

  const admin = await pageFor("Administrator");
  await admin.goto(base);
  await openStudio(admin);
  await admin.getByLabel("Username", { exact: true }).fill("Admin");
  await admin.getByLabel("Password", { exact: true }).fill("Admin123");
  await admin
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(
    admin.getByRole("heading", { name: "Admin panel", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    admin.getByRole("button", { name: "Play solo", exact: true }),
  ).toHaveCount(0);
  const denied = await admin.request.post(`${base}/api/create_game`, {
    headers: { Authorization: "Bearer ignored" },
    data: {},
  });
  assert.equal(denied.status(), 403);
  assert.match(await denied.text(), /cannot play/);
  assert.equal(
    await socketOpens(owner),
    true,
    "Regular account can connect to game WebSocket",
  );
  assert.equal(
    await socketOpens(admin),
    false,
    "Admin is blocked at the WebSocket upgrade",
  );
  await admin.evaluate(() =>
    window.dispatchEvent(new CustomEvent("join-lobby", { detail: {} })),
  );
  await expect(admin.locator("body")).not.toHaveClass(/in-game/);
  await admin
    .locator(".submission-card")
    .filter({ hasText: name })
    .getByRole("button", { name: "Review details", exact: true })
    .click();
  await admin
    .getByLabel("Review feedback", { exact: true })
    .fill("Please refine the coastline and resubmit.");
  await admin
    .getByRole("button", { name: "Reject with feedback", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText("Map rejected");
  await owner.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(owner.locator(".submissions")).toContainText(
    "Please refine the coastline",
  );
  await owner
    .locator(".submission-card")
    .filter({ hasText: name })
    .getByRole("button", { name: "Edit a copy", exact: true })
    .click();
  const approvedName = name + " v2";
  await expect(owner.getByLabel("Map name", { exact: true })).toHaveValue(
    approvedName,
  );
  await owner
    .getByRole("button", { name: "Publish for review", exact: true })
    .click();
  await expect(owner.getByRole("status")).toContainText("Map submitted");
  await admin.getByRole("button", { name: "Refresh", exact: true }).click();
  await admin
    .locator(".submission-card")
    .filter({ hasText: approvedName })
    .getByRole("button", { name: "Review details", exact: true })
    .click();
  await admin.screenshot({ path: "artifacts/community-admin-review.png" });
  const guest = await pageFor("CommunityGuest");
  await guest.goto(base);
  await guest.getByRole("button", { name: "Play solo", exact: true }).click();
  await guest
    .getByPlaceholder("Search maps...", { exact: true })
    .filter({ visible: true })
    .fill(approvedName);
  await expect(
    guest.getByRole("button", { name: approvedName, exact: true }),
  ).toHaveCount(0);
  await admin
    .getByRole("button", { name: "Approve and publish", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText("Map approved");
  const catalog = (await (await api(owner, "/maps")).json()).maps,
    approved = catalog.find((m) => m.name === approvedName);
  assert(approved);
  const key = "Community:" + approved.id;
  await admin.setViewportSize({ width: 390, height: 950 });
  assert.equal(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await admin.screenshot({ path: "artifacts/community-admin-mobile.png" });
  console.log(
    "Admin-only management, HTTP/WebSocket gameplay denial, review feedback, resubmission and automatic publication passed",
  );

  await expect(
    guest.getByRole("button", { name: approvedName, exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await chooseMap(guest, approvedName);
  await guest.getByRole("button", { name: /^start game$/i }).click();
  await running(guest, key);
  await guest.screenshot({ path: "artifacts/community-solo.png" });
  console.log("Approved user map loads and runs in real solo gameplay");
  await guest.goto(base);
  await owner.getByRole("button", { name: "Play", exact: true }).click();
  await owner.getByRole("button", { name: "Host a game", exact: true }).click();
  await expect.poll(() => owner.url()).toMatch(/\/game\//);
  await chooseMap(owner, approvedName);
  await guest.goto(owner.url());
  await expect(owner.locator("host-lobby-modal")).toContainText(
    "CommunityGuest",
  );
  await expect(guest.locator("join-lobby-modal")).toContainText(approvedName);
  await owner.getByRole("button", { name: /^start game$/i }).click();
  await running(owner, key);
  await running(guest, key);
  await guest.waitForTimeout(5000);
  await expect(
    guest.getByText("Connection error!", { exact: true }),
  ).toHaveCount(0);
  await owner.screenshot({ path: "artifacts/community-multiplayer.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Approved user map runs in multiplayer on two connected clients; no browser errors",
  );
} catch (error) {
  for (const [i, context] of browser.contexts().entries())
    for (const page of context.pages())
      await page
        .screenshot({ path: `artifacts/community-failure-${i}.png` })
        .catch(() => {});
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
