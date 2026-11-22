/**
 * Pure Node.js PNG icon generator for TransMao (16, 32, 48, 128 px)
 * Warm Paper & Ink Hand-Drawn Cat Stationery Theme — zero external dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve('public/icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

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
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
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
  const samples = 4;

  // Palette: Warm Paper (#FBF9F5), Charcoal Ink (#26231F), Terracotta Stamp (#C85A32), Sand Blush (#F0DFC8)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rAcc = 0, gAcc = 0, bAcc = 0, aAcc = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;

          // Rounded square stationery stamp
          const dx = Math.abs(u - 0.5) * 2;
          const dy = Math.abs(v - 0.5) * 2;
          const margin = 0.08;
          const radius = 0.34;
          const qx = Math.max(dx - (1 - margin - radius), 0);
          const qy = Math.max(dy - (1 - margin - radius), 0);
          const dist = Math.hypot(qx, qy);

          if (dist > radius) continue;

          // Outer ink border
          let r = 251, g = 249, b = 245; // #FBF9F5 warm paper
          if (dist > radius - 0.11) {
            r = 38; g = 35; b = 31; // #26231F ink border
          } else {
            // Terracotta cat silhouette with crisp ink outline
            const exOut = (u - 0.5) / 0.33;
            const eyOut = (v - 0.59) / 0.27;
            const inHeadOut = (exOut * exOut + eyOut * eyOut) <= 1.0;
            const inLEarOut = pointInTriangle(u, v, 0.19, 0.50, 0.22, 0.18, 0.45, 0.36);
            const inREarOut = pointInTriangle(u, v, 0.81, 0.50, 0.78, 0.18, 0.55, 0.36);

            const exIn = (u - 0.5) / 0.285;
            const eyIn = (v - 0.59) / 0.225;
            const inHeadIn = (exIn * exIn + eyIn * eyIn) <= 1.0;
            const inLEarIn = pointInTriangle(u, v, 0.23, 0.47, 0.25, 0.24, 0.42, 0.38);
            const inREarIn = pointInTriangle(u, v, 0.77, 0.47, 0.75, 0.24, 0.58, 0.38);

            // Inner ear blush
            const inLBlush = pointInTriangle(u, v, 0.26, 0.43, 0.27, 0.30, 0.38, 0.39);
            const inRBlush = pointInTriangle(u, v, 0.74, 0.43, 0.73, 0.30, 0.62, 0.39);

            // Minimal cute ink eyes & tiny nose
            const inLEye = Math.hypot((u - 0.39) / 0.042, (v - 0.57) / 0.042) <= 1.0;
            const inREye = Math.hypot((u - 0.61) / 0.042, (v - 0.57) / 0.042) <= 1.0;
            const inNose = pointInTriangle(u, v, 0.465, 0.625, 0.535, 0.625, 0.50, 0.665);

            // Tiny terracotta bookmark corner tag (top-right inside stamp)
            const inTag = (u > 0.68 && u < 0.84 && v > 0.12 && v < 0.21);

            if (inHeadOut || inLEarOut || inREarOut) {
              if (inLEye || inREye) {
                r = 38; g = 35; b = 31; // ink eyes
              } else if (inNose) {
                r = 251; g = 249; b = 245; // cream nose
              } else if (inLBlush || inRBlush) {
                r = 240; g = 223; b = 200; // warm sand inner ear
              } else if (inHeadIn || inLEarIn || inREarIn) {
                r = 200; g = 90; b = 50; // #C85A32 terracotta cat
              } else {
                r = 38; g = 35; b = 31; // crisp ink outline
              }
            } else if (inTag) {
              r = 200; g = 90; b = 50;
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
