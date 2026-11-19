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
  assert.equal(await page.locator(".archive-topline, .archive-caption, .archive-play").count(), 0);
  assert.equal(await page.getByRole("heading", { name: "Make your agent more capable.", exact: true }).count(), 1);
  assert.equal(await page.locator("h1 .kubai-icon[aria-hidden='true']").count(), 2);
  await page.locator(".hero-keyword").first().hover();
  await page.waitForFunction(() => document.querySelector("h1 .kubai-icon-bot [data-n='ant']").getAttribute("transform") !== "rotate(0 15.5 7.4)");
  await page.mouse.move(10, 70);
  await page.waitForTimeout(600);
  const sparkle = page.locator("h1 .kubai-icon-sparkles [data-n='b']");
  const sparkleRest = await sparkle.getAttribute("transform");
  await page.locator(".hero-keyword").last().hover();
  await page.waitForFunction((rest) => document.querySelector("h1 .kubai-icon-sparkles [data-n='b']").getAttribute("transform") !== rest, sparkleRest);
  await page.screenshot({ path: path.join(output, "skillbank-hero-motion.png") });
  await page.mouse.move(10, 70);
  await page.waitForTimeout(600);
  for (const width of [320, 641, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1040 });
    assert.equal(await page.locator("h1").evaluate((el) => el.getBoundingClientRect().right <= innerWidth), true);
    assert.equal(await page.locator("h1").evaluate((el) => el.scrollWidth > el.clientWidth), false);
  }
  const restingPaths = await page.locator(".archive-stage svg").innerHTML();
  for (let i = 0; i < centres.length; i++) {
    await hover(page, page.locator(".archive-stage"), centres[i]);
    await page.waitForFunction((index) => {
      const panels = document.querySelectorAll(".archive-stage svg path.sil + path.sil");
      return panels[2 - index].classList.contains("hi");
    }, i);
    await page.waitForTimeout(350);
    assert.notEqual(await page.locator(".archive-stage svg").innerHTML(), restingPaths);
  }
  await page.mouse.move(10, 70);
  await page.waitForTimeout(1100);
  assert.equal(await page.locator(".archive-stage svg path.sil + path.sil").nth(1).getAttribute("class"), "sil hi");
  await page.screenshot({ path: path.join(output, "skillbank-desktop-light.png") });
  const lightStroke = await page.locator(".archive-stage .hi").first().evaluate((el) => getComputedStyle(el).stroke);
  await page.getByRole("button", { name: /Light theme\. Switch to dark theme/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, "skillbank-desktop-dark.png") });
  const darkStroke = await page.locator(".archive-stage .hi").first().evaluate((el) => getComputedStyle(el).stroke);
  console.log("highlight strokes", JSON.stringify({ light: lightStroke, dark: darkStroke }));

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
  const reducedIcon = await phone.locator("h1 .kubai-icon-sparkles").innerHTML();
  await phone.locator(".hero-keyword").last().tap();
  await phone.waitForTimeout(150);
  assert.equal(await phone.locator("h1 .kubai-icon-sparkles").innerHTML(), reducedIcon);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await phone.locator(".archive-stage").evaluate((el) => getComputedStyle(el).touchAction), "pan-y");
  await phone.screenshot({ path: path.join(output, "skillbank-mobile.png"), fullPage: false });
  for (const [i, [x, y]] of centres.entries()) {
    const box = await phone.locator(".archive-stage").boundingBox();
    await phone.touchscreen.tap(box.x + box.width * x / 400, box.y + box.height * y / 320);
    await phone.waitForFunction((index) => {
      const panels = document.querySelectorAll(".archive-stage svg path.sil + path.sil");
      return panels[2 - index].classList.contains("hi");
    }, i);
    await phone.waitForTimeout(80);
    const paths = await phone.locator(".archive-stage svg").innerHTML();
    await phone.waitForTimeout(150);
    assert.equal(await phone.locator(".archive-stage svg").innerHTML(), paths);
  }
  await phone.emulateMedia({ reducedMotion: "no-preference" });
  await phone.locator(".hero-keyword").last().tap();
  await phone.waitForFunction(() => document.querySelector("h1 .kubai-icon-sparkles [data-n='b']").getAttribute("transform").includes("rotate(90)"));
  assert.equal(await phone.locator(".archive-topline, .archive-caption, .archive-play").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: hero icon hover and tap, headline overflow, drawer selection, removed labels and controls, navigation cleanup, search, filters, pagination, reduced motion, touch scrolling, and browser errors.");
} finally {
  await browser.close();
}
