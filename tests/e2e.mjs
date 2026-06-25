import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://localhost:5173/";
const outputDir = process.env.QA_OUTPUT ?? "/tmp/lily-brainrot-qa";
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseURL, { waitUntil: "load" });
  await page.locator("#loading").waitFor({ state: "detached", timeout: 15_000 });
  assert.equal(await page.title(), "Lily's Brainrot Parade");
  assert.equal(await page.locator("#star-value").innerText(), "50");

  const tutorialButton = page.getByRole("button", { name: "LET'S PLAY!" });
  if (await tutorialButton.isVisible()) await tutorialButton.click();

  await page.getByRole("button", { name: "Ring the bell to call a brain rot" }).click();
  assert.equal(await page.locator("#star-value").innerText(), "40");
  assert.equal(await page.locator("#collection-count").innerText(), "1 / 12");
  await page.screenshot({ path: `${outputDir}/desktop-spawn.png` });

  await page.locator("#game-canvas").click({ position: { x: 640, y: 215 } });
  await page.waitForTimeout(3_400);
  const placedState = await page.evaluate(() => JSON.parse(localStorage.getItem("lilys-brainrot-parade-save-v1") ?? "{}"));
  assert.equal(placedState.instances.length, 1);
  assert.equal(placedState.instances[0].status, "placed");
  assert.equal(typeof placedState.instances[0].padId, "number");
  await page.screenshot({ path: `${outputDir}/desktop-placed.png` });

  await page.evaluate(() => {
    localStorage.setItem("lilys-brainrot-parade-save-v1", JSON.stringify({
      version: 1,
      stars: 50,
      instances: [
        { id: "merge-a", type: 1, rarity: "classic", status: "placed", padId: 0, createdAt: Date.now() },
        { id: "merge-b", type: 1, rarity: "classic", status: "placed", padId: 1, createdAt: Date.now() },
      ],
      pads: [
        { id: 0, occupantId: "merge-a" },
        { id: 1, occupantId: "merge-b" },
        { id: 2, occupantId: null },
        { id: 3, occupantId: null },
        { id: 4, occupantId: null },
        { id: 5, occupantId: null },
      ],
      discovered: ["1:classic"],
      settings: { soundEnabled: false, reducedMotion: true },
      tutorialSeen: true,
      firstMergeSeen: false,
      lastIncomeAt: Date.now(),
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.locator("#loading").waitFor({ state: "detached", timeout: 15_000 });
  await page.mouse.move(190, 290);
  await page.mouse.down();
  await page.mouse.move(1090, 290, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const mergedState = await page.evaluate(() => JSON.parse(localStorage.getItem("lilys-brainrot-parade-save-v1") ?? "{}"));
  assert.equal(mergedState.instances.length, 1);
  assert.equal(mergedState.instances[0].rarity, "neon");
  assert.equal(mergedState.firstMergeSeen, true);
  await page.screenshot({ path: `${outputDir}/desktop-merge.png` });

  await page.getByRole("button", { name: "Open collection book" }).click();
  await page.getByRole("heading", { name: "Brainrot Book" }).waitFor({ state: "visible" });
  assert.equal(await page.locator(".collection-card").count(), 12);
  await page.screenshot({ path: `${outputDir}/collection-book.png` });
  await page.getByRole("button", { name: "Close collection book" }).click();

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".game-viewport").isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Ring the bell to call a brain rot" }).isVisible(), true);
  await page.screenshot({ path: `${outputDir}/mobile-landscape.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".portrait-message").isVisible(), true);
  assert.equal(await page.locator(".game-viewport").isVisible(), false);
  await page.screenshot({ path: `${outputDir}/mobile-portrait.png` });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    ok: true,
    screenshots: [
      "desktop-spawn.png",
      "desktop-placed.png",
      "desktop-merge.png",
      "collection-book.png",
      "mobile-landscape.png",
      "mobile-portrait.png",
    ].map((name) => `${outputDir}/${name}`),
  }, null, 2));
} finally {
  await browser.close();
}
