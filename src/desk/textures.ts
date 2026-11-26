import { currentDesk, type Desk } from './state.ts';
import { TOK, CORNER } from './tunables.ts';
import type { Card, Rect, CardBox } from './layout.ts';
import type { Gpu, Sim } from './gpu.ts';
import { STAMP_SIZE, paintStamp, develop } from './stamp.ts';

type Ctx = OffscreenCanvasRenderingContext2D;

// ---------- card backs ----------
// The back of a card: type alone, with a hand-drawn underline under each link; the sticky note's links are handwritten in
// Caveat. Every back uses one type scale and an 8px spacing grid, and its first baseline sits 32px below its top edge.
// Material follows the front: paper cards stay paper, the polaroid's back is matte photo-paper stock, the note stays
// yellow. Layout is in CSS px, so the DOM can put the real links (hit areas) in the same places.

// A back's layout: its lines of copy, its links, and how tall it needs to be (need).
type Link = ReturnType<Desk['linkAt']>;
interface BackLine { t: string; f: { font: string; color: string }; y: number }
interface BackLayout { lines: BackLine[]; links: Link[]; w: number; h: number; need: number; stamp?: { x: number; y: number } | null }
type Row = [HTMLAnchorElement, number, number][]; // a row of links: each with its x and text width

export function mountTextures() {
const desk = currentDesk();
const { BOX_T, font, BOX3D, capped, STRIP, CAP_LH, HAND, measure, hinged, sources, decked, NAMES,
  tallySetup } = desk;
// ---------- card textures ----------

// The part of an image (fractions) that covers a media area of aspect ma, zoomed by the card's framing [zoom, x, y].
// x and y place the crop like CSS object-position, so stills, clips, and the DOM fallback frame the same way.
function coverRect(ia: number, ma: number, [z, px, py]: number[]) {
  const w = Math.min(1, ma / ia) / z, h = Math.min(1, ia / ma) / z;
  return [px * (1 - w), py * (1 - h), w, h];
}

// The card box, in the desk's paper and ink: its front (the page's name handwritten on it, a thumb notch at the open end,
// a fine inset frame and a few faint veins), and its lid (inside: plain stock and the fold; outside: the tuck flap's
// pen outline). The box's open end is its left edge, toward the page; the lid is hinged there.
const BOX_NAMES = ['projects', 'research'];
function paintBox(x: Ctx, s: Card, S: number) {
  const w = s.w, h = s.h, t = BOX_T, fh = h - t, lid = Math.round((h - 12 - t) * 0.13); // the tuck flap's width (boxSize)
  x.save(); x.scale(S, S); x.clearRect(0, 0, w, h);
  const poly = (...p: [number, number][]) => { x.beginPath(); x.moveTo(...p[0]); for (const q of p.slice(1)) x.lineTo(...q); x.closePath(); };
  const line = (a: [number, number], b: [number, number], color: string, width = 1) => { x.strokeStyle = color; x.lineWidth = width; x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); };
  // The wall facing down the page, in the shade of the light from the upper left; darker toward the desk.
  let g = x.createLinearGradient(0, fh, 0, h); g.addColorStop(0, '#d3ccbb'); g.addColorStop(1, '#ada48f');
  poly([t, fh], [w, fh], [w - t, h], [0, h]); x.fillStyle = g; x.fill();
  // The open end: the inside, in the front panel's shadow (deepest under its edge), drawn see-through so a card going in
  // shows in it.
  g = x.createLinearGradient(t, 0, 0, 0); g.addColorStop(0, 'rgba(38, 33, 26, 0.84)'); g.addColorStop(0.55, 'rgba(38, 33, 26, 0.62)'); g.addColorStop(1, 'rgba(38, 33, 26, 0.4)');
  poly([t, 0], [t, fh], [0, h], [0, t]); x.fillStyle = g; x.fill();
  // The front panel: card stock, lit a little more toward the light, a few faint veins inside a fine inset frame.
  g = x.createLinearGradient(t, 0, w, fh); g.addColorStop(0, '#fbf9f3'); g.addColorStop(1, TOK.stock);
  x.fillStyle = g; x.fillRect(t, 0, w - t, fh);
  paintVeins(x, [t + 7, 7, w - t - 14, fh - 14], rng(31 + s.region * 7), 14, 0.28);
  x.strokeStyle = TOK.inkLine; x.lineWidth = 1; x.strokeRect(t + 7.5, 7.5, w - t - 15, fh - 15);
  // The thumb notch at the open end, cut out of the front panel: the inside shows through it.
  x.save(); x.beginPath(); x.arc(t, fh / 2, 15, -Math.PI / 2, Math.PI / 2); x.closePath(); x.clip(); x.clearRect(t, fh / 2 - 15, 15, 30);
  g = x.createLinearGradient(t, 0, t + 15, 0); g.addColorStop(0, 'rgba(38, 33, 26, 0.7)'); g.addColorStop(1, 'rgba(38, 33, 26, 0.84)');
  x.fillStyle = g; x.fillRect(t, fh / 2 - 15, 15, 30); x.restore();
  x.strokeStyle = 'rgba(255, 253, 246, 0.95)'; x.lineWidth = 1.2; x.beginPath(); x.arc(t, fh / 2, 15, -Math.PI / 2, Math.PI / 2); x.stroke();
  // Edges: the paper's cut edges catch the light (the front panel's top and open end, the walls' ends at the opening); the
  // crease into the shaded wall and the base's edges on the desk are dark.
  line([t, 0.6], [w, 0.6], 'rgba(255, 253, 246, 0.95)', 1.2);
  line([t + 0.6, 0], [t + 0.6, fh / 2 - 15], 'rgba(255, 253, 246, 0.95)', 1.2); line([t + 0.6, fh / 2 + 15], [t + 0.6, fh], 'rgba(255, 253, 246, 0.95)', 1.2);
  line([t, 0.6], [0.6, t], 'rgba(255, 253, 246, 0.8)', 1.2);
  line([t, fh], [0.6, h - 0.6], 'rgba(255, 253, 246, 0.55)', 1);
  line([t, fh], [w, fh], 'rgba(60, 54, 44, 0.35)', 1);
  line([0.5, t], [0.5, h], 'rgba(40, 36, 30, 0.45)', 1); line([0, h - 0.5], [w - t, h - 0.5], 'rgba(40, 36, 30, 0.5)', 1);
  // The page's name, handwritten along the upright box like a spine, just past the closed lid so it shows when tucked.
  x.font = font(500, 26, 'Caveat'); x.fillStyle = TOK.text2; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.translate(t + lid + 17, fh / 2); x.rotate(-Math.PI / 2); x.fillText(BOX_NAMES[s.region], 0, 2);
  x.restore();
}
// A few faint veins of ink in a rect of board: n points, each joined to its two nearest by a curved stroke.
function paintVeins(x: Ctx, [x0, y0, vw, vh]: number[], r: () => number, n: number, alpha: number) {
  x.save(); x.beginPath(); x.rect(x0, y0, vw, vh); x.clip();
  const pts = Array.from({ length: n }, () => [x0 + r() * vw, y0 + r() * vh]);
  x.strokeStyle = TOK.ink; x.globalAlpha = alpha; x.lineCap = 'round';
  for (const [i, p] of pts.entries()) {
    const near = pts.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j > i).sort((a, b) => a[0] - b[0]).slice(0, 2);
    for (const [d, j] of near) { const q = pts[j]; x.lineWidth = Math.max(0.6, 2 - d / 60); x.beginPath(); x.moveTo(p[0], p[1]); x.quadraticCurveTo((p[0] + q[0]) / 2 + (r() - 0.5) * 0.3 * d, (p[1] + q[1]) / 2 + (r() - 0.5) * 0.3 * d, q[0], q[1]); x.stroke(); }
  }
  x.restore();
}
// The flying box's faces besides its front (which is the painting's front panel), at device resolution: the shaded wall
// and the open end taken from the painting itself (each parallelogram there unsheared to its face), so its first frame
// in the air is the painting; plain board for the walls the painting never shows, and the inside.
function paintFaces(s0: Card, S0: number, tile: OffscreenCanvas) {
  const S = S0 * (s0.k || 1), s = design(s0), t = BOX_T, fh = s.h - t, a = BOX3D.a, W = s.w - t, H = s.h - t, D = t / a;
  const face = (fw: number, fhh: number, paint: (x: Ctx, fw: number, fhh: number) => void) => { const c = new OffscreenCanvas(Math.ceil(fw * S), Math.ceil(fhh * S)), x = c.getContext('2d')!; x.scale(S, S); paint(x, fw, fhh); return c; };
  const from = (x: Ctx, m: [number, number, number, number, number, number]) => { x.save(); x.setTransform(...m); x.drawImage(tile, 0, 0); x.restore(); }; // the painting, mapped (device px) onto the face
  const board = (x: Ctx, fw: number, fhh: number, seed: number, n: number) => {
    const g = x.createLinearGradient(0, 0, fw, fhh); g.addColorStop(0, '#fbf9f3'); g.addColorStop(1, TOK.stock);
    x.fillStyle = g; x.fillRect(0, 0, fw, fhh);
    if (n) paintVeins(x, [7, 7, fw - 14, fhh - 14], rng(seed), n, 0.16);
    x.strokeStyle = 'rgba(255, 253, 246, 0.9)'; x.lineWidth = 1.2; x.strokeRect(1.6, 1.6, fw - 3.2, fhh - 3.2); // the cut edges catch the light
    x.strokeStyle = 'rgba(60, 54, 44, 0.32)'; x.lineWidth = 1; x.strokeRect(0.5, 0.5, fw - 1, fhh - 1);
  };
  return {
    bottom: face(W, D, (x) => { // the wall facing down the page, in its shade
      const g = x.createLinearGradient(0, 0, 0, D); g.addColorStop(0, '#d3ccbb'); g.addColorStop(1, '#ada48f');
      x.fillStyle = g; x.fillRect(0, 0, W, D); from(x, [1, 0, 1, 1 / a, -S * (t + fh), (-S * fh) / a]);
    }),
    open: face(H, D, (x) => from(x, [1, -1 / a, 1, 0, -S * t, (S * t) / a])),
    top: face(W, D, (x) => board(x, W, D, 47 + s.region * 7, 3)),
    end: face(H, D, (x) => board(x, H, D, 53 + s.region * 7, 3)),
    back: face(W, H, (x) => { // the base, its glued flap along one side
      board(x, W, H, 61 + s.region * 7, 9);
      x.fillStyle = 'rgba(60, 54, 44, 0.05)'; x.fillRect(1, H - 22, W - 2, 21);
      x.strokeStyle = 'rgba(60, 54, 44, 0.22)'; x.beginPath(); x.moveTo(1, H - 22.5); x.lineTo(W - 1, H - 22.5); x.stroke();
    }),
    inner: face(8, 8, (x) => { x.fillStyle = '#ddd6c6'; x.fillRect(0, 0, 8, 8); }),
  };
}
// The lid: the deep end wall (BOX_T, at the hinge) and the tuck flap. Inside (open, lying on the desk beside the open end,
// hinged on its right): plain stock, on the base's span below the clear strip. Outside (closed over the open end, seen
// mirrored, hinged on its left): the end wall, lit, standing between the base's edge and the front panel's, then the flap
// lying on the front panel, its rounded corners in pen.
function paintLid(x: Ctx, s: Card, S: number, outside: boolean) {
  const w = s.w, h = s.h, t = BOX_T, fh = h - t;
  x.save(); x.scale(S, S); x.clearRect(0, 0, w, h);
  x.strokeStyle = TOK.inkLine; x.lineWidth = 1;
  const rr = Math.min(18, (w - t) * 0.6);
  if (outside) {
    x.beginPath(); x.moveTo(0, t); x.lineTo(t, 0); x.lineTo(t, fh); x.lineTo(0, h); x.closePath(); x.fillStyle = '#f7f4ec'; x.fill();
    x.strokeStyle = 'rgba(40, 36, 30, 0.45)'; x.beginPath(); x.moveTo(0.5, t); x.lineTo(0.5, h); x.stroke();
    x.fillStyle = TOK.stock; x.fillRect(t, 0, w - t, fh);
    x.strokeStyle = 'rgba(255, 253, 246, 0.95)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(t + 0.6, 0); x.lineTo(t + 0.6, fh); x.moveTo(t, 0.6); x.lineTo(w, 0.6); x.stroke();
    x.strokeStyle = TOK.inkLine; x.lineWidth = 1; const tip = w - 1.5;
    x.beginPath(); x.moveTo(t + 3, 5); x.lineTo(tip - rr, 5); x.quadraticCurveTo(tip, 5, tip, 5 + rr); x.lineTo(tip, fh - 5 - rr); x.quadraticCurveTo(tip, fh - 5, tip - rr, fh - 5); x.lineTo(t + 3, fh - 5); x.stroke();
  } else {
    x.fillStyle = '#efeadf'; x.fillRect(0, t, w, fh);
    x.fillStyle = 'rgba(60, 54, 44, 0.06)'; x.fillRect(w - t, t, t, fh); // the end wall's inside, a touch shaded
    x.globalAlpha = 0.7; x.beginPath(); x.moveTo(w - t, t + 4); x.lineTo(w - t, h - 4); x.stroke(); // the fold between the end wall and the flap
    x.beginPath(); x.moveTo(w - t - 3, t + 5); x.lineTo(1.5 + rr, t + 5); x.quadraticCurveTo(1.5, t + 5, 1.5, t + 5 + rr); x.lineTo(1.5, h - 5 - rr); x.quadraticCurveTo(1.5, h - 5, 1.5 + rr, h - 5); x.lineTo(w - t - 3, h - 5); x.stroke();
    x.globalAlpha = 1;
  }
  x.restore();
}
function drawCard(s0: Card, S0: number) {
  const cw = Math.ceil(s0.w * S0), ch = Math.ceil(s0.h * S0), S = S0 * (s0.k || 1), s = design(s0); // drawn in design px
  const c = new OffscreenCanvas(cw, ch), x = c.getContext('2d')!;
  x.fillStyle = s.kind === 'note' ? TOK.note : capped(s) ? TOK.film : TOK.stock; // photo cards on their film's stock
  x.fillRect(0, 0, cw, ch);
  if (s.kind === 'deck') (s.lid ? paintLid : paintBox)(x, s, S, false); // the card box's front, or its lid's inside
  if (s.kind === 'note') { x.fillStyle = TOK.noteStrip; x.fillRect(0, 0, cw, STRIP * S); } // the sticky strip is a touch darker
  let mediaPx: Rect | null = null;
  if (s.media) {
    const m = s.media;
    mediaPx = { x: Math.round(m.x * S), y: Math.round(m.y * S), w: Math.round(m.w * S), h: Math.round(m.h * S) };
    const src = s.img!; // a card with media has its picture
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    const [fx, fy, fw, fh] = coverRect(iw / ih, mediaPx.w / mediaPx.h, s.frame);
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, fx * iw, fy * ih, fw * iw, fh * ih, mediaPx.x, mediaPx.y, mediaPx.w, mediaPx.h);
  }
  x.scale(S, S);
  x.textBaseline = 'alphabetic';
  if (capped(s)) { // the caption in the film's bottom strip: the title over its line, or the polaroid's line centered
    s.lines!.forEach((l, i) => {
      const last = i === s.lines!.length - 1;
      x.font = font(s.titled ? (last ? 400 : 600) : 500); x.fillStyle = s.titled ? (last ? TOK.muted : TOK.text) : TOK.body;
      x.textAlign = s.titled ? 'left' : 'center';
      x.fillText(l, s.titled ? s.media!.x : s.w / 2, s.baseline! + i * CAP_LH());
    });
  } else if (s.kind === 'paper') {
    x.fillStyle = TOK.body; x.fillRect(0, 0, 3, s.h);
    x.font = font(600, 16); x.fillStyle = TOK.text;
    s.lines!.forEach((l, i) => x.fillText(l, 21, 16 + 16 + i * 21.5));
    x.font = font(400); x.fillStyle = TOK.muted;
    x.fillText(s.sub!, 21, 16 + s.lines!.length * 21.5 + 6 + 13);
  } else if (s.kind === 'note') {
    x.font = HAND; x.fillStyle = TOK.text2;
    s.lines!.forEach((l, i) => x.fillText(l, 16, 14 + 19 + i * 26.5));
  }
  return { canvas: c, mediaPx };
}
const STOCK = (kind: string) => ({ photo: TOK.film, paper: TOK.stock, polaroid: TOK.stockWarm, note: TOK.note } as Record<string, string>)[kind] ?? TOK.stock; // a photo card's back is its film's stock (read when drawn: the colors are tunable)
const TYPE = { // read when drawn: the type follows TS
  get body() { return { font: font(400), lh: 19 * desk.TS, color: TOK.body }; }, // the copy sits 1 px closer than the front's
  get link() { return { font: font(500), color: TOK.inkDeep }; },
  noteHand: { font: HAND, color: TOK.text2 },
};
// Back spacing in design px.
const BK = {
  pad: 12, get first() { return BK.pad + 16 * desk.TS; }, get row() { return 22 * desk.TS; },
  get gap() { return 12 * desk.TS; }, get bottom() { return BK.pad - 7 + 13 * desk.TS; },
};

// A link: its text at (x, base) and its hit area (a 24px row, 4px wider than the text on each side).
const linkAt = (a: HTMLAnchorElement, x: number, base: number, tw: number, h = BK.row) => ({ a, x: x - 4, y: base - 16, w: tw + 8, h, tx: x, base, tw });
// b: the size to lay out at (the card's own by default). loose: the note's list at the roomier spacing (16 px padding,
// 24 px rows) the desk sizes the note by (layout.ts), so it stays as tall as when every back had that spacing.
function backLayout(s: Card, b: CardBox = s, loose = false): BackLayout {
  const w = b.w, m = measure(), { pad, row } = BK;
  if (s.kind === 'note') {
    // A tidy list, one link per line, from the same first baseline as every other back.
    m.font = TYPE.noteHand.font;
    const [first, r, bottom] = loose ? [16 + 16 * desk.TS, 24 * desk.TS, 9 + 13 * desk.TS] : [BK.first, row, BK.bottom];
    // Two columns when one would not fit.
    const n = s.backLinks!.length, two = !loose && first + (n - 1) * r + bottom + STRIP > b.h, per = two ? Math.ceil(n / 2) : n;
    const links = s.backLinks!.map((a, i) => linkAt(a, pad + (i >= per ? Math.round((w - 2 * pad) / 2) : 0), first + (i % per) * r, m.measureText(a.textContent!).width));
    return { lines: [], links, w, h: b.h, need: first + (per - 1) * r + bottom + STRIP }; // clear of the strip along its bottom
  }
  // An inked card has its stamp in the top right when the copy still fits beside it.
  const stamped = s.inkHex && s.img ? backText(s, b, STAMP_SIZE) : null;
  return stamped && stamped.need <= b.h ? stamped : backText(s, b, null);
}
// A back's copy and links, wrapped beside a stamp of size [w, h] in the top right while the lines are level with it.
function backText(s: Card, b: CardBox, stamp: [number, number] | null): BackLayout {
  const w = b.w, m = measure(), { pad, row } = BK, st = stamp && { x: w - pad - stamp[0] + 2, y: pad - 4 }, below = st ? st.y + stamp![1] + 4 : 0;
  // No label line: it only repeated the front's caption (Clark: no redundancy).
  // The paragraphs, 8px apart, the first 8px under the first baseline, narrower while level with the stamp. The title
  // is on the front only.
  const lines: BackLine[] = [], f = TYPE.body, narrow = st ? st.x - 8 - pad : 0;
  let y = BK.first - f.lh;
  m.font = f.font;
  for (const t of s.backParas!) {
    y += 8;
    let line = '';
    for (const word of t.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (line && m.measureText(test).width > (st && y + f.lh - 13 * desk.TS < below ? narrow : w - 2 * pad)) { y += f.lh; lines.push({ t: line, f, y }); line = word; } else line = test;
    }
    if (line) { y += f.lh; lines.push({ t: line, f, y }); }
  }
  // Links: ink text in rows along the bottom, the last baseline 22px above the bottom edge (top, on a back with no text).
  m.font = TYPE.link.font;
  const rows: Row[] = [[]];
  let x = pad;
  for (const a of s.backLinks!) {
    const tw = m.measureText(a.textContent!).width;
    if (x + tw > w - pad && x > pad) { rows.push([]); x = pad; }
    rows.at(-1)!.push([a, x, tw]); x += tw + BK.gap;
  }
  const need = Math.ceil((lines.length ? y : 0) + 32 + BK.bottom + (rows.length - 1) * row);
  const base0 = b.h - BK.bottom - (rows.length - 1) * row;
  const links = rows.flatMap((r, i) => r.map(([a, lx, tw]) => linkAt(a, lx, base0 + i * row, tw)));
  return { lines, links, w, h: b.h, need: Math.max(need, Math.ceil(below + 20 + BK.bottom + (rows.length - 1) * row)), stamp: st }; // the links clear the stamp
}

// Deterministic noise, so the atlas looks the same on every build.
function rng(seed: number) { let t = seed >>> 0; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296); }
// Matte stock: a faint, fine grain (photo-paper backs and the note).
function grain(x: Ctx, cw: number, ch: number, amt: number, seed: number) {
  const img = x.getImageData(0, 0, cw, ch), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}
// A hand-drawn underline: a slightly wavering, slightly tilted stroke that starts and ends a touch past the word.
function penLine(x: Ctx, x0: number, x1: number, y: number, seed: number, width: number) {
  const r = rng(seed * 7919 + 17), tilt = (r() - 0.5) * 1.2, ph = r() * 6.28, n = Math.max(4, Math.round((x1 - x0) / 6));
  x.beginPath();
  for (let i = 0; i <= n; i++) {
    const u = i / n, px = x0 - 2 + (x1 - x0 + 3) * u;
    const py = y + tilt * (u - 0.5) + Math.sin(ph + u * 5) * 0.45;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.lineWidth = width; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();
}

function drawBack(s0: Card, S0: number) {
  const S = S0 * (s0.k || 1), s = design(s0), { lines, links, w, h, stamp } = backLayout(s), { pad } = BK; // design px
  const cw = Math.ceil(s0.w * S0), chh = Math.ceil(s0.h * S0);
  const c = new OffscreenCanvas(cw, chh), x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = STOCK(s.kind); x.fillRect(0, 0, cw, chh);
  if (s.kind === 'polaroid') grain(x, cw, chh, 9, 7); // the photo paper's back: warmer, matte, a little toothy
  if (s.kind === 'note') grain(x, cw, chh, 5, 11);
  x.scale(S, S);
  if (s.kind === 'note') { x.fillStyle = TOK.noteStrip; x.fillRect(0, h - STRIP, w, STRIP); } // the strip's back, along the bottom: the note turns over its top edge
  let print = null;
  if (stamp) { // its picture, framed as on its front
    const src = s.img!, iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    print = paintStamp(x, s.inkHex!, (p, pw, ph) => { const [fx, fy, fw, fh] = coverRect(iw / ih, pw / ph, s.frame); p.imageSmoothingQuality = 'high'; p.drawImage(src, fx * iw, fy * ih, fw * iw, fh * ih, 0, 0, pw, ph); }, stamp.x, stamp.y, S);
  }
  x.textBaseline = 'alphabetic';
  for (const l of lines) { x.font = l.f.font; x.fillStyle = l.f.color; x.fillText(l.t, pad, l.y); }
  links.forEach((k, i) => {
    const t = k.a.textContent!;
    if (s.kind === 'note') {
      x.font = TYPE.noteHand.font; x.fillStyle = TOK.text2; x.fillText(t, k.tx, k.base);
      x.strokeStyle = TOK.inkLine; penLine(x, k.tx, k.tx + k.tw, k.base + 4, i + 1, 1.3);
      return;
    }
    x.font = TYPE.link.font; x.fillStyle = TYPE.link.color; x.fillText(t, k.tx, k.base);
    x.strokeStyle = TOK.inkLine; penLine(x, k.tx, k.tx + k.tw, k.base + 4, s.id * 13 + i, 1.15);
  });
  return { canvas: c, links, w, h, print };
}
// The stamp's print, as far as it has developed, over its spot in the atlas.
function developStamp(s: Card) {
  const p = s.print!;
  desk.gpu!.device.queue.writeTexture({ texture: desk.shared!.atlas!, origin: [p.x, p.y] }, develop(p, s.dev), { bytesPerRow: p.w * 4 }, [p.w, p.h]);
  desk.redraw = true;
}
function drawLidOutside(s: Card, S: number) {
  const c = new OffscreenCanvas(Math.ceil(s.w * S), Math.ceil(s.h * S));
  paintLid(c.getContext('2d')!, design(s), S * (s.k || 1), true);
  return { canvas: c, links: [], w: s.w, h: s.h, print: null };
}
// A card at its design size (what it is drawn and laid out in; the desk shows it at its card scale).
const design = (s: Card): Card => (s.k && s.k !== 1 ? { ...s, w: s.w / s.k, h: s.h / s.k } : s);
// The DOM links sit exactly on the drawn ones, as their hit areas.
function placeBackLinks(_s: Card, links: Link[]) {
  for (const k of links) Object.assign(k.a.style, { left: k.x + 'px', top: k.y + 'px', width: k.w + 'px', height: k.h + 'px' });
}
// Without WebGPU the DOM shows the same drawn back, as the .back's background, with the links over it.
function paintDomBack(s: Card) {
  const S = Math.min(3, devicePixelRatio || 1), { canvas: oc, links } = drawBack(s, S);
  const c = Object.assign(document.createElement('canvas'), { width: oc.width, height: oc.height });
  c.getContext('2d')!.drawImage(oc, 0, 0);
  s.backEl!.style.backgroundImage = `url(${c.toDataURL()})`;
  placeBackLinks(s, links);
}
function renderEntries(g: Gpu, sm: Sim, extra: GPUBindGroupEntry[] = []) {
  return [
    { binding: 0, resource: { buffer: g.uniform } }, { binding: 1, resource: sm.trail[sm.parity].createView() },
    { binding: 2, resource: sm.mask.createView() }, { binding: 3, resource: desk.shared!.atlas!.createView() }, { binding: 4, resource: g.sampler },
    { binding: 5, resource: desk.shared!.paper.createView() }, { binding: 6, resource: desk.shared!.frozenTex[desk.shared!.fz].createView() }, { binding: 9, resource: { buffer: desk.shared!.tiles } },
    { binding: 10, resource: g.chipR.view() }, { binding: 11, resource: g.chipR.zView() }, { binding: 12, resource: g.note.view }, ...extra];
}
// A card in a deck (on the pile, in the fan, on its way in or out) shows a plain paper back with only the deck's name
// on it, handwritten where the upright pile shows and reading up it like the box's spine; the card's own back shows
// only on the desk, when it is turned over. Drawn at the card's size on the desk, landscape or portrait.
function paintPlainBack(s: Card, S: number) {
  const cs = desk.view.cs || 1, region = s.region, portrait = s.w <= s.h, w = s.w, h = s.h;
  const c = new OffscreenCanvas(Math.ceil(w * S), Math.ceil(h * S)), x = c.getContext('2d')!;
  x.scale(S, S); x.fillStyle = STOCK(s.kind); x.fillRect(0, 0, w, h); // the polaroid's warmer stock, the note's yellow
  if (hinged(s)) { x.translate(w, h); x.rotate(Math.PI); } // the note is seen turned over its top edge, not its side
  x.font = font(500, 26 * cs, 'Caveat'); x.fillStyle = TOK.text2; x.textAlign = 'center'; x.textBaseline = 'middle';
  // Upright in the pile a landscape card is turned a quarter turn clockwise, so its back's lower part is the part that
  // shows and the name is written upside down there; a portrait card's left part shows, the name turned to read up.
  if (portrait) { x.translate(w * 0.27, h / 2); x.rotate(-Math.PI / 2); } else { x.translate(w / 2, h * 0.73); x.rotate(Math.PI); }
  x.fillText(BOX_NAMES[region], 0, 2);
  return c;
}
async function buildAtlas(g: Gpu) {
  const S = desk.shared!.dev; // cards rasterize at device resolution
  const drawn: ReturnType<typeof drawCard>[] = [];
  for (const src of sources) drawn.push(drawCard(src, S));
  const backs = sources.filter((src) => src.backEl || src.lid).map((src) => ({ src, ...(src.lid ? drawLidOutside(src, S) : drawBack(src, S)) }));
  const plainFor = sources.filter(decked), plain = plainFor.map((s) => paintPlainBack(s, S)); // each card's plain deck back, at its own size
  // The corners' labels, in pen (transparent around the ink): one canvas size for both, the longer word's.
  const lf = font(500, CORNER.label * desk.view.k * S, 'Caveat'), mc = measure();
  mc.font = lf;
  const lw = Math.ceil(Math.max(...NAMES.map((t) => mc.measureText(t).width)) + 6 * S), lh = Math.ceil(24 * desk.view.k * S);
  const labels = NAMES.map((t) => {
    const c = new OffscreenCanvas(lw, lh), x = c.getContext('2d')!;
    Object.assign(x, { font: lf, fillStyle: '#000', textAlign: 'center', textBaseline: 'middle' });
    x.fillText(t, lw / 2, lh / 2);
    return c;
  });
  desk.shared!.label = { hw: lw / 2 / S, hh: lh / 2 / S };
  // Shelf-pack the cards into one atlas.
  const AW = Math.min(4096, g.device.limits.maxTextureDimension2D);
  let x = 0, y = 0, rowH = 0;
  const boxes = sources.filter((s) => s.kind === 'deck' && !s.lid), faces = boxes.map((d) => paintFaces(d, S, drawn[d.id].canvas));
  const faceCanvases = faces.flatMap((f) => Object.values(f));
  const extra = [...plain, ...labels, ...faceCanvases], places = [...drawn, ...backs, ...extra.map((c) => ({ canvas: c }))].map(({ canvas: c }) => {
    if (x + c.width > AW) { x = 0; y += rowH + 2; rowH = 0; }
    const p = { x, y }; x += c.width + 2; rowH = Math.max(rowH, c.height); return p;
  });
  const AH = y + rowH;
  const atlas = g.device.createTexture({ size: [AW, AH], format: 'rgba8unorm', usage: 0x04 | 0x02 | 0x10 });
  drawn.forEach(({ canvas: c, mediaPx }, i) => {
    const p = places[i], src = sources[i];
    g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
    src.atlasAt = { x: p.x, y: p.y };
    if (src.more) src.raster = c; // the tally's paper
    src.uv = [p.x / AW, p.y / AH, (p.x + src.w * S) / AW, (p.y + src.h * S) / AH];
    src.mediaUV = mediaPx ? [mediaPx.x / (src.w * S), mediaPx.y / (src.h * S), (mediaPx.x + mediaPx.w) / (src.w * S), (mediaPx.y + mediaPx.h) / (src.h * S)] : [0, 0, 0, 0];
  });
  backs.forEach(({ src, canvas: c, links, print }, i) => {
    const p = places[drawn.length + i];
    src.print = print && { ...print, x: p.x + print.x, y: p.y + print.y };
    g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
    src.buv = [p.x / AW, p.y / AH, (p.x + src.w * S) / AW, (p.y + src.h * S) / AH];
    placeBackLinks(src, links);
  });
  const rest = extra.map((c, i) => {
    const p = places[drawn.length + backs.length + i];
    g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
    return [p.x / AW, p.y / AH, (p.x + c.width) / AW, (p.y + c.height) / AH];
  });
  plainFor.forEach((s, i) => (s.puv = rest[i]));
  const labelUV = rest.slice(plainFor.length, plainFor.length + labels.length);
  let fi = plainFor.length + labels.length;
  boxes.forEach((d, i) => {
    const t = (BOX_T * (d.k || 1)) / d.w, f = (BOX_T * (d.k || 1)) / d.h, [u0, v0, u1, v1] = d.uv;
    d.faceUV = { front: [u0 + t * (u1 - u0), v0, u1, v1 - f * (v1 - v0)] };
    for (const name of Object.keys(faces[i])) d.faceUV[name] = rest[fi++];
    const [a0, b0, a1, b1] = d.faceUV.inner, e = 0.25; // the inside: its middle, clear of its neighbors
    d.faceUV.inner = [a0 + e * (a1 - a0), b0 + e * (b1 - b0), a1 - e * (a1 - a0), b1 - e * (b1 - b0)];
  });
  desk.shared!.labelUV = labelUV;
  desk.shared!.atlas = atlas;
  for (const src of sources) if (src.print && src.dev < 1) developStamp(src); // as far as it has got
  for (const src of sources) if (src.more) tallySetup(src);
}
return { backLayout, paintDomBack, design, BOX_NAMES, linkAt, coverRect, renderEntries, buildAtlas, drawBack, drawCard, developStamp };
}
