/**
 * Writes the two test images the browser check uses.
 *
 * fixture.png has a black-to-white ramp on the left and two saturated blocks on
 * the right, which makes brightness, saturation and warmth changes easy to
 * detect numerically. fixture2.png is the same shape in different colours, so
 * the check can prove that switching between photos really switches, and that
 * each keeps its own edits.
 *
 *   node tests/make-fixture.mjs
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 240;
const HEIGHT = 160;

function scanlines(topBlock, bottomBlock, width = WIDTH, height = HEIGHT) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    raw[cursor] = 0; // per-scanline filter byte
    cursor += 1;
    for (let x = 0; x < width; x += 1) {
      let rgb;
      if (x < width / 2) {
        const value = Math.round((x / (width / 2)) * 255);
        rgb = [value, value, value];
      } else {
        rgb = y < height / 2 ? topBlock : bottomBlock;
      }
      [raw[cursor], raw[cursor + 1], raw[cursor + 2]] = rgb;
      cursor += 3;
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function png(raw, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const TESTS_DIR = dirname(fileURLToPath(import.meta.url));

/** Writes one fixture and returns its path. */
export function writeFixture(name, { width = WIDTH, height = HEIGHT, top, bottom }) {
  const bytes = png(scanlines(top, bottom, width, height), width, height);
  const path = join(TESTS_DIR, name);
  writeFileSync(path, bytes);
  return { path, width, height, bytes: bytes.length };
}

/**
 * A photo-sized fixture, for checking that the preview stays responsive on a
 * real photograph. It is ~1.3MB, so it is generated on demand and gitignored
 * rather than committed.
 */
export const LARGE_FIXTURE = { name: "fixture-large.png", width: 3000, height: 2000 };

export function writeLargeFixture() {
  return writeFixture(LARGE_FIXTURE.name, {
    width: LARGE_FIXTURE.width,
    height: LARGE_FIXTURE.height,
    top: [200, 60, 40],
    bottom: [40, 80, 200],
  });
}

// Only the two small committed fixtures are written when run directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, top, bottom] of [
    ["fixture.png", [200, 60, 40], [40, 80, 200]],
    ["fixture2.png", [60, 190, 90], [190, 190, 40]],
  ]) {
    const written = writeFixture(name, { top, bottom });
    console.log(`wrote ${name} (${written.width}x${written.height}, ${written.bytes} bytes)`);
  }
}
