/**
 * End-to-end check of the parts unit tests cannot reach: that the canvas really
 * changes, that each photo in the tray keeps its own edits, and that removing
 * one leaves the rest intact. It drives a real browser and measures pixels
 * rather than trusting a screenshot.
 *
 * Optional -- it needs a browser, which the app itself does not:
 *   npm install --no-save playwright && npx playwright install chromium
 *   npm run build && npm start        (in another terminal)
 *   node tests/browser-check.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FIXTURE_A = "./tests/fixture.png";
const FIXTURE_B = "./tests/fixture2.png";

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });

const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const failures = [];
const check = (condition, description) => {
  console.log(`  ${condition ? "ok  " : "FAIL"}  ${description}`);
  if (!condition) failures.push(description);
};

/** Average colour of the visible canvas, so effects are measured not guessed. */
const stats = () =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const pixels = data.length / 4;
    return {
      w: canvas.width,
      h: canvas.height,
      r: +(r / pixels).toFixed(1),
      g: +(g / pixels).toFixed(1),
      b: +(b / pixels).toFixed(1),
    };
  });

const thumbCount = () => page.locator('button[title]:has(img)').count();

/** Filenames in the tray, and the name shown over the canvas. */
const trayNames = () =>
  page.evaluate(() => [...document.querySelectorAll("button[title] img")].map((img) => img.alt));
const shownName = () =>
  page.evaluate(
    () => document.querySelector("canvas")?.parentElement?.querySelector("span")?.textContent ?? "",
  );

async function instruct(text) {
  await page.fill('textarea[aria-label="Describe the change you want"]', text);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(400);
}

const feedback = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("p")]
      .map((p) => p.textContent.trim())
      .filter((t) => t.startsWith("Understood:") || t.startsWith("This app only") || t.startsWith("Not sure")),
  );

await page.goto(BASE, { waitUntil: "networkidle" });

console.log("\n— loading two photos —");
await page.setInputFiles('input[type="file"]', [FIXTURE_A, FIXTURE_B]);
await page.waitForSelector("canvas", { timeout: 10000 });
await page.waitForTimeout(600);
check((await thumbCount()) === 2, "both photos appear in the tray");
check(
  JSON.stringify(await trayNames()) === JSON.stringify(["fixture.png", "fixture2.png"]),
  "the tray lists both files by name, in order",
);

const originalA = await stats();

console.log("\n— editing the first photo —");
await instruct("make it much brighter");
const editedA = await stats();
check(editedA.r > originalA.r + 5, "the first photo brightened");

console.log("\n— switching to the second photo —");
await page.locator('button[title]:has(img)').nth(1).click();
await page.waitForTimeout(400);
const photoB = await stats();
check(await shownName() === "fixture2.png", "the second photo is the one on screen");
check(
  Math.abs(photoB.g - editedA.g) > 5,
  "the second photo is a different image, not the first one's pixels",
);
check(photoB.r !== editedA.r, "the second photo did not inherit the first one's edit");

console.log("\n— a whole paragraph on the second photo —");
await instruct(
  "This is a photo of my grandmother from the 1970s. I would like it to feel warm and " +
    "nostalgic, like an old family photograph. Please make it a little softer, and remove " +
    "the person on the left.",
);
const afterParagraph = await stats();
const notes = await feedback();
console.log(notes.map((n) => `      ${n}`).join("\n"));
check(afterParagraph.r !== photoB.r, "the paragraph changed the picture");
check(
  notes.some((n) => n.startsWith("Understood:")),
  "it reported what it understood",
);
check(
  notes.some((n) => n.includes("removing things")),
  "it said plainly that removing a person is not something it can do",
);
check(
  !notes.some((n) => n.startsWith("Not sure")),
  "it did not flag the context sentence as unrecognised",
);

console.log("\n— going back to the first photo —");
await page.locator('button[title]:has(img)').nth(0).click();
await page.waitForTimeout(400);
const backToA = await stats();
check(await shownName() === "fixture.png", "the first photo is back on screen");
check(Math.abs(backToA.r - editedA.r) < 1, "the first photo kept its own edit");

console.log("\n— removing the first photo —");
await page.locator('button[aria-label^="Remove"]').first().click();
await page.waitForTimeout(400);
check((await thumbCount()) === 1, "one photo left in the tray");
check(
  JSON.stringify(await trayNames()) === JSON.stringify(["fixture2.png"]),
  "the photo that was removed is the one that is gone",
);
check(await shownName() === "fixture2.png", "the survivor is the one now on screen");
const survivor = await stats();
check(
  Math.abs(survivor.r - afterParagraph.r) < 1,
  "the remaining photo kept its edits after the other was removed",
);

await page.screenshot({ path: "browser-check.png", fullPage: true });

console.log("\n— page errors —");
console.log(errors.length ? errors.map((e) => `  ${e}`).join("\n") : "  none");

console.log(`\n${failures.length ? `FAILED: ${failures.length}` : "ALL CHECKS PASSED"}`);
await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
