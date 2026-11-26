import { currentDesk, type Desk } from './state.ts';
import { TOK, hexRGB } from './tunables.ts';
import type { Card, Rect, CardBox } from './layout.ts';
import type { Gpu, Sim } from './gpu.ts';

type Ctx = OffscreenCanvasRenderingContext2D;

// ---------- card backs ----------
// The back of a card, in one of four styles (?backs=, or the panel):
//   postcard: a project card's back is a postcard's: the message on the left, a thin divider, and the links on ruled
//             address lines on the right under a small slime-cell stamp in the project's tint.
//             The polaroid and the note keep pen backs.
//   quiet: type alone; links are ink text with a thin underline. The sticky note lists its links with small icons.
//   index: an index card: a label strip, a header rule, and body lines on faint rules. The note is ruled and handwritten.
//   pen:   quiet cards with a hand-drawn underline under each link; the note's links are handwritten in Caveat.
// Every back uses one type scale and an 8px spacing grid, and its first baseline sits 32px below its top edge. Material
// follows the front: paper cards stay paper, the polaroid's back is matte photo-paper stock, the note stays yellow.
// Layout is in CSS px, so the DOM can put the real links (hit areas) in the same places.
interface BackStyle { underline: string; note: string; postcard?: boolean; ruled?: boolean }

// A back's layout: its lines of copy, its links, and how tall it needs to be (need); a postcard's columns or a ruled back's rules.
type Link = ReturnType<Desk['linkAt']>;
interface BackLine { t: string; f: { font: string; color: string }; y: number }
type Postcard = { stacked?: undefined; divX: number; x0: number; x1: number; base0: number; n: number } | { stacked: true; x0: number; x1: number; base0: number; n: number };
interface BackLayout { st: BackStyle; lines: BackLine[]; links: Link[]; w: number; h: number; need: number; strip?: string | null; ruleTop?: number | null; ruleEnd?: number; postcard?: Postcard }
type Row = [HTMLAnchorElement, number, number][]; // a row of links: each with its x and text width

export function mountTextures() {
const desk = currentDesk();
const { BOX_T, font, BOX3D, capped, STRIP, CAP_LH, HAND, T, measure, wrapLines, hinged, sources, decked, NAMES,
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
const BACK_STYLES: Record<string, BackStyle> = {
  postcard: { underline: 'pen', note: 'pen', postcard: true },
  quiet: { underline: 'line', note: 'icons' },
  index: { underline: 'line', note: 'ruled', ruled: true },
  pen: { underline: 'pen', note: 'pen' },
};
const STOCK = (kind: string) => ({ photo: TOK.film, paper: TOK.stock, polaroid: TOK.stockWarm, note: TOK.note } as Record<string, string>)[kind] ?? TOK.stock; // a photo card's back is its film's stock (read when drawn: the colors are tunable)
const lhBody = () => (T.backTight ? 19 : TOK.lhBody) * desk.TS; // tighter backs set the copy 1 px closer
const TYPE = { // read when drawn: the type follows TS
  get title() { return { font: font(600), lh: lhBody(), color: TOK.text }; },
  get label() { return { font: font(400), lh: 16 * desk.TS, color: TOK.muted }; },
  get body() { return { font: font(400), lh: lhBody(), color: TOK.body }; },
  get link() { return { font: font(500), color: TOK.inkDeep }; },
  get noteLink() { return { font: font(500), color: TOK.text2 }; },
  noteHand: { font: HAND, color: TOK.text2 },
};
// Back spacing in design px; T.backTight (an option) takes 4 px off the padding and the space between link rows.
const BK = {
  get pad() { return T.backTight ? 12 : 16; }, get first() { return BK.pad + 16 * desk.TS; }, get row() { return (T.backTight ? 22 : 24) * desk.TS; },
  get gap() { return (T.backTight ? 12 : 16) * desk.TS; }, get bottom() { return BK.pad - 7 + 13 * desk.TS; }, strip: 32,
};
// Small monochrome marks for the note's links (quiet), by link text; 24-unit boxes except GitHub (16).
const ICONS: Record<string, [number, string]> = {
  GitHub: [16, 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z'],
  Scholar: [24, 'M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z'],
  LinkedIn: [24, 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'],
  X: [24, 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'],
  Kaggle: [24, 'M18.825 23.859c-.022.092-.117.141-.281.141h-3.139c-.187 0-.351-.082-.492-.248l-5.178-6.589-1.448 1.374v5.111c0 .235-.117.352-.351.352H5.505c-.236 0-.354-.117-.354-.352V.353c0-.233.118-.353.354-.353h2.431c.234 0 .351.12.351.353v14.343l6.203-6.272c.165-.165.33-.246.495-.246h3.239c.144 0 .236.06.281.18.046.149.034.255-.036.315l-6.555 6.344 6.836 8.507c.095.104.117.208.075.339z'],
  Resume: [24, 'M6 1.5h8.5L20 7v14a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4.5 21V3A1.5 1.5 0 0 1 6 1.5zm7.5 1.8V8h4.7zM8 12v1.6h8V12zm0 4v1.6h8V16z'],
};
const backStyle = (s?: Card) => { const st = BACK_STYLES[T.backs] || BACK_STYLES.postcard; return st.postcard && s?.kind !== 'photo' ? BACK_STYLES.pen : st; };
// The postcard back: where the divider sits (a share of the width), the gap either side of it, the stamp (w, h), and how
// many ruled address lines it has (at least one per link).
const PC = { split: 0.62, get gutter() { return T.backTight ? 10 : 14; }, get stamp() { return T.backTight ? [34, 40] : [40, 48]; }, get lines() { return T.backTight ? 1 : 3; } };

// A link: its text at (x, base) and its hit area (a 24px row, 4px wider than the text on each side).
const linkAt = (a: HTMLAnchorElement, x: number, base: number, tw: number, h = BK.row) => ({ a, x: x - 4, y: base - 16, w: tw + 8, h, tx: x, base, tw });
// b: the size to lay out at (the card's own by default); nothing sets a title on it, so the title falls back to the front's lines.
function backLayout(s: Card, b: CardBox & { title?: string } = s): BackLayout {
  const st = backStyle(s), w = b.w, m = measure(), { pad, row } = BK;
  if (st.postcard) return postcardLayout(s, b);
  if (s.kind === 'note') {
    // A tidy list, one link per line, from the same first baseline as every other back.
    const hand = st.note !== 'icons', f = hand ? TYPE.noteHand : TYPE.noteLink, x0 = pad + (hand ? 0 : 20);
    m.font = f.font;
    // Tighter backs set the list in two columns when one would not fit.
    const n = s.backLinks!.length, two = T.backTight && BK.first + (n - 1) * row + BK.bottom + STRIP > b.h, per = two ? Math.ceil(n / 2) : n;
    const links = s.backLinks!.map((a, i) => linkAt(a, x0 + (i >= per ? Math.round((w - 2 * pad) / 2) : 0), BK.first + (i % per) * row, m.measureText(a.textContent!).width));
    return { st, lines: [], links, w, h: b.h, need: BK.first + (per - 1) * row + BK.bottom + STRIP }; // clear of the strip along its bottom
  }
  // No label line: it only repeated the front's caption (Clark: no redundancy).
  const title = T.backTitle ? s.backTitle ?? (b.title || b.lines?.join(' ') || '') : '', label = ''; // the title can stay on the front only
  const strip = st.ruled && label && s.kind !== 'polaroid'; // index: the label gets its own strip along the top
  const lines: BackLine[] = [];
  let y = BK.first + (strip ? BK.strip : 0) - TYPE.title.lh, gapNext = 0;
  const add = (t: string, kind: 'title' | 'label' | 'body') => {
    const f = TYPE[kind];
    y += gapNext;
    wrapLines(t, w - 2 * pad, f.font).forEach((l, i) => { y += i || kind !== 'label' ? f.lh : 18; lines.push({ t: l, f, y }); });
  };
  if (title) add(title, 'title');
  if (label && !strip) add(label, 'label');
  // Paragraphs: 8px apart; on ruled cards each one just starts on the next rule.
  let ruleTop: number | null = null;
  if (strip || (st.ruled && s.kind !== 'polaroid')) { ruleTop = y + 10; y = ruleTop + 15 - TYPE.body.lh; }
  gapNext = ruleTop == null ? 8 : 0;
  s.backParas!.forEach((t) => { add(t, 'body'); gapNext = ruleTop == null ? 8 : 0; });
  // Links: ink text in rows along the bottom, the last baseline 22px above the bottom edge (top, on a back with no text).
  m.font = TYPE.link.font;
  const rows: Row[] = [[]];
  let x = pad;
  for (const a of s.backLinks!) {
    const tw = m.measureText(a.textContent!).width;
    if (x + tw > w - pad && x > pad) { rows.push([]); x = pad; }
    rows.at(-1)!.push([a, x, tw]); x += tw + BK.gap;
  }
  // Ruled: the links sit on rules too (at least one empty rule above them), and their rule darkens as the underline.
  const pitch = ruleTop == null ? row : TYPE.body.lh, lift = ruleTop == null ? 32 : 2 * TYPE.body.lh;
  const need = Math.ceil((lines.length ? y : 0) + lift + BK.bottom + (rows.length - 1) * pitch);
  let base0 = b.h - BK.bottom - (rows.length - 1) * pitch;
  if (ruleTop != null) base0 = ruleTop + 15 + Math.floor((base0 - ruleTop - 15) / pitch) * pitch;
  const links = rows.flatMap((r, i) => r.map(([a, lx, tw]) => linkAt(a, lx, base0 + i * pitch, tw, pitch)));
  return { st, lines, links, w, h: b.h, need, strip: strip ? label : null, ruleTop, ruleEnd: base0 + (rows.length - 1) * pitch + 5 };
}

// The message (title, then the back copy) from the same first baseline as every back, in the column left of the divider;
// the links on the address lines, which sit at the bottom of the right column, the last 22px above the bottom edge.
function postcardLayout(s: Card, b: CardBox & { title?: string }): BackLayout {
  const st = backStyle(s), { w, h } = b, m = measure(), { pad, row } = BK;
  m.font = TYPE.link.font; // the divider moves left if a link would not fit on its address line
  const divX = Math.min(Math.round(w * PC.split), Math.floor(w - pad - PC.gutter - Math.max(...s.backLinks!.map((a) => m.measureText(a.textContent!).width)))), colW = divX - pad - PC.gutter, lines: BackLine[] = [];
  let y = BK.first - TYPE.title.lh;
  const add = (t: string, kind: 'title' | 'body', gap: number) => { y += gap; wrapLines(t, colW, TYPE[kind].font).forEach((l) => { y += TYPE[kind].lh; lines.push({ t: l, f: TYPE[kind], y }); }); };
  const title = T.backTitle ? s.backTitle ?? b.title ?? '' : ''; // the title can stay on the front only
  if (title) add(title, 'title', 0);
  s.backParas!.forEach((t, i) => add(t, 'body', title || i ? 8 : 0));
  m.font = TYPE.link.font;
  const x0 = divX + PC.gutter, x1 = w - pad, n = Math.max(PC.lines, s.backLinks!.length), base0 = h - BK.bottom - (n - 1) * row;
  const links = s.backLinks!.map((a, i) => linkAt(a, x0, base0 + i * row, m.measureText(a.textContent!).width));
  const stampBottom = pad - 2 + PC.stamp[1], wide = links.some((k) => k.tx + k.tw > x1);
  const need = wide ? Infinity : Math.max(Math.ceil(y + BK.bottom), stampBottom + 12 + 16 + (n - 1) * row + BK.bottom);
  if (need <= h) return { st, lines, links, w, h, need, postcard: { divX, x0, x1, base0, n } };
  return stackedPostcard(s, b) || { st, lines, links, w, h, need, postcard: { divX, x0, x1, base0, n } };
}
// A smaller card's postcard back when the columns will not hold its message: the message runs the full width (beside
// the stamp at the top), and the links share one ruled line along the bottom (a second if they must).
function stackedPostcard(s: Card, b: CardBox): BackLayout | null {
  const st = backStyle(s), { w, h } = b, m = measure(), { pad, row } = BK, [sw, sh] = PC.stamp, stampBottom = pad - 2 + sh;
  const lines: BackLine[] = []; let y = BK.first - TYPE.body.lh;
  s.backParas!.forEach((t, i) => {
    y += i ? 8 : 0; m.font = TYPE.body.font;
    let line = '';
    const width = () => (y + TYPE.body.lh - 13 * desk.TS < stampBottom + 4 ? w - 2 * pad - sw - 10 : w - 2 * pad); // beside the stamp, then full
    for (const word of t.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (line && m.measureText(test).width > width()) { y += TYPE.body.lh; lines.push({ t: line, f: TYPE.body, y }); line = word; } else line = test;
    }
    if (line) { y += TYPE.body.lh; lines.push({ t: line, f: TYPE.body, y }); }
  });
  m.font = TYPE.link.font;
  const rows: Row[] = [[]]; let x = pad;
  for (const a of s.backLinks!) { const tw = m.measureText(a.textContent!).width; if (x + tw > w - pad && x > pad) { rows.push([]); x = pad; } rows.at(-1)!.push([a, x, tw]); x += tw + BK.gap; }
  const base0 = h - BK.bottom - (rows.length - 1) * row;
  const links = rows.flatMap((r, i) => r.map(([a, lx, tw]) => linkAt(a, lx, base0 + i * row, tw)));
  const need = Math.ceil(y + row + (rows.length - 1) * row + BK.bottom);
  return need <= h ? { st, lines, links, w, h, need, postcard: { stacked: true, base0, n: rows.length, x0: pad, x1: w - pad } } : null;
}
// OKLab blend of an sRGB hex toward another hex's hue at the first one's lightness and chroma (mix 0 to 1): the stamp's
// olive ink with a cast of the project's color.
function tintHex(baseHex: string, hueHex: string, mix: number) {
  const [L, a0, b0] = desk.oklab(hexRGB(baseHex)), c = desk.oklab(hexRGB(hueHex)), C = Math.hypot(a0, b0), hh = Math.atan2(c[2], c[1]);
  const [r, g, bl] = desk.fromOklab([L, a0 + mix * (C * Math.cos(hh) - a0), b0 + mix * (C * Math.sin(hh) - b0)]);
  return `rgb(${r.toFixed(0)}, ${g.toFixed(0)}, ${bl.toFixed(0)})`;
}
// A small postage stamp: perforated paper, a fine frame, and a few slime cells (seeded by the card) in the tinted ink.
function paintStamp(x: Ctx, x0: number, y0: number, sw: number, sh: number, ink: string, seed: number) {
  x.fillStyle = TOK.stockWarm; x.fillRect(x0, y0, sw, sh);
  x.fillStyle = TOK.stock; // the perforation: little bites along every edge
  const bite = (cx: number, cy: number) => { x.beginPath(); x.arc(cx, cy, 1.5, 0, 2 * Math.PI); x.fill(); };
  for (let i = 0, n = Math.round(sw / 4.5); i <= n; i++) { bite(x0 + (i * sw) / n, y0); bite(x0 + (i * sw) / n, y0 + sh); }
  for (let i = 1, n = Math.round(sh / 4.5); i < n; i++) { bite(x0, y0 + (i * sh) / n); bite(x0 + sw, y0 + (i * sh) / n); }
  const ix = x0 + 4.5, iy = y0 + 4.5, iw = sw - 9, ih = sh - 9, r = rng(seed * 2654435761 + 1);
  x.save(); x.beginPath(); x.rect(ix, iy, iw, ih); x.clip();
  x.fillStyle = ink; x.globalAlpha = 0.12; x.fillRect(ix, iy, iw, ih); x.globalAlpha = 1;
  const pts = Array.from({ length: 9 }, (_, i) => [ix - 4 + ((i % 3) + 0.2 + 0.6 * r()) * ((iw + 8) / 3), iy - 4 + (Math.floor(i / 3) + 0.2 + 0.6 * r()) * ((ih + 8) / 3)]);
  x.strokeStyle = ink; x.lineCap = 'round';
  for (const [i, p] of pts.entries()) { // each cell's center to its nearest neighbors: veins between the cells
    const near = pts.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j > i).sort((a, c) => a[0] - c[0]).slice(0, 3);
    for (const [d, j] of near) {
      const q = pts[j], bend = (r() - 0.5) * 0.5 * d;
      x.lineWidth = Math.max(0.7, 1.9 - d / 14);
      x.beginPath(); x.moveTo(p[0], p[1]);
      x.quadraticCurveTo((p[0] + q[0]) / 2 - ((q[1] - p[1]) / d) * bend, (p[1] + q[1]) / 2 + ((q[0] - p[0]) / d) * bend, q[0], q[1]); x.stroke();
    }
  }
  x.restore();
  x.strokeStyle = ink; x.lineWidth = 0.8; x.strokeRect(ix + 0.4, iy + 0.4, iw - 0.8, ih - 0.8);
}
function drawPostcard(x: Ctx, s: Card, L: BackLayout) {
  const P = L.postcard!, { w, h } = L, { pad, row } = BK;
  if (!P.stacked) { x.fillStyle = '#a5a9708c'; x.fillRect(P.divX, pad, 1, h - 2 * pad); } // the divider, a thin olive rule
  const [sw, sh] = PC.stamp;
  paintStamp(x, w - pad - sw + 2, pad - 2, sw, sh, tintHex(TOK.inkLine, s.hueHex, 0.45), s.id + 1);
  x.fillStyle = '#a5a97059'; // the address lines
  for (let i = 0; i < P.n; i++) x.fillRect(P.x0 - 2, P.base0 + i * row + 5, P.x1 - P.x0 + 2, 1);
  for (const l of L.lines) { x.font = l.f.font; x.fillStyle = l.f.color; x.fillText(l.t, pad, l.y); }
  for (const k of L.links) { // written on its line, which darkens under it as its underline
    x.font = TYPE.link.font; x.fillStyle = TYPE.link.color; x.fillText(k.a.textContent!, k.tx, k.base);
    x.fillStyle = TOK.inkLine; x.fillRect(k.tx, k.base + 5, k.tw, 1);
  }
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
  const S = S0 * (s0.k || 1), s = design(s0), L = backLayout(s), { st, lines, links, w, h } = L, { pad } = BK; // design px
  const cw = Math.ceil(s0.w * S0), chh = Math.ceil(s0.h * S0);
  const c = new OffscreenCanvas(cw, chh), x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = STOCK(s.kind); x.fillRect(0, 0, cw, chh);
  if (s.kind === 'polaroid') grain(x, cw, chh, 9, 7); // the photo paper's back: warmer, matte, a little toothy
  if (s.kind === 'note') grain(x, cw, chh, 5, 11);
  x.scale(S, S);
  if (s.kind === 'note') { x.fillStyle = TOK.noteStrip; x.fillRect(0, h - STRIP, w, STRIP); } // the strip's back, along the bottom: the note turns over its top edge
  x.textBaseline = 'alphabetic';
  if (L.postcard) { drawPostcard(x, s, L); return { canvas: c, links, w, h }; }
  // index: the label strip, the header rule, and faint rules under every line to the bottom of the card
  if (L.strip) {
    x.fillStyle = TOK.stockWarm; x.fillRect(0, 0, w, BK.strip);
    x.fillStyle = '#1d1d1b14'; x.fillRect(0, BK.strip - 1, w, 1);
    x.font = TYPE.label.font; x.fillStyle = TYPE.label.color; x.fillText(L.strip, pad, 21);
  }
  if (L.ruleTop != null) {
    x.fillStyle = '#5c5f4a99'; x.fillRect(pad - 4, L.ruleTop, w - 2 * pad + 8, 1);
    x.fillStyle = '#a5a97047';
    for (let ry = L.ruleTop + TYPE.body.lh; ry <= L.ruleEnd!; ry += TYPE.body.lh) x.fillRect(pad - 4, ry, w - 2 * pad + 8, 1);
  }
  if (s.kind === 'note' && st.note === 'ruled') {
    x.fillStyle = '#c9b95e66';
    for (let ry = BK.first + 5; ry < h - 6; ry += BK.row) x.fillRect(0, ry, w, 1);
  }
  for (const l of lines) { x.font = l.f.font; x.fillStyle = l.f.color; x.fillText(l.t, pad, l.y); }
  links.forEach((k, i) => {
    const t = k.a.textContent!;
    if (s.kind === 'note') {
      const hand = st.note !== 'icons';
      x.font = hand ? TYPE.noteHand.font : TYPE.noteLink.font; x.fillStyle = TOK.text2;
      x.fillText(t, k.tx, k.base);
      if (!hand && ICONS[t]) {
        const [vb, d] = ICONS[t], sz = 12;
        x.save(); x.translate(pad, k.base - 11); x.scale(sz / vb, sz / vb); x.fillStyle = TOK.text2; x.fill(new Path2D(d)); x.restore();
      }
      if (st.note === 'pen') { x.strokeStyle = TOK.inkLine; penLine(x, k.tx, k.tx + k.tw, k.base + 4, i + 1, 1.3); }
      else if (st.note === 'icons') { x.fillStyle = TOK.ink; x.fillRect(k.tx, k.base + 3, k.tw, 1); }
      return;
    }
    x.font = TYPE.link.font; x.fillStyle = TYPE.link.color; x.fillText(t, k.tx, k.base);
    if (st.underline === 'pen') { x.strokeStyle = TOK.inkLine; penLine(x, k.tx, k.tx + k.tw, k.base + 4, s.id * 13 + i, 1.15); }
    else if (L.ruleTop == null) { x.fillStyle = TOK.ink; x.fillRect(k.tx, k.base + 3, k.tw, 1); }
    else { x.fillStyle = TOK.inkDeep; x.fillRect(k.tx, k.base + 5, k.tw, 1); } // the link's stretch of its rule
  });
  return { canvas: c, links, w, h };
}
function drawLidOutside(s: Card, S: number) {
  const c = new OffscreenCanvas(Math.ceil(s.w * S), Math.ceil(s.h * S));
  paintLid(c.getContext('2d')!, design(s), S * (s.k || 1), true);
  return { canvas: c, links: [], w: s.w, h: s.h };
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
  const lf = font(500, T.cornerLabel * desk.view.k * S, 'Caveat'), mc = measure();
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
  backs.forEach(({ src, canvas: c, links }, i) => {
    const p = places[drawn.length + i];
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
  for (const src of sources) if (src.more) tallySetup(src);
}
return { backLayout, paintDomBack, design, BOX_NAMES, linkAt, coverRect, renderEntries, buildAtlas, drawBack, drawCard };
}
