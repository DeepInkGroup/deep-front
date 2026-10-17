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
    2048,
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
    owner.getByRole("button", { name: "Profile", exact: true }),
  ).toHaveCount(0);
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
  await owner.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(owner.locator("profile-page")).toBeVisible();
  await expect(owner.locator(".profile-identity")).toContainText(username);
  await expect(owner.locator(".profile-stats")).toContainText(
    "Signed-in sessions",
  );
  await owner.reload();
  await expect(owner.locator("profile-page")).toBeVisible();
  for (const width of [390, 320]) {
    await owner.setViewportSize({ width, height: 950 });
    assert.equal(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Profile fits at ${width}px`,
    );
    assert.equal(
      await owner
        .getByRole("button", { name: "Profile", exact: true })
        .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
      true,
      `Profile icon is fully visible at ${width}px`,
    );
  }
  await owner.screenshot({ path: "artifacts/community-profile-mobile.png" });
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await owner.getByRole("button", { name: "Map studio", exact: true }).click();
  const canvas = owner.locator(".terrain-editor");
  await expect(canvas).toBeVisible();
  await expect(
    owner.getByRole("combobox", { name: "Map size", exact: true }),
  ).toHaveValue("16");
  await owner
    .getByRole("button", { name: "Twin Straits", exact: true })
    .click();
  await expect(owner.locator(".world-idea")).toContainText("Four rival shores");
  const savedTiles = () =>
    owner.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            `deepfront.map-draft.${document.querySelector("community-page").user.id}`,
          ),
        ).tiles,
    );
  const straits = await savedTiles();
  await owner.getByRole("button", { name: "Inland Sea", exact: true }).click();
  assert.notDeepEqual(await savedTiles(), straits);
  await owner.getByRole("button", { name: "Undo", exact: true }).click();
  assert.deepEqual(await savedTiles(), straits);
  await owner.getByRole("button", { name: "Redo", exact: true }).click();
  assert.notDeepEqual(await savedTiles(), straits);
  await owner.getByRole("button", { name: "Archipelago", exact: true }).click();
  await owner.getByLabel("Editor zoom", { exact: true }).selectOption("2");
  assert.equal(
    await owner
      .locator(".terrain-viewport")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    true,
  );
  await owner.getByLabel("Editor zoom", { exact: true }).selectOption("1");
  await owner.getByLabel("Grid", { exact: true }).check();
  const archipelago = await savedTiles();
  const clickCell = async (x, y) => {
    await canvas.scrollIntoViewIfNeeded();
    const area = await canvas.boundingBox();
    await owner.mouse.click(
      area.x + (area.width * (x + 0.5)) / 128,
      area.y + (area.height * (y + 0.5)) / 96,
    );
  };
  await owner
    .getByRole("button", { name: "River / canal", exact: true })
    .click();
  await clickCell(38, 42);
  assert.equal((await savedTiles())[42 * 128 + 38], 0);
  await owner.getByRole("button", { name: "Undo", exact: true }).click();
  assert.deepEqual(await savedTiles(), archipelago);
  await owner.getByRole("button", { name: "Mountains", exact: true }).click();
  await owner.getByLabel("Paint mode", { exact: true }).selectOption("fill");
  await clickCell(0, 0);
  assert.equal((await savedTiles())[0], 3);
  await owner.getByRole("button", { name: "Undo", exact: true }).click();
  assert.deepEqual(await savedTiles(), archipelago);
  await owner.getByLabel("Paint mode", { exact: true }).selectOption("brush");
  await owner.getByRole("button", { name: "Smooth", exact: true }).click();
  await clickCell(38, 42);
  const smoothed = await savedTiles();
  assert.equal(smoothed.length, archipelago.length);
  assert(smoothed.every((t) => t >= 0 && t <= 3));
  await owner.getByRole("button", { name: "Undo", exact: true }).click();
  assert.deepEqual(await savedTiles(), archipelago);
  await canvas.scrollIntoViewIfNeeded();
  await owner.getByRole("button", { name: "Hills", exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
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
  await clickCell(38, 42);
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
  await admin.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(admin.locator(".profile-identity")).toContainText(
    "Management only",
  );
  await admin
    .getByRole("button", { name: "Back to admin panel", exact: true })
    .click();
  await expect(admin.locator("community-page .admin-stats")).toContainText(
    "Stored map assets",
  );
  await admin.getByLabel("Search maps", { exact: true }).fill(name);
  await expect(admin.locator(".submission-card")).toHaveCount(1);
  await admin
    .getByLabel("Search maps", { exact: true })
    .fill("absent-map-12345");
  await expect(admin.locator(".submission-card")).toHaveCount(0);
  await admin.getByLabel("Search maps", { exact: true }).fill("");
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
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.getByRole("button", { name: /^Approved \d+$/ }).click();
  await admin
    .locator(".submission-card")
    .filter({ hasText: approvedName })
    .getByRole("button", { name: "Unpublish", exact: true })
    .click();
  assert.equal(
    (await (await api(owner, "/maps")).json()).maps.some(
      (m) => m.id === approved.id,
    ),
    false,
  );
  assert.equal(
    (await api(owner, `/maps/${approved.id}/map.bin`)).status(),
    200,
  );
  await admin.getByRole("button", { name: /^Withdrawn \d+$/ }).click();
  await admin
    .locator(".submission-card")
    .filter({ hasText: approvedName })
    .getByRole("button", { name: "Republish", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText("Map republished");
  await admin.getByLabel("Search accounts", { exact: true }).fill(username);
  const row = admin
    .locator(".account-list > div")
    .filter({ hasText: username });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("2 submitted");
  await row
    .getByRole("button", { name: "Sign out devices", exact: true })
    .click();
  assert.equal((await api(owner, "/profile")).status(), 401);
  await row
    .getByRole("button", { name: "Disable account", exact: true })
    .click();
  await expect(row).toContainText("disabled");
  await row
    .getByRole("button", { name: "Enable account", exact: true })
    .click();
  await expect(admin.locator(".activity-list")).toContainText(
    "Map republished",
  );
  await expect(admin.locator(".activity-list")).toContainText(
    "Sessions revoked",
  );
  await owner.goto(base);
  await expect(
    owner.getByRole("button", { name: "Profile", exact: true }),
  ).toHaveCount(0);
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
