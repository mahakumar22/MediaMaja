/**
 * Writes tests/fixture.png: a test image with known colours, so the browser
 * check can measure effects rather than eyeball them. The left half is a black
 * to white ramp, the right half two saturated blocks — between them they make
 * brightness, saturation and warmth changes easy to detect numerically.
 *
 *   node tests/make-fixture.mjs
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 240;
const HEIGHT = 160;

const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
let cursor = 0;
for (let y = 0; y < HEIGHT; y += 1) {
  raw[cursor] = 0; // per-scanline filter byte
  cursor += 1;
  for (let x = 0; x < WIDTH; x += 1) {
    let r;
    let g;
    let b;
    if (x < WIDTH / 2) {
      r = g = b = Math.round((x / (WIDTH / 2)) * 255);
    } else if (y < HEIGHT / 2) {
      [r, g, b] = [200, 60, 40];
    } else {
      [r, g, b] = [40, 80, 200];
    }
    raw[cursor] = r;
    raw[cursor + 1] = g;
    raw[cursor + 2] = b;
    cursor += 3;
  }
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

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bit depth
header[9] = 2; // truecolour

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "fixture.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
