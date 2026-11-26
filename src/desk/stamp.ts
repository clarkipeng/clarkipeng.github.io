// The stamp in the top right of a card's back, in the card's one ink color. Three designs for review, picked by ?stamp=
// (1 engraved postage stamp, 2 postmark, 3 rubber stamp, 0 none); the two not chosen get deleted.
// Each is painted at device resolution into its own canvas, so it stays crisp at any scale.

type Ctx = OffscreenCanvasRenderingContext2D;
export interface StampArt {
  ink: string; // the card's ink, as hex without '#'
  seed: number;
  title: string; // the card's own title, as on its front
  pic: ((x: Ctx, w: number, h: number) => void) | null; // draws the card's picture, cropped as on its front, to fill w x h
}

export const STAMP = Math.round(Number(new URLSearchParams(location.search).get('stamp') ?? 1));
// Each design is drawn on a unit of Z design px; its size in design px is [width, height].
const Z = 1.55;
export const STAMP_SIZE: Record<number, [number, number]> = { 1: [38 * Z, 46 * Z], 2: [60 * Z, 42 * Z], 3: [46 * Z, 46 * Z] };

const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
function rng(seed: number) { let t = seed >>> 0; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296); }
// Smooth value noise on a lattice of cell px (device px), seeded.
function noise(seed: number, cell: number) {
  const h = (i: number, j: number) => { let n = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const u = x / cell, v = y / cell, i = Math.floor(u), j = Math.floor(v), a = s(u - i), b = s(v - j);
    return (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) + (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b;
  };
}
// A rubber-stamp impression: the ink thins and drops out in a fine grain and fades toward one side, as a hand stamp does.
function inked(c: OffscreenCanvas, seed: number, S: number, amt: number) {
  const x = c.getContext('2d')!, img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  const fine = noise(seed, 0.9 * S), mid = noise(seed + 7, 4 * S), r = rng(seed), ang = r() * 6.2832, ca = Math.cos(ang), sa = Math.sin(ang);
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
    const k = (j * c.width + i) * 4;
    if (!d[k + 3]) continue;
    const side = 0.5 + 0.5 * (((i - c.width / 2) * ca + (j - c.height / 2) * sa) / (0.5 * Math.max(c.width, c.height))); // 0 to 1 across it
    const keep = Math.min(1, Math.max(0, 1.6 - amt * (0.55 * fine(i, j) + 0.45 * mid(i, j)) - 0.45 * amt * side));
    d[k + 3] *= keep;
  }
  x.putImageData(img, 0, 0);
}

// 1: a postage stamp whose picture is the card's own, engraved in its ink: lines whose width follows the picture's
// darkness (crossed in the darkest parts), a fine frame, perforated edges.
function engraved(a: StampArt, W: number, H: number, S: number, dev: number) {
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!, [ir, ig, ib] = rgb(a.ink);
  x.fillStyle = '#fdfbf5'; x.fillRect(0, 0, W, H);
  const m = Math.round(3.6 * S), pw = W - 2 * m, ph = H - 2 * m;
  if (a.pic && pw > 0 && ph > 0) {
    const p = new OffscreenCanvas(pw, ph), px = p.getContext('2d', { willReadFrequently: true })!;
    a.pic(px, pw, ph);
    const src = px.getImageData(0, 0, pw, ph).data, L = new Float32Array(pw * ph);
    for (let i = 0; i < L.length; i++) L[i] = (0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2]) / 255;
    const sorted = Float32Array.from(L).sort(), lo = sorted[Math.floor(L.length * 0.03)], hi = sorted[Math.floor(L.length * 0.97)]; // auto levels, so a dark scene still reads
    const out = x.getImageData(m, m, pw, ph), d = out.data, g = Math.max(2.6, 1.45 * dev), aa = 1.6 / g;
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      const k = j * pw + i, D = Math.pow(1 - Math.min(1, Math.max(0, (L[k] - lo) / Math.max(0.05, hi - lo))), 0.9);
      const y = j + 0.22 * g * Math.sin(i / (5 * S)), v = Math.abs(((y / g) % 1) - 0.5) * 2; // 0 on a line's middle
      let cov = Math.min(1, Math.max(0, (D * 0.95 - v) / aa + 0.5));
      if (D > 0.62) { const u = Math.abs((((i + 0.5 * g) / g) % 1) - 0.5) * 2; cov = Math.max(cov, Math.min(1, Math.max(0, ((D - 0.62) * 1.6 - u) / aa + 0.5))); }
      const o = k * 4; d[o] += (ir - d[o]) * cov; d[o + 1] += (ig - d[o + 1]) * cov; d[o + 2] += (ib - d[o + 2]) * cov;
    }
    x.putImageData(out, m, m);
  }
  x.strokeStyle = '#' + a.ink; x.lineWidth = Math.max(1, 0.55 * S);
  const f = m - 1.1 * S; x.strokeRect(f, f, W - 2 * f, H - 2 * f);
  x.globalCompositeOperation = 'destination-out'; // the perforation: half-round bites along every edge
  const bite = (cx: number, cy: number) => { x.beginPath(); x.arc(cx, cy, 1.25 * S, 0, 6.2832); x.fill(); };
  for (let i = 0, n = Math.round(W / (3.8 * S)); i <= n; i++) { bite((i * W) / n, 0); bite((i * W) / n, H); }
  for (let i = 1, n = Math.round(H / (3.8 * S)); i < n; i++) { bite(0, (i * H) / n); bite(W, (i * H) / n); }
  return c;
}

// A small slime network: evenly spread nodes in a disc of radius R, each joined by a slightly bent vein to its three
// nearest, so the veins close into cells.
function network(x: Ctx, cx: number, cy: number, R: number, n: number, w: number, r: () => number) {
  const pts: number[][] = [], min = (1.5 * R) / Math.sqrt(n);
  for (let tries = 0; pts.length < n && tries < 4000; tries++) {
    const t = r() * 6.2832, d = R * Math.sqrt(r()), p = [cx + Math.cos(t) * d, cy + Math.sin(t) * d];
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > min)) pts.push(p);
  }
  const seen = new Set<string>();
  x.lineCap = 'round';
  for (const [i, p] of pts.entries()) {
    const near = pts.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 3);
    for (const [d, j] of near) {
      const key = i < j ? i + ',' + j : j + ',' + i;
      if (seen.has(key)) continue;
      seen.add(key);
      const q = pts[j], bend = (r() - 0.5) * 0.35 * d;
      x.lineWidth = w * (0.6 + 0.7 * r());
      x.beginPath(); x.moveTo(p[0], p[1]);
      x.quadraticCurveTo((p[0] + q[0]) / 2 - ((q[1] - p[1]) / d) * bend, (p[1] + q[1]) / 2 + ((q[0] - p[0]) / d) * bend, q[0], q[1]); x.stroke();
    }
  }
  for (const p of pts) { x.beginPath(); x.arc(p[0], p[1], w * 0.8, 0, 6.2832); x.fill(); }
}

// 2: a round postmark: two rings with the card's title set around them, a little slime network in the middle, and wavy
// cancel lines running off to the left; a hand-stamp impression.
function postmark(a: StampArt, W: number, H: number, S: number, dev: number) {
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!, r = rng(a.seed * 31 + 5);
  const R = 19.5 * S, cx = W - R - 1.2 * S, cy = H / 2, rot = (r() - 0.5) * 0.3;
  x.strokeStyle = x.fillStyle = '#' + a.ink;
  x.translate(cx, cy); x.rotate(rot); x.translate(-cx, -cy);
  x.lineWidth = 1.1 * S; x.beginPath(); x.arc(cx, cy, R - 0.6 * S, 0, 6.2832); x.stroke();
  x.lineWidth = 0.7 * S; x.beginPath(); x.arc(cx, cy, R - 7.4 * S, 0, 6.2832); x.stroke();
  const t = a.title.toUpperCase(), tr = R - 5.6 * S, gap = 0.9 * S;
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const widths = (fs: number) => { x.font = `600 ${fs}px Inter, sans-serif`; return [...t].map((ch) => x.measureText(ch).width + gap); };
  let ws = widths(4.6 * S), span = ws.reduce((s, v) => s + v, 0) / tr; // radians it takes
  if (span > 5.3) { ws = widths(4.6 * S * Math.max(0.7, 5.3 / span)); span = ws.reduce((s, v) => s + v, 0) / tr; } // a long title: smaller type
  let th = -Math.PI / 2 - span / 2;
  for (const [i, ch] of [...t].entries()) {
    const mid = th + ws[i] / 2 / tr;
    x.save(); x.translate(cx + Math.cos(mid) * tr, cy + Math.sin(mid) * tr); x.rotate(mid + Math.PI / 2); x.fillText(ch, 0, 0); x.restore();
    th += ws[i] / tr;
  }
  network(x, cx, cy + 0.6 * S, 9.5 * S, 9, 0.6 * S, r);
  x.lineWidth = 0.95 * S; x.lineCap = 'round';
  const x1 = cx - R - 1.5 * S; // the cancel lines stop short of the ring
  for (let k = 0; k < 4; k++) {
    const y = cy + (k - 1.5) * 5.2 * S, ph = r() * 6.2832;
    x.beginPath();
    for (let px = 1.5 * S; px <= x1; px += 0.5 * S) { const py = y + 1.25 * S * Math.sin(px / (2.4 * S) + ph); if (px === 1.5 * S) x.moveTo(px, py); else x.lineTo(px, py); }
    x.stroke();
  }
  inked(c, a.seed * 13 + 1, dev, 0.75);
  return c;
}

// 3: a rubber stamp: a rounded square in a heavy and a fine border around a bold slime network, pressed a little crooked
// and unevenly inked.
function rubber(a: StampArt, W: number, H: number, S: number, dev: number) {
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!, r = rng(a.seed * 17 + 3);
  const cx = W / 2, cy = H / 2, s = Math.min(W, H) - 6 * S, rot = (r() - 0.5) * 0.24;
  x.translate(cx, cy); x.rotate(rot); x.translate(-cx, -cy);
  x.strokeStyle = x.fillStyle = '#' + a.ink;
  const box = (inset: number, w: number, rad: number) => { x.lineWidth = w; x.beginPath(); x.roundRect(cx - s / 2 + inset, cy - s / 2 + inset, s - 2 * inset, s - 2 * inset, rad); x.stroke(); };
  box(0.9 * S, 1.8 * S, 5 * S); box(3.6 * S, 0.6 * S, 3 * S);
  x.save(); x.beginPath(); x.roundRect(cx - s / 2 + 4 * S, cy - s / 2 + 4 * S, s - 8 * S, s - 8 * S, 2.6 * S); x.clip();
  network(x, cx, cy, s * 0.62, 16, 1.05 * S, r); // runs off the inner border, clipped
  x.restore();
  inked(c, a.seed * 7 + 2, dev, 0.9);
  return c;
}

// Paints design `which` with its top left at (x0, y0) design px on a back drawn at S device px per design px.
export function paintStamp(x: Ctx, which: number, a: StampArt, x0: number, y0: number, S: number) {
  const [sw, sh] = STAMP_SIZE[which], W = Math.round(sw * S), H = Math.round(sh * S);
  const c = (which === 1 ? engraved : which === 2 ? postmark : rubber)(a, W, H, S * Z, S); // geometry on the unit, grain and engraving at device fineness
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  if (which === 1) { x.shadowColor = 'rgba(60, 50, 30, 0.22)'; x.shadowBlur = 1.6 * S; x.shadowOffsetY = 0.5 * S; } // a paper stamp stuck on
  else x.globalCompositeOperation = 'multiply'; // ink pressed into the card
  x.drawImage(c, Math.round(x0 * S), Math.round(y0 * S));
  x.restore();
}
