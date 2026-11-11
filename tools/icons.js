// Draws the app icons, a Roman arch on nasone green, straight into PNG files without an image library.
// Usage: node tools/icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const out = path.join(__dirname, "..", "docs", "icons");
const GREEN = [31, 92, 71];
const WHITE = [255, 255, 255];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encode(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);   // each row starts with filter byte 0
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bits per channel
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))
  ]);
}

// in a unit square: a half ring on two legs, standing on a low step; it stays inside the
// maskable safe circle (radius 0.4), so Android can crop the icon to any shape
function inArch(x, y) {
  const cx = 0.5, R = 0.225, T = 0.112, top = 0.25, legEnd = 0.725, step = 0.045;
  const dx = Math.abs(x - cx), cy = top + R;
  if (y >= legEnd && y <= legEnd + step) return dx <= R + step;
  if (y < top || y > legEnd) return false;
  if (y <= cy) {
    const d = Math.hypot(x - cx, y - cy);
    return d <= R && d >= R - T;
  }
  return dx <= R && dx >= R - T;
}
function inRounded(x, y, r) {
  const qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return qx * qx + qy * qy <= r * r;
}
// corner = 0 fills the whole square (maskable and Apple icons); 5×5 samples per pixel smooth the edges
function draw(size, corner) {
  const S = 5, rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size, y = (py + (sy + 0.5) / S) / size;
          if (corner && !inRounded(x, y, corner)) continue;
          bg++;
          if (inArch(x, y)) fg++;
        }
      }
      if (!bg) continue;
      const o = (py * size + px) * 4, t = fg / bg;
      for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(GREEN[c] + (WHITE[c] - GREEN[c]) * t);
      rgba[o + 3] = Math.round((255 * bg) / (S * S));
    }
  }
  return encode(size, rgba);
}

fs.mkdirSync(out, { recursive: true });
const ICONS = { "icon-192.png": [192, 0.22], "icon-512.png": [512, 0.22], "maskable-512.png": [512, 0], "apple-touch-icon.png": [180, 0] };
for (const [name, [size, corner]] of Object.entries(ICONS)) {
  const png = draw(size, corner);
  fs.writeFileSync(path.join(out, name), png);
  console.log(name, `${size}px`, `${(png.length / 1024).toFixed(1)} KB`);
}
