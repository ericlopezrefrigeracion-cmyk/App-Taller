import pako from 'pako';

type Point = { x: number; y: number };

// ─── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  const combined = new Uint8Array(t.length + data.length);
  combined.set(t); combined.set(data, t.length);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(u32(data.length), 0);
  out.set(t, 4);
  out.set(data, 8);
  out.set(u32(crc32(combined)), 8 + data.length);
  return out;
}

// ─── Pixel drawing ────────────────────────────────────────────────────────────
function drawDot(buf: Uint8ClampedArray, W: number, H: number, cx: number, cy: number, r: number) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r + 0.8) continue;
      const alpha = d < r ? 1.0 : (r + 0.8 - d) / 0.8;
      const idx = (y * W + x) * 4;
      buf[idx]     = Math.round(buf[idx]     * (1 - alpha));
      buf[idx + 1] = Math.round(buf[idx + 1] * (1 - alpha));
      buf[idx + 2] = Math.round(buf[idx + 2] * (1 - alpha));
    }
  }
}

function drawSegment(buf: Uint8ClampedArray, W: number, H: number, a: Point, b: Point, r: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drawDot(buf, W, H, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function strokesToPNG(strokes: Point[][], W: number, H: number): string {
  const w = Math.round(W);
  const h = Math.round(H);
  if (w <= 0 || h <= 0) return '';

  const buf = new Uint8ClampedArray(w * h * 4).fill(255);
  const r = 2.0; // pen radius

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    if (stroke.length === 1) { drawDot(buf, w, h, stroke[0].x, stroke[0].y, r); continue; }
    for (let i = 0; i < stroke.length - 1; i++) drawSegment(buf, w, h, stroke[i], stroke[i + 1], r);
  }

  // IHDR
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  // Scanlines: filter(None=0) + RGB per pixel
  const rowSize = w * 3;
  const raw = new Uint8Array((rowSize + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (rowSize + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (rowSize + 1) + 1 + x * 3;
      raw[dst] = buf[src]; raw[dst + 1] = buf[src + 1]; raw[dst + 2] = buf[src + 2];
    }
  }

  const idat = pako.deflate(raw, { level: 6 });

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { png.set(c, off); off += c.length; }

  // Uint8Array → base64
  let bin = '';
  for (let i = 0; i < png.length; i++) bin += String.fromCharCode(png[i]);
  return `data:image/png;base64,${btoa(bin)}`;
}
