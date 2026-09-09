/**
 * End-to-end check of the bits unit tests cannot reach: that the canvas really
 * changes when an instruction is applied. It drives a real browser, uploads a
 * fixture, and measures the pixels rather than trusting the screenshot.
 *
 * Optional -- it needs a browser, which the app itself does not:
 *   npm install --no-save playwright && npx playwright install chromium
 *   npm run build && npm start        (in another terminal)
 *   node tests/browser-check.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SRC = process.argv[2] || "./tests/fixture.png";

// CHROMIUM_PATH lets this run against an already-installed browser; without it
// Playwright uses the one it downloaded itself.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(BASE, { waitUntil: "networkidle" });

// Upload
await page.setInputFiles('input[type="file"]', SRC);
await page.waitForSelector("canvas", { timeout: 10000 });
await page.waitForTimeout(500);

/** Average RGB of the canvas, so effects can be measured rather than eyeballed. */
async function stats() {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return { w: c.width, h: c.height, r: +(r / n).toFixed(1), g: +(g / n).toFixed(1), b: +(b / n).toFixed(1) };
  });
}

async function instruct(text) {
  await page.fill('input[aria-label="Describe the change you want"]', text);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(400);
}

async function readFeedback() {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("p")].filter((p) => p.textContent.includes("Understood:") || p.textContent.includes("Not understood:"));
    return el.map((e) => e.textContent.trim());
  });
}

const results = [];
const base = await stats();
results.push(["loaded (original)", base, ""]);

await instruct("make it much brighter");
const brighter = await stats();
results.push(["much brighter", brighter, (await readFeedback()).join(" | ")]);

await instruct("reset");
await instruct("black and white");
const bw = await stats();
results.push(["black and white", bw, (await readFeedback()).join(" | ")]);

await instruct("reset");
await instruct("much warmer");
const warm = await stats();
results.push(["much warmer", warm, (await readFeedback()).join(" | ")]);

await instruct("reset");
await instruct("rotate right");
const rot = await stats();
results.push(["rotate right", rot, (await readFeedback()).join(" | ")]);

await instruct("reset");
await instruct("vintage look and add a unicorn");
const vintage = await stats();
results.push(["vintage + nonsense", vintage, (await readFeedback()).join(" | ")]);

console.log("\n=== measured canvas output ===");
for (const [label, s, fb] of results) {
  console.log(`${label.padEnd(22)} ${s.w}x${s.h}  avg rgb ${String(s.r).padStart(6)} ${String(s.g).padStart(6)} ${String(s.b).padStart(6)}`);
  if (fb) console.log(`${" ".repeat(22)} ${fb}`);
}

// Assertions
const fail = [];
if (!(brighter.r > base.r + 5)) fail.push("brightness did not increase");
if (!(Math.abs(bw.r - bw.g) < 2 && Math.abs(bw.g - bw.b) < 2)) fail.push("black & white did not neutralise colour");
if (!(warm.r - warm.b > base.r - base.b + 10)) fail.push("warmth did not shift red above blue");
if (!(rot.w === base.h && rot.h === base.w)) fail.push("rotation did not swap canvas dimensions");
if (!(vintage.r !== base.r)) fail.push("vintage preset had no effect");

await page.screenshot({ path: "browser-check.png", fullPage: true });

console.log("\n=== page errors ===");
console.log(errors.length ? errors.join("\n") : "  none");
console.log("\n=== assertions ===");
console.log(fail.length ? "FAIL:\n  " + fail.join("\n  ") : "  all passed");

await browser.close();
process.exit(fail.length || errors.length ? 1 : 0);
