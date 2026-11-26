import { currentDesk, type Desk } from './state.ts';
import { PHONE, clamp, REF_W, REF_H, TOK, smooth, lerp, lin, PAPER, CORNER } from './tunables.ts';
import type { Patch } from './cards.ts';
import { type Chain, NS } from './note.ts';
import type { Body as PBody } from './physics.ts';
import type { Mark, TallySurface } from './tally.ts';
import type { Print } from './stamp.ts';

// ---------- types ----------

export type Ease = (u: number) => number;
export type V3 = number[]; // [x, y, z]
// A rectangle (CSS or design px).
export interface Rect { x: number; y: number; w: number; h: number }
// A card's size and what it shows, for one width (cardBox, fitCard; design px).
export interface CardBox { w: number; h: number; media: Rect | null; lines?: string[]; sub?: string; titled?: boolean; baseline?: number }
// The cards dealt together off one box: this card is k of n, fanning from at (s).
export interface Stack { k: number; n: number; at: number }
// A card being dealt out of its box to (x, y, r) (deal).
export interface OutFlight { out: true; in?: undefined; at: number; x: number; y: number; r: number; deck: Card; stack: Stack; i: number; ur: number; pw: number; up?: boolean; clear?: boolean }
// A card going into its box (collect).
export interface InFlight { in: true; out?: undefined; deck: Card; at: number; dur: number; x0: number; y0: number; r0: number; face0: number; lift0: number; open: boolean; say: string;
  up?: boolean; inside?: boolean }
type Flight = OutFlight | InFlight;
// A card pushed aside from (fx, fy) to (tx, ty) (shove).
interface Shove { fx: number; fy: number; tx: number; ty: number; dist: number; t: number; dur: number }
// A tween of one value (the card box's tuck).
interface Tween { at: number; from: number; to: number; t: number; dur: number; ease: Ease }
// The card box sliding in or out ('out': in place; 'off': off screen), after `wait` s.
export interface Slide extends Tween { want: string; wait: number; arrive?: number }
// A page turn's curve, for the thrown box's paper (turnAt).
export interface Seg { t0: number; d0: number; d1: number; dur: number; a: number; ease: Ease; mode?: string }
// The thrown box this frame (poseThrow).
export interface ThrowPose { X: V3; Y: V3; w: number; C: V3; M: number[]; low: number; foot: number[] | null; fade: number }
// A card or its box thrown off by the page turn (launch): where it lay, the time since, its ease home or slide off, its
// pose, and its outline as last drawn (page-local CSS px).
export interface Launch {
  x: number; y: number; wt: number;
  home: { t: number; q: number[] } | null; out: { t: number } | null; P: ThrowPose; hull: number[][] | null;
}
// The card box's pencil tally (tallySetup).
interface Tally { t: number; free: number; gen: number; marks: Mark[]; shown: boolean; surf?: TallySurface; dirty?: boolean }
// A clip: its address and where it starts (s).
export interface Clip { src: string; start: number }
// A video element with its queued play/pause/seek chain and the start of the clip it holds.
export type Video = HTMLVideoElement & { op?: Promise<unknown>; clipStart: number };
// A card on the desk, or a page's card box (more) or its lid (lid). Fields after the DOM's are set by layout,
// placeDecks, buildAtlas and the like before anything reads them.
export interface Card {
  id: number; el: HTMLElement; hit: HTMLElement; img: HTMLImageElement | null; key: string; kind: string;
  backEl: HTMLElement | null; backParas: string[] | null;
  region: number; featured: boolean; inkHex: string | undefined; emit: number; still: string | undefined;
  backLinks: HTMLAnchorElement[] | null; flip: number; flipTo: number; face: number; deck: Card | null;
  frame: number[]; baseFrame: number[]; focus: number[] | null; contain: boolean;
  slot: { x: number; y: number; w: number; r: number } | null; baseW: number; order: number; more: boolean; lid: boolean;
  overflow: boolean; shape: number;
  x: number; y: number; w: number; h: number; rot: number; home: number; vx: number; vy: number; lift: number; liftV: number;
  tilt: number[]; tiltV: number[]; sway: number; swayV: number;
  hover: number; hoverOn: boolean; burst: number; z: number; dragging: boolean; released: boolean;
  landK: boolean; landS: number; rel: number; flying: boolean; flyLift: number; shoveOnLand?: boolean;
  relV: number; pk?: { t: number; n: number; a: number } | null; pv?: number[] | null; patch?: Patch; // contact: release speed, the most motion it has had above the band, last pose, the patch that landed
  videoSrc?: string; ts?: number;
  // layout
  k: number; media: Rect | null; lines?: string[]; sub?: string; titled?: boolean; baseline?: number; px?: number; py?: number;
  // the desk
  fly?: Flight | null; shove?: Shove | null; kb?: { tx: number; ty: number } | null; keyHeld?: boolean; keyTimer?: number;
  ch?: Chain | null; imp?: { x: number; y: number; t: number } | null; over?: boolean; snap?: number; squash: number; squashV: number;
  said?: number; suppressClick?: boolean; edgePen?: boolean; rotFrom: number; rotTo: number;
  focused?: boolean; carrier?: Card | null; gone?: boolean; flyH?: number[]; plane?: { dc: V3; n: V3 }; flipA?: number;
  // media
  playlist: Clip[] | null; player?: InstanceType<Desk['Player']>;
  // the atlas (buildAtlas)
  atlasAt: { x: number; y: number }; uv: number[]; buv: number[]; puv: number[]; mediaUV: number[]; raster: OffscreenCanvas;
  print?: Print | null; dev: number; // its stamp's print in the atlas, and how far it has developed (0 to 1)
  // a card box
  spot: number; slide: Slide; pile: Card[]; lidT: number; dirty: boolean; bx: Tween; room: { pw: number; ph: number };
  body?: PBody | null; launch?: Launch | null; tally?: Tally; faceUV: { front: number[]; [face: string]: number[] }; outFor: number; gatherAsk: boolean; drawAsk: { all: boolean } | null;
  welcome?: boolean; near?: boolean;
}

// The window: CSS px, whether it is a phone's column, the desk's scale (k) and the cards' (cs); phones: research's label
// and the cards' column height.
export interface View { w: number; h: number; phone: boolean; k: number; docH: number; dpr: number; cs?: number; labelY?: number; cardsH?: number }

export function mountLayout() {
const desk = currentDesk();
const { HAND, font, T } = desk;
// ---------- page ----------

const body = desk.root;
// desk.html holds every one of these
const canvas = desk.root.querySelector<HTMLCanvasElement>('#field')!;
const nameEl = desk.root.querySelector<HTMLElement>('.name')!;
const taglineEl = desk.root.querySelector<HTMLElement>('.tagline')!;
const linksEl = desk.root.querySelector<HTMLElement>('.links')!;
const regionLabel = desk.root.querySelector<HTMLElement>('.region-label')!;
const pageEl = desk.root.querySelector<HTMLElement>('#page')!;
const doorEl = desk.root.querySelector<HTMLElement>('.door')!;

// Each page's deck; cards without a data-slot (more than the hand-placed slots) start in it.
{
  const list = pageEl.querySelector('.sources')!;
  for (const region of ['main', 'research']) { // every page has a deck for its cards, and a card box (its body and its lid) for when it is empty
    list.insertAdjacentHTML('beforeend', `<li class="src deck more" data-key="deck-${region}" data-region="${region}" data-slot="0,0,170,0" data-order="99"><div class="hit" role="button" tabindex="0" aria-label="Card box"></div></li>`);
    list.insertAdjacentHTML('beforeend', `<li class="src deck lid" data-key="lid-${region}" data-region="${region}" data-slot="0,0,40,0" data-order="98" aria-hidden="true"><div class="hit"></div></li>`);
  }
}

const sources = [...desk.root.querySelectorAll<HTMLElement>('.src')].map((el, id) => {
  const d = el.dataset;
  const [sx, sy, sw, sr] = (d.slot || `0,0,${d.w || 260},0`).split(',').map(Number); // no slot: an overflow card
  const backEl = el.querySelector<HTMLElement>('.back');
  const kind = ['deck', 'note', 'paper'].find((k) => el.classList.contains(k)) || 'photo';
  return {
    id, el, hit: el.querySelector<HTMLElement>('.hit')!, img: el.querySelector('img'), key: d.key, kind,
    // Back of the card: optional title, paragraphs, and link buttons, straight from the DOM.
    backEl, backParas: backEl ? [...backEl.querySelectorAll('p')].map((x) => x.textContent!) : null, // an element's text is never null
    region: d.region === 'research' ? 1 : 0, featured: !!d.slot && !el.classList.contains('deck'),
    inkHex: d.ink, emit: 0, // the card's own ink (paper style), emitted while the card is open
    still: d.still, // an explicit still (a paper figure) that clips.json does not replace
    backLinks: backEl ? [...backEl.querySelectorAll('a')] : null, flip: 0, flipTo: 0, face: 0, deck: null, // face: 0 front up, 1 back up (one value, set by a flip, a flight, or the box's preview); deck: the box it is in (or going into)
    frame: (d.frame || '1,0.5,0.5').split(',').map(Number), // zoom, then where the crop sits (like object-position)
    // focus: the zoom and crop on the picture's subject, for the poster and the clips alike (so the
    // hover fade stays seamless)
    baseFrame: (d.frame || '1,0.5,0.5').split(',').map(Number), focus: d.focus ? d.focus.split(',').map(Number) : null,
    contain: d.fit === 'contain', // a paper figure shows whole, on a white mat, instead of filling its window
    slot: d.slot ? { x: sx, y: sy, w: sw, r: sr } : null, baseW: sw, order: Number(d.order), more: el.classList.contains('more'), lid: el.classList.contains('lid'),
    overflow: !d.slot && !el.classList.contains('deck'), shape: +(d.shape || 1.5), // width / height: every card keeps its own shape, its longest side at the shared cap
    videoSrc: d.video,
    x: 0, y: 0, w: 0, h: 0, rot: sr, home: sr, vx: 0, vy: 0, lift: 0, liftV: 0, tilt: [0, 0], tiltV: [0, 0], sway: 0, swayV: 0,
    hover: 0, hoverOn: false, burst: 0, z: id, dragging: false, released: false,
    // Landing: landK is set for the one sim step that bursts, landS is how hard it last landed, rel the seconds since then
    // (< 0 while flying in, so its held agents wait; 1e3 once their release is over).
    landK: false, landS: 1, rel: 1e3, flying: false, flyLift: 0, relV: 0, dev: 0,
  } as Card; // the rest: see Card
});
desk.view = { w: innerWidth, h: innerHeight, phone: innerWidth < PHONE, k: 1, docH: innerHeight, dpr: 1 };
desk.nameBox = null; // CSS px: { x, baseline, size }

// Card geometry in CSS px. Media rect is where the image (or video) sits.
// The card box, a little bigger than a postcard all round so a card inside it is hidden; its lid lies open beside it.
// The box fits its page's largest upright card with room all round (design px, d.room).
// The box has walls BOX_T deep: its front panel sits that much up and right of its base (seen from above the page's
// middle, its open end and the wall facing down the page show), and its lid is that deep end wall plus the tuck flap.
const BOX_T = 26;
const STRIP = 22; // the sticky note's strip, design px (the stylesheet's .note gradient matches)
// The sticky note turns over its top edge, about its horizontal axis, like a real one lifted to read its back; every other
// card turns over its side.
const hinged = (s: Card) => s.kind === 'note';
// Its strip stays stuck: the rest of it turns over it as paper (s.ch, note.ts) and lies on it, back up.
const noteMesh = (s: Card) => hinged(s) && s.ch && !s.fly && !s.deck && !s.carrier;
const paperL = (s: Card) => s.h / (s.k || 1) - STRIP; // the sheet past the strip, design px
// The sheet's profile for the mesh (CSS px from the strip's edge, along the note and up, and its angle there): the
// chain's joints, through a Catmull-Rom spline, at NS + 1 even steps along it.
const NOTE_P = new Float32Array((NS + 1) * 4);
function noteProfile(s: Card) {
  const { n, x } = s.ch!, k = s.k || 1, q = (j: number, a: number) => (j < 0 ? 2 * x[a] - x[2 + a] : j > n ? 2 * x[2 * n + a] - x[2 * n - 2 + a] : x[2 * j + a]);
  for (let i = 0, th = 0; i <= NS; i++) {
    const t = (i * n) / NS, j = Math.min(Math.floor(t), n - 1), u = t - j;
    const cr = (a: number) => { // the spline through joints j-1..j+2 at u, and its slope
      const p0 = q(j - 1, a), p1 = q(j, a), p2 = q(j + 1, a), p3 = q(j + 2, a), b = p2 - p0, c = 2 * p0 - 5 * p1 + 4 * p2 - p3, d = 3 * (p1 - p2) + p3 - p0;
      return [p1 + 0.5 * u * (b + u * (c + u * d)), b + u * (2 * c + 3 * u * d)];
    };
    const [y, dy] = cr(0), [z, dz] = cr(1), a = Math.atan2(dz, dy);
    th = i ? th + Math.atan2(Math.sin(a - th), Math.cos(a - th)) : a; // unwrapped, so rows never turn the long way between
    NOTE_P[i * 4] = y * k; NOTE_P[i * 4 + 1] = z * k; NOTE_P[i * 4 + 2] = th;
  }
  return NOTE_P;
}
const boxSize = (s: Card): [number, number] => { const p = desk.pageDeck(s.region)!.room; return s.lid ? [BOX_T + Math.round(p.ph * 0.13), p.ph + 12 + BOX_T] : [p.pw + 14 + BOX_T, p.ph + 12 + BOX_T]; };
function cardBox(s: Card, w: number, h = 0): CardBox {
  if (s.kind === 'deck') return { w, h, media: null }; // the deck's spot (the box's size), or the box's lid
  if (s.kind === 'note') {
    const lines = wrapLines(s.hit.innerText.replace(/\n/g, ' \n '), w - 32, HAND);
    return { w, h: h || 28 + lines.length * 26.5, media: null, lines }; // the one card size, or (phones) as tall as its words
  }
  if (s.kind === 'paper') {
    const lines = wrapLines(s.hit.querySelector('b')!.textContent!, w - 39, '600 16px Inter'); // a paper card has its title and venue
    return { w, h: 16 + lines.length * 21.5 + 6 + 17 + 16, media: null, lines, sub: s.hit.querySelector('small')!.textContent! };
  }
  const { side, top, bottom } = borders(s, w, Math.max(w, h));
  const media = { x: side, y: top, w: w - 2 * side, h: h - top - bottom };
  const cap = capLines(s, w - 2 * side), baseline = media.y + media.h + (bottom - cap.lines.length * CAP_LH()) / 2 + CAP_LH() / 2 + 4.5 * desk.TS;
  return { w, h, media, ...cap, baseline };
}
// A photo card's caption lines at tw wide (design px): the title's, then the line under it; or its one line (.hand).
const CAP_LH = () => 18 * desk.TS;
function capLines(s: Card, tw: number): { lines: string[]; titled?: boolean } {
  const hand = s.el.querySelector('.hand');
  if (hand) return { lines: [hand.textContent!] };
  const title = s.el.querySelector('.cap b')!.textContent!, sub = s.el.querySelector('.cap span')!.textContent!;
  return { lines: [...wrapLines(title, tw, font(600)), sub], titled: true };
}
// Photo cards are framed like instant film (Polaroid 600: 4.5 mm sides, about 6 mm on top and 22 mm below on a 107 mm
// sheet), as fractions of the cards' shared longest side.
const FILM = { side: 0.042, top: 0.052, bottom: 0.19 };
// The film's borders for a photo card w wide with longest side L (design px); the strip fits its page's longest caption.
function borders(s: Card, w: number, L: number) {
  const side = Math.round(FILM.side * L), rows = sources.filter((o) => capped(o) && o.region === s.region)
    .map((o) => capLines(o, (o === s || desk.view.phone ? w : o.shape >= 1 ? L : L * o.shape) - 2 * side).lines.length);
  return { side, top: Math.round(FILM.top * L), bottom: Math.ceil(Math.max(FILM.bottom * L, Math.max(...rows) * CAP_LH() + 20)) };
}
// Every card keeps its own shape (data-shape, width / height) with its longest side at one shared cap (CARD_MAX on the
// reference desk), so all share one scale and sharpness; the sticky note keeps its own size. (Clark, 2026-11-23, replacing
// the one card size.)
const CARD_MAX = 280; // design px at 1440x900; scales with the desk
const capped = (s: Card) => s.kind === 'photo';
const cappedDims = (s: Card, cap: number): [number, number] => (s.shape >= 1 ? [cap, cap / s.shape] : [cap * s.shape, cap]);
// Each page's pile, upright: as wide as its widest card's short side and as tall as its longest long side (design px).
function pileSizes() {
  for (const d of sources) if (d.more) {
    const cards = sources.filter((s) => s.region === d.region && desk.decked(s)), k = desk.view.cs || 1;
    d.room = { pw: Math.max(1, ...cards.map((s) => Math.min(s.w, s.h) / k)), ph: Math.max(1, ...cards.map((s) => Math.max(s.w, s.h) / k)) };
  }
}
// The note keeps its own shape, one size for both faces: the front's own size when the back's copy fits on it at the
// shared type scale; otherwise it grows taller.
function fitCard(s: Card, w: number, loose = false) {
  const box = cardBox(s, w), need = s.backEl ? desk.backLayout(s, box, loose).need : 0;
  return need <= box.h ? box : { ...box, h: need };
}
let measureCtx: OffscreenCanvasRenderingContext2D | null = null;
const measure = () => (measureCtx ||= new OffscreenCanvas(8, 8).getContext('2d')!);
function wrapLines(text: string, maxW: number, font: string) {
  const m = measure(); m.font = font;
  const out: string[] = []; let line = '';
  for (const word of text.split(' ')) {
    if (word === '\n') { out.push(line.trim()); line = ''; continue; }
    const test = line ? line + ' ' + word : word;
    if (m.measureText(test).width > maxW && line) { out.push(line.trim()); line = word; } else line = test;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function layout() {
  desk.endFlights(); // a new layout puts every card in its place
  for (const s of sources) s.frame = s.focus ?? s.baseFrame;
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const phone = vw < PHONE;
  body.classList.toggle('phone', phone);
  body.classList.toggle('desk', !phone);
  desk.view = { ...desk.view, w: vw, h: vh, phone };
  if (!phone) {
    const k = clamp(Math.min(vw / REF_W, vh / REF_H), 0.62, 1.35);
    desk.view.k = k; desk.view.docH = vh;
    desk.nameBox = { x: 54 * k, baseline: 46 * k + 60 * k * 0.8, size: 60 * k };
    // Sizes are set at full scale (design px); a smaller card scale shows every card that much smaller, the same in a
    // deck and on the desk, and keeps the layout's composition (slots are fractions of the desk).
    const c = clamp(T.cardScale, 0.6, 1);
    desk.TS = 1; // the sizes are the full-scale ones
    const fixed = new Map(sources.filter((s) => !capped(s) && s.kind !== 'deck').map((s) => [s, fitCard(s, Math.round((s.slot?.w ?? s.baseW) / c), true)])); // the note: its own small size on every window, so its words wrap the same and it stays nearly square
    desk.TS = Math.max(1, 12 / (TOK.fs * c)); desk.view.cs = c;
    // The longest side (design px) scales with the desk like the layout, but never below the smallest at which every back fits.
    const fitsAt = (cp: number) => sources.every((s) => !capped(s) || !s.backEl || ((b: CardBox) => desk.backLayout(s, b).need <= b.h)(cardBox(s, ...cappedDims(s, cp))));
    let lo = 120, hi = 900; while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fitsAt(mid)) hi = mid; else lo = mid; }
    const cap = Math.max((CARD_MAX * k) / c, Math.ceil(hi));
    for (const s of sources) if (s.kind !== 'deck') { const box = capped(s) ? cardBox(s, ...cappedDims(s, cap)) : fixed.get(s)!; Object.assign(s, box, { k: c, w: box.w * c, h: box.h * c }); }
    pileSizes();
    for (const s of sources) {
      if (s.kind === 'deck') { const box = cardBox(s, ...boxSize(s)); Object.assign(s, box, { k: c, w: box.w * c, h: box.h * c }); }
      if (s.slot) { [s.x, s.y, s.rot] = desk.homeOf(s); s.home = s.rot; } // cards without a slot wait on their deck
    }
    desk.placeDecks();
    for (const s of sources) if (!s.slot && s.kind !== 'deck' && desk.dealing) { const d = desk.pageDeck(s.region)!; Object.assign(s, { x: d.x, y: d.y, rot: d.rot }); } // a card without a slot waits on its deck
    for (const r of [0, 1]) desk.pileUp(r); // each deck holds its page's cards that are not on the desk
  } else {
    const pad = 22;
    desk.view.labelY = 0;
    desk.nameBox = { x: pad, baseline: 30 + 44 * 0.8, size: 44 };
    let y = 0;
    const full = Math.min(vw - 32, 380);
    desk.TS = 1; desk.view.cs = 1; for (const s of sources) s.k = 1; // phones show cards at full size, the cap the column's width
    for (const s of sources) if (capped(s)) Object.assign(s, cardBox(s, ...cappedDims(s, full)));
    pileSizes();
    for (const s of sources) if (s.kind === 'deck') Object.assign(s, cardBox(s, ...boxSize(s))); // phones scroll to research: no decks
    desk.placeDecks();
    const order = [...sources].filter((s) => s.kind !== 'deck').sort((a, b) => a.order - b.order);
    for (const [i, s] of order.entries()) {
      if (s.region && !desk.view.labelY) { desk.view.labelY = y + 10; y += 56; } // research becomes a section further down
      const w = Math.round(s.kind === 'note' || s.kind === 'paper' ? Math.min(full * 0.82, 280) : full);
      if (!capped(s)) Object.assign(s, fitCard(s, w));
      s.rot = s.home = (s.slot?.r ?? 0) * 0.7;
      s.px = vw / 2 + (i % 2 ? 1 : -1) * Math.min(14, (vw - w) / 4);
      if (hinged(s)) y += Math.max(0, s.h - 2 * STRIP - 16); // turned over, the note lies above its strip: leave it room
      s.py = y + s.h / 2; y += s.h + 30;
    }
    desk.view.cardsH = y;
  }
  // Text blocks.
  Object.assign(nameEl.style, { left: desk.nameBox.x + 'px', top: desk.nameBox.baseline - desk.nameBox.size * 0.8 + 'px', fontSize: desk.nameBox.size + 'px' });
  const tagTop = desk.nameBox.baseline + desk.nameBox.size * 0.3;
  Object.assign(taglineEl.style, { left: desk.nameBox.x + 6 + 'px', top: tagTop + 'px', maxWidth: (phone ? desk.view.w - 2 * desk.nameBox.x - 6 : 390 * desk.view.k) + 'px' });
  if (phone) {
    const tb = taglineEl.getBoundingClientRect();
    const linksTop = tagTop + tb.height + 14;
    Object.assign(linksEl.style, { left: desk.nameBox.x + 6 + 'px', top: linksTop + 'px', maxWidth: desk.view.w - 2 * desk.nameBox.x + 'px' });
    const top = linksTop + linksEl.getBoundingClientRect().height + 36;
    for (const s of sources) { s.x = s.px ?? -1e4; s.y = (s.py ?? 0) + top; }
    Object.assign(regionLabel.style, { left: desk.nameBox.x + 6 + 'px', top: top + desk.view.labelY! + 'px' }); // set above
    desk.view.docH = Math.ceil(top + desk.view.cardsH! + 40);
    desk.root.querySelector<HTMLElement>('#page')!.style.height = desk.view.docH + 'px';
  } else {
    Object.assign(linksEl.style, { left: '', top: '', maxWidth: '' });
    desk.root.querySelector<HTMLElement>('#page')!.style.height = '';
  }
  // Without the deal (no WebGPU, reduced motion) a card that would wait on its deck lies in the best free spot instead,
  // found once everything else (cards, name, tagline, links, corner) is in its final place on this layout.
  if (!phone && !desk.dealing) for (const s of sources) if (s.overflow) {
    s.slot = null;
    const [x, y, r] = desk.freeSlot(s);
    s.slot = { x: ((x - s.region * desk.view.w) / desk.view.w) * REF_W, y: (y / desk.view.h) * REF_H, w: s.baseW, r };
    Object.assign(s, { x, y, rot: r, home: r });
  }
  desk.turn.on = false; desk.clipLinks(); // a turn in progress just ends
  desk.cam.x = desk.view.phone ? 0 : desk.regionFromUrl() * desk.view.w; desk.placePage(); desk.setInert(desk.regionFromUrl()); placeDoor();
  for (const s of sources) {
    if (s.media) {
      const [z, px, py] = s.frame, v = 1 / z;
      Object.assign(s.img!.style, { height: s.media.h + 'px', objectPosition: `${px * 100}% ${py * 100}%`, // a card with media has its image
        objectViewBox: z > 1 ? `inset(${py * (1 - v) * 100}% ${(1 - px) * (1 - v) * 100}% ${(1 - py) * (1 - v) * 100}% ${px * (1 - v) * 100}%)` : '' });
      const m = s.media; // the DOM still and the no-WebGPU fallback take the same film frame
      for (const [k, v] of [['--fx', m.x], ['--ft', m.y], ['--fb', s.h / (s.k || 1) - m.y - m.h]] as const) s.el.style.setProperty(k, v + 'px');
    }
    if (!desk.gpu && s.flipTo) desk.paintDomBack(s); // the still fallback's open backs follow the new size
    placeDom(s);
  }
}

// The corner's DOM: its hit area and focus ring (a triangle over the fold, hovered or not), and without WebGPU the fold
// itself, drawn flat: the sliver underneath, the flap, and the label on it.
function placeDoor() {
  const k = desk.view.k, c = CORNER.size * k * Math.SQRT2, S = Math.ceil((2 * (CORNER.size + CORNER.lift) - Math.PI * desk.DOOR.R + 14) * k * Math.SQRT2);
  // The focus ring traces the folded corner at rest, 3 px out: the flap's edges out to its tip, and the page's edges.
  const m = 3, tip = S - ((2 * CORNER.size - Math.PI * desk.DOOR.R) * k) / Math.SQRT2 - m * Math.SQRT2;
  const svg = doorEl.querySelector('svg')!, set = (sel: string, d: string) => svg.querySelector(sel)!.setAttribute('d', d);
  for (const [a, v] of [['width', S], ['height', S], ['viewBox', `0 0 ${S} ${S}`]]) svg.setAttribute(String(a), String(v));
  const ch = (CORNER.size + CORNER.lift) * k * Math.SQRT2, tipH = S - ((2 * (CORNER.size + CORNER.lift) - Math.PI * desk.DOOR.R) * k) / Math.SQRT2;
  set('.hit', `M${S} ${S - ch}L${tipH} ${tipH}L${S - ch} ${S}H${S}Z`); // the pointer's area: the fold as drawn when hovered (the sliver and the flap), not the larger triangle
  set('.ring', `M${S - m} ${S - c - m}L${tip} ${tip}L${S - c - m} ${S - m}H${S - m}Z`);
  // Without WebGPU the fold itself, flat, from the corner's state: it lifts and leans toward the pointer like the drawn one
  // (the sliver under it, the flap reflected over the fold, the label printed on the flap).
  const d = desk.door.d || CORNER.size * k, a = desk.door.a, [dx, dy] = desk.dirOf(a), far = 2 * d - Math.PI * desk.DOOR.R * k;
  const B = [S - d / Math.cos(a), S], Rt = [S, S - d / Math.sin(a)], tipF = [S + far * dx, S + far * dy], P = (q: number[]) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  set('.sliver', `M${P(Rt)}L${S} ${S}L${P(B)}Z`); set('.flap', `M${P(Rt)}L${P(tipF)}L${P(B)}Z`);
  const t = svg.querySelector('text')!, at = far - (CORNER.size - Math.PI * desk.DOOR.R - 4 - 12) * k, cx = S + at * dx, cy = S + at * dy;
  Object.assign(t.style, { fontSize: CORNER.label * k + 'px' });
  for (const [n, v] of [['x', cx], ['y', cy], ['transform', `rotate(${(-45 - (2 * (a - Math.PI / 4) * 180) / Math.PI).toFixed(2)} ${cx} ${cy})`]]) t.setAttribute(String(n), String(v));
}
// No frame loop without WebGPU: the flat corner runs its own while it moves.
let flatDoor = 0;
function animateFlatDoor() {
  if (desk.gpu || flatDoor || !body.classList.contains('nogpu')) return;
  let last = performance.now();
  const tick = (now: number) => {
    const d0 = desk.door.d, a0 = desk.door.a;
    desk.stepDoor(Math.min(0.05, (now - last) / 1000)); last = now; placeDoor();
    flatDoor = Math.abs(desk.door.d - d0) + Math.abs(desk.door.a - a0) > 1e-3 ? requestAnimationFrame(tick) : 0;
  };
  flatDoor = requestAnimationFrame(tick);
}
// Where a card shows: where it is, or, while it waits over its box (s.snap), easing into the box's open end, upright.
function shown(s: Card) {
  const e = smooth(s.snap || 0);
  if (!e) return [s.x, s.y, s.rot];
  const d = desk.pageDeck(s.region)!, [mx, my, mr] = desk.mouthPose(d, d.pile.length, s); // over its box
  return [lerp(s.x, mx, e), lerp(s.y, my, e), lerp(s.rot, mr, e)];
}
// The DOM box (hit area and focus ring) follows the drawn card: a card is one size wherever it is (lifted or not), so
// only the box's nudge squash scales it; the 3D tilt is left out.
function placeDom(s: Card) {
  const sc = 1 - 0.014 * (s.squash || 0);
  const [x, y, rot] = shown(s), r = rot + (s.sway * 180) / Math.PI, k = s.k || 1, w = s.w / k, h = s.h / k; // design px, scaled to the card scale
  s.el.style.width = w + 'px'; s.el.style.height = h + 'px';
  s.el.style.transform = `translate(${(x - w / 2).toFixed(2)}px, ${(y - h / 2).toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${(sc * k).toFixed(4)})`;
  if (s.ts !== desk.TS) { s.ts = desk.TS; s.el.style.setProperty('--ts', String(desk.TS)); } // the DOM still's captions take the same type
  s.el.style.zIndex = String(Math.round(s.z));
  if (hinged(s) && s.backEl) placeFold(s);
}
// The note lying folded over its strip: its hit area and its back (the links; without WebGPU the drawn back) move up
// onto the sheet, and the back's strip band (under the strip, never seen) is cut off. Design px.
function placeFold(s: Card) {
  const k = s.k || 1, C = s.flip === 1 && s.ch ? STRIP + s.ch.x[2 * s.ch.n] : 0;
  const backEl = s.backEl!; // placeDom calls this only for the note with its back
  backEl.style.transform = C ? `translateY(${C}px)` : '';
  backEl.style.clipPath = C ? `inset(0 0 ${STRIP}px)` : '';
  Object.assign(s.hit.style, { top: C ? C + 'px' : '', bottom: C ? s.h / k - STRIP + 'px' : '' });
}

// ---------- color ----------

const absorbance = (ink: number[]) => ink.map((c, i) => -Math.log(Math.max(lin(c), 1e-4) / lin(PAPER[i])));
return { sources, doorEl, pageEl, linksEl, animateFlatDoor, placeDom, hinged, paperL, nameEl, taglineEl, BOX_T,
  measure, shown, body, capped, STRIP, CAP_LH, wrapLines, canvas, regionLabel, absorbance, noteProfile, noteMesh,
  layout, placeDoor };
}
