import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const baseUrl = process.env.BASE_URL || "http://localhost:9000";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseUrl);
    await expect(
      page.getByRole("button", { name: "Play solo", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".mode-art img")).toHaveJSProperty(
      "complete",
      true,
    );
    await expect(page.locator(".mode-art img")).not.toHaveJSProperty(
      "naturalWidth",
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Home overflow at ${width}px`,
    );
    assert.equal(
      await page.locator("clan-modal,store-modal,nav-account-menu").count(),
      0,
    );
    await page.screenshot({
      path: `artifacts/home-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Settings", exact: false }).click();
    await expect(page.locator("#page-settings")).toBeVisible();
    await page.screenshot({ path: `artifacts/settings-${width}.png` });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page
      .locator("desktop-nav-bar")
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await expect(page.locator("#page-help")).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px home, settings, help: passed`);
  }
  const page = await browser.newPage();
  const health = await page.request.get(`${baseUrl}/api/health`);
  assert.equal(health.status(), 200);
  const source = await page.request.head(`${baseUrl}/source.zip`);
  assert.equal(source.status(), 404);
  console.log("Production health and retired source download: passed");
} finally {
  await browser.close();
}
