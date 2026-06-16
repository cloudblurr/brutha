/* Generate BRUTHA PWA icons as real PNGs with zero image dependencies.
 *
 * Produces solid-background rounded icons with a "B" glyph, encoded as valid
 * PNGs via Node's zlib. Run:
 *
 *   node scripts/gen-icons.mjs
 *
 * Outputs: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png,
 * badge-72.png, and public/apple-touch-icon.png (180).
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter byte 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 5x7 bitmap "B"
const GLYPH = ["11110", "10001", "10001", "11110", "10001", "10001", "11110"];

function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let inside = true;
      if (!maskable) {
        const dx = Math.max(Math.abs(x - cx) - (size / 2 - radius), 0);
        const dy = Math.max(Math.abs(y - cy) - (size / 2 - radius), 0);
        inside = Math.sqrt(dx * dx + dy * dy) <= radius;
      }
      const t = (x + y) / (2 * size); // indigo -> violet gradient
      if (inside) {
        buf[i] = Math.round(79 + t * (139 - 79));
        buf[i + 1] = Math.round(70 + t * (92 - 70));
        buf[i + 2] = Math.round(229 + t * (246 - 229));
        buf[i + 3] = 255;
      } else {
        buf[i + 3] = 0;
      }
    }
  }
  const glyphH = size * 0.5;
  const cell = glyphH / 7;
  const glyphW = cell * 5;
  const ox = cx - glyphW / 2;
  const oy = cy - glyphH / 2;
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (GLYPH[gy][gx] !== "1") continue;
      for (let py = 0; py < Math.ceil(cell); py++) {
        for (let px = 0; px < Math.ceil(cell); px++) {
          const X = Math.round(ox + gx * cell + px);
          const Y = Math.round(oy + gy * cell + py);
          if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
          const i = (Y * size + X) * 4;
          buf[i] = 255;
          buf[i + 1] = 255;
          buf[i + 2] = 255;
          buf[i + 3] = 255;
        }
      }
    }
  }
  return buf;
}

function write(name, size, maskable = false) {
  const png = encodePNG(size, draw(size, maskable));
  fs.writeFileSync(path.join(OUT, name), png);
  console.log("wrote", name, png.length, "bytes");
}

write("icon-192.png", 192);
write("icon-512.png", 512);
write("icon-maskable-512.png", 512, true);
write("badge-72.png", 72);
const apple = encodePNG(180, draw(180, false));
fs.writeFileSync(path.join(__dirname, "..", "public", "apple-touch-icon.png"), apple);
console.log("wrote apple-touch-icon.png");
