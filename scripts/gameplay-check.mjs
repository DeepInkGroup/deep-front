import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
const baseUrl = process.env.BASE_URL || "http://localhost:9000";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGE ERROR", e.message);
});
await page.goto(baseUrl);
await page.getByRole("button", { name: "Play solo", exact: true }).click();
await page.getByRole("button", { name: /^random spawn$/i }).click();
await page.getByRole("button", { name: /^start game$/i }).click();
await expect(page.locator("body")).toHaveClass(/in-game/, { timeout: 45000 });
await expect(page.locator("canvas").first()).toBeVisible();
await expect(page.getByText("Connection error!", { exact: true })).toHaveCount(
  0,
);
await page.waitForTimeout(2000);
await expect
  .poll(
    () =>
      page.evaluate(() =>
        document.querySelector("control-panel")?.game?.ticks(),
      ),
    { timeout: 20000 },
  )
  .toBeGreaterThan(5);
await page.screenshot({ path: "artifacts/solo-game.png" });
console.log(
  "SOLO RUNNING",
  (await page.locator("body").innerText()).slice(-1800),
);
await page.goto(baseUrl);
await page.getByRole("button", { name: "Host a game", exact: true }).click();
await page.waitForTimeout(2500);
console.log(
  "HOST",
  page.url(),
  (await page.locator("body").innerText()).slice(-4200),
);
await page.screenshot({ path: "artifacts/host-lobby.png" });
const guestContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
await guestContext.addInitScript(() =>
  localStorage.setItem("username", "GuestPlayer"),
);
const guest = await guestContext.newPage();
guest.on("pageerror", (e) => console.log("GUEST PAGE ERROR", e.message));
await guest.goto(page.url());
await guest.waitForTimeout(3000);
console.log(
  "GUEST",
  guest.url(),
  (await guest.locator("body").innerText()).slice(-2600),
);
console.log(
  "HOST AFTER JOIN",
  (await page.locator("body").innerText()).slice(-1800),
);
await page.screenshot({ path: "artifacts/host-two-players.png" });
await page.getByRole("button", { name: /^start game$/i }).click();
await expect(page.locator("body")).toHaveClass(/in-game/, { timeout: 45000 });
await expect(guest.locator("body")).toHaveClass(/in-game/, { timeout: 45000 });
await expect(page.getByText("Connection error!", { exact: true })).toHaveCount(
  0,
);
await expect(guest.getByText("Connection error!", { exact: true })).toHaveCount(
  0,
);
await expect
  .poll(
    () =>
      page.evaluate(() =>
        document.querySelector("control-panel")?.game?.ticks(),
      ),
    { timeout: 20000 },
  )
  .toBeGreaterThan(5);
await expect
  .poll(
    () =>
      guest.evaluate(() =>
        document.querySelector("control-panel")?.game?.ticks(),
      ),
    { timeout: 20000 },
  )
  .toBeGreaterThan(5);
await page.screenshot({ path: "artifacts/multiplayer-game.png" });
console.log("MULTIPLAYER RUNNING for both players");
console.log("Errors", errors);
await browser.close();
