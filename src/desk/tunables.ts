import { currentDesk } from './state.ts';
import { TALLY_PARAMS } from './tally.ts';

export const MAX = 32; // cards and decks the uniforms hold (room for overflow projects)
export const REF_W = 1440, REF_H = 900, PHONE = 700;
export const STEP = 1 / 60;
export const PAPER = [0xf3, 0xf1, 0xea];
// Design tokens: the colors, type, and spacing every card face and back is drawn with. The stylesheet mirrors them as
// custom properties (--paper, --stock, ...), so the DOM still and no-WebGPU fallback match the GPU drawing.
export const TOK = {
  paper: '#f3f1ea', stock: '#fffdf8', film: '#fbf8f0', note: '#fff4a8', noteStrip: '#f7ea98',
  text: '#1d1d1b', text2: '#2b2b28', body: '#3d3c38', muted: '#6f6d66', // muted is AA (4.5:1) on paper and every stock
  ink: '#a5a970', inkDeep: '#5c5f4a', inkLine: '#85895c', // inkLine: drawn link underlines, 3:1 on every stock
  fs: 13, fsHand: 23, lhBody: 20, radius: 3,
};
// Motion: a few durations and two curves. Things the user triggers respond in `respond`; cards that come down onto the
// desk take `settle`; moves across the desk take `travel`. Arrivals decelerate (ease-out quart); turns and pans ease in
// and out; physical motion (lift, tilt, squash) is springs. Exits run at `exit` times their entrance.
export const MOTION = { quick: 0.15, respond: 0.3, settle: 0.55, travel: 1, exit: 0.7 };
export const IMPRINT_S = 1; // a lifted card's imprint fades over this long (s)
// Each page's folded corner, the way to the other page: its size, its label's size, and how far it lifts on hover (px).
export const CORNER = { size: 70, label: 19, lift: 10 };
// A card coming down onto the desk (see Landing below): its burst reaches `r` px and decays by `decay` a step; the agents
// held under it stream out over `release` s. A landing pushes by the momentum it sheds: its mass (the card box's is 1)
// x (`wn` x its speed coming down + its other motion), a full burst at `p`, seen as its square root (as loudness grows,
// so a chip a twentieth of the box's weight still shows); it counts only after it rose above the panel's landH px.
export const push = (momentum: number) => Math.min(1, Math.sqrt(momentum / LAND.p));
export const LAND = { r: 29, decay: 0.955, release: 0.15, p: 320, wn: 0.36 };
// Touchdown, one rule for every item that comes down part by part (a chip rocking, the note's sheet rolling down). Its
// samples (x, y, height: px, now and the step before; a missing part is at height Infinity) arm once they rise above
// `rise` (the panel's landH) and land on first coming within `band` of the desk, so a part settling as it is eaten never lands again.
// Slime under the newly covered area is squeezed out at the speed the contact front sweeps across the item (the change
// in sqrt of the share down x the item's radius `size`, px), plus the motion the parts shed (wn x coming down + along).
// It pushes by the item's mass `m` x that speed: the slime under a part feels the item's weight per area there, as if
// all of it landed so. Returns how many, their middle, and that push.
export function touchdown(at: ArrayLike<number>, was: ArrayLike<number>, armed: Uint8Array, band: number, rise: number, dt: number, m: number, size: number) {
  let n = 0, all = 0, down = 0, sx = 0, sy = 0, v = 0;
  for (let o = 0, i = 0; o < at.length; o += 3, i++) {
    const z = at[o + 2];
    if (z === Infinity) continue;
    all++;
    if (z > rise) armed[i] = 1;
    if (z > band) continue;
    down++;
    if (!armed[i] || was[o + 2] === Infinity) continue;
    armed[i] = 0; n++; sx += at[o]; sy += at[o + 1];
    v += (LAND.wn * Math.max(0, was[o + 2] - z) + Math.hypot(at[o] - was[o], at[o + 1] - was[o + 1])) / dt;
  }
  if (!n) return null;
  const front = (size * (Math.sqrt(down / all) - Math.sqrt((down - n) / all))) / dt;
  return [n, sx / n, sy / n, push(m * (v / n + front))];
}
// A flipped or dealt card lands at its home angle plus a gaussian spread of `jitter` deg (std dev), never past `max` deg.
export const ANGLE = { jitter: 1.5, max: 5 };
export const NAME_INK = [30, 34, 40];
// ?debug is the one URL parameter the site reads. It opens the admin panel (admin.ts), and only then does the desk read
// back what the panel saved, so the plain address is always the real site. dbg: the saved values by row key (tunables,
// page.key styles, tok.* and card.* colors, and the debug rows), live: the panel writes it and the desk reads it.
export const DEBUG = new URLSearchParams(location.search).has('debug');
export const dbg: Record<string, number | string | boolean> = (() => {
  try { return DEBUG ? JSON.parse(localStorage.getItem('desk.debug') || '{}') : {}; } catch { return {}; }
})();

// Every tunable, defaults matched to b-desk.html's CPU sim (scale 0.45, 26k agents, 1.1 sim px per step at 60 steps/s,
// about 147 CSS px/s). Distances are CSS px, speed is CSS px per second. Each one is a slider in the admin panel (?debug,
// admin.ts), its hint in help.ts, and all of them apply live; only the agent count and resolution re-seed the sim.
// Sections of [key, default, min, max, step, label].
export const GROUPS = {
  // One physical world: the card box, the cards a page throws, the chips and the sticky note fall under the same gravity
  // and share one friction and one bounce.
  Physics: [
    ['gravity', 9000, 2000, 20000, 100, 'Gravity'],
    ['friction', 0.6, 0, 1.5, 0.05, 'Friction'],
    ['bounce', 0.25, 0, 0.9, 0.05, 'Bounce'],
    ['shove', 1, 0, 2, 0.05, 'Shove'],
    ['turnS', 1.3, 0.3, 2.5, 0.05, 'Page turn length'],
    ['landH', 12, 1, 40, 1, 'Landing height (px)'],
  ],
  Cards: [
    ['cardScale', 0.75, 0.6, 1, 0.01, 'Size'],
    ['shadow', 1.35, 0, 5, 0.05, 'Shadow'],
    ['lift', 60, 0, 60, 1, 'Lift height'],
    ['flipS', 0.7, 0.15, 1.5, 0.05, 'Flip length'],
    ['drawStagger', 0.1, 0, 0.4, 0.01, 'Deal stagger'],
    ['lidS', 0.25, 0.05, 1, 0.05, 'Box flap length'],
    ['boxNear', 60, 0, 240, 5, 'Box opens within'],
    ['fadeIn', 0.4, 0.05, 2, 0.05, 'Clip fade in'],
    ['fadeOut', 1, 0.1, 3, 0.05, 'Clip fade out'],
    ...TALLY_PARAMS, // the pencil tally on each card box (tally.ts)
  ],
  // Chips: click the bare desk to drop a potato chip; the slime grows to it and eats it from below (chips.ts).
  Chips: [
    ['chipSize', 31, 15, 60, 0.5, 'Size'],
    ['chipCurl', 1.4, 0, 2, 0.05, 'Curl'],
    ['chipEat', 1.2, 0.05, 3, 0.01, 'Eating speed'],
    ['chipBand', 1, 0.1, 6, 0.1, 'Eaten within (px)'],
    ['chipGold', 0.35, 0, 1, 0.01, 'Gold'],
    ['chipShadow', 0.6, 0, 1.5, 0.01, 'Shadow'],
  ],
  // Slime: the agents, the food band just outside each card's edge, the burst a card landing on the desk sends out from
  // its edge, and the ink an open card puts in.
  Slime: [
    ['res', 1, 0.2, 1, 0.05, 'Resolution'],
    ['agents', 200000, 4000, 400000, 1000, 'Agents'],
    ['speed', 93, 10, 400, 1, 'Speed'],
    ['turn', 0.1, 0, 1.5, 0.01, 'Turning'],
    ['sa', 0.5, 0.05, 1.5, 0.01, 'Sensor angle'],
    ['sd', 26.6, 4, 80, 0.2, 'Sensor reach'],
    ['decay', 0.9, 0.8, 0.995, 0.001, 'Trail fade'],
    ['deposit', 0.038, 0.005, 0.2, 0.001, 'Trail strength'],
    ['diffuse', 0.79, 0, 1, 0.01, 'Trail blur'],
    ['respawn', 0.003, 0, 0.02, 0.0005, 'Respawn'],
    ['hoverE', 0.04, 0, 0.2, 0.002, 'Hover stir'],
    ['cursorE', 0.1, 0, 0.2, 0.002, 'Cursor stir'],
    ['edge', 0.55, 0, 2, 0.01, 'Card pull'],
    ['ridge', 7, 0, 40, 0.5, 'Pull distance'],
    ['ridgeW', 3.5, 1, 24, 0.5, 'Pull width'],
    ['landBurst', 1.8, 0, 6, 0.05, 'Landing burst'],
    ['emitIn', 0.8, 0.1, 4, 0.1, 'Open card ink in'],
    ['emitOut', 4, 0.5, 12, 0.25, 'Open card ink out'],
  ],
} as const;
// Every tunable's current value.
type Param = (typeof GROUPS)[keyof typeof GROUPS][number];
// A panel row as the panel reads it: key, default, min, max, step, label.
export type ParamRow = readonly [string, number, number, number, number, string];
type Tunables = { [P in Param as P[0]]: number } & Record<string, number>;
// glide: one page turn whose speed rises gently (as u^1.5) and settles long and soft (as (1 - u)^3): the integral of
// that speed profile, tabulated. No linear stretch, no corner.
const glide = (() => {
  const N = 512, acc = [0];
  let sum = 0;
  for (let i = 1; i <= N; i++) { const u = (i - 0.5) / N; sum += u ** 1.5 * (1 - u) ** 3; acc.push(sum); }
  return (u: number) => { const x = Math.min(1, Math.max(0, u)) * N, i = Math.floor(x); return i >= N ? 1 : (acc[i] + (acc[i + 1] - acc[i]) * (x - i)) / sum; };
})();
export const EASES = {
  glide,
  cubic: (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
};
const PARAMS = Object.values(GROUPS).flat();
export const DEFAULTS = Object.fromEntries(PARAMS.map(([k, d]) => [k, d]));
export const RESEED = ['agents', 'res']; // the only settings that rebuild the sim
// Per-page styles: each page has its own paper and ink, tuned under Colors in the panel (saved as main.gain,
// research.tint, ...): light paper, one muted ink that darkens like dye.
export const PAGE_NAMES = ['main', 'research'];
export const STYLE_PARAMS: [string, number | string, number, number, number, string][] = [
  ['bg', 'f3f1ea', 0, 0, 0, 'Paper'],
  ['ink', 'a5a970', 0, 0, 0, 'Ink'],
  ['opacity', 1, 0, 4, 0.05, 'Ink opacity'],
  ['gain', 1.1, 0.1, 4, 0.01, 'Ink gain'],
  ['gamma', 1.8, 0.4, 3, 0.01, 'Ink contrast'],
  ['soft', 0.7, 0, 2, 0.05, 'Ink softness'],
  ['grain', 0.1, 0, 0.6, 0.01, 'Paper grain'],
  ['tint', 0, 0, 1, 0.01, 'Card tint'],
  ['hueMix', 0, 0, 1, 0.01, 'Card hue'], // tint: how much of its mild ink a closed card always emits (open: full ink); hueMix: how far that ink turns from the shared olive toward the card's own ink
];
// A page's style: its background and ink are strings, the rest numbers.
type Style = { bg: string; ink: string; opacity: number; gain: number; gamma: number; soft: number; grain: number;
  tint: number; hueMix: number } & Record<string, number | string>;
export const STYLE_DEFAULTS: Record<string, Style> = {
  // main: Clark's K8 look (light olive veins, no project color until a card is opened)
  main: { bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.76, gamma: 2.01, soft: 0, grain: 0.3, tint: 0, hueMix: 0.3 },
  // research: the same K8 paper, with each paper always emitting a soft wash of its own ink
  research: { bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.3, grain: 0.16, tint: 0.8, hueMix: 0.8 },
};
export const hexRGB = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (u: number) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lin = (c: number) => Math.pow(c / 255, 2.2);

export function mountTunables() {
const desk = currentDesk();
// Card scale (an option, T.cardScale): every desk card is drawn at its own design size and shown that much smaller, its
// type, padding and frames with it; only the type stops at 12 px on screen, so below 12/13 of full size the type grows
// within the card by TS (in design px) while the card keeps its size.
desk.TS = 1;
const font = (weight: number, px = TOK.fs * desk.TS, family = 'Inter') => `${weight} ${px}px ${family}`;
const HAND = font(500, TOK.fsHand, 'Caveat');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !!dbg.still;
const T = Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, dbg[k] ?? d])) as Tunables;
const STYLE = Object.fromEntries(PAGE_NAMES.map((pg) => [pg, Object.fromEntries(Object.entries(STYLE_DEFAULTS[pg]).map(([k, d]) => [k, dbg[`${pg}.${k}`] ?? d]))])) as Record<string, Style>;
return { HAND, font, T, reduced, STYLE };
}
