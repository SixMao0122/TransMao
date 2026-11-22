/**
 * Pure Node.js PNG icon generator for TransMao (16, 32, 48, 128 px)
 * Zero external binary dependencies — uses built-in zlib + CRC32.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve('public/icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Precompute CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 supersampling for crisp anti-aliasing

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rAcc = 0, gAcc = 0, bAcc = 0, aAcc = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size; // 0..1
          const v = (y + (sy + 0.5) / samples) / size; // 0..1

          // Squircle SDF for rounded icon background
          const dx = Math.abs(u - 0.5) * 2;
          const dy = Math.abs(v - 0.5) * 2;
          const margin = 0.08;
          const radius = 0.38;
          const qx = Math.max(dx - (1 - margin - radius), 0);
          const qy = Math.max(dy - (1 - margin - radius), 0);
          const inBg = Math.hypot(qx, qy) <= radius;

          if (!inBg) continue;

          // Gradient: Indigo (#4F46E5) -> Purple (#7C3AED) -> Pink (#EC4899)
          const t = Math.min(1, Math.max(0, (u + v) * 0.5));
          let r, g, b;
          if (t < 0.5) {
            const k = t * 2;
            r = 79 + (124 - 79) * k;
            g = 70 + (58 - 70) * k;
            b = 229 + (237 - 229) * k;
          } else {
            const k = (t - 0.5) * 2;
            r = 124 + (236 - 124) * k;
            g = 58 + (72 - 58) * k;
            b = 237 + (153 - 237) * k;
          }

          // White cat head ellipse + two triangular cat ears
          const ex = (u - 0.5) / 0.30;
          const ey = (v - 0.58) / 0.25;
          const inHead = (ex * ex + ey * ey) <= 1.0;
          const inLeftEar = pointInTriangle(u, v, 0.22, 0.46, 0.24, 0.20, 0.43, 0.37);
          const inRightEar = pointInTriangle(u, v, 0.78, 0.46, 0.76, 0.20, 0.57, 0.37);

          // Inner pink ears
          const inLeftInner = pointInTriangle(u, v, 0.26, 0.42, 0.27, 0.26, 0.39, 0.37);
          const inRightInner = pointInTriangle(u, v, 0.74, 0.42, 0.73, 0.26, 0.61, 0.37);

          // Stylized "T" / Translation accent bars inside cat face
          const inTopBar = (u >= 0.36 && u <= 0.64 && v >= 0.48 && v <= 0.545);
          const inStem = (u >= 0.465 && u <= 0.535 && v >= 0.53 && v <= 0.73);
          const inDot = Math.hypot((u - 0.63) / 0.045, (v - 0.68) / 0.045) <= 1.0;

          if (inHead || inLeftEar || inRightEar) {
            if (inLeftInner || inRightInner) {
              r = 244; g = 114; b = 182;
            } else if (inTopBar || inStem) {
              // Gradient letter inside face
              r = 99; g = 60; b = 225;
            } else if (inDot) {
              r = 236; g = 72; b = 153;
            } else {
              r = 255; g = 255; b = 255;
            }
          }

          rAcc += r;
          gAcc += g;
          bAcc += b;
          aAcc += 255;
        }
      }

      const n = samples * samples;
      const idx = (y * size + x) * 4;
      if (aAcc > 0) {
        buf[idx] = Math.round(rAcc / (aAcc / 255));
        buf[idx + 1] = Math.round(gAcc / (aAcc / 255));
        buf[idx + 2] = Math.round(bAcc / (aAcc / 255));
        buf[idx + 3] = Math.round(aAcc / n);
      }
    }
  }

  return encodePNG(size, size, buf);
}

for (const size of [16, 32, 48, 128]) {
  const png = renderIcon(size);
  const outPath = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
