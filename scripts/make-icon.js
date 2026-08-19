const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 512;
const Z = 4;

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function inTriangle(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function sample(u, v) {
  const x = (u / S) * 2 - 1;
  const y = (v / S) * 2 - 1;
  const d = Math.sqrt(x * x + y * y);
  const R = 0.82;
  const rEdge = 0.03;

  if (d > R + rEdge) return [0, 0, 0, 0];

  const outside = d > R;
  const alpha = outside ? Math.max(0, 1 - (d - R) / rEdge) : 1;

  let r, g, b;

  const ringD = Math.abs(d - 0.60);
  const inRing = ringD < 0.018;
  const gx = Math.min(1, Math.max(0, (x + 1) / 2));

  let goldR = 212 + 12 * gx;
  let goldG = 175 - 12 * gx;
  let goldB = 55 + 10 * gx;

  const tri = inTriangle(x, y, [0.06, 0.36], [0.06, -0.36], [0.52, 0.0]);

  if (inRing) {
    r = 222; g = 185; b = 70;
  } else if (tri) {
    r = goldR; g = goldG; b = goldB;
  } else {
    const bgGlow = Math.max(0, 1 - d / 0.85);
    r = 14 + 26 * bgGlow;
    g = 14 + 26 * bgGlow;
    b = 22 + 30 * bgGlow;
  }

  return [r, g, b, alpha * 255];
}

const raw = Buffer.alloc(S * (S * 4 + 1));
let o = 0;
for (let y = 0; y < S; y++) {
  raw[o++] = 0;
  for (let x = 0; x < S; x++) {
    let ar = 0, ag = 0, ab = 0, aa = 0;
    for (let sy = 0; sy < Z; sy++) {
      for (let sx = 0; sx < Z; sx++) {
        const c = sample(x + (sx + 0.5) / Z, y + (sy + 0.5) / Z);
        ar += c[0]; ag += c[1]; ab += c[2]; aa += c[3];
      }
    }
    const n = Z * Z;
    raw[o++] = Math.round(ar / n);
    raw[o++] = Math.round(ag / n);
    raw[o++] = Math.round(ab / n);
    raw[o++] = Math.round(aa / n);
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
const target = path.join(out, 'icon.png');
fs.writeFileSync(target, png);
console.log('Ícone gerado:', target, png.length, 'bytes');