import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const cache = process.env.HAIRLINE_LOOK_CACHE || path.join(os.tmpdir(), "hairline-look");
const { chromium } = createRequire(path.join(cache, "look.cjs"))("playwright-core");
const base = process.argv[2] || "http://127.0.0.1:5180";
const output = path.resolve("outputs/hairline");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
const watch = (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
};

async function point(page, selector, [x, y], touch) {
  const stage = page.locator(selector);
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox();
  const px = box.x + box.width * x / 400, py = box.y + box.height * y / 320;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.move(px, py);
}

try {
  for (const [name, width, theme, reduced] of [
    ["desktop-light", 1440, "light", false],
    ["desktop-dark", 1440, "dark", false],
    ["mobile", 390, "light", false],
    ["mobile-reduced", 390, "dark", true],
  ]) {
    const touch = width < 600;
    const context = await browser.newContext({
      viewport: { width, height: 900 }, isMobile: touch, hasTouch: touch,
      reducedMotion: reduced ? "reduce" : "no-preference", colorScheme: theme,
    });
    await context.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
    const page = await context.newPage();
    watch(page);
    // All three modules start on a fresh page: this exercises shared registration.
    await page.goto(`${base}/?q=unfindable-skill-xyzzq`, { waitUntil: "domcontentloaded" });
    await Promise.all([".archive-stage", ".empty-tray", ".footer-sheets"].map((selector) => page.waitForSelector(`${selector} > svg path`)));
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator(".hairline-stage > svg").count(), 3);
    assert.equal(await page.getByRole("link", { name: "Built by Meeday", exact: true }).getAttribute("href"), "https://www.meedaydesign.xyz/");
    for (const [selector, coordinates, state] of [
      [".empty-tray", [175, 176], "tray · 0"],
      [".footer-sheets", [215, 173], "sheet 03"],
    ]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const rest = await page.locator(`${selector} > svg`).innerHTML();
      await point(page, selector, coordinates, touch);
      if (reduced) {
        await page.waitForTimeout(250);
        assert.equal(await page.locator(`${selector} > svg`).innerHTML(), rest);
        assert.equal(await page.locator(selector).getAttribute("data-state"), "rest");
      } else {
        await page.waitForFunction(([selector, state]) => document.querySelector(selector).dataset.state === state, [selector, state]);
        await page.waitForTimeout(850);
        assert.notEqual(await page.locator(`${selector} > svg`).innerHTML(), rest);
      }
    }
    await page.locator(".site-footer").screenshot({ path: path.join(output, `footer-hairline-${name}.png`) });
    await page.locator(".empty").screenshot({ path: path.join(output, `empty-hairline-${name}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (let i = 0; i < 2; i++) {
      await page.locator(".empty").getByRole("button", { name: "Clear search and filters", exact: true }).click();
      await page.waitForSelector(".empty-tray", { state: "detached" });
      assert.equal(await page.locator(".footer-sheets > svg").count(), 1);
      await page.locator("#search").fill(`unfindable-skill-xyzzq-${i}`);
      await page.waitForSelector(".empty-tray > svg path");
      assert.equal(await page.locator(".empty-tray > svg").count(), 1);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS: concurrent figure loading, footer and empty-state hover/touch, reduced-motion rest poses, themes, mobile overflow, repeated mount/cleanup, and browser errors.");
} finally {
  await browser.close();
}
