// The stamp in the top right of a card's back: a postage stamp whose picture is the card's own, engraved in its one ink.
// It is painted at device resolution into its own canvas, so it stays crisp at any scale.

type Ctx = OffscreenCanvasRenderingContext2D;
type Pic = (x: Ctx, w: number, h: number) => void; // draws the card's picture, cropped as on its front, to fill w x h

// The stamp is drawn on a unit of Z design px; its size in design px.
const Z = 1.55;
export const STAMP_SIZE: [number, number] = [38 * Z, 46 * Z];

const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Lines whose width follows the picture's darkness (crossed in the darkest parts), a fine frame, perforated edges.
function engraved(ink: string, pic: Pic, W: number, H: number, S: number, dev: number) {
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d')!, [ir, ig, ib] = rgb(ink);
  x.fillStyle = '#fdfbf5'; x.fillRect(0, 0, W, H);
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
  return c;
}

// Paints the stamp, stuck on, with its top left at (x0, y0) design px on a back drawn at S device px per design px.
export function paintStamp(x: Ctx, ink: string, pic: Pic, x0: number, y0: number, S: number) {
  const W = Math.round(STAMP_SIZE[0] * S), H = Math.round(STAMP_SIZE[1] * S);
  const c = engraved(ink, pic, W, H, S * Z, S); // geometry on the unit, the engraving at device fineness
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  x.shadowColor = 'rgba(60, 50, 30, 0.22)'; x.shadowBlur = 1.6 * S; x.shadowOffsetY = 0.5 * S;
  x.drawImage(c, Math.round(x0 * S), Math.round(y0 * S));
  x.restore();
}
