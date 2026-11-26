import { currentDesk } from './state.ts';
import { NCH } from './chips.ts';
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
// Groups of [key, default, min, max, step, label]. A string default makes a select (options in CHOICES) or, for ink, a
// color picker; a 0/1 default with step 1 is a checkbox.
export const GROUPS = {
  Look: [['look', 'k8', 0, 0, 0, 'preset']],
  Performance: [
    ['auto', 1, 0, 1, 1, 'auto quality'],
    ['res', 0.5, 0.2, 1, 0.05, 'sim resolution (re-seeds)'],
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
    ['edgeMode', 'max', 0, 0, 0, 'mode'],
    ['edge', 0.55, 0, 2, 0.01, 'strength'],
    ['ridge', 7, 0, 40, 0.5, 'distance px'],
    ['ridgeW', 3.5, 1, 24, 0.5, 'width px'],
    ['ring2', 1, 0, 1, 1, 'second ring (on in ring2)'],
    ['ring2At', 2.25, 1.5, 6, 0.05, 'second ring at x distance'],
    ['corner', 0, 0, 4, 0.05, 'corner emphasis'],
    ['share', 1, 0.05, 1, 0.05, 'share of agents'],
  ],
  Cards: [
    ['shadowSoft', 1.1, 0.2, 3, 0.05, 'shadow softness'],
    ['shadow', 1.35, 0, 5, 0.05, 'shadow strength'],
    ['lift', 60, 0, 60, 1, 'lift height px'],
    ['tilt', 6, 0, 20, 0.5, 'tilt max deg'],
    ['flipS', 0.7, 0.15, 1.5, 0.05, 'flip duration s (closing takes exit x this)'],
    ['paperN', 16, 8, 24, 1, 'note: paper links, strip to free edge'],
    ['paperBend', 50, 20, 120, 1, 'note: paper stiffness (px it holds out straight)'],
    ['paperG', 8000, 2000, 20000, 100, 'note: gravity px/s^2'],
    ['paperDrag', 0.03, 0, 0.1, 0.001, 'note: air drag on the paper'],
    ['paperLift', 12000, 2000, 40000, 500, 'note: finger lift on the free edge'],
    ['cards', 'compact', 0, 0, 0, 'card size preset'],
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
  // Prints: card images treated as photos printed on the desk's paper. A preset sets the knobs below it.
  Prints: [
    ['print', 'as-is', 0, 0, 0, 'preset'], // as-is: K8's untreated photos
    ['pDesat', 0, 0, 1, 0.01, 'desaturate'],
    ['pWarm', 0, 0, 1, 0.01, 'white balance to paper'],
    ['pBlack', 0, 0, 0.12, 0.001, 'lift blacks to ink'],
    ['pGrain', 0, 0, 3, 0.05, 'paper grain'],
    ['pMatte', 0, 0, 12, 0.25, 'matte edge px'],
    ['pDuo', 0, 0, 1, 0.01, 'duotone at rest'],
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
    ['turnEase', 'glide', 0, 0, 0, 'page turn easing'],
  ],
  // Throw: the card box as a rigid body the turning page throws off (physics.ts, curl.ts).
  Throw: [
    ['throwG', 9000, 2000, 20000, 100, 'gravity px/s²'],
    ['throwMass', 1, 0.1, 5, 0.05, 'box mass (against what it hits)'],
    ['throwMu', 0.6, 0, 1.5, 0.05, 'box friction on paper'],
    ['throwBounce', 0.25, 0, 0.9, 0.05, 'box restitution'],
    ['throwSag', 40, 0, 120, 1, 'curl coupling: flap edge sag px'],
    ['throwHz', 480, 120, 960, 60, 'physics steps per s'],
    ['throwRest', 0.5, 0.05, 2, 0.05, 'asleep once it stays within px for 0.4 s'],
    ['throwPersp', 0.25, 0.05, 1, 0.05, 'box perspective ease s'],
    ['throwHome', 0.5, 0.1, 2, 0.05, 'fallen box eases home s'],
  ],
  // Desk: what the desk does with cards you move.
  Desk: [
    ['edgeSoft', 1, 0, 1, 1, 'thrown cards bounce softly off the edges'],
    ['keyMove', 1, 0, 1, 1, 'arrow keys move the focused card'],
    ['imprint', 1, 0, 1, 1, 'lifting a card leaves a brief imprint (trial)'],
    ['lidS', 0.25, 0.05, 1, 0.05, 'card box flap folds open or shut s'],
    ['lidWait', 0.3, 0, 1.5, 0.05, 'flap waits before shutting s'],
  ],
  Tally: TALLY_PARAMS, // the pencil tally on each card box (tally.ts)
  // Chips: click the bare desk to drop a potato chip; the slime grows to it and eats it from below (chips.ts).
  Chips: [
    ['chips', 1, 0, 1, 1, 'click the desk to drop a chip'],
    ['chipSize', 31, 15, 60, 0.5, 'radius px'],
    ['chipThick', 2, 0.8, 5, 0.1, 'thickness px'],
    ['chipCurl', 1.4, 0, 2, 0.05, 'curl'],
    ['chipFold', 1, 0, 2, 0.05, 'curled-up edges'],
    ['chipBend', 0.8, 0.05, 2, 0.01, 'how gradually the edges curl'],
    ['chipDrop', 150, 0, 400, 1, 'drop height px'],
    ['chipSpin', 10, 0, 30, 0.5, 'tumble rad/s'],
    ['chipMass', 0.05, 0.005, 0.5, 0.005, 'mass against the card box'],
    ['chipCam', 1200, 400, 4000, 10, 'camera height px (nearer looks larger)'],
    ['chipE', 0.3, 0, 0.8, 0.01, 'bounce'],
    ['chipMu', 0.5, 0, 1.5, 0.01, 'friction'],
    ['chipDamp', 16, 0, 40, 0.5, 'rocking dies at x/s on the desk'],
    ['chipEat', 1.2, 0.05, 3, 0.01, 'eating speed'],
    ['chipBand', 1, 0.2, 4, 0.05, 'eaten within px of the desk'],
    ['chipTaste', 1.5, 0.2, 6, 0.05, 'slime under it counts x'],
    ['chipFood', 1, 0, 2, 0.01, 'food strength'],
    ['chipFoodR', 2, 0.3, 3, 0.05, 'food reach x radius'],
    ['chipMax', 8, 1, NCH, 1, 'live chips'],
    ['chipHurry', 6, 1, 20, 0.5, 'over the cap: the oldest is eaten x faster'],
    ['chipCrumbs', 30, 0, 200, 1, 'a piece under this many columns is crumbs'],
    ['chipCrumbS', 0.6, 0.05, 3, 0.05, 'crumbs eaten in s'],
    ['chipGold', 0.35, 0, 1, 0.01, 'pale to deep gold'],
    ['chipCrisp', 0.8, 0, 1.5, 0.01, 'browned rim'],
    ['chipSalt', 0.6, 0, 2, 0.01, 'salt'],
    ['chipEdge', 1.5, 0, 3, 0.05, 'its thickness shows along the edge where it tilts'],
    ['chipLight', 2.5, 0, 3, 0.05, 'light across the curl'],
    ['chipFill', 0.6, 0, 1, 0.01, 'the darkest the side turned away gets'],
    ['chipRelief', 0.3, 0, 1.5, 0.01, 'bright crests, dark troughs'],
    ['chipGloss', 0.8, 0, 2, 0.01, 'broad highlight'],
    ['chipShadow', 0.6, 0, 1.5, 0.01, 'shadow'],
    ['chipSoft', 0.5, 0, 2, 0.01, 'shadow softens per px of height'],
    ['chipShadowH', 80, 20, 300, 1, 'shadow fades out by height px'],
    ['chipContact', 1, 0, 2, 0.01, 'contact shadow'],
    ['chipNibble', 0.6, 0, 1.5, 0.01, 'nibbled edges'],
    ['chipStain', 0.4, 0, 1, 0.01, 'slime stain'],
  ],
} as const;
// Every tunable's current value: a number, or a string for the selects and the ink color.
type Param = (typeof GROUPS)[keyof typeof GROUPS][number];
// A panel row as the panel reads it: key, default, min, max, step, label.
export type ParamRow = readonly [string, number | string, number, number, number, string];
type Tunables = { [P in Param as P[0]]: P[1] extends string ? string : number } & Record<string, number | string>;
// none: no food | max: a band of food that tops the trail up | plus: the band adds to the trail | corners: blobs at the
// four corners | center: one blob under the card | ring2: max plus a second ridge farther out
export const EDGE_MODES = ['none', 'max', 'plus', 'corners', 'center', 'ring2'];
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
  quint: (u: number) => (u < 0.5 ? 16 * u ** 5 : 1 - (-2 * u + 2) ** 5 / 2),
  sine: (u: number) => -(Math.cos(Math.PI * u) - 1) / 2,
  linear: (u: number) => u,
};
export const PRINTS: Record<string, Record<string, number>> = {
  print: { pDesat: 0.22, pWarm: 0.7, pBlack: 0.03, pGrain: 1, pMatte: 1.5, pDuo: 0 },
  duotone: { pDesat: 0.22, pWarm: 0.7, pBlack: 0.03, pGrain: 1, pMatte: 1.5, pDuo: 1 }, // full color fades in as the card plays
  'as-is': { pDesat: 0, pWarm: 0, pBlack: 0, pGrain: 0, pMatte: 0, pDuo: 0 },
};
// Looks: presets for the agents and both pages' ink (the research page keeps its own project color). original: the first desk (b-desk.html: 26k agents on a 0.45x
// grid (agents count at 0.5x, so 32.1k here), soft pale veins drawn at half opacity, big open cells); k8: Clark's K8 tuning (denser, finer olive veins).
const LOOKS: Record<string, { T: Record<string, number>; main: Record<string, number | string> }> = {
  original: { T: { res: 0.45, agents: 32100, speed: 147, turn: 0.35, sa: 0.5, sd: 26.7, decay: 0.9, deposit: 0.045, diffuse: 1, respawn: 0, edge: 0.14 },
    main: { ink: 'b0b993', opacity: 1, gain: 1.1, gamma: 1.8, soft: 0.4, grain: 0.16, tint: 0 } },
  k8: { T: { res: 1, agents: 200000, speed: 93, turn: 0.1, sa: 0.5, sd: 26.6, decay: 0.9, deposit: 0.038, diffuse: 0.79, respawn: 0.003, edge: 0.55 },
    main: { ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.3, grain: 0.16, tint: 0 } },
};
// Card size presets: compact (Clark's pick, 2026-11-23, the default) shows cards at 0.75 with the title on the front
// only, tighter backs, and thumbnails framed on their subject; as-is is the full-size card from before.
export const CARD_PRESETS: Record<string, Record<string, number>> = {
  'as-is': { cardScale: 1, backTitle: 1, backTight: 0, framing: 0 },
  compact: { cardScale: 0.75, backTitle: 0, backTight: 1, framing: 1 },
};
export const CHOICES: Record<string, readonly string[]> = { cards: Object.keys(CARD_PRESETS), look: Object.keys(LOOKS), edgeMode: EDGE_MODES, turnEase: Object.keys(EASES), print: Object.keys(PRINTS) };
const PARAMS = Object.values(GROUPS).flat();
export const DEFAULTS = Object.fromEntries(PARAMS.map(([k, d]) => [k, d]));
export const RESEED = ['agents', 'res', 'auto']; // the only settings that rebuild the sim
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
  main: { bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.8, grain: 0.16, tint: 0, hueMix: 0.3 },
  // research: the same K8 paper, with each paper always emitting a soft wash of its own ink
  research: { bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.3, grain: 0.16, tint: 0.8, hueMix: 0.8 },
};
// What the tweak panel resets to: the defaults with the default look and print laid over them (the research page keeps its tint).
const LOOK = LOOKS[DEFAULTS.look];
export const BASE = { ...DEFAULTS, ...LOOK.T, ...PRINTS[DEFAULTS.print] };
export const STYLE_BASE = Object.fromEntries(PAGE_NAMES.map((pg) => [pg,
  { ...STYLE_DEFAULTS[pg], ...Object.fromEntries(Object.entries(LOOK.main).filter(([k]) => pg === 'main' || k !== 'tint')) }])) as Record<string, Style>;
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
  T[k] = typeof DEFAULTS[k] === 'string' ? qs.get(k)! : parseFloat(qs.get(k)!);
}
for (const [k, list] of Object.entries(CHOICES)) if (!list.includes(T[k] as string)) T[k] = DEFAULTS[k];
for (const [k, v] of Object.entries(PRINTS[T.print])) if (!qs.has(k)) T[k] = v;
for (const [k, v] of Object.entries(CARD_PRESETS[T.cards])) if (!qs.has(k)) T[k] = v;
const STYLE: Record<string, Style> = Object.fromEntries(PAGE_NAMES.map((pg) => [pg, Object.fromEntries(Object.entries(STYLE_DEFAULTS[pg]).map(([k, d]) => {
  const v = qs.get(`${pg}.${k}`);
  return [k, v == null ? d : typeof d === 'string' ? v : parseFloat(v)];
})) as Style]));
// A look sets its agents and both pages' ink (research keeps its project color); values given in the URL win.
function applyLook(name: string, fromUrl = false) {
  for (const [k, v] of Object.entries(LOOKS[name].T)) if (!fromUrl || !qs.has(k)) T[k] = v;
  for (const pg of PAGE_NAMES) for (const [k, v] of Object.entries(LOOKS[name].main)) {
    if ((pg === 'main' || k !== 'tint') && (!fromUrl || !qs.has(`${pg}.${k}`))) STYLE[pg][k] = v;
  }
}
applyLook(T.look, true);
return { qs, HAND, font, T, reduced, STYLE, applyLook };
}
