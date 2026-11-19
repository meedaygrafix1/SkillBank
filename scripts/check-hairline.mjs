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
const hover = async (page, stage, [x, y]) => {
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width * x / 400, box.y + box.height * y / 320);
};

try {
  const reference = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  watch(reference);
  await reference.addInitScript(() => {
    let engine;
    Object.defineProperty(window, "HL", {
      configurable: true,
      get: () => engine,
      set: (value) => { engine = { ...value, proj: (camera) => (window.P = value.proj(camera)) }; },
    });
  });
  await reference.goto(`${base}/hairline-archive.html`);
  await reference.waitForSelector("#stage svg path");
  const centres = await reference.evaluate(() => [window.P(56, 63, 89), window.P(56, 69, 55), window.P(56, 61, 21)]);
  console.log("drawer centres", JSON.stringify(centres.map((p) => p.map(Math.round))));
  const tour = JSON.parse(/tour:\s*(\[[^\n]+\])/.exec(fs.readFileSync("archive.js", "utf8"))[1]);
  for (let i = 0; i < tour.length - 1; i++) {
    await hover(reference, reference.locator("#stage"), tour[i]);
    await reference.waitForFunction((label) => document.querySelector("#read").textContent === label, `drawer 0${i + 1}`);
  }
  await reference.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, colorScheme: "light" });
  await context.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "# Skill preview\n" }));
  await context.addInitScript(() => localStorage.setItem("theme", "light"));
  const page = await context.newPage();
  watch(page);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".archive-stage svg path");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(".archive-stage > svg").count(), 1);
  assert.equal(await page.locator(".result-count").innerText(), "772 skills");
  for (let i = 0; i < centres.length; i++) {
    await hover(page, page.locator(".archive-stage"), centres[i]);
    await page.waitForFunction((label) => document.querySelector(".archive-topline output").textContent === label, `drawer 0${i + 1}`);
  }
  await page.mouse.move(10, 70);
  await page.waitForTimeout(1100);
  assert.equal(await page.locator(".archive-topline output").textContent(), "rest");
  await page.screenshot({ path: path.join(output, "skillbank-desktop-light.png") });
  const lightStroke = await page.locator(".archive-stage .hi").first().evaluate((el) => getComputedStyle(el).stroke);
  await page.getByRole("button", { name: /Light theme\. Switch to dark theme/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, "skillbank-desktop-dark.png") });
  const darkStroke = await page.locator(".archive-stage .hi").first().evaluate((el) => getComputedStyle(el).stroke);
  console.log("highlight strokes", JSON.stringify({ light: lightStroke, dark: darkStroke }));

  await page.getByRole("button", { name: "Play tour", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".archive-topline output").textContent === "drawer 01");
  await page.getByRole("button", { name: "Stop tour", exact: true }).click();
  await page.locator("#search").fill("video");
  await page.waitForFunction(() => new URLSearchParams(location.search).get("q") === "video");
  assert.ok(await page.locator(".card").count() > 0);
  await page.locator("#search").press("Escape");
  await page.waitForFunction(() => !new URLSearchParams(location.search).has("q"));
  await page.getByRole("button", { name: /^Video editing skill / }).click();
  await page.waitForFunction(() => document.querySelector(".result-count").textContent.startsWith("9 skills"));
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.locator(".card-link").first().click();
  await page.waitForURL(/\/skill\//);
  await page.getByRole("button", { name: "All skills", exact: true }).click();
  await page.waitForSelector(".archive-stage svg path");
  assert.equal(await page.locator(".archive-stage > svg").count(), 1);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get("page") === "2");
  assert.equal(await page.locator(".card").count(), 24);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", colorScheme: "light" });
  const phone = await mobile.newPage();
  watch(phone);
  await phone.goto(base, { waitUntil: "domcontentloaded" });
  await phone.waitForSelector(".archive-stage svg path");
  await phone.evaluate(() => document.fonts.ready);
  await phone.waitForTimeout(300);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await phone.locator(".archive-stage").evaluate((el) => getComputedStyle(el).touchAction), "pan-y");
  await phone.screenshot({ path: path.join(output, "skillbank-mobile.png"), fullPage: false });
  for (const label of ["drawer 01", "drawer 02", "drawer 03", "rest"]) {
    await phone.getByRole("button", { name: "Show next archive drawer", exact: true }).click();
    await phone.waitForFunction((value) => document.querySelector(".archive-topline output").textContent === value, label);
    await phone.waitForTimeout(80);
    const paths = await phone.locator(".archive-stage svg").innerHTML();
    await phone.waitForTimeout(150);
    assert.equal(await phone.locator(".archive-stage svg").innerHTML(), paths);
  }
  await phone.emulateMedia({ reducedMotion: "no-preference" });
  await phone.getByRole("button", { name: "Play tour", exact: true }).click();
  await phone.waitForFunction(() => document.querySelector(".archive-topline output").textContent === "drawer 01");
  await phone.getByRole("button", { name: "Stop tour", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log("PASS: drawer selection, tour, navigation cleanup, search, filters, pagination, responsive overflow, reduced motion, touch scrolling, and browser errors.");
} finally {
  await browser.close();
}
