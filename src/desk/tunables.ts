import { currentDesk } from './state.ts';
import { TALLY_PARAMS } from './tally.ts';

export const MAX = 32; // cards and decks the uniforms hold (room for overflow projects)
export const REF_W = 1440, REF_H = 900, PHONE = 700;
export const POSTCARD = 3 / 2; // every project card is one landscape postcard, 3:2, the same size on the desk and in a deck
export const STEP = 1 / 60;
export const PAPER = [0xf3, 0xf1, 0xea];
// Design tokens: the colors, type, and spacing every card face and back is drawn with. The stylesheet mirrors them as
// custom properties (--paper, --stock, ...), so the DOM still and no-WebGPU fallback match the GPU drawing.
export const TOK = {
  paper: '#f3f1ea', stock: '#fffdf8', stockWarm: '#f5f0e4', film: '#fbf8f0', note: '#fff4a8', noteStrip: '#f7ea98',
  text: '#1d1d1b', text2: '#2b2b28', body: '#3d3c38', muted: '#6f6d66', // muted is AA (4.5:1) on paper and every stock
  ink: '#a5a970', inkDeep: '#5c5f4a', inkLine: '#85895c', // inkLine: drawn link underlines, 3:1 on every stock
  fs: 13, fsHand: 23, lhBody: 20, radius: 3,
};
// Motion: a few durations and two curves. Things the user triggers respond in `respond`; cards that come down onto the
// desk take `settle`; moves across the desk take `travel`. Arrivals decelerate (ease-out quart); turns and pans ease in
// and out; physical motion (lift, tilt, squash) is springs. Exits run at `exit` times their entrance.
export const MOTION = { quick: 0.15, respond: 0.3, settle: 0.55, travel: 1, exit: 0.7 };
export const IMPRINT_S = 1; // a lifted card's imprint fades over this long (s)
export const NAME_INK = [30, 34, 40];

// Every tunable, defaults matched to b-desk.html's CPU sim (scale 0.45, 26k agents, 1.1 sim px per step at 60 steps/s,
// about 147 CSS px/s). Distances are CSS px, speed is CSS px per second. Each one is a URL parameter and a slider in the
// tweak panel (press t), and all of them apply live; only the agent count re-seeds the sim.
// Groups of [key, default, min, max, step, label]. A 0/1 default with step 1 is a checkbox.
export const GROUPS = {
  Performance: [
    ['res', 1, 0.2, 1, 0.05, 'sim resolution (re-seeds)'],
    ['agents', 200000, 4000, 400000, 1000, 'agents (re-seeds)'],
  ],
  Agents: [
    ['speed', 93, 10, 400, 1, 'speed px/s'],
    ['turn', 0.1, 0, 1.5, 0.01, 'turn'],
    ['sa', 0.5, 0.05, 1.5, 0.01, 'sensor angle'],
    ['sd', 26.6, 4, 80, 0.2, 'sensor distance px'],
    ['decay', 0.9, 0.8, 0.995, 0.001, 'trail decay'],
    ['deposit', 0.038, 0.005, 0.2, 0.001, 'deposit'],
    ['diffuse', 0.79, 0, 1, 0.01, 'diffuse'],
    ['respawn', 0.003, 0, 0.02, 0.0005, 'respawn / step'],
    ['hoverE', 0.04, 0, 0.2, 0.002, 'hover excitation'],
    ['cursorE', 0.1, 0, 0.2, 0.002, 'cursor excitation'],
  ],
  'Card outlines': [
    ['edge', 0.55, 0, 2, 0.01, 'strength'],
    ['ridge', 7, 0, 40, 0.5, 'distance px'],
    ['ridgeW', 3.5, 1, 24, 0.5, 'width px'],
  ],
  Cards: [
    ['shadowSoft', 1.1, 0.2, 3, 0.05, 'shadow softness'],
    ['shadow', 1.35, 0, 5, 0.05, 'shadow strength'],
    ['lift', 60, 0, 60, 1, 'lift height px'],
    ['tilt', 6, 0, 20, 0.5, 'tilt max deg'],
    ['flipS', 0.7, 0.15, 1.5, 0.05, 'flip duration s (closing takes exit x this)'],
    ['paperN', 16, 8, 24, 1, 'note: paper links, strip to free edge'],
    ['paperBend', 50, 20, 120, 1, 'note: paper stiffness (px it holds out straight)'],
    ['paperDrag', 0.03, 0, 0.1, 0.001, 'note: air drag on the paper'],
    ['paperLift', 12000, 2000, 40000, 500, 'note: finger lift on the free edge'],
    ['cardScale', 0.75, 0.6, 1, 0.01, 'card scale (desk; type stops at 12 px)'],
    ['cardMax', 280, 180, 400, 1, 'card max side px (desk, at 1440x900; scales with the desk)'],
    ['backTitle', 0, 0, 1, 1, 'title on the back (it is on the front)'],
    ['backTight', 1, 0, 1, 1, 'tighter back padding and link rows'],
    ['framing', 1, 0, 1, 1, 'frame thumbnails on their subject (data-focus)'],
    ['emitIn', 0.8, 0.1, 4, 0.1, 'open card color in s'],
    ['emitOut', 4, 0.5, 12, 0.25, 'color fade after close s'],
  ],
  // Landing: every card that comes down onto the desk sends the agents under and around it out from its edge with a burst
  // of speed, and releases any agents waiting for it (a page's network grows out of its cards when they fly in).
  Landing: [
    ['intro', 1, 0, 1, 1, 'draw the cards on first visit (?intro=0 skips)'],
    ['landBurst', 1.8, 0, 6, 0.05, 'burst strength (speed x)'],
    ['landR', 29, 0, 60, 1, 'burst reach px'],
    ['landDecay', 0.955, 0.8, 0.995, 0.001, 'burst decay / step'],
    ['landRelease', 0.15, 0, 1.5, 0.05, 'release time s'],
    ['drawStagger', 0.1, 0, 0.4, 0.01, 'draw stagger s (cards dealt off a deck)'],
    ['landP', 503, 100, 2000, 1, 'momentum shed for a full burst px/s'],
    ['landWn', 0.36, 0, 2, 0.01, 'share of coming-down momentum'],
    ['landBand', 12, 0, 60, 1, 'contact band px (higher is off the page)'],
    ['shove', 1, 0, 2, 0.05, 'shove strength (0 off)'],
    ['flipJitter', 1.5, 0, 6, 0.1, 'flip angle spread (std dev, deg)'],
    ['maxAngle', 5, 0, 15, 0.5, 'max card angle deg'],
  ],
  Media: [
    ['fadeIn', 0.4, 0.05, 2, 0.05, 'fade in s'],
    ['fadeOut', 1, 0.1, 3, 0.05, 'fade out s'],
    ['finishFirst', 1, 0, 1, 1, 'finish clip before fading out'],
    ['xfade', 0.6, 0.1, 2, 0.05, 'crossfade s'],
    ['hold', 0, 0, 10, 0.25, 'clip hold s (0 = whole clip)'],
    ['hoverDelay', 0, 0, 800, 10, 'hover delay ms'],
    ['focusS', MOTION.respond, 0.05, 2, 0.05, 'hover fade s (release takes exit x this)'],
  ],
  // Film: photo cards are framed like instant film (Polaroid 600: 4.5 mm sides, about 6 mm on top and 22 mm below on a
  // 107 mm sheet), as fractions of the cards' shared longest side; the strip grows to fit its page's longest caption.
  Film: [
    ['frameSide', 0.042, 0, 0.1, 0.002, 'side borders'],
    ['frameTop', 0.052, 0, 0.12, 0.002, 'top border'],
    ['frameBottom', 0.19, 0.06, 0.32, 0.005, 'bottom strip'],
  ],
  // Notebook: each page's folded corner, the way to the other page, and the page turn.
  Notebook: [
    ['cornerSize', 70, 40, 120, 1, 'corner size px'],
    ['cornerLabel', 19, 12, 30, 0.5, 'corner label px'],
    ['cornerLift', 10, 0, 40, 1, 'hover lift px'],
    ['turnS', 1.3, 0.3, 2.5, 0.05, 'page turn s'],
  ],
  // World: one physical world. The card box, the chips and the sticky note fall under the same gravity; the box and the
  // chips share one friction and one bounce.
  World: [
    ['gravity', 9000, 2000, 20000, 100, 'gravity px/s²'],
    ['friction', 0.6, 0, 1.5, 0.05, 'friction'],
    ['bounce', 0.25, 0, 0.9, 0.05, 'bounce'],
  ],
  // Box: the card box's flap.
  Box: [
    ['lidS', 0.25, 0.05, 1, 0.05, 'card box flap folds open or shut s'],
  ],
  Tally: TALLY_PARAMS, // the pencil tally on each card box (tally.ts)
  // Chips: click the bare desk to drop a potato chip; the slime grows to it and eats it from below (chips.ts).
  Chips: [
    ['chipSize', 31, 15, 60, 0.5, 'radius px'],
    ['chipCurl', 1.4, 0, 2, 0.05, 'curl'],
    ['chipEat', 1.2, 0.05, 3, 0.01, 'eating speed'],
    ['chipGold', 0.35, 0, 1, 0.01, 'pale to deep gold'],
    ['chipShadow', 0.6, 0, 1.5, 0.01, 'shadow'],
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
// Per-page styles: each page has its own paper and ink, tuned under Style in the panel (URL keys main.gain,
// research.tint, ...): light paper, one muted ink that darkens like dye.
export const PAGE_NAMES = ['main', 'research'];
export const STYLE_PARAMS: [string, number | string, number, number, number, string][] = [
  ['bg', 'f3f1ea', 0, 0, 0, 'background'],
  ['ink', 'a5a970', 0, 0, 0, 'ink'],
  ['opacity', 1, 0, 4, 0.05, 'ink opacity'],
  ['gain', 1.1, 0.1, 4, 0.01, 'gain'],
  ['gamma', 1.8, 0.4, 3, 0.01, 'gamma'],
  ['soft', 0.7, 0, 2, 0.05, 'softness'],
  ['grain', 0.1, 0, 0.6, 0.01, 'paper grain'],
  ['tint', 0, 0, 1, 0.01, 'project color strength'],
  ['hueMix', 0, 0, 1, 0.01, 'project hue (0 = olive, 1 = its ink)'], // tint: how much of its mild ink a closed card always emits (open: full ink); hueMix: how far that ink turns from the shared olive toward the card's own ink
];
// A page's style: its background and ink are strings, the rest numbers.
type Style = { bg: string; ink: string; opacity: number; gain: number; gamma: number; soft: number; grain: number;
  tint: number; hueMix: number } & Record<string, number | string>;
export const STYLE_DEFAULTS: Record<string, Style> = {
  // main: Clark's K8 look (light olive veins, no project color until a card is opened)
  main: { bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.3, grain: 0.16, tint: 0, hueMix: 0.3 },
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
const qs = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || qs.has('still');
const T = { ...DEFAULTS } as Tunables;
for (const k of Object.keys(DEFAULTS)) {
  if (!qs.has(k)) continue;
  T[k] = parseFloat(qs.get(k)!);
}
const STYLE: Record<string, Style> = Object.fromEntries(PAGE_NAMES.map((pg) => [pg, Object.fromEntries(Object.entries(STYLE_DEFAULTS[pg]).map(([k, d]) => {
  const v = qs.get(`${pg}.${k}`);
  return [k, v == null ? d : typeof d === 'string' ? v : parseFloat(v)];
})) as Style]));
return { qs, HAND, font, T, reduced, STYLE };
}
