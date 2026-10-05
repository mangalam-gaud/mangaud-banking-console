// Generates the PWA PNG icons from the logo geometry.
// Hand-rolled PNG encoder (node:zlib only) so the repo needs no image library.
//
//   node make-icons.mjs
//
// Shapes are drawn with signed-distance functions and 2x2 supersampled, which
// gives clean anti-aliasing on curves at every icon size.
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// scripts/ -> client/
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SS = 2; // supersampling factor

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};

const encodePNG = (rgba, w, h) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // one filter byte (0 = None) per scanline
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ------------------------------------------------------------------- drawing

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp01(t));

// Signed distance to a rounded rectangle centred on (cx, cy).
const sdRoundRect = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

// Distance to a thick line segment, used for the strokes.
const sdSegment = (px, py, ax, ay, bx, by, halfW) => {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy || 1));
  return Math.hypot(wx - vx * t, wy - vy * t) - halfW;
};

const INK_TOP = [0x16, 0x23, 0x3d];
const INK_MID = [0x0e, 0x17, 0x26];
const INK_BOT = [0x0a, 0x10, 0x17];
const GOLD_LT = [0xf5, 0xb8, 0x41];
const GOLD_DK = [0xd9, 0x77, 0x06];

/**
 * @param {number} size     output pixel size
 * @param {object} opts     maskable: shrink the mark for the safe zone,
 *                          transparent: emit a transparent background
 */
const render = (size, { maskable = false, transparent = false } = {}) => {
  const rgba = Buffer.alloc(size * size * 4);
  const S = size * SS;

  // Geometry in a 64-unit design space, scaled to S.
  const u = S / 64;
  // Maskable icons must keep content inside the central 80% safe zone.
  const scale = maskable ? 0.72 : 0.9;
  const off = (64 * (1 - scale)) / 2;
  // Nudge the artwork to the optical centre (the arc rings read heavier at the
  // bottom, and the rupee's leg throws the mass right).
  const DX = 32 - 32;
  const DY = -1.5;
  const P = (v) => (off + v * scale) * u + (v === 0 ? 0 : 0);
  const PX = (v) => P(v) + DX * u;
  const PY = (v) => P(v) + DY * u;

  // cover: 0 = outside shape, 1 = inside
  const covRounded = (px, py) => {
    const d = sdRoundRect(px, py, S / 2, S / 2, S / 2, S / 2, maskable ? 0 : 15 * u);
    return clamp01(0.5 - d / (u * 0.6));
  };
  const covStroke = (d) => clamp01(0.5 - d / (u * 0.6));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x * SS + sx + 0.5);
          const py = (y * SS + sy + 0.5);

          // background
          let cr, cg, cb, ca;
          if (transparent) {
            [cr, cg, cb, ca] = [0, 0, 0, 0];
          } else {
            const t = (px / S + py / S) / 2;
            const c = t < 0.55 ? mix(INK_TOP, INK_MID, t / 0.55) : mix(INK_MID, INK_BOT, (t - 0.55) / 0.45);
            [cr, cg, cb] = c;
            ca = covRounded(px, py);
          }

          // vault arcs
          if (ca > 0) {
            const d1 = Math.abs(Math.hypot(px - P(32), py - PY(32)) - P(22)) - 0.75 * u;
            const d2 = Math.abs(Math.hypot(px - P(32), py - PY(32)) - P(17)) - 0.75 * u;
            const arc = Math.max(covStroke(d1) * 0.16, covStroke(d2) * 0.26);
            if (arc > 0) [cr, cg, cb] = mix([cr, cg, cb], GOLD_LT, arc);
          }

          // rupee: two bars, a stem descending from the left, and a leg
          const hw = 1.9 * u;
          const d = Math.min(
            sdSegment(px, py, PX(21), PY(24), PX(43), PY(24), hw),
            sdSegment(px, py, PX(21), PY(32), PX(43), PY(32), hw),
            sdSegment(px, py, PX(27), PY(24), PX(27), PY(32), hw),
            sdSegment(px, py, PX(27), PY(32), PX(32), PY(39), hw),
            sdSegment(px, py, PX(32), PY(39), PX(43), PY(41), hw)
          );
          const s = covStroke(d);
          if (s > 0) {
            const g = mix(GOLD_LT, GOLD_DK, clamp01((px / S + py / S) / 2));
            [cr, cg, cb] = mix([cr, cg, cb], g, s);
          }

          // ledger ticks
          for (let i = 0; i < 3; i++) {
            const tx = PX(21 + i * 8);
            const dt = sdRoundRect(px, py, tx + PX(2.5), PY(47), 2.5 * u * scale, 1.1 * u * scale, 1.1 * u);
            const ct = covStroke(dt) * 0.45;
            if (ct > 0) [cr, cg, cb] = mix([cr, cg, cb], GOLD_LT, ct);
          }

          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      // un-premultiply so edges keep their colour
      if (alpha > 0.0001) {
        rgba[i] = Math.round(r / n / alpha);
        rgba[i + 1] = Math.round(g / n / alpha);
        rgba[i + 2] = Math.round(b / n / alpha);
      }
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }

  return encodePNG(rgba, size, size);
};

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-192-maskable.png', 192, { maskable: true }],
  ['icon-512-maskable.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['favicon-32.png', 32, {}],
];

for (const [name, size, opts] of jobs) {
  writeFileSync(join(OUT, name), render(size, opts));
  console.log(`  ${name.padEnd(28)} ${size}x${size}`);
}
console.log('icons written to client/public/icons/');
