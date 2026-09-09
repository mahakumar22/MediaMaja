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

function scanlines(topBlock, bottomBlock) {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  let cursor = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    raw[cursor] = 0; // per-scanline filter byte
    cursor += 1;
    for (let x = 0; x < WIDTH; x += 1) {
      let rgb;
      if (x < WIDTH / 2) {
        const value = Math.round((x / (WIDTH / 2)) * 255);
        rgb = [value, value, value];
      } else {
        rgb = y < HEIGHT / 2 ? topBlock : bottomBlock;
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

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bit depth
header[9] = 2; // truecolour

function png(raw) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const here = dirname(fileURLToPath(import.meta.url));
for (const [name, top, bottom] of [
  ["fixture.png", [200, 60, 40], [40, 80, 200]],
  ["fixture2.png", [60, 190, 90], [190, 190, 40]],
]) {
  const bytes = png(scanlines(top, bottom));
  writeFileSync(join(here, name), bytes);
  console.log(`wrote ${name} (${WIDTH}x${HEIGHT}, ${bytes.length} bytes)`);
}
