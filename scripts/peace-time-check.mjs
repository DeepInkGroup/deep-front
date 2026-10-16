import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

const baseUrl = process.env.BASE_URL || "http://localhost:9000";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const hostContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const host = await hostContext.newPage();
  host.on("pageerror", (error) => errors.push(error.message));
  await host.goto(baseUrl);
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  const peace = host.getByLabel("Peace time", { exact: true });
  await expect(peace).toHaveValue("0");
  assert.deepEqual(
    await peace
      .locator("option")
      .allTextContents()
      .then((labels) => labels.map((label) => label.trim())),
    ["Off", "3 min", "5 min", "10 min"],
  );

  const guestContext = await browser.newContext();
  await guestContext.addInitScript(() =>
    localStorage.setItem("username", "PeaceGuest"),
  );
  const guest = await guestContext.newPage();
  guest.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => host.url()).toMatch(/\/game\//);
  await guest.goto(host.url());
  await expect(host.locator("host-lobby-modal")).toContainText("PeaceGuest");
  for (const minutes of [3, 5, 10]) {
    await peace.selectOption(String(minutes));
    await expect(
      guest.getByText(new RegExp(`Peace time.*${minutes}min`)),
    ).toBeVisible();
  }
  await peace.selectOption("0");
  await expect(guest.getByText(/Peace time.*min/)).toHaveCount(0);
  await peace.selectOption("3");
  await expect(guest.getByText(/Peace time.*3min/)).toBeVisible();
  console.log("All four peace-time choices synchronized to the guest");

  await peace.scrollIntoViewIfNeeded();
  await host.screenshot({ path: "artifacts/peace-time-lobby.png" });
  await host.setViewportSize({ width: 390, height: 950 });
  await peace.scrollIntoViewIfNeeded();
  await expect(peace).toBeVisible();
  assert.equal(
    await host.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await host.screenshot({ path: "artifacts/peace-time-mobile.png" });
  await host.setViewportSize({ width: 1440, height: 1000 });
  await host.getByRole("button", { name: /^random spawn$/i }).click();
  await host.getByRole("button", { name: /^start game$/i }).click();
  for (const page of [host, guest]) {
    await expect(page.locator("body")).toHaveClass(/in-game/, {
      timeout: 45000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document
              .querySelector("control-panel")
              ?.game?.config()
              .spawnImmunityDuration(),
          ),
        { timeout: 15000 },
      )
      .toBe(1800);
    await expect(
      page.locator("immunity-timer").getByRole("timer"),
    ).toContainText("Peace time:", { timeout: 45000 });
  }
  const remaining = await host
    .locator("immunity-timer")
    .evaluate((timer) => timer.remainingSeconds);
  assert.ok(remaining > 0 && remaining <= 180);
  await expect
    .poll(
      () =>
        host
          .locator("immunity-timer")
          .evaluate((timer) => timer.remainingSeconds),
      { timeout: 10000 },
    )
    .toBeLessThan(remaining);
  await host.screenshot({ path: "artifacts/peace-time-game.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Two-player match: peace time active, countdown running for both players",
  );
} finally {
  await browser.close();
}
