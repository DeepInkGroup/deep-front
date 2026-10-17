import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
const allowed = new Set([
  "index.html",
  "styles.css",
  "main.js",
  "config.json",
  "favicon.svg",
  "github.svg",
  "multiplayer.png",
]);
const types = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
};
const server = http.createServer(async (req, res) => {
  const file =
    new URL(req.url, "http://localhost").pathname.slice(1) || "index.html";
  if (!allowed.has(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await fs.readFile(
      new URL(`../pages/${file}`, import.meta.url),
    );
    res.writeHead(200, { "Content-Type": types[file.split(".").pop()] });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await fs.mkdir("artifacts", { recursive: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await expect(
      page.getByRole("link", { name: "Telegram", exact: true }),
    ).toHaveAttribute("href", "https://t.me/DeepFrontGame");
    await expect(
      page.getByRole("link", { name: "GitHub", exact: true }),
    ).toHaveAttribute("href", "https://github.com/DeepInkGroup");
    await expect(
      page.getByRole("link", { name: "Create map", exact: true }),
    ).toHaveAttribute("href", "#setup");
    await expect(page.locator(".multiplayer-art")).toHaveJSProperty(
      "complete",
      true,
    );
    await expect(page.locator(".multiplayer-art")).not.toHaveJSProperty(
      "naturalWidth",
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `artifacts/pages-community-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel("Your Render game URL").fill("http://example.com");
    await page.getByRole("button", { name: /^Open game/ }).click();
    await expect(page.locator("#form-message")).toContainText("HTTPS");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `Pages ${width}px: footer icons, multiplayer image, map studio link, layout and URL validation passed`,
    );
  }
  const page = await browser.newPage();
  await page.goto(`${base}/?server=https://sample-deep-front.onrender.com`);
  await expect(page.locator("#map-studio-link")).toHaveAttribute(
    "href",
    "https://sample-deep-front.onrender.com/#community",
  );
  console.log(
    "Pages Map Studio link connects to the configured multiplayer server",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
