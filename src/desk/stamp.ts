// The stamp in the top right of a card's back: a postage stamp whose picture is the card's own, engraved in its one ink.
// It is painted at device resolution into its own canvas, so it stays crisp at any scale. The first time the back shows,
// its print (the frame and the picture inside it) develops like instant film.

import { smooth } from './tunables.ts';

type Ctx = OffscreenCanvasRenderingContext2D;
type Pic = (x: Ctx, w: number, h: number) => void; // draws the card's picture, cropped as on its front, to fill w x h

// The stamp is drawn on a unit of Z design px; its size in design px.
const Z = 1.55;
export const STAMP_SIZE: [number, number] = [38 * Z, 46 * Z];

const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const PAPER = [0xfd, 0xfb, 0xf5]; // the stamp's paper
// Undeveloped film: the paper's warmth mirrored to cool, a little dimmer: a milky square.
const FOG = [...PAPER].reverse().map((c) => c * 0.88);
export const DEVELOP_S = 2.4; // how long the print takes to develop

// Lines whose width follows the picture's darkness (crossed in the darkest parts), a fine frame, perforated edges.
function engraved(ink: string, pic: Pic, W: number, H: number, S: number, dev: number) {
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!, [ir, ig, ib] = rgb(ink);
  x.fillStyle = `rgb(${PAPER})`; x.fillRect(0, 0, W, H);
  const m = Math.round(3.6 * S), pw = W - 2 * m, ph = H - 2 * m;
  const p = new OffscreenCanvas(pw, ph), px = p.getContext('2d', { willReadFrequently: true })!;
  pic(px, pw, ph);
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
  x.strokeStyle = '#' + ink; x.lineWidth = Math.max(1, 0.55 * S);
  const f = m - 1.1 * S; x.strokeRect(f, f, W - 2 * f, H - 2 * f);
  x.globalCompositeOperation = 'destination-out'; // the perforation: half-round bites along every edge
  const bite = (cx: number, cy: number) => { x.beginPath(); x.arc(cx, cy, 1.25 * S, 0, 6.2832); x.fill(); };
  for (let i = 0, n = Math.round(W / (3.8 * S)); i <= n; i++) { bite((i * W) / n, 0); bite((i * W) / n, H); }
  for (let i = 1, n = Math.round(H / (3.8 * S)); i < n; i++) { bite(0, (i * H) / n); bite(W, (i * H) / n); }
  return { c, inset: Math.ceil(1.25 * S) + 1 }; // the print: all of it inside the bites
}

// Paints the stamp, stuck on, with its top left at (x0, y0) design px on a back drawn at S device px per design px.
// Returns its print, developed, as the back's device px.
export function paintStamp(x: Ctx, ink: string, pic: Pic, x0: number, y0: number, S: number): Print {
  const W = Math.round(STAMP_SIZE[0] * S), H = Math.round(STAMP_SIZE[1] * S), X = Math.round(x0 * S), Y = Math.round(y0 * S);
  const { c, inset } = engraved(ink, pic, W, H, S * Z, S); // geometry on the unit, the engraving at device fineness
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  x.shadowColor = 'rgba(60, 50, 30, 0.22)'; x.shadowBlur = 1.6 * S; x.shadowOffsetY = 0.5 * S;
  x.drawImage(c, X, Y);
  x.restore();
  const w = W - 2 * inset, h = H - 2 * inset, full = c.getContext('2d')!.getImageData(inset, inset, w, h).data;
  // How much ink each pixel holds, from the channel where the ink differs most from the paper.
  const ir = rgb(ink), k = [0, 1, 2].reduce((a, b) => (Math.abs(PAPER[b] - ir[b]) > Math.abs(PAPER[a] - ir[a]) ? b : a));
  const cov = new Float32Array(w * h).map((_, i) => Math.min(1, Math.max(0, (PAPER[k] - full[i * 4 + k]) / (PAPER[k] - ir[k]))));
  return { x: X + inset, y: Y + inset, w, h, full, cov, out: new Uint8Array(full.length) };
}
export interface Print { x: number; y: number; w: number; h: number; full: Uint8ClampedArray; cov: Float32Array; out: Uint8Array<ArrayBuffer> }
// The print u of the way through developing (0 to 1, eased): out of the fog, the inked lines first, then the paper.
export function develop(p: Print, u: number) {
  const e = smooth(u), { full, cov, out } = p;
  for (let i = 0; i < cov.length; i++) {
    const d = e ** (2 - cov[i]), o = i * 4;
    for (let ch = 0; ch < 3; ch++) out[o + ch] = FOG[ch] + (full[o + ch] - FOG[ch]) * d;
    out[o + 3] = 255;
  }
  return out;
}
