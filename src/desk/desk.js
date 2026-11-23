// K. Desk, minimal: the B desk (sparse slime under paper cards), rebuilt as one WebGPU pass chain.
// Every step: excitation field E -> a few tens of thousands of agents (steer, deposit by atomics) -> trail diffuse/decay.
// The slime lives on a soft, lower-resolution grid under the whole desk; cards lie on top. Agents only find a little
// food in a thin band just outside each card's edge, so veins hug the cards as a soft outline that follows a dragged card.
// Clicking a card flips it in 3D to its back (details and links). Every time a card comes down onto the desk (the first
// visit's fly-in, a flip, a drop, a page change) it lands: one burst of ink from its edge, scaled by how hard it landed.
// One fragment pass at full device resolution draws paper grain, one muted ink (Beer-Lambert, so it darkens like dye),
// the crisp signature, and the cards (atlas texture, video via importExternalTexture) with soft drop shadows.
// The DOM keeps invisible hit targets and the accessible text.
// Site port of .context/mockups/k-desk-minimal.js: the same code, run inside mountDesk(root, router), which returns a
// teardown. Its pages have their own addresses (the mockup's #research is /publications here); router.push(path, state)
// and router.state() go through the site's router, so it keeps the history and the page title.

import { clips, mediaUrl } from 'virtual:desk-media';

export function mountDesk(root, router) {
const ac = new AbortController(), signal = ac.signal;
const addEventListener = (type, fn, opts) => window.addEventListener(type, fn, { ...opts, signal });
let dead = false;

const MAX = 32; // cards and decks the uniforms hold (room for overflow projects)
const REF_W = 1440, REF_H = 900, PHONE = 700;
const POSTCARD = 3 / 2; // every project card is one landscape postcard, 3:2, the same size on the desk and in a deck
const STEP = 1 / 60;
const PAPER = [0xf3, 0xf1, 0xea];
// Design tokens: the colors, type, and spacing every card face and back is drawn with. The stylesheet mirrors them as
// custom properties (--paper, --stock, ...), so the DOM still and no-WebGPU fallback match the GPU drawing.
const TOK = {
  paper: '#f3f1ea', stock: '#fffdf8', stockWarm: '#f5f0e4', note: '#fff4a8', noteStrip: '#f7ea98',
  text: '#1d1d1b', text2: '#2b2b28', body: '#3d3c38', muted: '#6f6d66', // muted is AA (4.5:1) on paper and every stock
  ink: '#a5a970', inkDeep: '#5c5f4a', inkLine: '#85895c', // inkLine: drawn link underlines, 3:1 on every stock
  fs: 13, fsHand: 23, lhBody: 20, radius: 3,
};
// Card scale (an option, T.cardScale): every desk card is drawn at its own design size and shown that much smaller, its
// type, padding and frames with it; only the type stops at 12 px on screen, so below 12/13 of full size the type grows
// within the card by TS (in design px) while the card keeps its size.
let TS = 1;
const font = (weight, px = TOK.fs * TS, family = 'Inter') => `${weight} ${px}px ${family}`;
const HAND = font(500, TOK.fsHand, 'Caveat');
// Motion: a few durations and two curves. Things the user triggers respond in `respond`; cards that come down onto the
// desk take `settle`; moves across the desk take `travel`. Arrivals decelerate (ease-out quart); turns and pans ease in
// and out; physical motion (lift, tilt, squash) is springs. Exits run at `exit` times their entrance.
const MOTION = { quick: 0.15, respond: 0.3, settle: 0.55, travel: 1, exit: 0.7 };
const IMPRINT_S = 1; // a lifted card's imprint fades over this long (s)
const NAME_INK = [30, 34, 40];
const qs = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || qs.has('still');

// Every tunable, defaults matched to b-desk.html's CPU sim (scale 0.45, 26k agents, 1.1 sim px per step at 60 steps/s,
// about 147 CSS px/s). Distances are CSS px, speed is CSS px per second. Each one is a URL parameter and a slider in the
// tweak panel (press t), and all of them apply live; only the agent count re-seeds the sim.
// Groups of [key, default, min, max, step, label]. A string default makes a select (options in CHOICES) or, for ink, a
// color picker; a 0/1 default with step 1 is a checkbox.
const GROUPS = {
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
    ['backs', 'postcard', 0, 0, 0, 'back style (postcard; pen was the previous)'],
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
    ['landThrow', 1500, 200, 4000, 50, 'drop speed for a full burst px/s'],
    ['shove', 1, 0, 2, 0.05, 'shove strength (0 off)'],
    ['flipJitter', 1.5, 0, 6, 0.1, 'flip angle spread (std dev, deg)'],
    ['maxAngle', 5, 0, 15, 0.5, 'max card angle deg'],
  ],
  Media: [
    ['fadeIn', MOTION.respond, 0.05, 2, 0.05, 'fade in s'],
    ['fadeOut', 1, 0.1, 3, 0.05, 'fade out s'],
    ['finishFirst', 1, 0, 1, 1, 'finish clip before fading out'],
    ['xfade', 0.6, 0.1, 2, 0.05, 'crossfade s'],
    ['hold', 0, 0, 10, 0.25, 'clip hold s (0 = whole clip)'],
    ['hoverDelay', 0, 0, 800, 10, 'hover delay ms'],
    ['focusSoft', 1.5, 0, 2, 0.05, 'background softness while hovering a card'],
    ['focusS', MOTION.respond, 0.05, 2, 0.05, 'focus fade s (release takes exit x this)'],
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
  // Notebook: each page's folded corner, the way to the other page, and the page turn.
  Notebook: [
    ['cornerSize', 70, 40, 120, 1, 'corner size px'],
    ['cornerLabel', 19, 12, 30, 0.5, 'corner label px'],
    ['cornerLift', 10, 0, 40, 1, 'hover lift px'],
    ['turnS', 0.9, 0.3, 2.5, 0.05, 'page turn s'],
    ['turnEase', 'glide', 0, 0, 0, 'page turn easing'],
  ],
  // Desk: what the desk does with cards you move.
  Desk: [
    ['edgeSoft', 1, 0, 1, 1, 'thrown cards bounce softly off the edges'],
    ['keyMove', 1, 0, 1, 1, 'arrow keys move the focused card'],
    ['imprint', 1, 0, 1, 1, 'lifting a card leaves a brief imprint (trial)'],
  ],
};
// none: no food | max: a band of food that tops the trail up | plus: the band adds to the trail | corners: blobs at the
// four corners | center: one blob under the card | ring2: max plus a second ridge farther out
const EDGE_MODES = ['none', 'max', 'plus', 'corners', 'center', 'ring2'];
// glide: one page turn whose speed rises gently (as u^1.5) and settles long and soft (as (1 - u)^3): the integral of
// that speed profile, tabulated. No linear stretch, no corner.
const glide = (() => {
  const N = 512, acc = [0];
  let sum = 0;
  for (let i = 1; i <= N; i++) { const u = (i - 0.5) / N; sum += u ** 1.5 * (1 - u) ** 3; acc.push(sum); }
  return (u) => { const x = Math.min(1, Math.max(0, u)) * N, i = Math.floor(x); return i >= N ? 1 : (acc[i] + (acc[i + 1] - acc[i]) * (x - i)) / sum; };
})();
const EASES = {
  glide,
  cubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  quint: (u) => (u < 0.5 ? 16 * u ** 5 : 1 - (-2 * u + 2) ** 5 / 2),
  sine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  linear: (u) => u,
};
const PRINTS = {
  print: { pDesat: 0.22, pWarm: 0.7, pBlack: 0.03, pGrain: 1, pMatte: 1.5, pDuo: 0 },
  duotone: { pDesat: 0.22, pWarm: 0.7, pBlack: 0.03, pGrain: 1, pMatte: 1.5, pDuo: 1 }, // full color fades in as the card plays
  'as-is': { pDesat: 0, pWarm: 0, pBlack: 0, pGrain: 0, pMatte: 0, pDuo: 0 },
};
// Looks: presets for the agents and both pages' ink (the research page keeps its own project color). original: the first desk (b-desk.html: 26k agents on a 0.45x
// grid (agents count at 0.5x, so 32.1k here), soft pale veins drawn at half opacity, big open cells); k8: Clark's K8 tuning (denser, finer olive veins).
const LOOKS = {
  original: { T: { res: 0.45, agents: 32100, speed: 147, turn: 0.35, sa: 0.5, sd: 26.7, decay: 0.9, deposit: 0.045, diffuse: 1, respawn: 0, edge: 0.14 },
    main: { ink: 'b0b993', opacity: 1, gain: 1.1, gamma: 1.8, soft: 0.4, grain: 0.16, glow: 0, halo: 0, tint: 0 } },
  k8: { T: { res: 1, agents: 200000, speed: 93, turn: 0.1, sa: 0.5, sd: 26.6, decay: 0.9, deposit: 0.038, diffuse: 0.79, respawn: 0.003, edge: 0.55 },
    main: { ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.3, grain: 0.16, glow: 0, halo: 0, tint: 0 } },
};
// Card size presets: compact (Clark's pick, 2026-11-23, the default) shows cards at 0.75 with the title on the front
// only, tighter backs, and thumbnails framed on their subject; as-is is the full-size card from before.
const CARD_PRESETS = {
  'as-is': { cardScale: 1, backTitle: 1, backTight: 0, framing: 0 },
  compact: { cardScale: 0.75, backTitle: 0, backTight: 1, framing: 1 },
};
const CHOICES = { cards: Object.keys(CARD_PRESETS), backs: ['postcard', 'quiet', 'index', 'pen'], look: Object.keys(LOOKS), edgeMode: EDGE_MODES, turnEase: Object.keys(EASES), mode: ['paper', 'spectrum', 'j'], print: Object.keys(PRINTS) };
const PARAMS = Object.values(GROUPS).flat();
const DEFAULTS = Object.fromEntries(PARAMS.map(([k, d]) => [k, d]));
const T = { ...DEFAULTS };
for (const k of Object.keys(DEFAULTS)) {
  if (!qs.has(k)) continue;
  T[k] = typeof DEFAULTS[k] === 'string' ? qs.get(k) : parseFloat(qs.get(k));
}
for (const [k, list] of Object.entries(CHOICES)) if (!list.includes(T[k])) T[k] = DEFAULTS[k];
for (const [k, v] of Object.entries(PRINTS[T.print])) if (!qs.has(k)) T[k] = v;
for (const [k, v] of Object.entries(CARD_PRESETS[T.cards])) if (!qs.has(k)) T[k] = v;
const RESEED = ['agents', 'res', 'auto']; // the only settings that rebuild the sim
// Per-page styles: each page has its own surface and ink, tuned under Style in the panel (URL keys main.gain, research.mode,
// ...). paper: light paper, one muted ink that darkens like dye. spectrum: a dark surface where each card's veins glow
// in the card's own hue and add like light where they meet.
const PAGE_NAMES = ['main', 'research'];
const STYLE_PARAMS = [
  ['mode', 'paper', 0, 0, 0, 'style'],
  ['bg', 'f3f1ea', 0, 0, 0, 'background'],
  ['ink', 'a5a970', 0, 0, 0, 'ink'],
  ['opacity', 1, 0, 4, 0.05, 'ink opacity'],
  ['gain', 1.1, 0.1, 4, 0.01, 'gain'],
  ['gamma', 1.8, 0.4, 3, 0.01, 'gamma'],
  ['soft', 0.7, 0, 2, 0.05, 'softness'],
  ['grain', 0.1, 0, 0.6, 0.01, 'paper grain'],
  ['glow', 1.5, 0, 4, 0.05, 'glow'],  // paper: darker dense vein cores; spectrum: vein brightness
  ['halo', 0.6, 0, 2, 0.05, 'halo'],  // paper: a soft ink bleed around veins; spectrum: a soft light around veins
  ['tint', 0, 0, 1, 0.01, 'project color strength'],
  ['hueMix', 0, 0, 1, 0.01, 'project hue (0 = olive, 1 = own hue)'], // paper: tint is how much of its mild ink a closed card always emits (open: full ink); hueMix how far that ink turns from the shared olive toward the card's own hue
  // j: the J desk's look (warm paper, each paper's own ink, a light stain over cards); agents and cards follow the shared
  // settings above, like every page
  ['stain', 0.1, 0, 1, 0.01, 'ink stain over cards'],
  ['bleed', 7, 0, 24, 0.5, 'ink bleed into borders px'],
  ['bloom', 1.5, 0.2, 5, 0.1, 'bloom into colors s'],
];
const J_KEYS = ['stain', 'bleed', 'bloom'];
const J_DEFAULTS = { stain: 0.1, bleed: 7, bloom: 1.5 };
const STYLE_DEFAULTS = {
  // main: Clark's K8 look (light olive veins, no glow or halo, no project color until a card is opened)
  main: { mode: 'paper', bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.8, grain: 0.16, glow: 0, halo: 0, tint: 0, hueMix: 0.3, ...J_DEFAULTS },
  // research: the same K8 paper, with each paper always emitting a soft wash of its own ink; spectrum and j are one mode switch away
  research: { mode: 'paper', bg: 'f3f1ea', ink: 'a5a970', opacity: 1, gain: 0.69, gamma: 1.47, soft: 0.3, grain: 0.16, glow: 0, halo: 0, tint: 0.8, hueMix: 0.8, ...J_DEFAULTS },
};
const STYLE = Object.fromEntries(PAGE_NAMES.map((pg) => [pg, Object.fromEntries(Object.entries(STYLE_DEFAULTS[pg]).map(([k, d]) => {
  const v = qs.get(`${pg}.${k}`);
  return [k, v == null ? d : typeof d === 'string' ? v : parseFloat(v)];
}))]));
for (const pg of PAGE_NAMES) if (!CHOICES.mode.includes(STYLE[pg].mode)) STYLE[pg].mode = STYLE_DEFAULTS[pg].mode;
// A look sets its agents and both pages' ink (research keeps its project color); values given in the URL win.
function applyLook(name, fromUrl = false) {
  for (const [k, v] of Object.entries(LOOKS[name].T)) if (!fromUrl || !qs.has(k)) T[k] = v;
  for (const pg of PAGE_NAMES) for (const [k, v] of Object.entries(LOOKS[name].main)) {
    if ((pg === 'main' || k !== 'tint') && (!fromUrl || !qs.has(`${pg}.${k}`))) STYLE[pg][k] = v;
  }
}
applyLook(T.look, true);
const hexRGB = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, t) => a + (b - a) * t;
const lin = (c) => Math.pow(c / 255, 2.2);

// ---------- WGSL ----------

const COMMON = /* wgsl */ `
struct Card { inv0: vec4f, inv1: vec4f, inv2: vec4f, geo: vec4f, flat: vec4f, misc: vec4f, uv: vec4f, media: vec4f, bound: vec4f, buv: vec4f, hue: vec4f, ink: vec4f, imp: vec4f };
// imp: where the card was just picked up (page sim px) and how strongly its imprint shows (fades over IMPRINT_S)
// Sim px. geo: half size, corner radius, lift | flat: center, cos, sin | misc: scale, hover, burst, lift height
// uv: front atlas rect | media: media rect in card uv | bound: bounding radius, facing (+1 front, -1 back), landing now, |cos flip|
// inv1.w: seconds since the card last landed (< 0 while it is flying in, 1e3 once its release is over) | inv2.w: how hard it last landed
// buv: back atlas rect | hue: the card's linear-light hue (spectrum style), w = off the desk (no outline food)
// ink: the card's own ink as absorbance (paper style), w = how strongly it emits it now (open card: 1, fading after close)
struct G {
  a: vec4f,   // sim W, H, active agent count, sim px per CSS px
  b: vec4f,   // speed, deposit, decay, diffuse
  c: vec4f,   // sensor distance, sensor angle, turn, jitter
  d: vec4f,   // respawn, edge food, sources, frame
  e: vec4f,   // cursor xy, cursor amount, E decay
  f: vec4f,   // E attraction, E speed-up, ink gain, ink gamma
  n: vec4f,   // ink absorbance rgb (paper style), sim px per device px
  k: vec4f,   // name ink absorbance rgb, 1 in how many agents feel the edge food
  v: vec4f,   // video card, video mix, crossfade to the next clip, device px per CSS px at the reference size (dev * k)
  x: vec4f,   // edge mode, ridge distance, ridge width, landing burst reach (sim px)
  y: vec4f,   // landing burst speed-up, burst decay, hover excitation, cursor excitation
  z: vec4f,   // ink softness (texels), ink grain, unused, on-screen card count
  w: vec4f,   // second ring on, second ring at (x ridge distance), corner emphasis, ink opacity
  u: vec4f,   // shadow softness, shadow strength, release window (s), tiles per row (TILE device px each)
  st: vec4f,  // style (0 paper, 1 spectrum, 2 j), glow, halo, page clock (s)
  bg: vec4f,  // page background, linear rgb
  pg: vec4f,  // canvas size (device px), crossfade from the frozen frame (a sim resolution change), page turn on
  jq: vec4f,  // j style: ink stain over cards, ink bleed into card borders (sim px); hold (1: clear the ink, hold the agents), unused
  pr: vec4f,  // prints: desaturate, white balance to paper, black lift, duotone at rest
  pq: vec4f,  // prints: paper grain, matte edge (CSS px); the first agent this pass runs (a warm-up step's later part), unused
  cu: vec4f,  // page turn: the outgoing page's roll (direction from the corner xy, fold distance, roll radius; device px)
  dr: vec4f,  // the page corner of the page you see, the same way
  lb: vec4f,  // the corner's label on the back of the paper: center along the fold's axis, half width, half height (device px); stacked edges during a turn
  la: vec4f,  // the corner label's atlas rect
  lt: vec4f,  // the turning page's label's atlas rect
  ord: array<vec4f, ${MAX / 4}>, // draw order, bottom to top
  vu: vec4f,  // video uv offset, scale
  cards: array<Card, ${MAX}>,
};
@group(0) @binding(0) var<uniform> g: G;

fn toLocal(c: Card, p: vec2f) -> vec2f {
  let h = vec3f(p, 1.0);
  let q = vec3f(dot(c.inv0.xyz, h), dot(c.inv1.xyz, h), dot(c.inv2.xyz, h));
  return q.xy / q.z;
}
fn boxSd(l: vec2f, half: vec2f, r: f32) -> f32 {
  let q = abs(l) - half + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn cardSd(k: u32, p: vec2f) -> f32 { let c = g.cards[k]; return boxSd(toLocal(c, p), c.geo.xy, c.geo.z) * c.misc.x; }
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
`;

// Hovering a card excites the ink around it; a drop sends a soft pulse; the cursor stirs a little.
const E_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var esrc: texture_2d<f32>;
@group(0) @binding(2) var edst: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = vec2i(textureDimensions(esrc));
  let p = vec2i(gid.xy);
  if (p.x >= size.x || p.y >= size.y) { return; }
  let c = textureLoad(esrc, p, 0).r;
  let n4 = (textureLoad(esrc, clamp(p + vec2i(1, 0), vec2i(0), size - 1), 0).r + textureLoad(esrc, clamp(p - vec2i(1, 0), vec2i(0), size - 1), 0).r
          + textureLoad(esrc, clamp(p + vec2i(0, 1), vec2i(0), size - 1), 0).r + textureLoad(esrc, clamp(p - vec2i(0, 1), vec2i(0), size - 1), 0).r) * 0.25;
  var v = mix(c, n4, 0.3) * g.e.w;
  let w = (vec2f(p) + 0.5) * 2.0;
  let s = g.a.w;
  for (var k = 0u; k < u32(g.d.z); k++) {
    let m = g.cards[k].misc;
    if (m.y + m.z < 0.002) { continue; }
    let d = max(cardSd(k, w), 0.0);
    v += m.y * g.y.z * exp(-d / (30.0 * s)) + m.z * 0.12 * exp(-d / (40.0 * s));
  }
  let q = (w - g.e.xy) / (40.0 * s);
  v += g.e.z * g.y.w * exp(-dot(q, q));
  textureStore(edst, p, vec4f(min(v, 1.0), 0.0, 0.0, 1.0));
}`;

const SLOW = Math.max(0, Math.round(+qs.get('slow') || 0)); // test hook: artificial GPU work per agent
const AGENT_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> agents: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dep: array<atomic<u32>>;
@group(0) @binding(3) var trail: texture_2d<f32>;
@group(0) @binding(4) var etex: texture_2d<f32>;

var<private> rs: u32;
fn rnd() -> f32 { rs = pcg(rs); return f32(rs >> 8u) / 16777216.0; }
fn wrap(p: vec2f) -> vec2f { return p - floor(p / g.a.xy) * g.a.xy; }
fn eAt(p: vec2f) -> f32 { return textureLoad(etex, clamp(vec2i(p * 0.5), vec2i(0), vec2i(textureDimensions(etex)) - 1), 0).r; }
fn dir(a: f32) -> vec2f { return vec2f(cos(a), sin(a)); }
fn ridge(d: f32, at: f32) -> f32 { let b = (d - at) / g.x.z; return exp(-b * b); }
// Heading straight out through card c's nearest edge from p (under the card or just outside it).
fn outward(c: Card, p: vec2f) -> f32 {
  let r = p - c.flat.xy; let cs = c.flat.zw;
  let l = vec2f(cs.x * r.x + cs.y * r.y, -cs.y * r.x + cs.x * r.y);
  let q = abs(l) - c.geo.xy * c.misc.x;
  var n = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), q.x > q.y);
  if (q.x > 0.0 && q.y > 0.0) { n = normalize(q); }
  n *= select(vec2f(-1.0), vec2f(1.0), l >= vec2f(0.0));
  return atan2(cs.y * n.x + cs.x * n.y, cs.x * n.x - cs.y * n.y);
}
// Food card k leaves at p, by edge mode (see EDGE_MODES in JS). Distances in sim px.
fn food(k: u32, p: vec2f) -> f32 {
  let mode = u32(g.x.x);
  let c = g.cards[k];
  if (mode == 3u || mode == 4u) {
    let l = toLocal(c, p) * c.misc.x;
    let h = c.geo.xy * c.misc.x;
    if (mode == 4u) { let q = l / (0.45 * min(h.x, h.y)); return exp(-dot(q, q)); }
    let o = h + vec2f(g.x.y * 0.7); // just outside each corner
    let q = (abs(l) - o) / (1.5 * g.x.z);
    return exp(-dot(q, q));
  }
  let d = cardSd(k, p);
  var f = ridge(d, g.x.y);
  if (g.w.x > 0.5) { f = max(f, ridge(d, g.x.y * g.w.y)); }
  if (g.w.z > 0.0) { // corner emphasis: extra food just outside the four corners
    let l = toLocal(c, p) * c.misc.x;
    let q = (abs(l) - c.geo.xy * c.misc.x - vec2f(g.x.y * 0.7)) / (4.0 * g.x.z);
    f = max(f, g.w.z * exp(-dot(q, q)));
  }
  return f;
}
// Trail, excitation, and food near each card, so veins gather around the cards. In max mode food only tops the trail
// up to a vein's strength, so the outlines never starve the open network; plus mode adds it on top.
fn cardAt(j: u32) -> u32 { return u32(g.ord[j / 4u][j % 4u]); } // j-th on-screen card
fn sense(p: vec2f, edgy: bool) -> f32 {
  var v = textureLoad(trail, vec2i(wrap(p)), 0).a;
  if (edgy && g.x.x > 0.5) {
    let reach = g.x.y * max(g.w.y, 1.0) + 3.0 * g.x.z;
    for (var j = 0u; j < u32(g.z.w); j++) {
      let k = cardAt(j);
      if (g.cards[k].hue.w > 0.5) { continue; } // a card off the desk (mid-flip) leaves the slime alone
      if (distance(p, g.cards[k].flat.xy) > g.cards[k].bound.x + reach) { continue; }
      let f = g.d.y * food(k, p);
      if (u32(g.x.x) == 2u) { v += f; } else { v = max(v, f); }
    }
  }
  return v + eAt(p) * g.f.x;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x + u32(g.pq.z); // agents from g.pq.z up to g.a.z run in this pass
  if (i >= arrayLength(&agents) || f32(i) >= g.a.z) { return; } // auto quality runs only the first g.a.z agents
  rs = pcg(i * 1664525u + pcg(u32(g.d.w) + 17u));
  let a = agents[i];
  var pos = a.xy; var ang = a.z;
  // w packs the hue tag (index of the card whose color it carries) and the burst (set when a card lands next to the
  // agent, decaying over about a second): w = tag * 8 + burst. Negative w: held, waiting for card -w - 1 to land.
  var tag = floor(a.w / 8.0);
  var puff = a.w - tag * 8.0;
  if (g.jq.z > 0.5) { // hold: every agent waits for the nearest card about to land (the page's ink is cleared meanwhile)
    var best = -1.0; var bd = 1e12;
    for (var k = 0u; k < u32(g.d.z); k++) {
      let c = g.cards[k];
      if (c.inv1.w >= 0.0) { continue; }
      let dd = distance(pos, c.flat.xy);
      if (dd < bd) { bd = dd; best = f32(k); }
    }
    if (best >= 0.0) { agents[i] = vec4f(pos, ang, -1.0 - best); }
    return;
  }
  if (a.w < 0.0) {
    // Held: the agent waits, still and inkless, until its card lands, then leaves from a random point on the card's edge,
    // heading outward with the landing's burst, at its own moment within the release window.
    tag = -a.w - 1.0;
    let c = g.cards[u32(tag)];
    let since = c.inv1.w - f32(pcg(i ^ 0x9e3779b9u) >> 8u) / 16777216.0 * g.u.z;
    if (since < 0.0) { return; }
    puff = 0.0;
    if (since < 0.25) {
      let h = c.geo.xy * c.misc.x + vec2f(1.5 * g.a.w);
      let t = rnd() * 2.0 * (h.x + h.y);
      let side = select(-1.0, 1.0, rnd() < 0.5);
      var l = vec2f(h.x * side, t - 2.0 * h.x - h.y); var n = vec2f(side, 0.0);
      if (t < 2.0 * h.x) { l = vec2f(t - h.x, h.y * side); n = vec2f(0.0, side); }
      let cs = c.flat.zw;
      pos = wrap(c.flat.xy + vec2f(cs.x * l.x - cs.y * l.y, cs.y * l.x + cs.x * l.y));
      ang = atan2(cs.y * n.x + cs.x * n.y, cs.x * n.x - cs.y * n.y) + (rnd() - 0.5) * 1.2;
      puff = c.inv2.w * (0.8 + 0.2 * rnd()); // nearly one speed, so they leave as a coherent ring
    } // else it missed its moment (not running then, under auto quality): it joins where it is
  }
  if (rnd() < g.d.x) { // respawn anywhere, carrying the color of the nearest card
    let np = vec2f(rnd(), rnd()) * g.a.xy;
    var best = 0.0; var bd = 1e12;
    for (var j = 0u; j < u32(g.z.w); j++) { let k = cardAt(j); let dd = distance(np, g.cards[k].flat.xy); if (dd < bd) { bd = dd; best = f32(k); } }
    agents[i] = vec4f(np, rnd() * 6.2831853, best * 8.0);
    return;
  }
  // A card landing sends the agents under it and just around it out through its edge.
  for (var j = 0u; j < u32(g.z.w); j++) {
    let k = cardAt(j);
    let c = g.cards[k];
    // A card that emits ink (an open card, or every card in the j style) colors the agents passing close to its edge;
    // they carry its ink out along the network, and inks mix like dye where the veins meet.
    if (c.ink.w > 0.02 && distance(pos, c.flat.xy) < c.bound.x + 24.0 * g.a.w && rnd() < 0.3 * c.ink.w && cardSd(k, pos) < 24.0 * g.a.w) { tag = f32(k); }
    if (c.bound.z > 0.5 && cardSd(k, pos) < g.x.w) {
      ang = outward(c, pos) + (rnd() - 0.5) * 1.2;
      puff = max(puff, c.inv2.w * (0.8 + 0.2 * rnd()));
    }
  }
  puff *= g.y.y;
  let e = eAt(pos);
  let sd = g.c.x; let sa = g.c.y; let turn = g.c.z * (1.0 - min(puff, 1.0));
  let edgy = i % u32(g.k.w) == 0u;
  let f = sense(pos + dir(ang) * sd, edgy);
  let l = sense(pos + dir(ang - sa) * sd, edgy);
  let r = sense(pos + dir(ang + sa) * sd, edgy);
  // B's rule: always lean toward the stronger side sensor, which curls the network into rounder cells.
  if (f < l && f < r) { ang += (rnd() - 0.5) * 2.0 * turn; }
  else if (l > r) { ang -= turn; }
  else if (r > l) { ang += turn; }
  ${SLOW ? `var burn = pos.x; for (var z = 0u; z < ${SLOW}u; z++) { burn = fract(burn * 1.618 + 0.37); } ang += burn * 1e-12; // test load: ?slow=N` : ''}
  pos = wrap(pos + dir(ang) * g.b.x * (1.0 + g.f.y * e + g.y.x * puff));
  let q = vec2u(min(pos, g.a.xy - 1.0));
  let at = (q.y * u32(g.a.x) + q.x) * 4u;
  let amt = g.b.y * (1.0 + 2.0 * e) * (1.0 - 0.7 * min(puff, 1.0)) * 4096.0;
  // rgb carries color: on paper the ink's absorbance (the shared olive, or the agent's card ink while that card is open),
  // so overlapping inks darken like dye; in spectrum the card's hue as light, brighter while the card is open.
  let ck = g.cards[u32(tag)];
  var tint = mix(g.n.xyz, ck.ink.rgb, ck.ink.w);
  if (g.st.x > 0.5 && g.st.x < 1.5) { tint = ck.hue.rgb * (1.0 + ck.ink.w); }
  atomicAdd(&dep[at], u32(tint.r * amt)); atomicAdd(&dep[at + 1u], u32(tint.g * amt)); atomicAdd(&dep[at + 2u], u32(tint.b * amt));
  atomicAdd(&dep[at + 3u], u32(amt));
  agents[i] = vec4f(pos, ang, tag * 8.0 + puff);
}`;

const DIFFUSE_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> dep: array<atomic<u32>>;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
var<workgroup> tile: array<vec4f, 324>; // 18x18: the 16x16 block plus a 1px apron (wrapped, like the agents)
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u) {
  let size = vec2i(g.a.xy);
  let origin = vec2i(wg.xy) * 16 - 1;
  for (var t = li; t < 324u; t += 256u) {
    let q = origin + vec2i(i32(t % 18u), i32(t / 18u));
    tile[t] = textureLoad(src, (q + size) % size, 0);
  }
  workgroupBarrier();
  let p = vec2i(gid.xy);
  if (p.x >= size.x || p.y >= size.y) { return; }
  let lp = p - origin;
  var s = vec4f(0.0);
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) { s += tile[u32(lp.y + dy) * 18u + u32(lp.x + dx)]; }
  }
  let c = tile[u32(lp.y) * 18u + u32(lp.x)];
  let k = (u32(p.y) * u32(size.x) + u32(p.x)) * 4u;
  let d = vec4f(f32(atomicExchange(&dep[k], 0u)), f32(atomicExchange(&dep[k + 1u], 0u)), f32(atomicExchange(&dep[k + 2u], 0u)), f32(atomicExchange(&dep[k + 3u], 0u))) / 4096.0;
  var v = mix(c, s / 9.0, g.b.w) * g.b.z + d;
  if (v.a > 1.0) { v /= v.a; } // density saturates; the hue keeps its proportions
  if (g.jq.z > 0.5) { v = vec4f(0.0); } // hold: the page starts over from bare paper
  textureStore(dst, p, v);
}`;

// Which cards can touch each 16x16 tile of the screen, so the render visits only those: bit j of x for the j-th on-screen
// card (its shadow's reach, the render's own test), bit k of y for card k's pickup imprint. Both tests only ever widen the
// render's own per-pixel tests, so the picture is the same; a pixel just skips cards that cannot reach it.
const TILE = 16;
const TILE_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> tiles: array<vec2u>;
fn rectDist(c: vec2f, lo: vec2f, hi: vec2f) -> f32 { return length(max(max(lo - c, c - hi), vec2f(0.0))); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tx = u32(g.u.w);
  let ty = (u32(g.pg.y) + ${TILE}u - 1u) / ${TILE}u;
  if (gid.x >= tx * ty) { return; }
  let q = g.n.w; let s = g.a.w;
  let lo = vec2f(f32(gid.x % tx), f32(gid.x / tx)) * ${TILE}.0 * q;
  let hi = lo + vec2f(${TILE}.0 * q);
  var m = vec2u(0u);
  for (var j = 0u; j < u32(g.z.w); j++) {
    let k = u32(g.ord[j / 4u][j % 4u]);
    let reach = g.cards[k].bound.x + (40.0 + 60.0 * g.cards[k].geo.w) * s * max(g.u.x, 1.0);
    if (rectDist(g.cards[k].flat.xy, lo, hi) <= reach + 1.0) { m.x |= 1u << j; }
  }
  for (var k = 0u; k < u32(g.d.z); k++) {
    let im = g.cards[k].imp;
    if (im.z < 0.002) { continue; }
    if (rectDist(im.xy, lo, hi) <= length(g.cards[k].geo.xy) + 6.0 * s + 1.0) { m.y |= 1u << k; } // the rounded box lies inside its corners' circle
  }
  tiles[gid.x] = m;
}`;

// Fullscreen triangle and the paper's grain. Grain is static, so it is baked once per layout into a desk-sized texture.
const PAPER_FNS = /* wgsl */ `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let v = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(v[i], 0.0, 1.0);
}
fn h21(p: vec2f) -> f32 { var q = fract(p * vec2f(0.1031, 0.1030)); q += dot(q, q.yx + 33.33); return fract((q.x + q.y) * q.x); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2f(1.0, 0.0)), u.x), mix(h21(i + vec2f(0.0, 1.0)), h21(i + vec2f(1.0, 1.0)), u.x), u.y);
}
// Paper: x = slow mottling, y = fibers and tooth (also how readily the paper takes ink).
fn grain(pc: vec2f) -> vec2f {
  let coarse = vnoise(pc / 41.0) * 0.5 + vnoise(pc / 13.0 + 7.0) * 0.3 + vnoise(pc / 4.7 + 3.0) * 0.2;
  let r1 = vec2f(0.8 * pc.x + 0.6 * pc.y, -0.6 * pc.x + 0.8 * pc.y);
  let r2 = vec2f(0.28 * pc.x - 0.96 * pc.y, 0.96 * pc.x + 0.28 * pc.y);
  let fib = vnoise(r1 * vec2f(0.09, 1.2)) * 0.5 + vnoise(r2 * vec2f(0.07, 1.0) + 11.0) * 0.5;
  return vec2f(coarse, fib * 0.55 + vnoise(pc * 1.4) * 0.45);
}
`;
const GRAIN_WGSL = COMMON + PAPER_FNS + /* wgsl */ `
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f { return vec4f(grain(fp.xy * g.n.w / g.a.w), 0.0, 1.0); }`;

const renderWGSL = (video) => COMMON + /* wgsl */ `
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var atlas: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;
@group(0) @binding(5) var paper: texture_2d<f32>;
@group(0) @binding(6) var frozen: texture_2d<f32>;
${video ? '@group(0) @binding(7) var vidA: texture_external;\n@group(0) @binding(8) var vidB: texture_external;' : ''}
@group(0) @binding(9) var<storage, read> tiles: array<vec2u>;

const PAPER = vec3f(${PAPER.map(lin).map((x) => x.toFixed(5)).join(', ')});

${PAPER_FNS}
// J's ink transmittance: concentration saturates with density, the paper's tooth modulates it, inks add absorbance.
fn inkJ(v: vec4f, tooth: f32, k: f32) -> vec3f {
  if (v.a < 1e-4) { return vec3f(1.0); }
  let conc = (1.0 - exp(-v.a * g.f.z)) * (0.78 + 0.44 * tooth) * k;
  return exp(-(v.rgb / v.a) * conc);
}
// A card's image as a photo printed on the desk's paper (linear rgb): muted, its whites balanced to the paper, its blacks
// lifted to a warm ink-dark, the paper's grain on top, and a soft matte edge. Duotone: at rest an olive-ink/paper print
// (the page's ink), giving way to full color as color goes to 1.
fn printed(cc: vec3f, gr: vec2f, edge: f32, color: f32) -> vec3f {
  let lum = dot(cc, vec3f(0.2126, 0.7152, 0.0722));
  let white = mix(vec3f(1.0), PAPER / PAPER.r, g.pr.y);
  let dark = g.pr.z * vec3f(1.0, 0.86, 0.66);
  var c = mix(cc, vec3f(lum), g.pr.x);
  c = mix(c, PAPER * exp(-g.n.xyz * 4.0 * (1.0 - sqrt(lum))), g.pr.w * (1.0 - color));
  c = dark + (white - dark) * c;
  c *= 1.0 + ((gr.y - 0.5) * 0.09 + (gr.x - 0.5) * 0.05) * g.pq.x;
  return mix(white, c, smoothstep(0.0, max(g.pq.y, 1e-3), edge)); // the image softens into the card's border
}
// Soft shadow of card c's flat footprint, offset by o and blurred by b (sim px).
fn shadow(c: Card, p: vec2f, o: vec2f, b: f32) -> f32 {
  let q = p - c.flat.xy - o;
  let l = vec2f(c.flat.z * q.x + c.flat.w * q.y, -c.flat.w * q.x + c.flat.z * q.y) / c.misc.x / vec2f(max(c.bound.w, 0.05), 1.0);
  return 1.0 - smoothstep(-b, b, boxSd(l, c.geo.xy, c.geo.z) * c.misc.x);
}

// Bare paper in the paper style: its grain (gr) and the vignette (vq).
fn bare(gr: vec2f, vq: vec2f) -> vec3f {
  return g.bg.rgb * (1.0 + ((gr.x - 0.5) * 0.06 + (gr.y - 0.5) * 0.045) * g.z.y / 0.16) * (1.0 - 0.04 * dot(vq, vq));
}
// Ink mixed the way the browser draws text (in sRGB), so text drawn here matches the DOM's.
fn inked(col: vec3f, ink: vec3f, a: f32) -> vec3f { return pow(mix(pow(col, vec3f(1.0 / 2.2)), ink, a), vec3f(2.2)); }
const PI = 3.14159265;
const DARK = vec3f(0.169, 0.169, 0.157); // TOK.text2, sRGB
fn grainAt(p: vec2f) -> vec2f { return textureLoad(paper, clamp(vec2i(p), vec2i(0), vec2i(g.pg.xy) - 1), 0).rg; }
// Signed distance from p to the page (the screen), device px: negative inside.
fn pageSd(p: vec2f) -> f32 { let h = 0.5 * g.pg.xy; let q = abs(p - h) - h; return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0); }
// Under a folded corner: the edges of the pages below, a hairline step each, a touch darker the deeper (w: how much).
fn stacked(p: vec2f, w: f32) -> f32 {
  let u = 1.6 * g.v.w; // a sheet's step
  let e = min(g.pg.x - p.x, g.pg.y - p.y);
  if (w < 0.001 || e > 4.0 * u) { return 1.0; }
  var f = 1.0;
  for (var j = 1; j <= 3; j++) {
    let out = f32(4 - j) * u - e; // outside sheet j (j = 1 is the page right under this one)
    f *= 1.0 - 0.2 * exp(-max(out, 0.0) / 0.8) * smoothstep(-0.5, 0.5, out) - 0.02 * smoothstep(-0.5, 0.5, out);
  }
  return mix(1.0, f, w);
}
// Light on the rolled paper (light from the upper left, like the cards' shadows): th is the paper's angle on the roll
// (0: lying flat face up, PI: flipped over flat, back up). A soft highlight runs along the crease.
fn rollLight(dir: vec2f, th: f32, back: bool) -> f32 {
  let L = normalize(vec3f(-0.3, -0.75, 1.0));
  let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  var n = vec2f(sin(th), cos(th)); // along the roll direction, up
  if (back) { n = -n; }
  let nl = n.x * dot(L.xy, dir) + n.y * L.z;
  let nh = n.x * dot(H.xy, dir) + n.y * H.z;
  return 1.0 + 0.55 * (nl - L.z) + 0.07 * pow(max(nh, 0.0), 60.0) - 0.07 * pow(H.z, 60.0);
}
// One sheet rolling up off the page from its bottom-right corner, like a notebook page: it wraps around a cylinder of
// radius R whose foot (the fold) lies d from the corner along dir, and lies flipped over beyond it, back side up. top is
// the sheet's front at p (from the frozen frame when turning, sampled where the paper came from); below is what it
// uncovers. The back is the paper's back, with the label written on it near the corner: printed on the sheet, in the
// paper's own axes (the fold's rest direction), so it turns, foreshortens and curls with the paper however the fold
// leans, and takes the roll's light and shade like the paper under it. Device px; antialiased edges.
fn rolled(p: vec2f, below: vec3f, top: vec3f, turning: bool, cu: vec4f, lab: vec4f) -> vec3f {
  let dir = cu.xy; let d = cu.z; let R = max(cu.w, 0.5);
  if (d <= 0.0) { return top; }
  let C = g.pg.xy; let N = vec2f(-dir.y, dir.x);
  let x = dot(p - C, dir); let y = dot(p - C, N);
  if (x > max(2.0 * d - PI * R, d) + 6.0 + 2.0 * R) { return top; } // past the flap and its shadow: untouched
  // What it uncovers, in the roll's shadow where the page still rolls up at this point of the fold.
  let rolls = clamp(0.5 - pageSd(C + d * dir + y * N) / (1.0 + R), 0.0, 1.0);
  var c = below * (1.0 - 0.3 * rolls * exp(-max(d - R - x, 0.0) / (3.0 * g.v.w + 0.8 * R)));
  // The front: flat past the fold, or rolling up on the near half of the cylinder.
  var fa = 0.0; var fp = p; var fth = 0.0;
  if (x >= d) { fa = 1.0; }
  else if (x > d - R) { fth = asin(clamp((d - x) / R, 0.0, 1.0)); fp = C + (d - R * fth) * dir + y * N; fa = clamp(x - d + R + 0.5, 0.0, 1.0); }
  fa *= clamp(0.5 - pageSd(fp), 0.0, 1.0);
  // The back: the far half of the cylinder, or the flap lying flipped over past the fold.
  var ba = 0.0; var bp = p; var bth = PI;
  if (x >= d) { bp = C + (2.0 * d - PI * R - x) * dir + y * N; ba = 1.0; }
  else if (x > d - R) { bth = PI - asin(clamp((d - x) / R, 0.0, 1.0)); bp = C + (d - R * bth) * dir + y * N; ba = clamp(x - d + R + 0.5, 0.0, 1.0); }
  ba *= clamp(0.5 - pageSd(bp), 0.0, 1.0);
  if (fa > 0.0) {
    var fc = top;
    if (turning && fth > 0.0) { fc = pow(textureLoad(frozen, clamp(vec2i(fp), vec2i(0), vec2i(g.pg.xy) - 1), 0).rgb, vec3f(2.2)); }
    fc *= rollLight(dir, fth, false);
    // The flap's soft shadow on the flat page, cast a little down and right.
    let ps = p - vec2f(0.4, 1.0) * (1.0 + 0.6 * R); let xs = dot(ps - C, dir);
    let sd = pageSd(C + (2.0 * d - PI * R - xs) * dir + dot(ps - C, N) * N);
    fc *= 1.0 - 0.2 * step(d, xs) * (1.0 - smoothstep(-1.0, 2.0 + 1.2 * R, sd));
    c = mix(c, fc, fa);
  }
  if (ba > 0.0) {
    let bg2 = grainAt(bp);
    var bc = g.bg.rgb * (1.0 + ((bg2.x - 0.5) * 0.06 + (bg2.y - 0.5) * 0.045) * g.z.y / 0.16) * 0.97;
    let D0 = vec2f(-0.70710678, -0.70710678); let N0 = vec2f(0.70710678, -0.70710678); // the fold's direction at rest, fixed on the paper
    let lx = dot(bp - C, D0); let ly = dot(bp - C, N0);
    let lu = vec2f(ly / (2.0 * g.lb.y) + 0.5, (lx - g.lb.x) / (2.0 * g.lb.z) + 0.5);
    if (all(lu > vec2f(0.0)) && all(lu < vec2f(1.0))) { bc = inked(bc, DARK, 0.92 * textureSampleLevel(atlas, samp, mix(lab.xy, lab.zw, lu), 0.0).a); }
    c = mix(c, bc * rollLight(dir, bth, true), ba);
  }
  return c;
}

@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let q = g.n.w;           // sim px per device px
  let pd = fp.xy;          // device px on the page
  let p = pd * q;          // everything below is in sim px, except the crisp masks and edge coverage
  let s = g.a.w;           // sim px per CSS px
  let ip = vec2i(pd);
  let gr = textureLoad(paper, ip, 0).rg;
  let vq = (fp.xy / g.pg.xy - 0.5) * vec2f(1.6, 1.2); // vignette follows the screen
  let spectrum = g.st.x > 0.5 && g.st.x < 1.5;
  let jmode = g.st.x > 1.5;
  let m = textureLoad(mask, ip, 0);
  let tp = 1.0 / g.a.xy; // a small tent filter keeps the veins soft, like B's upscaled canvas
  let o = g.z.x;
  let t4 = 0.25 * (textureSampleLevel(trail, samp, (p + vec2f(-o, -o)) * tp, 0.0) + textureSampleLevel(trail, samp, (p + vec2f(o, -o)) * tp, 0.0)
                 + textureSampleLevel(trail, samp, (p + vec2f(-o, o)) * tp, 0.0) + textureSampleLevel(trail, samp, (p + vec2f(o, o)) * tp, 0.0));
  let a = t4.a;
  // Text stays legible because the ink thins out behind it.
  // The ink fades in over the page's first seconds, so the scattered start never shows as noise.
  // Pickup imprint (trial): where a card was just lifted, the ink in its old footprint sits a little darker and fades
  // back as the veins reclaim it. Render only; the agents are untouched.
  var stamp = 0.0;
  let tm = tiles[(u32(fp.y) / ${TILE}u) * u32(g.u.w) + u32(fp.x) / ${TILE}u]; // the cards that can reach this tile
  var ims = tm.y;
  while (ims != 0u) {
    let k = firstTrailingBit(ims); ims &= ims - 1u;
    let im = g.cards[k].imp; // read only what it needs: copying the whole card per pixel is not free
    if (im.z < 0.002) { continue; }
    let fl = g.cards[k].flat; let ge = g.cards[k].geo; let r = p - im.xy;
    let l = vec2f(fl.z * r.x + fl.w * r.y, -fl.w * r.x + fl.z * r.y);
    stamp = max(stamp, im.z * (1.0 - smoothstep(-20.0 * g.a.w, 6.0 * g.a.w, boxSd(l, ge.xy, ge.z))));
  }
  let fadeIn = smoothstep(0.6, 2.6, g.st.w) * (1.0 - 0.85 * m.b) * g.w.w * (1.0 + 0.6 * stamp);
  var col: vec3f;
  var conc = 0.0;
  let h = 4.0 * o + 2.0; // halo: a wider look at the same trail
  let halo4 = 0.25 * (textureSampleLevel(trail, samp, (p + vec2f(-h, -h)) * tp, 0.0) + textureSampleLevel(trail, samp, (p + vec2f(h, -h)) * tp, 0.0)
                    + textureSampleLevel(trail, samp, (p + vec2f(-h, h)) * tp, 0.0) + textureSampleLevel(trail, samp, (p + vec2f(h, h)) * tp, 0.0));
  var localInk = 0.0;
  if (jmode) {
    // The J desk: warm paper, ink as dye (Beer-Lambert absorbance per channel), denser where the paper's tooth takes it.
    col = g.bg.rgb * (1.0 + (gr.x - 0.5) * 0.07 + (gr.y - 0.5) * 0.05) * (1.0 - 0.05 * dot(vq, vq));
    let T = inkJ(t4, gr.y, fadeIn);
    col *= T;
    localInk = 1.0 - (T.r + T.g + T.b) / 3.0;
    col *= exp(-g.k.xyz * m.r * (0.93 + 0.14 * gr.y));
    col = inked(col, DARK, m.g);
    conc = localInk;
  } else if (spectrum) {
    // Dark surface, glowing veins: each vein carries its card's hue, added like light, with a soft halo around it.
    let core = pow(clamp(a * g.f.z, 0.0, 1.0), g.f.w) * fadeIn;
    let haloA = pow(clamp(halo4.a * g.f.z, 0.0, 1.0), 1.5) * g.st.z * fadeIn;
    col = g.bg.rgb * (1.0 - 0.25 * dot(vq, vq)) + (t4.rgb / max(a, 1e-4) * core + halo4.rgb / max(halo4.a, 1e-4) * haloA) * g.st.y;
    col = mix(col, vec3f(0.86), max(m.r, m.g)); // the name and tagline, if this page has them, in light ink
    conc = core;
  } else {
    col = bare(gr, vq); // paper grain: the paper's own texture (K8's at 0.16), and how unevenly it takes ink
    // Ink: opacity scales its strength (1 = the ink color at full density), glow darkens dense vein cores, halo bleeds a
    // soft wash of ink around the veins. Each pixel's ink color comes from the trail, so card inks mix like dye.
    let tooth = 1.0 - 0.5 * g.z.y + g.z.y * gr.y;
    let d0 = clamp(a * g.f.z, 0.0, 1.0);
    conc = pow(d0, g.f.w) * (1.0 + g.st.y * smoothstep(0.35, 0.95, d0)) * tooth * fadeIn;
    let concH = pow(clamp(halo4.a * g.f.z, 0.0, 1.0), 1.4) * g.st.z * 0.45 * tooth * fadeIn;
    let inkA = select(g.n.xyz, t4.rgb / max(a, 1e-4), a > 1e-3);
    let inkH = select(g.n.xyz, halo4.rgb / max(halo4.a, 1e-4), halo4.a > 1e-3);
    col *= exp(-inkA * conc - inkH * concH);
    col *= exp(-g.k.xyz * m.r * (0.93 + 0.14 * gr.y));
    col = inked(col, DARK, m.g); // the tagline
  }

  var cards = tm.x;
  while (cards != 0u) { // on-screen cards that can reach this tile, bottom to top
    let j = firstTrailingBit(cards); cards &= cards - 1u;
    let k = u32(g.ord[j / 4u][j % 4u]);
    let c = g.cards[k];
    let lift = c.geo.w;
    if (distance(p, c.flat.xy) > c.bound.x + (40.0 + 60.0 * lift) * s * max(g.u.x, 1.0)) { continue; }
    let lp = toLocal(c, p);
    let d = boxSd(lp, c.geo.xy, c.geo.z) * c.misc.x;
    if (jmode) {
      // J: a contact shadow from local ink density (ink pools against the edge), plus a soft shadow while lifted.
      if (d > -1.0) {
        let dd = max(d, 0.0) / s;
        let contact = (exp(-dd / 1.1) * (0.13 + 0.45 * localInk) + exp(-dd / (3.0 + 6.0 * localInk)) * (0.04 + 0.3 * localInk)) * (1.0 - min(lift * 2.5, 1.0));
        var ls = 0.0;
        if (lift > 0.001) { let b = (2.0 + 20.0 * lift) * s; ls = shadow(c, p, vec2f(0.35, 1.0) * c.misc.w * 1.3, b) * 0.24 * lift; }
        col *= (1.0 - contact) * (1.0 - ls);
      }
    } else {
      // A paper card's soft drop shadow: a tight contact line plus a wide, faint ambient one that grows as it lifts.
      let near = shadow(c, p, vec2f(0.0, (0.6 + 2.0 * lift) * s), (1.2 + 3.0 * lift) * s * g.u.x) * (0.09 + 0.08 * conc) * (1.0 - 0.6 * lift) * g.u.y;
      let far = shadow(c, p, vec2f(0.25, 1.0) * (5.0 + 16.0 * lift) * s, (14.0 + 22.0 * lift) * s * g.u.x) * (0.06 + 0.1 * lift) * g.u.y;
      col *= (1.0 - near) * (1.0 - far);
    }
    let cov = clamp(0.5 - d / q, 0.0, 1.0);
    if (cov > 0.0) {
      var un = lp / (2.0 * c.geo.xy) + 0.5;
      let back = c.bound.y < 0.0;
      if (back) { un.x = 1.0 - un.x; } // seen from behind, so the back texture reads the right way round
      var cc = pow(textureSampleLevel(atlas, samp, mix(select(c.uv.xy, c.buv.xy, back), select(c.uv.zw, c.buv.zw, back), un), 0.0).rgb, vec3f(2.2));
      ${video ? `if (!back && f32(k) == g.v.x && g.v.y > 0.0) {
        let mu = (un - c.media.xy) / (c.media.zw - c.media.xy);
        if (all(mu >= vec2f(0.0)) && all(mu <= vec2f(1.0))) {
          let vuv = g.vu.xy + mu * g.vu.zw;
          // Video YUV->RGB can land slightly outside [0, 1] (limited-range blacks); pow() of a negative is undefined and
          // showed up as inverted colors. Clamp each frame, then crossfade in linear light.
          let ra = textureSampleBaseClampToEdge(vidA, samp, vuv).rgb;
          let rb = textureSampleBaseClampToEdge(vidB, samp, vuv).rgb;
          let la = pow(clamp(ra, vec3f(0.0), vec3f(1.0)), vec3f(2.2));
          let lb = pow(clamp(rb, vec3f(0.0), vec3f(1.0)), vec3f(2.2));
          cc = mix(cc, mix(la, lb, clamp(g.v.z, 0.0, 1.0)), clamp(g.v.y, 0.0, 1.0));
          ${qs.has('vdebug') ? 'if (any(ra < vec3f(0.0)) || any(rb < vec3f(0.0)) || any(ra > vec3f(1.0)) || any(rb > vec3f(1.0))) { return vec4f(1.0, 0.0, 1.0, 1.0); }' : ''}
        }
      }` : ''}
      let mu = (un - c.media.xy) / max(c.media.zw - c.media.xy, vec2f(1e-5));
      if (!back && c.media.z > 0.0 && all(mu >= vec2f(0.0)) && all(mu <= vec2f(1.0))) {
        let ms = (c.media.zw - c.media.xy) * c.geo.xy * 2.0 / s; // media size, CSS px
        let edge = min(min(mu.x, 1.0 - mu.x) * ms.x, min(mu.y, 1.0 - mu.y) * ms.y);
        // Full color: while the card's clip shows (a card with clips), or while hovered (a still).
        let color = select(c.misc.y, select(0.0, g.v.y, f32(k) == g.v.x), c.inv0.w > 0.5);
        cc = printed(cc, gr, edge, color);
      }
      cc *= (1.0 + (gr.y - 0.5) * 0.03) * (0.82 + 0.18 * c.bound.w) * select(1.0, 0.9, spectrum); // a turning card catches less light; on the dark surface cards sit a touch dimmer
      if (jmode) {
        // J: ink runs under the card and shows through as a light stain, soaking in harder along the border's fibers;
        // over captions it stays faint so the text reads. A lifted card is above the ink and comes away clean.
        let band = 1.0 - smoothstep(0.0, g.jq.y * (0.35 + 1.3 * gr.y), max(-d, 0.0));
        let onMedia = all(un >= c.media.xy) && all(un <= c.media.zw);
        cc *= pow(inkJ(t4, gr.y, fadeIn), vec3f(mix(g.jq.x * select(0.35, 1.0, onMedia), 0.6, band) * (1.0 - lift)));
      }
      col = mix(col, cc, cov);
    }
  }
  // This page's folded corner, over a sliver of the next page and the edges of the pages below.
  col = rolled(pd, bare(gr, vq) * stacked(pd, 1.0), col, false, g.dr, g.la);
  // A page turn: the page you left (its frozen last frame) rolls away over this one. What it uncovers fades from the bare
  // paper the resting corner shows to this page as the fold opens (the same 250 px as the stacked edges), so the sliver
  // never switches in one frame, at the start or when a turn by hand falls back.
  if (g.pg.w > 0.5) { col = rolled(pd, mix(col, bare(gr, vq), g.lb.w) * stacked(pd, g.lb.w), pow(textureLoad(frozen, ip, 0).rgb, vec3f(2.2)), true, g.cu, g.lt); }
  var outc = vec4f(pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
  if (g.pg.z > 0.0) { outc = mix(outc, textureLoad(frozen, ip, 0), g.pg.z); } // crossfade from the frame before a sim resolution change
  return outc;
}`;

// ---------- page ----------

const body = root;
const canvas = root.querySelector('#field');
const nameEl = root.querySelector('.name');
const taglineEl = root.querySelector('.tagline');
const linksEl = root.querySelector('.links');
const regionLabel = root.querySelector('.region-label');
const pageEl = root.querySelector('#page');
const doorEl = root.querySelector('.door');
const hud = qs.has('hud') ? body.appendChild(Object.assign(document.createElement('div'), { className: 'hud' })) : null;

// Each page's deck; cards without a data-slot (more than the hand-placed slots) start in it.
const DECK_LABEL = { pile: 'Deck: draw a card (double-click to gather or deal)', box: 'Card box: double-click or press Enter to put every card back' };
{
  const list = pageEl.querySelector('.sources');
  for (const region of ['main', 'research']) { // every page has a deck for its cards, and a card box (its body and its lid) for when it is empty
    list.insertAdjacentHTML('beforeend', `<li class="src deck more" data-key="deck-${region}" data-region="${region}" data-slot="0,0,170,0" data-order="99"><div class="hit" role="button" tabindex="0" aria-label="${DECK_LABEL.pile}"></div></li>`);
    list.insertAdjacentHTML('beforeend', `<li class="src deck lid" data-key="lid-${region}" data-region="${region}" data-slot="0,0,40,0" data-order="98" aria-hidden="true"><div class="hit"></div></li>`);
  }
}
const sources = [...root.querySelectorAll('.src')].map((el, id) => {
  const d = el.dataset;
  const [sx, sy, sw, sr] = (d.slot || `0,0,${d.w || 260},0`).split(',').map(Number); // no slot: an overflow card
  const backEl = el.querySelector('.back');
  const kind = ['deck', 'note', 'polaroid', 'paper'].find((k) => el.classList.contains(k)) || 'photo';
  return {
    id, el, hit: el.querySelector('.hit'), img: el.querySelector('img'), key: d.key, kind,
    // Back of the card: optional title, paragraphs, and link buttons, straight from the DOM.
    backEl, backTitle: backEl?.querySelector('b')?.textContent, backParas: backEl ? [...backEl.querySelectorAll('p')].map((x) => x.textContent) : null,
    region: d.region === 'research' ? 1 : 0, featured: !!d.slot && !el.classList.contains('deck'), hueHex: d.hue || '888888', // the card's own hue (spectrum style)
    inkHex: d.ink, emit: 0, // the card's own ink (paper style), emitted while the card is open
    jinkHex: d.jink, still: d.still, // the J desk's ink for this card; an explicit still (a paper figure) that clips.json does not replace
    backLinks: backEl ? [...backEl.querySelectorAll('a')] : null, flip: 0, flipTo: 0,
    frame: (d.frame || '1,0.5,0.5').split(',').map(Number), // zoom, then where the crop sits (like object-position)
    // focus: the framing option's zoom and crop on the picture's subject, for the poster and the clips alike (so the
    // hover fade stays seamless)
    baseFrame: (d.frame || '1,0.5,0.5').split(',').map(Number), focus: d.focus ? d.focus.split(',').map(Number) : null,
    slot: d.slot ? { x: sx, y: sy, w: sw, r: sr } : null, baseW: sw, order: +d.order, more: el.classList.contains('more'), lid: el.classList.contains('lid'),
    overflow: !d.slot && !el.classList.contains('deck'), inDeck: !d.slot && !el.classList.contains('deck'), aspect: kind === 'photo' ? POSTCARD : +(d.aspect || 1), shape: +(d.shape || 1.5), // width / height: every card keeps its own shape, its longest side at the shared cap videoSrc: d.video,
    x: 0, y: 0, w: 0, h: 0, rot: sr, home: sr, vx: 0, vy: 0, lift: 0, liftV: 0, tilt: [0, 0], tiltV: [0, 0], sway: 0, swayV: 0,
    hover: 0, hoverOn: false, burst: 0, z: id, dragging: false, released: false,
    // Landing: landK is set for the one sim step that bursts, landS is how hard it last landed, rel the seconds since then
    // (< 0 while flying in, so its held agents wait; 1e3 once their release is over).
    landK: false, landS: 1, rel: 1e3, flying: false, flyLift: 0,
  };
});

let view = { w: innerWidth, h: innerHeight, phone: innerWidth < PHONE, k: 1, docH: innerHeight, dpr: 1 };
let nameBox = null; // CSS px: { x, baseline, size }

// Card geometry in CSS px. Media rect is where the image (or video) sits.
// The card box, a little bigger than a postcard all round so a card inside it is hidden; its lid lies open beside it.
// The box fits its page's largest upright card with room all round (design px of the page's pile, d.pile).
const boxSize = (s) => { const p = pageDeck(s.region).pile; return s.lid ? [Math.round(p.ph * 0.13), p.ph + 12] : [p.pw + 14, p.ph + 12]; };
function cardBox(s, w, h = s.kind === 'polaroid' || s.kind === 'note' ? 0 : Math.round(w / POSTCARD)) {
  if (s.kind === 'deck') return { w, h, media: null }; // the deck's spot (the box's size), or the box's lid
  if (s.kind === 'note') {
    const lines = wrapLines(s.hit.innerText.replace(/\n/g, ' \n '), w - 32, HAND);
    return { w, h: h || 28 + lines.length * 26.5, media: null, lines }; // the one card size, or (phones) as tall as its words
  }
  if (s.kind === 'paper') {
    const lines = wrapLines(s.hit.querySelector('b').textContent, w - 39, '600 16px Inter');
    return { w, h: 16 + lines.length * 21.5 + 6 + 17 + 16, media: null, lines, sub: s.hit.querySelector('small').textContent };
  }
  if (s.kind === 'polaroid' && h) { // a polaroid at its capped size: the photo, then its wide bottom strip
    return { w, h, media: { x: 8, y: 8, w: w - 16, h: h - 8 - 36 } };
  }
  if (s.kind === 'polaroid') {
    const mw = w - 16;
    return { w, h: 8 + mw / s.aspect + 36, media: { x: 8, y: 8, w: mw, h: mw / s.aspect } }; // its caption grows into the strip with the type
  }
  // A postcard: the picture takes what the caption leaves (a long title wraps), cover-framed.
  const mw = w - 12;
  const [title, sub] = [s.el.querySelector('.cap b').textContent, s.el.querySelector('.cap span').textContent];
  const m = measure();
  m.font = font(600); const tw = m.measureText(title).width;
  m.font = font(400); const sw = m.measureText(sub).width;
  const oneLine = tw + sw + 14 < mw - 4;
  const titleLines = oneLine ? [title] : wrapLines(title, mw - 4, font(600)); // long titles wrap
  return { w, h, media: { x: 6, y: 6, w: mw, h: h - 6 - (oneLine ? 14 + 18 * TS : 13 + (titleLines.length + 1) * 18 * TS) }, title, titleLines, sub, oneLine };
}
// Every card keeps its own shape (data-shape, width / height) with its longest side at one shared cap (T.cardMax on the
// reference desk), so all share one scale and sharpness; the sticky note keeps its own size. (Clark, 2026-11-23, replacing
// the one card size.)
const capped = (s) => s.kind === 'photo' || s.kind === 'polaroid';
const cappedDims = (s, cap) => (s.shape >= 1 ? [cap, cap / s.shape] : [cap * s.shape, cap]);
// Each page's pile, upright: as wide as its widest card's short side and as tall as its longest long side (design px).
function pileSizes() {
  for (const d of sources) if (d.more) {
    const cards = sources.filter((s) => s.region === d.region && decked(s)), k = view.cs || 1;
    d.pile = { pw: Math.max(1, ...cards.map((s) => Math.min(s.w, s.h) / k)), ph: Math.max(1, ...cards.map((s) => Math.max(s.w, s.h) / k)) };
  }
}
// The polaroid and the note keep their own shapes, one size for both faces: the front's own size when the back's copy
// fits on it at the shared type scale; otherwise the polaroid becomes the smallest card (up to maxW wide) that fits it,
// its image cropped (cover framing) to at most 25% wider or taller than its own aspect, and the note grows taller.
function fitCard(s, w0, maxW = Math.round(w0 * 1.5)) {
  const box = cardBox(s, w0);
  if (!s.backEl || backLayout(s, box).need <= box.h) return box;
  if (!s.media) return { ...box, h: backLayout(s, box).need };
  let best = null;
  for (let w = w0; w <= maxW; w += 2) {
    const b = cardBox(s, w), chrome = b.h - b.media.h, mw = b.media.w;
    const mh = Math.max(backLayout(s, b).need - chrome, mw / (s.aspect * 1.25));
    if (mh > (mw * 1.25) / s.aspect) continue; // the image would be cropped too narrow
    if (!best || w * (chrome + mh) < best.w * best.h) best = { ...b, h: chrome + mh, media: { ...b.media, h: mh } };
  }
  if (best) return best;
  const b = cardBox(s, maxW), extra = backLayout(s, b).need - b.h; // last resort: as wide as allowed, then taller
  return extra > 0 ? { ...b, h: b.h + extra, media: { ...b.media, h: b.media.h + extra } } : b;
}
let measureCtx = null;
const measure = () => (measureCtx ||= new OffscreenCanvas(8, 8).getContext('2d'));
function wrapLines(text, maxW, font) {
  const m = measure(); m.font = font;
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    if (word === '\n') { out.push(line.trim()); line = ''; continue; }
    const test = line ? line + ' ' + word : word;
    if (m.measureText(test).width > maxW && line) { out.push(line.trim()); line = word; } else line = test;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function layout() {
  endFlights(true); // a new layout puts every card in its slot (piles are made again below)
  for (const s of sources) s.frame = T.framing && s.focus ? s.focus : s.baseFrame;
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const phone = vw < PHONE;
  body.classList.toggle('phone', phone);
  body.classList.toggle('desk', !phone);
  view = { ...view, w: vw, h: vh, phone };
  if (!phone) {
    const k = clamp(Math.min(vw / REF_W, vh / REF_H), 0.62, 1.35);
    view.k = k; view.docH = vh;
    nameBox = { x: 54 * k, baseline: 46 * k + 60 * k * 0.8, size: 60 * k };
    // Sizes are set at full scale (design px); a smaller card scale shows every card that much smaller, the same in a
    // deck and on the desk, and keeps the layout's composition (slots are fractions of the desk).
    const c = clamp(T.cardScale, 0.6, 1);
    // The sizes are the full-scale ones with the backs as they are by default (title on, usual spacing), so the scale is
    // always relative to the same card; the back options only change what fits on it.
    const opts = { backTitle: T.backTitle, backTight: T.backTight };
    Object.assign(T, { backTitle: 1, backTight: 0 }); TS = 1;
    const fixed = new Map(sources.filter((s) => !capped(s) && s.kind !== 'deck').map((s) => [s, fitCard(s, Math.round(((s.slot?.w ?? s.baseW) * k) / c))]));
    Object.assign(T, opts); TS = Math.max(1, 12 / (TOK.fs * c)); view.cs = c;
    // The longest side (design px) scales with the desk like the layout, but never below the smallest at which every back fits.
    const fitsAt = (cp) => sources.every((s) => !capped(s) || !s.backEl || ((b) => backLayout(s, b).need <= b.h)(cardBox(s, ...cappedDims(s, cp))));
    let lo = 120, hi = 900; while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fitsAt(mid)) hi = mid; else lo = mid; }
    const cap = Math.max((T.cardMax * k) / c, Math.ceil(hi));
    for (const s of sources) if (s.kind !== 'deck') { const box = capped(s) ? cardBox(s, ...cappedDims(s, cap)) : fixed.get(s); Object.assign(s, box, { k: c, w: box.w * c, h: box.h * c }); }
    pileSizes();
    for (const s of sources) {
      if (s.kind === 'deck') { const box = cardBox(s, ...boxSize(s)); Object.assign(s, box, { k: c, w: box.w * c, h: box.h * c }); }
      if (s.slot) { [s.x, s.y, s.rot] = homeOf(s); s.home = s.rot; } // cards without a slot wait on their deck
    }
    placeDecks();
    for (const s of sources) if (!s.slot && s.kind !== 'deck' && dealing) { const d = pageDeck(s.region); Object.assign(s, { x: d.x, y: d.y, rot: d.rot }); } // a card without a slot waits on its deck
    for (const r of [0, 1]) pileUp(r); // each deck holds its page's cards that are not on the desk
  } else {
    const pad = 22;
    view.labelY = 0;
    nameBox = { x: pad, baseline: 30 + 44 * 0.8, size: 44 };
    let y = 0;
    const full = Math.min(vw - 32, 380);
    TS = 1; view.cs = 1; for (const s of sources) s.k = 1; // phones show cards at full size, the cap the column's width
    for (const s of sources) if (capped(s)) Object.assign(s, cardBox(s, ...cappedDims(s, full)));
    pileSizes();
    for (const s of sources) if (s.kind === 'deck') Object.assign(s, cardBox(s, ...boxSize(s))); // phones scroll to research: no decks
    placeDecks();
    const order = [...sources].filter((s) => s.kind !== 'deck').sort((a, b) => a.order - b.order);
    for (const [i, s] of order.entries()) {
      if (s.region && !view.labelY) { view.labelY = y + 10; y += 56; } // research becomes a section further down
      const w = Math.round(s.kind === 'note' || s.kind === 'paper' ? Math.min(full * 0.82, 280) : full);
      if (!capped(s)) Object.assign(s, fitCard(s, w, full));
      s.rot = s.home = (s.slot?.r ?? 0) * 0.7;
      s.px = vw / 2 + (i % 2 ? 1 : -1) * Math.min(14, (vw - w) / 4);
      s.py = y + s.h / 2; y += s.h + 30;
    }
    view.cardsH = y;
  }
  // Text blocks.
  Object.assign(nameEl.style, { left: nameBox.x + 'px', top: nameBox.baseline - nameBox.size * 0.8 + 'px', fontSize: nameBox.size + 'px' });
  const tagTop = nameBox.baseline + nameBox.size * 0.3;
  Object.assign(taglineEl.style, { left: nameBox.x + 6 + 'px', top: tagTop + 'px', maxWidth: (phone ? view.w - 2 * nameBox.x - 6 : 390 * view.k) + 'px' });
  if (phone) {
    const tb = taglineEl.getBoundingClientRect();
    const linksTop = tagTop + tb.height + 14;
    Object.assign(linksEl.style, { left: nameBox.x + 6 + 'px', top: linksTop + 'px', maxWidth: view.w - 2 * nameBox.x + 'px' });
    const top = linksTop + linksEl.getBoundingClientRect().height + 36;
    for (const s of sources) { s.x = s.px ?? -1e4; s.y = (s.py ?? 0) + top; }
    Object.assign(regionLabel.style, { left: nameBox.x + 6 + 'px', top: top + view.labelY + 'px' });
    view.docH = Math.ceil(top + view.cardsH + 40);
    root.querySelector('#page').style.height = view.docH + 'px';
  } else {
    Object.assign(linksEl.style, { left: '', top: '', maxWidth: '' });
    root.querySelector('#page').style.height = '';
  }
  // Without the deal (no WebGPU, reduced motion) a card that would wait on its deck lies in the best free spot instead,
  // found once everything else (cards, name, tagline, links, corner) is in its final place on this layout.
  if (!phone && !dealing) for (const s of sources) if (s.overflow) {
    s.inDeck = false; s.slot = null;
    const [x, y, r] = freeSlot(s);
    s.slot = { x: ((x - s.region * view.w) / view.w) * REF_W, y: (y / view.h) * REF_H, w: s.baseW, r };
    Object.assign(s, { x, y, rot: r, home: r });
  }
  turn.on = false; clipLinks(); // a turn in progress just ends
  cam.x = view.phone ? 0 : regionFromUrl() * view.w; placePage(); setInert(regionFromUrl()); placeDoor();
  for (const s of sources) {
    if (s.media) {
      const [z, px, py] = s.frame, v = 1 / z;
      Object.assign(s.img.style, { height: s.media.h + 'px', objectPosition: `${px * 100}% ${py * 100}%`,
        objectViewBox: z > 1 ? `inset(${py * (1 - v) * 100}% ${(1 - px) * (1 - v) * 100}% ${(1 - py) * (1 - v) * 100}% ${px * (1 - v) * 100}%)` : '' });
    }
    if (!gpu && s.flipTo) paintDomBack(s); // the still fallback's open backs follow the new size
    placeDom(s);
  }
}

// The corner's DOM: its hit area and focus ring (a triangle over the fold, hovered or not), and without WebGPU the fold
// itself, drawn flat: the sliver underneath, the flap, and the label on it.
function placeDoor() {
  const k = view.k, c = T.cornerSize * k * Math.SQRT2, S = Math.ceil((2 * (T.cornerSize + T.cornerLift) - Math.PI * DOOR.R + 14) * k * Math.SQRT2);
  // The focus ring traces the folded corner at rest, 3 px out: the flap's edges out to its tip, and the page's edges.
  const m = 3, tip = S - ((2 * T.cornerSize - Math.PI * DOOR.R) * k) / Math.SQRT2 - m * Math.SQRT2;
  const svg = doorEl.querySelector('svg'), set = (sel, d) => svg.querySelector(sel).setAttribute('d', d);
  for (const [a, v] of [['width', S], ['height', S], ['viewBox', `0 0 ${S} ${S}`]]) svg.setAttribute(a, v);
  const ch = (T.cornerSize + T.cornerLift) * k * Math.SQRT2, tipH = S - ((2 * (T.cornerSize + T.cornerLift) - Math.PI * DOOR.R) * k) / Math.SQRT2;
  set('.hit', `M${S} ${S - ch}L${tipH} ${tipH}L${S - ch} ${S}H${S}Z`); // the pointer's area: the fold as drawn when hovered (the sliver and the flap), not the larger triangle
  set('.ring', `M${S - m} ${S - c - m}L${tip} ${tip}L${S - c - m} ${S - m}H${S - m}Z`);
  // Without WebGPU the fold itself, flat, from the corner's state: it lifts and leans toward the pointer like the drawn one
  // (the sliver under it, the flap reflected over the fold, the label printed on the flap).
  const d = door.d || T.cornerSize * k, a = door.a, [dx, dy] = dirOf(a), far = 2 * d - Math.PI * DOOR.R * k;
  const B = [S - d / Math.cos(a), S], Rt = [S, S - d / Math.sin(a)], tipF = [S + far * dx, S + far * dy], P = (q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  set('.sliver', `M${P(Rt)}L${S} ${S}L${P(B)}Z`); set('.flap', `M${P(Rt)}L${P(tipF)}L${P(B)}Z`);
  const t = svg.querySelector('text'), at = far - (T.cornerSize - Math.PI * DOOR.R - 4 - 12) * k, cx = S + at * dx, cy = S + at * dy;
  Object.assign(t.style, { fontSize: T.cornerLabel * k + 'px' });
  for (const [n, v] of [['x', cx], ['y', cy], ['transform', `rotate(${(-45 - (2 * (a - Math.PI / 4) * 180) / Math.PI).toFixed(2)} ${cx} ${cy})`]]) t.setAttribute(n, v);
}
// No frame loop without WebGPU: the flat corner runs its own while it moves.
let flatDoor = 0;
function animateFlatDoor() {
  if (gpu || flatDoor || !body.classList.contains('nogpu')) return;
  let last = performance.now();
  const tick = (now) => {
    const d0 = door.d, a0 = door.a;
    stepDoor(Math.min(0.05, (now - last) / 1000)); last = now; placeDoor();
    flatDoor = Math.abs(door.d - d0) + Math.abs(door.a - a0) > 1e-3 ? requestAnimationFrame(tick) : 0;
  };
  flatDoor = requestAnimationFrame(tick);
}
// A card dragged over its deck turns face down (s.down) and, with it, toward the pile's angle (s.downTo).
const shownRot = (s) => (s.down > 0 && s.downTo != null ? lerp(s.rot, s.downTo, smooth(s.down)) : s.rot);
// The DOM box (hit area and focus ring) follows the drawn card: the same lift scale, landing squash, and the camera's
// perspective on a lifted card (cardUniform's f / (f - zh)); the 3D tilt is left out.
function placeDom(s) {
  const lift = Math.max(s.lift, s.flyLift || 0), sc = (1 + 0.035 * lift) * (1 - 0.014 * (s.squash || 0)) * (1800 / (1800 - lift * T.lift));
  const r = shownRot(s) + (s.sway * 180) / Math.PI, k = s.k || 1, w = s.w / k, h = s.h / k; // design px, scaled to the card scale
  s.el.style.width = w + 'px'; s.el.style.height = h + 'px';
  s.el.style.transform = `translate(${(s.x - w / 2).toFixed(2)}px, ${(s.y - h / 2).toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${(sc * k).toFixed(4)})`;
  if (s.ts !== TS) { s.ts = TS; s.el.style.setProperty('--ts', TS); } // the DOM still's captions take the same type
  s.el.style.zIndex = Math.round(s.z);
}

// ---------- color ----------

const absorbance = (ink) => ink.map((c, i) => -Math.log(Math.max(lin(c), 1e-4) / lin(PAPER[i])));

// ---------- interaction ----------

const cursor = { x: -1e4, y: -1e4, amt: 0 };
let topZ = sources.length, hovered = null;
// Focus: the background eases from sharp to soft while a card is hovered (like depth of field), and back after.
let focus = 0, focusAt = 0;

// One page shows at a time: the camera is at x = 0 for the main page and at the viewport width for research. A page turn
// moves it in one jump (the turning page covers the change).
const cam = { x: 0 };
const PATHS = ['/', '/publications']; // the desk, and research
const regionOf = (path) => { const i = PATHS.indexOf(path.replace(/(.)\/+$/, '$1')); return i < 0 ? null : i; };
const regionFromUrl = () => regionOf(location.pathname) ?? 0;
const WARM_STEPS = 150; // with reduced motion, a page you have not seen yet is formed before it is drawn
let page = 0, dest = 0; // the page you see, and the page you are on your way to
const NAMES = ['research', 'desk']; // written on each page's corner: where it leads
// Tab stays on the page you see: the other page's cards are inert (focusing one would scroll the desk sideways), and so
// are cards lying in a deck (face down, nothing to show; the deck itself is the way to them).
const inertFor = (s, region) => !view.phone && (s.region !== region || (s.inDeck && s.kind !== 'deck'));
const syncInert = () => { for (const s of sources) { const v = inertFor(s, page); if (s.el.inert !== v) s.el.inert = v; } };
const setInert = (region) => {
  for (const s of sources) s.el.inert = inertFor(s, region);
  doorEl.setAttribute('aria-label', region ? 'Back to the desk' : 'Go to research');
  doorEl.querySelector('text').textContent = NAMES[region];
};
function placePage() { pageEl.style.transform = view.phone ? '' : `translate3d(${(-cam.x).toFixed(2)}px, 0, 0)`; }
function drawStill() {
  const enc = gpu.device.createCommandEncoder();
  for (; sim.warm > 0; sim.warm--) { writeUniforms(gpu); encodeStep(enc); }
  writeUniforms(gpu);
  encodeRender(enc, gpu.ctx.getCurrentTexture().createView());
  gpu.device.queue.submit([enc.finish()]);
}
// Clear a page's ink and hold its agents, each for the nearest card about to land (cards with rel < 0): one sim step.
function holdPage(sm) {
  writeUniforms(gpu, sm, true);
  const enc = gpu.device.createCommandEncoder();
  encodeStep(enc, 'ad', null, sm, sm.n);
  gpu.device.queue.submit([enc.finish()]);
  sm.t = Math.max(sm.t, 4.5); sm.warm = 0; // nothing to fade in or catch up: the ink shows from its first deposit
}

// ---------- the page corner and the page turn ----------
// Each page's bottom-right corner (where a notebook page turns) is folded back a little, like a notebook page: under it a sliver of the next page and the
// edges of the pages below, and on the fold, in pen, the other page's name. Hovering lifts it a little more, leaning
// toward the pointer. Click (or Enter) turns the page: this page's cards gather into its pile, then the whole page (its
// last frame, frozen) rolls away from the corner and off the screen, over the other page, live underneath, which then
// deals its cards to their homes. Dragging the corner turns it by hand: let go past halfway and it completes, else it
// falls back.
const DOOR = { R: 3.5, lean: 0.3, rMax: 60 }; // CSS px at k = 1: the roll's radius at rest; how far the fold leans toward the pointer; the roll's radius late in a turn (the fold's distance from the corner at rest and the hover lift are T.cornerSize and T.cornerLift)
const door = { amt: 0, d: 0, a: Math.PI / 4, hover: false, at: null, press: null }; // a: the fold's direction from the corner (rad above the bottom edge); amt: 0 to 1 as a page's corner folds back
const turn = { on: false, mode: '', t: 0, dur: 1, d0: 0, d1: 0, d: 0, start: 0, target: 0, a: Math.PI / 4, from: 0, to: 0 };
const dirOf = (a) => [-Math.cos(a), -Math.sin(a)]; // from the bottom-right corner, up and left
const rollR = (d) => view.k * clamp(DOOR.R + 0.06 * (d / view.k - T.cornerSize), DOOR.R, DOOR.rMax); // the roll widens as the page turns further
const span = (a) => view.w * Math.cos(a) + view.h * Math.sin(a); // from the corner to the far corner, along the fold's direction
const farD = (a) => span(a) + (Math.PI / 2) * DOOR.rMax * view.k + 8; // the fold's distance once the page is all off screen
const restD = (hover) => view.k * (T.cornerSize + (hover ? T.cornerLift : 0));
// The fold leans a little toward the pointer, between 25 and 65 degrees.
const leanTo = (x, y) => clamp(Math.PI / 4 + DOOR.lean * (Math.atan2(view.h - y, Math.max(view.w - x, 1)) - Math.PI / 4), 0.44, 1.13);
function stepDoor(dt) {
  if (!turn.on) door.amt = Math.min(1, door.amt + dt / 0.5); // a page's corner folds back once it is shown
  doorEl.classList.toggle('folding', turn.on || door.amt < 1); // no focus ring around a fold that is not there (mid-turn, folding back)
  doorEl.classList.toggle('flat', (turn.on && turn.mode !== 'drag') || (!turn.on && door.amt < 0.5)); // no pointer, and clicks pass through, while no corner is drawn
  const e = 1 - Math.exp(-dt / 0.12);
  door.d += (restD(door.hover) * smooth(door.amt) - door.d) * e;
  door.a += ((door.hover && door.at ? leanTo(door.at.x, door.at.y) : Math.PI / 4) - door.a) * e;
}
const ARRIVE_AT = 0.25, DEAL_AT = 0.35; // the deck comes in this far into the turn, as the roll uncovers its spot, then deals; a turn by hand deals this far into its finish
const busy = () => turn.on || flights.on || !!door.press;
const turns = () => !!gpu && !reduced && !view.phone && sims.length > 1; // phones, reduced motion, and no WebGPU just show the other page
// The page you see, frozen as it was last drawn, but without its corner: the turn draws that, from the same fold.
function freeze(sm = sim) {
  capturing = true; writeUniforms(gpu, sm); capturing = false;
  const enc = gpu.device.createCommandEncoder();
  encodeRender(enc, shared.frozenTex[1 - shared.fz].createView(), null, sm);
  gpu.device.queue.submit([enc.finish()]);
  shared.fz = 1 - shared.fz; redraw = true;
}
function show(region) {
  for (const s of sources) if (s.player && s.player.state !== 'rest') { s.player.state = 'rest'; s.player.mix = 0; s.player.reset(); } // no decoding off-page
  videoSrc = null; videoMix = 0;
  if (sim) sim.ready = false; // the page you leave stops; it is warmed again before it next shows
  page = region; if (gpu) sim = sims[page];
  if (sim) sim.pre = false, sim.part = 0;
  cam.x = view.phone ? 0 : region * view.w; placePage(); setInert(region);
  tweakSync?.();
}
// The turn starts from the corner as it is (hovered, leaning). The other page comes up under it from bare paper, its
// cards in its pile; they are dealt as the turn settles (a turn by hand: once it is let go past halfway).
function startTurn(to, mode) {
  freeze();
  Object.assign(turn, { on: true, mode, from: page, to, t: 0, dur: T.turnS, d0: door.d, d: door.d, start: door.d, target: door.d, a: door.a, d1: farD(door.a) });
  show(to);
  const r = linksEl.getBoundingClientRect(); // where the links show on the main page
  turn.links = { left: r.left + (to ? view.w : 0), top: r.top, width: r.width, height: r.height };
  Object.assign(door, { amt: 0, d: 0, a: Math.PI / 4 }); // the new page's corner lies flat until the turn is over
  arriveDeck(to, mode === 'drag' ? 0 : ARRIVE_AT * T.turnS);
  drawFrom(to, { delay: mode === 'drag' ? Infinity : ARRIVE_AT * T.turnS + MOTION.settle, hold: false });
}
function stepTurn(dt) {
  if (!turn.on) return;
  if (turn.mode === 'drag') turn.d += (turn.target - turn.d) * (1 - Math.exp(-dt / 0.03));
  else {
    turn.t = Math.min(1, turn.t + dt / turn.dur);
    turn.d = lerp(turn.d0, turn.d1, turn.mode === 'auto' ? EASES[T.turnEase](turn.t) : 1 - (1 - turn.t) ** 3);
  }
  clipLinks();
  if (turn.mode === 'drag' || turn.t < 1) return;
  turn.on = false;
  clipLinks();
  if (turn.mode === 'back') { // fell back: the page you were on comes back to life as it was
    for (const s of sources) if (s.region === turn.to && s.rel < 0) s.rel = 1e3; // the other page's held agents let go
    show(turn.from);
    Object.assign(door, { amt: 1, d: turn.d, a: turn.a });
  } else pileUp(turn.from); // a page turned by hand leaves its cards on its pile
  next();
}
// The links (DOM, on the main page) turn with it: while a turn shows the main page they stay put on screen, clipped to
// where its paper shows. As it leaves: past the fold, but not under the flap (the sheet's corner, turned over the fold);
// as it comes back: behind the roll.
const clipPoly = (poly, f) => { // a convex polygon cut by a line, keeping f >= 0 (Sutherland-Hodgman, one plane)
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], a = f(p), b = f(q);
    if (a >= 0) out.push(p);
    if ((a >= 0) !== (b >= 0)) { const t = a / (a - b); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  });
  return out;
};
function clipLinks() {
  const st = linksEl.style;
  if (!turn.on || view.phone || (turn.from && turn.to)) { st.clipPath = st.translate = ''; return; }
  const out = turn.from === 0, [dx, dy] = dirOf(turn.a), R = rollR(turn.d), d = turn.d, { left: L, top: Tp, width: w, height: h } = turn.links;
  const X = ([u, v]) => dx * (L + u - view.w) + dy * (Tp + v - view.h); // from the page's corner along the fold's direction
  const box = [[0, 0], [w, 0], [w, h], [0, h]], fmt = (poly) => poly.map(([u, v]) => `${u.toFixed(1)} ${v.toFixed(1)}`).join(' L ');
  let path;
  if (!out) path = clipPoly(box, (p) => d - R - X(p));
  else {
    const shown = clipPoly(box, (p) => X(p) - d), page = [[-L, -Tp], [view.w - L, -Tp], [view.w - L, view.h - Tp], [-L, view.h - Tp]];
    // the flap: the part of the page within d - pi R of the corner, mirrored across the fold (x to 2d - pi R - x)
    const flap = clipPoly(page, (p) => d - Math.PI * R - X(p)).map((p) => { const m = 2 * d - Math.PI * R - 2 * X(p); return [p[0] + m * dx, p[1] + m * dy]; });
    let under = flap; // the flap over what shows: clipped by each edge of the convex region
    const area = shown.reduce((s2, p, i) => { const q = shown[(i + 1) % shown.length]; return s2 + p[0] * q[1] - q[0] * p[1]; }, 0);
    shown.forEach((p, i) => { const q = shown[(i + 1) % shown.length]; under = clipPoly(under, (r) => Math.sign(area) * ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))); });
    path = shown.length > 2 ? [shown, under] : [];
  }
  st.translate = out ? `${view.w}px 0` : '';
  const polys = (out ? path : [path]).filter((poly) => poly.length > 2);
  st.clipPath = polys.length ? `path(evenodd, '${polys.map((poly) => `M ${fmt(poly)} Z`).join(' ')}')` : 'polygon(0 0, 0 0, 0 0)';
}
// The corner by hand. A drag keeps the paper under the pointer: the flap moves twice as fast as the fold.
const hitEl = doorEl.querySelector('.hit');
hitEl.addEventListener('pointerenter', () => { door.hover = true; prewarm(1 - page); animateFlatDoor(); });
hitEl.addEventListener('pointermove', animateFlatDoor);
hitEl.addEventListener('pointerleave', () => { door.hover = false; animateFlatDoor(); });
hitEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !turns() || busy() || sources.some((s) => s.dragging)) return;
  door.press = { x: e.clientX, y: e.clientY, d: door.d, moved: false };
  hitEl.setPointerCapture(e.pointerId);
});
hitEl.addEventListener('pointermove', (e) => {
  const pr = door.press;
  if (!pr) return;
  if (!pr.moved) {
    if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 4) return;
    pr.moved = true; startTurn(1 - page, 'drag');
  }
  turn.a = leanTo(e.clientX, e.clientY);
  const [dx, dy] = dirOf(turn.a);
  turn.target = clamp(pr.d + ((e.clientX - pr.x) * dx + (e.clientY - pr.y) * dy) / 2, 0, farD(turn.a));
});
const letGo = () => {
  const pr = door.press;
  door.press = null;
  if (!pr?.moved) return;
  doorEl.dataset.dragged = '1'; // the click that follows is not a turn
  if (2 * turn.target - Math.PI * rollR(turn.target) > span(turn.a) / 2) { // the corner is past halfway: complete the turn
    const d1 = farD(turn.a), dur = clamp(T.turnS * (d1 - turn.d) / (d1 - turn.start), 0.3, T.turnS);
    Object.assign(turn, { mode: 'finish', t: 0, d0: turn.d, d1, dur });
    drawFrom(turn.to, { delay: DEAL_AT * dur, hold: false });
    dest = turn.to; record(turn.to);
  } else Object.assign(turn, { mode: 'back', t: 0, d0: turn.d, d1: restD(hitEl.matches(':hover')), dur: 0.4 });
};
hitEl.addEventListener('pointerup', letGo);
hitEl.addEventListener('pointercancel', letGo);
doorEl.addEventListener('click', (e) => {
  e.preventDefault();
  if (doorEl.dataset.dragged) { delete doorEl.dataset.dragged; return; }
  navigate(1 - dest);
});
// The address follows the page: research is /publications, and going back to the desk pops it (the back button turns back).
function record(to) {
  if (to === 1) router.push(PATHS[1] + location.search, { fromMain: true });
  else if (router.state()?.fromMain) history.back();
  else router.push(PATHS[0] + location.search);
}
function navigate(to) {
  const popped = to === 0 && router.state()?.fromMain; // the popstate it fires turns the page
  record(to);
  if (!popped) go(to);
}
addEventListener('popstate', () => { const r = regionOf(location.pathname); if (r != null) go(r); }); // not when leaving the desk
// Every page change: gather this page's cards, turn the page, deal the other's. One change at a time; the last asked for
// waits its turn.
let pendingNav = null;
function go(region) {
  dest = region;
  if (busy()) { pendingNav = region; return; }
  if (region === page) return;
  if (!turns()) { jump(region); return; }
  prewarm(region);
  const out = sources.filter((s) => s.region === page && decked(s) && !s.inDeck && !s.dragging);
  if (!out.length) { startTurn(region, 'auto'); return; }
  // The turn starts while the last cards are still landing (the page keeps drawing them as it turns).
  Object.assign(flights, { thenAt: gather(out, pageDeck(page)) + 0.5 * GATHER.dur, then: () => startTurn(region, 'auto') });
}
function next() {
  if (busy() || pendingNav == null) return;
  const n = pendingNav;
  pendingNav = null;
  go(n);
}
// Warming the other page: so a turn uncovers a page whose slime has its network, the hidden page steps once a frame
// (after the frame's own work, outside the quality check's timing) with its cards counted at home, while you hover the
// corner, during the gather, and once after the first visit's deal for a page never shown (its network forms from
// scattered agents, about 3 s of sim time). Otherwise only the page you see steps.
const WARM = { fresh: 180, again: 30 };
function prewarm(region) {
  const sm = sims[region];
  if (!turns() || !sm || sm === sim || sm.ready || sm.pre) return;
  Object.assign(sm, { pre: true, warm: Math.max(sm.warm, sm.t < 3 ? WARM.fresh : WARM.again) });
}
// Each warm-up step is spread over WARM_PARTS frames, its agents run in that many parts (the E pass with the first, the
// diffuse with the last; nothing else touches the hidden page between them, so it is the same step), so the hidden page
// adds a fraction of a step's GPU work to a frame instead of doubling the sim's.
const WARM_PARTS = 2;
function stepWarm() {
  const sm = sims.find((x) => x !== sim && x.pre);
  if (!sm) return;
  const part = sm.part || 0;
  if (!part && sm.warm-- <= 0) { Object.assign(sm, { pre: false, ready: true, warm: 0 }); return; }
  atHome(sm.page, () => writeUniforms(gpu, sm));
  const n = activeAgents(sm), from = Math.round((n * part) / WARM_PARTS), to = Math.round((n * (part + 1)) / WARM_PARTS);
  U[2] = to; U[78] = from; // G.a.z, G.pq.z
  gpu.device.queue.writeBuffer(gpu.uniform, 0, U);
  const enc = gpu.device.createCommandEncoder();
  encodeStep(enc, (part ? '' : 'e') + 'a' + (part === WARM_PARTS - 1 ? 'd' : ''), null, sm, to - from);
  gpu.device.queue.submit([enc.finish()]);
  sm.part = (part + 1) % WARM_PARTS;
}
// Without the turn the other page is just there, and the cards of the page you leave go home.
function jump(region) {
  if (view.phone) return;
  for (const s of sources) if (s.region === page && s.slot && !s.inDeck) { [s.x, s.y, s.rot] = homeOf(s); placeDom(s); }
  show(region);
  if (reduced && gpu && sim) drawStill(); // no frame loop with reduced motion: settle this page and draw it once
}
// Pointer position on the desk (CSS px), accounting for the camera on desktop and the scroll on phones.
const deskX = (e) => (view.phone ? e.pageX : e.clientX + cam.x);
const deskY = (e) => (view.phone ? e.pageY : e.clientY);

// The mouse pointer on screen (null when it is not over the page). Hover is derived from it every frame, so a missed
// pointerenter/leave (or one that fires before the media is ready) can never leave a card stuck.
let mouse = null;
addEventListener('pointermove', (e) => {
  cursor.x = deskX(e); cursor.y = deskY(e);
  if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY };
  door.at = { x: e.clientX, y: e.clientY };
  if (!e.target.closest?.('.src')) cursor.amt = 1;
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => (mouse = null), { signal });
function syncHover() {
  if (view.phone || probeKey || sources.some((o) => o.dragging)) return;
  const el = mouse && document.elementFromPoint(mouse.x, mouse.y)?.closest('.src');
  const over = el && sources.find((o) => o.el === el);
  for (const s of sources) setHover(s, s === over);
}

function setHover(s, on) {
  if (view.phone || s.hoverOn === on || (on && (s.flipTo || s.flying || s.kind === 'deck'))) return; // a deck does not lift: its pile or its box and lid stay together
  s.hoverOn = on;
  if (on && s.playlist && !s.player) makePlayer(s);
  if (on) { hovered = s; s.hoverSince = performance.now(); } else if (hovered === s) hovered = null;
}

for (const s of sources) {
  const hit = s.hit;
  hit.addEventListener('click', (e) => {
    e.preventDefault();
    if (s.suppressClick) { s.suppressClick = false; return; }
    if (s.flying) return;
    s.more ? deckClick(s, e) : flip(s);
  });
  if (s.more) { hit.addEventListener('focus', () => (s.focused = hit.matches(':focus-visible'))); hit.addEventListener('blur', () => (s.focused = false)); } // a tucked box comes out for the keyboard
  hit.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !s.flying) { e.preventDefault(); s.more ? deckClick(s, e) : flip(s); }
    else if (ARROWS[e.key] && T.keyMove && gpu && !view.phone && !s.flying && !s.dragging && s.kind !== 'deck') { e.preventDefault(); nudge(s, ARROWS[e.key], e.shiftKey); }
  });
  hit.addEventListener('pointerdown', (e) => {
    if (view.phone || !gpu || reduced || e.button !== 0 || s.flying || s.kind === 'deck') return; // decks stay at their edge // reduced motion: cards stay put (a click still flips)
    const press = { x: deskX(e), y: deskY(e), ox: s.x - deskX(e), oy: s.y - deskY(e), moved: false };
    hit.setPointerCapture(e.pointerId);
    let lt = performance.now();
    const move = (m) => {
      if (!press.moved && Math.hypot(deskX(m) - press.x, deskY(m) - press.y) < 4) return;
      if (!press.moved) { press.moved = true; s.dragging = true; s.released = false; s.shove = s.kb = null; s.bounced = s.edgePen = false; if (T.imprint) s.imp = { x: s.x, y: s.y, t: 0 }; s.z = ++topZ; s.el.classList.add('dragging'); }
      const now = performance.now(), dt = Math.max(1, now - lt) / 1000;
      const nx = deskX(m) + press.ox, ny = deskY(m) + press.oy;
      const k = 1 - Math.exp(-dt / 0.05);
      s.vx = lerp(s.vx, (nx - s.x) / dt, k); s.vy = lerp(s.vy, (ny - s.y) / dt, k);
      s.x = nx; s.y = ny; lt = now;
      // Over its page's deck, it turns face down to the deck back (it would go back on the pile), and turns up again
      // once it is dragged away; it counts as over once well inside, and as away only once clearly out, so it never
      // flickers at the edge. The pile lifts a little to take it.
      const deck = pageDeck(s.region), x = deskX(m), y = deskY(m);
      s.over = !!deck && decked(s) && !s.flip && !s.flipTo && !flights.on && !turn.on && (deck.mode === 'pile' || deck.phase === 'open') && overDeck(deck, x, y, (s.over ? 28 : -10) * view.k);
      if (deck) { // near the right edge or the deck's spot it calls a tucked box out (160 px in, 220 px to let go)
        const r = obb(s), ex = reach(r, [1, 0]), ey = reach(r, [0, 1]), q = obb({ ...deck, x: deck.spot }), qx = reach(q, [1, 0]), qy = reach(q, [0, 1]);
        const gap = Math.min((s.region + 1) * view.w - s.x - ex, Math.hypot(Math.max(0, Math.abs(s.x - deck.spot) - ex - qx), Math.max(0, Math.abs(s.y - deck.y) - ey - qy)));
        deck.near = decked(s) && gap < (deck.near ? 220 : 160) * view.k;
        s.downTo = deck.rot + upright(s); // face down over it, it also turns square with the pile
      }
      for (const o of sources) if (o === deck || (o.region === s.region && o.fly?.at === Infinity)) o.welcome = s.over;
    };
    const up = (ev) => {
      hit.removeEventListener('pointermove', move);
      const deck = press.moved && pageDeck(s.region), over = s.over && !flights.on;
      for (const o of sources) { o.welcome = false; if (o.more) o.near = false; }
      s.over = false;
      if (deck && over) { // let go over its deck: face down and square with the pile already, it slides straight on
        Object.assign(s, { dragging: false, suppressClick: true, rot: shownRot(s) }); s.el.classList.remove('dragging');
        collect(s, deck, now()); flights.on = true; stepFlights(0); return;
      }
      if (press.moved) {
        s.suppressClick = true; s.dragging = false; s.released = true; s.el.classList.remove('dragging');
        const keep = performance.now() - lt > 80 ? 0 : 0.35; // a little momentum, none if held still before letting go
        // It lands when it touches down: a gentle drop gives a small burst, a throw a bigger one. It keeps its own angle.
        s.dropS = 0.25 + (Math.hypot(s.vx, s.vy) * (keep ? 1 : 0)) / T.landThrow;
        s.vx *= keep; s.vy *= keep;
        if (!hit.matches(':hover')) setHover(s, false);
      }
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerup', up, { once: true });
    hit.addEventListener('pointercancel', up, { once: true });
  });
}

// Click turns a card over to its details (and back): it lifts, turns, and lays back down, a little differently turned
// each time (its slot's angle plus a fresh jitter, so nothing drifts), and lands. While it is off the desk it leaves the
// slime alone (no outline food).
function flip(s) {
  if (!s.backEl) return;
  s.flipTo = s.flipTo ? 0 : 1;
  s.hit.setAttribute('aria-expanded', String(!!s.flipTo));
  if (s.flipTo) { setHover(s, false); s.z = ++topZ; }
  // Gaussian around the card's home angle (Box-Muller): most flips land near it, a few tilt further; capped at maxAngle.
  const gauss = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  s.rotFrom = s.rot; s.rotTo = view.phone ? s.home : clamp(s.home + gauss * T.flipJitter, -T.maxAngle, T.maxAngle); // a phone's card nearly fills the screen's width: it lands as it lay
  if (!gpu || reduced) { // the still fallback and reduced motion just swap faces
    if (!gpu && s.flipTo) paintDomBack(s);
    s.flip = s.emit = s.flipTo; s.el.classList.toggle('flipped', !!s.flipTo); placeDom(s);
    if (gpu) drawStill();
  }
}

// Hover's clock: the card's own response and the background's focus ease in together, and let go a little faster.
const hoverTau = (rising) => Math.max(0.01, T.focusS / 3) * (rising ? 1 : MOTION.exit);
// Springs: lift rises while dragging, tilt leans toward velocity (max ~8 deg), released cards glide and settle.
function stepCards(dt) {
  const maxTilt = (T.tilt * Math.PI) / 180;
  for (const s of sources) {
    if (s.shove) stepShove(s, dt);
    else if (s.kb) stepKey(s, dt); // s.kb: where the keys are taking it
    else if (!s.dragging && !s.flying && s.kind !== 'deck') { // decks stay at their edge
      const f = Math.exp(-dt * 7);
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= f; s.vy *= f;
      const mx = s.w * 0.25, my = s.h * 0.25;
      const x0 = view.phone ? 0 : s.region * view.w; // cards stay on their own page
      if (T.edgeSoft && s.released && !view.phone) edgeSpring(s, x0, dt);
      else {
        if (s.x < x0 + mx || s.x > x0 + view.w - mx) { s.x = clamp(s.x, x0 + mx, x0 + view.w - mx); s.vx *= -0.4; }
        if (s.y < my || s.y > view.docH - my) { s.y = clamp(s.y, my, view.docH - my); s.vy *= -0.4; }
      }
    }
    const liftT = s.dragging ? 1 : s.welcome ? 0.35 : s.keyHeld ? 0.3 : s.hoverOn ? 0.1 : 0;
    if (s.over || s.down) s.down = clamp((s.down || 0) + (s.over ? dt : -dt) / MOTION.respond); // face down over the deck
    s.liftV += (170 * (liftT - s.lift) - 17 * s.liftV) * dt; s.lift = Math.max(0, s.lift + s.liftV * dt);
    let tx = 0, ty = 0;
    if (s.dragging) { tx = s.vx * 0.00045; ty = s.vy * 0.00045; const m = Math.hypot(tx, ty); if (m > maxTilt) { tx *= maxTilt / m; ty *= maxTilt / m; } }
    for (const [i, t] of [tx, ty].entries()) { s.tiltV[i] += (150 * (t - s.tilt[i]) - 9 * s.tiltV[i]) * dt; s.tilt[i] += s.tiltV[i] * dt; }
    const swayT = s.dragging ? clamp(s.vx * 0.00005, -0.05, 0.05) : 0;
    s.swayV += (120 * (swayT - s.sway) - 10 * s.swayV) * dt; s.sway += s.swayV * dt;
    s.hover = lerp(s.hover, s.hoverOn ? 1 : 0, 1 - Math.exp(-dt / hoverTau(s.hoverOn))); // the same clock as the focus
    if (s.flip !== s.flipTo) {
      s.flip = s.flipTo ? Math.min(1, s.flip + dt / T.flipS) : Math.max(0, s.flip - dt / (T.flipS * MOTION.exit)); // closing is quicker
      s.el.classList.toggle('flipped', s.flipTo === 1 && s.flip >= 1); // the real links (their hover wash and focus ring) only once the back lies at rest: mid-flip they would float off the turning card
      // It eases into its new angle as it lays down (the last 22% of the turn), so it lands at the final angle.
      s.rot = lerp(s.rotFrom, s.rotTo, smooth(s.flipTo ? (s.flip - 0.78) / 0.22 : (0.22 - s.flip) / 0.22));
      if (s.flip === s.flipTo) { land(s, 1); placeDom(s); } // laid down
    }
    // An open card emits its ink: it ramps up while open and fades back to the shared ink slowly after closing.
    s.emit = s.flipTo ? Math.min(1, s.emit + dt / T.emitIn) : Math.max(0, s.emit - dt / T.emitOut);
    if (s.rel >= 0 && s.rel < 1e3 && (s.rel += dt) > T.landRelease + 0.5) s.rel = 1e3; // its held agents have all left
    if (s.squash || s.squashV) { // landing settle: a small damped squash
      s.squashV += (-260 * s.squash - 16 * s.squashV) * dt; s.squash += s.squashV * dt;
      if (Math.abs(s.squash) + Math.abs(s.squashV) < 1e-3) s.squash = s.squashV = 0;
    }
    s.burst *= Math.exp(-dt * 7);
    if (s.imp && (s.imp.t += dt) >= IMPRINT_S) s.imp = null; // the veins have reclaimed it
    if (s.released && !s.kb && !s.edgePen && Math.abs(s.lift - liftT) < 0.04 && Math.hypot(s.vx, s.vy) < 60) {
      const k = s.bounced ? Math.min(s.dropS, 0.45) : s.dropS; s.released = false; s.bounced = false;
      if (!offCorner(s)) { land(s, k); shove(s); } } // touched down, shoving the cards under it (or sliding off the corner first)
  }
}


// Edges push back: a released card that runs past the screen's margin meets a stiff, well-damped spring (zeta 0.7) that
// turns it around; on the way back it is no faster than an ease-out onto the margin (83 ms), so it is not flung back
// across the desk. No hard stop anywhere: a card dragged off the edge glides back in the same way.
function edgeSpring(s, x0, dt) {
  const r = obb(s), ex = reach(r, [1, 0]), ey = reach(r, [0, 1]), m = 12 * view.k, k = 1600, c = 56, back = 12;
  const lo = x0 + ex + m, hi = x0 + view.w - ex - m, top = ey + m, bot = view.h - ey - m;
  const px = s.x < lo ? lo - s.x : s.x > hi ? hi - s.x : 0, py = s.y < top ? top - s.y : s.y > bot ? bot - s.y : 0;
  const push = (v, p) => { v += (k * p - c * v) * dt; return Math.sign(v) === Math.sign(p) ? Math.sign(p) * Math.min(Math.abs(v), Math.abs(p) * back) : v; };
  if (px) s.vx = push(s.vx, px);
  if (py) s.vy = push(s.vy, py);
  if (px || py) s.bounced = true;
  s.edgePen = Math.abs(px) + Math.abs(py) > 0.5; // it touches down only once it is back inside
}


// Keyboard moving: arrow keys nudge the focused card (Shift for bigger steps). It lifts a little and follows the keys
// closely; once they stop it comes down with the same settle and shove as a drop. With reduced motion it just moves.
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
function nudge(s, [dx, dy], big) {
  const step = (big ? 40 : 8) * view.k, x0 = s.region * view.w, r = obb(s), ex = reach(r, [1, 0]), ey = reach(r, [0, 1]), m = 12 * view.k;
  const k = s.kb || { tx: s.shove ? s.shove.tx : s.x, ty: s.shove ? s.shove.ty : s.y };
  k.tx = clamp(k.tx + dx * step, Math.min(x0 + ex + m, s.x), Math.max(x0 + view.w - ex - m, s.x)); // stays on screen
  k.ty = clamp(k.ty + dy * step, Math.min(ey + m, s.y), Math.max(view.h - ey - m, s.y));
  Object.assign(s, { kb: k, keyHeld: true, shove: null, vx: 0, vy: 0, dropS: 0.25 });
  if (s.z !== topZ) s.z = ++topZ;
  clearTimeout(s.keyTimer);
  s.keyTimer = setTimeout(() => { s.keyHeld = false; if (reduced) { s.kb = null; shove(s); drawStill(); } }, 300);
  if (reduced) { Object.assign(s, { x: k.tx, y: k.ty }); placeDom(s); drawStill(); } else s.released = true;
}
function stepKey(s, dt) {
  const k = s.kb, e = 1 - Math.exp(-dt / 0.06);
  s.x += (k.tx - s.x) * e; s.y += (k.ty - s.y) * e;
  if (!s.keyHeld && Math.hypot(k.tx - s.x, k.ty - s.y) < 0.5) Object.assign(s, { x: k.tx, y: k.ty, kb: null });
}

// ---------- landing ----------
// The one thing that happens whenever a card comes down onto the desk: the next sim step sends the agents under and just
// around it out through its edge with a burst of speed (scaled by strength), the ink there gets a pulse of excitation,
// the card settles with a small squash, and agents held for it (a page whose cards fly in) leave from its edge.
function land(s, strength) {
  const k = clamp(strength, 0.1, 1.5);
  // The squash starts as a push (velocity), not a jump: it dips to about min(1, k) within ~75 ms and springs back.
  Object.assign(s, { landK: true, landS: k, burst: Math.max(s.burst, k), squash: s.squash || 0, squashV: (s.squashV || 0) + 29 * Math.min(1, k) });
  if (s.rel < 0) s.rel = 0;
  if (s.shoveOnLand) { s.shoveOnLand = false; s.dropS = 0.3; shove(s); } // a drawn card that had to land on something
}


// ---------- shove ----------
// A dropped card shoves the cards it comes down on out of its way. Each is pushed straight away from its pusher's center
// just far enough to clear it (further after a throw), and a pushed card can push the next. Targets are solved once, at
// touch-down, kept on screen and clear of the name, tagline, and links; then each card slides there and lands softly.
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
function obb(s, x = s.x, y = s.y) {
  const a = (s.rot * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a);
  return { x, y, hw: s.w / 2, hh: s.h / 2, u: [c, n], v: [-n, c] };
}
const reach = (r, n) => r.hw * Math.abs(dot2(r.u, n)) + r.hh * Math.abs(dot2(r.v, n)); // half extent along axis n
// How far rectangle b must move along unit d to clear rectangle a by pad (separating axes); 0 if they do not overlap.
function clearance(a, b, d, pad) {
  let t = Infinity;
  for (const n of [a.u, a.v, b.u, b.v]) {
    const ca = a.x * n[0] + a.y * n[1], ra = reach(a, n) + pad, cb = b.x * n[0] + b.y * n[1], rb = reach(b, n);
    if (cb - rb >= ca + ra || cb + rb <= ca - ra) return 0;
    const dn = dot2(d, n);
    if (dn > 1e-3) t = Math.min(t, (ca + ra - cb + rb) / dn);
    else if (dn < -1e-3) t = Math.min(t, (cb + rb - ca + ra) / -dn);
  }
  return t;
}
// Boxes no shoved card may end on (desk px): the name, the tagline, and the links.
function keepOut(x0) {
  const p = 10 * view.k, out = [nameEl, taglineEl].map((el) => ({ l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight }));
  const lb = linksEl.getBoundingClientRect();
  out.push({ l: x0 + lb.left, t: lb.top, r: x0 + lb.right, b: lb.bottom });
  out.push(cornerBox(x0, 0));
  return out.map((b) => ({ l: b.l - p, t: b.t - p, r: b.r + p, b: b.b + p }));
}
// The page corner's square, out to its hovered fold's tip, padded by p.
function cornerBox(x0, p = 10 * view.k) {
  const c = (2 * (T.cornerSize + T.cornerLift) - Math.PI * DOOR.R) * view.k / Math.SQRT2 + p;
  return { l: x0 + view.w - c, t: view.h - c, r: x0 + view.w, b: view.h };
}
// A card that comes to rest over the page corner slides off it (the corner would fold over it and take its pointer).
function offCorner(s) {
  if (view.phone || s.kind === 'deck') return false;
  const x0 = s.region * view.w, [tx, ty] = placeable(s, s.x, s.y, x0, [cornerBox(x0)]), dist = Math.hypot(tx - s.x, ty - s.y);
  if (dist < 0.5) return false;
  s.shove = { fx: s.x, fy: s.y, tx, ty, dist, t: 0, dur: MOTION.settle };
  return true;
}
// A shoved card's spot, moved fully on screen (unless it already hung off) and then out of the text the shortest way.
function placeable(s, x, y, x0, boxes) {
  const r = obb(s), ex = reach(r, [1, 0]), ey = reach(r, [0, 1]), m = 12 * view.k;
  const onScreen = (px, py) => px - ex >= x0 + m - 0.5 && px + ex <= x0 + view.w - m + 0.5 && py - ey >= m - 0.5 && py + ey <= view.h - m + 0.5;
  x = clamp(x, Math.min(x0 + ex + m, s.x), Math.max(x0 + view.w - ex - m, s.x));
  y = clamp(y, Math.min(ey + m, s.y), Math.max(view.h - ey - m, s.y));
  for (const b of boxes) {
    if (Math.min(x + ex, b.r) <= Math.max(x - ex, b.l) || Math.min(y + ey, b.b) <= Math.max(y - ey, b.t)) continue;
    const opts = [[b.r + ex, y], [b.l - ex, y], [x, b.b + ey], [x, b.t - ey]].filter(([px, py]) => onScreen(px, py));
    if (opts.length) [x, y] = opts.reduce((p, q) => (Math.hypot(q[0] - x, q[1] - y) < Math.hypot(p[0] - x, p[1] - y) ? q : p));
  }
  return [x, y];
}
function shove(p) {
  if (!T.shove || view.phone) return;
  const x0 = p.region * view.w, pad = 6 * view.k, boxes = keepOut(x0);
  const m = T.shove * (1 + 0.8 * clamp(p.dropS - 0.25)); // dropS - 0.25 is the release speed over landThrow
  const at = (s) => (s.shove ? [s.shove.tx, s.shove.ty] : [s.x, s.y]);
  const others = sources.filter((s) => s !== p && s.region === p.region && !s.dragging && !s.flying && s.kind !== 'deck' && !s.inDeck);
  const pos = new Map([[p, [p.x + p.vx / 7, p.y + p.vy / 7]]]), depth = new Map([[p, 0]]); // p's resting spot
  let front = [p];
  for (let it = 0; it < 5 && front.length; it++) { // chains: whoever moved this pass pushes on the next
    const next = new Set();
    for (const a of front) {
      const [ax, ay] = pos.get(a), A = obb(a, ax, ay);
      for (const b of others) {
        if (b === a) continue;
        let [bx, by] = pos.get(b) || at(b);
        const l = Math.hypot(bx - ax, by - ay), d = l > 1e-3 ? [(bx - ax) / l, (by - ay) / l] : [0, 1];
        const t = clearance(A, obb(b, bx, by), d, pad);
        if (!t || !Number.isFinite(t)) continue;
        [bx, by] = placeable(b, bx + d[0] * t * m, by + d[1] * t * m, x0, boxes);
        pos.set(b, [bx, by]);
        if (!depth.has(b)) depth.set(b, depth.get(a) + 1);
        next.add(b);
      }
    }
    front = [...next];
  }
  for (const [b, [tx, ty]] of pos) {
    const dist = Math.hypot(tx - b.x, ty - b.y);
    if (b === p || dist < 0.5) continue;
    if (reduced) { Object.assign(b, { x: tx, y: ty }); placeDom(b); continue; } // no motion: it is just out of the way
    b.shove = { fx: b.x, fy: b.y, tx, ty, dist, t: -0.07 * (depth.get(b) - 1), dur: MOTION.settle * (0.8 + 0.4 * clamp(dist / (250 * view.k))) };
    b.vx = b.vy = 0;
  }
}
// A shoved (or tidied) card slides out with an ease-out (chained cards a beat later) and lands, harder the further it went.
function stepShove(s, dt) {
  const v = s.shove;
  v.t += dt;
  const e = easeOutQuart(clamp(v.t / v.dur));
  s.x = v.fx + (v.tx - v.fx) * e; s.y = v.fy + (v.ty - v.fy) * e;
  if (v.tr !== undefined) s.rot = v.fr + (v.tr - v.fr) * e; // tidy turns it home too
  if (v.t >= v.dur) { s.shove = null; land(s, clamp(0.15 + v.dist / (300 * view.k), 0.1, 0.7)); placeDom(s); }
}


// ---------- tidy ----------
// A card's home: its slot on this layout, at its slot's angle.
const homeOf = (s) => [(s.region + s.slot.x / REF_W) * view.w, (s.slot.y / REF_H) * view.h, s.slot.r];


// ---------- drawing ----------
// The one way cards enter a page (Clark's deck-lab pick, "fan then deal"): a page's cards wait face down in a squared
// pile on its deck, the deck upright (every postcard lies turned a quarter turn, portrait); the pile fans toward the page
// from the top card down, and they are dealt top first: each lifts off the pile and travels home on an ease-out, turning
// face up on the way (from 10% to 51% of the travel) while it turns the quarter turn to land landscape at its desk angle
// (6% to 60%), and lands with the burst at contact. Going back onto a pile is the same path backward: it lifts, turns
// face down and back upright, square with the pile, and slides on. The first visit, a deep link, and every page turn
// deal this way.
const DRAW = { dur: 0.73, flipA: 0.1, flipB: 0.51, rotA: 0.06, rotB: 0.6, fan: 0.26 }; // s, then fractions of the travel, s to fan open
const upright = (s) => (s.w > s.h ? 90 : 0); // deg: a card in a deck lies upright; a landscape one turns a quarter turn
const GATHER = { dur: 0.36, stagger: 0.05 }; // a gather is the deal backward at twice the pace, the cards close together
const INTRO_DELAY = 0.15 + MOTION.settle; // s before the first visit's deck fans: it slides in first
// One clock for every card in the air: a batch that starts while others fly is timed from now on it. then: what
// follows at thenAt (or once every card is down): the page turn after a gather.
const flights = { on: false, t: 0, then: null, thenAt: Infinity };
const now = () => (flights.on ? flights.t : (flights.t = 0));
const easeOutQuart = (u) => 1 - (1 - u) ** 4;
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function cubicBezier(x1, y1, x2, y2) { // CSS cubic-bezier timing, solved for x by Newton steps with a bisection fallback
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t, dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const err = sx(t) - x, d = dx(t); if (Math.abs(err) < 1e-6 || Math.abs(d) < 1e-6) break; t -= err / d; }
    if (!(t >= 0 && t <= 1) || Math.abs(sx(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 40; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return sy(t);
  };
}
const drawEase = cubicBezier(0.25, 1, 0.5, 1);
// Deal a page's featured cards (the ones with a home slot) from its pile to their homes, the pile fanning at `delay` (s;
// Infinity: they wait on the pile, already held for, until dealt again with a real delay).
// hold: the page starts from bare paper and its slime grows out of the cards as they land (the first visit); a page turned
// to keeps the network it was warmed with, and the cards land on it.
function drawFrom(region, { delay = 0, hold = true } = {}) {
  endFlights(false, region);
  const deck = pageDeck(region);
  const cards = sources.filter((s) => s.region === region && s.featured && decked(s) && !s.dragging).sort((a, b) => a.order - b.order);
  if (view.phone || !gpu || reduced || !deck || !cards.length) return;
  for (const s of cards) Object.assign(s, { inDeck: false }, hold ? { rel: -1 } : {});
  if (hold) atHome(region, () => holdPage(sim)); // so each agent waits for the card that will land nearest it
  const t0 = now() + delay;
  cards.forEach((s, k) => deal(s, deck, t0 + DRAW.fan + k * T.drawStagger, { k, n: cards.length, at: t0 }, homeOf(s)));
  topZ += cards.length; // the stack sits above everything, the first to be dealt on top
  flights.on = true;
  stepFlights(0);
}
// Runs fn with a page's featured cards lying at home (its slime sees them there while they are on its pile).
function atHome(region, fn) {
  const cards = sources.filter((s) => s.region === region && s.featured);
  const was = cards.map(({ x, y, rot, flying, turn }) => ({ x, y, rot, flying, turn }));
  for (const s of cards) { [s.x, s.y, s.rot] = homeOf(s); Object.assign(s, { flying: false, turn: null }); }
  fn();
  cards.forEach((s, i) => Object.assign(s, was[i]));
}
// One card onto its way out of a deck to `to` (its home, or where it is now): it waits on the pile (card k of the n dealt
// together, the first on top; fanned from stack.at), then is dealt at `at`.
function deal(s, deck, at, stack = null, [x, y, r] = [s.x, s.y, s.rot]) {
  s.fly = { at, x, y, r, deck, t0: flights.t, stack, ur: upright(s), pw: Math.min(s.w, s.h),
    jit: [(hash01(s.id + 5) - 0.5) * 3, (hash01(s.id + 9) - 0.5) * 3, (hash01(s.id + 13) - 0.5) * 3] };
  s.el.classList.add('flying'); // clicks go through to the deck
  Object.assign(s, { flying: true, turn: 0, flip: 0, flipTo: 0, vx: 0, vy: 0, released: false, shove: null, kb: null,
    z: stack ? topZ + stack.n - stack.k : ++topZ }); // the first to be dealt on top
  s.el.classList.remove('flipped'); s.hit.setAttribute('aria-expanded', 'false');
}
// Where a waiting card sits: squared on its upright deck like a real pile (a pixel or two and a degree or two off), then,
// once its deal begins, fanned toward the page around the pile's outer edge, top card first, still upright.
function waitPose(k, t = flights.t) {
  const d = k.deck, [jx, jy, jr] = k.jit, f = k.stack;
  if (!f || f.at == null) return [d.px + jx, d.y + jy, d.rot + k.ur + jr];
  const { k: j, n } = f, a = 1 - (1 - clamp((t - f.at - j * 0.03) / DRAW.fan)) ** 3;
  const deg = a * (j - (n - 1) / 2) * Math.min(9, 40 / n), th = (deg * Math.PI) / 180, pw = d.pile.pw * view.cs, ph = d.pile.ph * view.cs; // the pile, upright
  const ox = -0.62 * pw, oy = -0.18 * ph; // from the pivot (outer edge, a little low) to the pile's center
  return [d.px + 0.62 * pw + ox * Math.cos(th) - oy * Math.sin(th) - (a * 30 * (n - j)) / n + jx,
    d.y + 0.18 * ph + ox * Math.sin(th) + oy * Math.cos(th) + jy, d.rot + k.ur + deg + jr];
}
// A page's deck holds its cards that are not on the desk: every card of a page you do not see (its featured cards come
// out as you turn to it), and those put back or never dealt.
function pileUp(region) {
  const deck = pageDeck(region);
  const cards = sources.filter((s) => s.region === region && decked(s) && !s.fly && (region !== page || s.inDeck)).sort((a, b) => a.order - b.order);
  if (deck?.slide && region !== page) resetBox(deck); // out of sight, a box puts itself away at once
  if (view.phone || !gpu || reduced || !deck || !cards.length) return;
  for (const s of cards) { s.inDeck = true; s.pileZ ||= -s.order; } // never dealt: the first in order on top
  cards.forEach((s, k) => deal(s, deck, Infinity, { k, n: cards.length }));
  topZ += cards.length;
  for (const s of cards) { [s.x, s.y, s.rot] = waitPose(s.fly); placeDom(s); }
}
function stepFlights(dt) {
  if (!flights.on) return;
  flights.t += dt;
  let busy = false;
  for (const s of sources) {
    const k = s.fly;
    if (!k || k.at === Infinity) continue; // a pile at rest
    // It lifts off the stack first (8% of the draw) and only then travels, so it rises up and over the cards below.
    if (k.box && flights.t - k.at >= k.dur) { busy = slideIn(s, k) || busy; placeDom(s); continue; } // lined up beside the box: in it goes
    const [wx, wy, wr] = k.box ? entryPose(k) : waitPose(k), u0 = clamp((flights.t - k.at) / (k.dur || DRAW.dur)), u = k.back ? 1 - u0 : u0, e = drawEase(clamp((u - 0.08) / 0.92));
    if (u0 > 0 && !k.up) { k.up = true; s.z = ++topZ; } // off the top (or onto it)
    Object.assign(s, { x: wx + (k.x - wx) * e, y: wy + (k.y - wy) * e, rot: wr + (k.r - wr) * smooth((u - DRAW.rotA) / (DRAW.rotB - DRAW.rotA)),
      turn: (1 - (k.down || 0)) * smooth((u - DRAW.flipA) / (DRAW.flipB - DRAW.flipA)), flyLift: 0.45 * smooth(u / 0.14) * (1 - smooth((u - 0.78) / 0.22)) });
    if (k.back && u0 >= 1 && !k.box) { k.at = Infinity; [s.x, s.y, s.rot] = waitPose(k); } // back on the pile, no burst
    else if (!k.back && u >= 1) { Object.assign(s, { x: k.x, y: k.y, rot: k.r, flying: false, fly: null, turn: null, flyLift: 0, dealtAt: ++dealSeq }); s.el.classList.remove('flying'); land(s, 1); } // contact
    else busy = true;
    placeDom(s);
  }
  flights.on = busy;
  const then = flights.then;
  if (then && (!busy || flights.t >= flights.thenAt)) { flights.then = null; then(); }
  else if (!busy) next();
}
// A card going into the box first lines up beside its open end, square with it and face down (entryPose), then slides
// in under its front (slideIn): from then on it is below the box, so the box hides what is inside.
let boxSeq = 0;
function entryPose(k) {
  const [x, y, r] = waitPose(k), d = k.deck, a = (d.rot * Math.PI) / 180, off = (d.w + k.pw) / 2 + 6 * view.k; // the card is upright: its short side across
  return [x - off * Math.cos(a), y - off * Math.sin(a), r];
}
function slideIn(s, k) {
  const u = clamp((flights.t - k.at - k.dur) / BOX.inS), [ex, ey] = entryPose(k), [x, y, r] = waitPose(k), e = EASES.cubic(u);
  if (!k.inside) { k.inside = true; s.z = k.deck.z - 1 + ++boxSeq * 1e-4; }
  Object.assign(s, { x: ex + (x - ex) * e, y: ey + (y - ey) * e, rot: r, turn: 0, flyLift: 0 });
  if (u < 1) return true;
  k.at = Infinity; k.box = false;
  return false;
}
// Puts every card still in the air (on one page, if given) straight into its place (a new layout, or a page dealt again
// mid-draw); a card on its way back lands on its pile.
function endFlights(all = false, region = null) { // all: piles too (a new layout)
  for (const s of sources) {
    if (region != null && s.region !== region) continue;
    if (s.shove) { Object.assign(s, { x: s.shove.tx, y: s.shove.ty, shove: null }); placeDom(s); }
    const k = s.fly;
    if (!k || (k.at === Infinity && !all)) continue;
    if (k.back && !all) { if (k.box && !k.inside) s.z = k.deck.z - 1; k.at = Infinity; k.box = false; Object.assign(s, { turn: 0, flyLift: 0 }); [s.x, s.y, s.rot] = waitPose(k); placeDom(s); continue; }
    s.el.classList.remove('flying');
    Object.assign(s, { x: k.x, y: k.y, rot: k.r, flying: false, fly: null, rel: 1e3, flip: 0, flipTo: 0, turn: null, flyLift: 0 });
    placeDom(s);
  }
  flights.on = sources.some((s) => s.fly && s.fly.at !== Infinity);
  if (all) flights.then = null;
}
// Each page's deck peeks in at its right edge, above the page corner: its pile of face-down postcards, or, once the last
// card has left it, the card box in the same spot.
const DECK_SHOW = 0.5; // how much of the upright box (and its pile) shows on the page, of its width
const lidOf = (d) => sources.find((s) => s.lid && s.region === d.region);
function placeDecks() {
  for (const s of sources) if (s.more && !view.phone) {
    Object.assign(s, { spot: (s.region + 1) * view.w - DECK_SHOW * s.w + s.w / 2, y: 0.36 * view.h, rot: -2, home: -2 });
    s.slide ??= { want: 'out', t: 1, dur: 1, ease: easeOutQuart };
    if (s.slide.want === 'off') s.slide.want = 'out';
    const at = deckOut(s, s.slide.want);
    Object.assign(s.slide, { at, from: at, to: at, t: 1, wait: 0 }); // a new layout: where it was headed
    s.mode ??= 'pile';
    const bx = s.mode === 'box' && s.phase !== 'leaving' ? 0 : deckOut(s, 'off');
    s.bx = { at: bx, from: bx, to: bx, t: 1, dur: 1, ease: easeOutQuart };
    s.px = s.x = s.spot + s.slide.at;
  }
  for (const s of sources) if (s.kind === 'deck') { s.el.hidden = !dealing; s.gone = true; } // nothing to hold without the deal
}
// The pile slides in from off screen right as a page's first beat (on load and when the page is turned to), on settle.
// The card box: when the last card leaves the pile, the box slides out to the same spot, lid open. A card dropped on it,
// or every card on the page (double-click or Enter), goes in through its open end: it lines up beside the box, then slides
// in under its front. Once they are all in, the lid closes over the opening and the box slides away off the edge, leaving
// the cards as the pile again.
const BOX = { close: 0.4, pause: 0.12, away: 0.45, inS: 0.26 }; // lid closing, a beat, the box leaving (s); a card sliding in (s)
const deckOut = (d, want) => (want === 'out' ? 0 : d.w + 40 * view.k); // x offset from its spot: in place, or off screen
function slideDeck(d, want, dur = MOTION.respond, ease = want === 'out' ? easeOutQuart : EASES.cubic) {
  const v = d.slide;
  if (v.want === want) return;
  Object.assign(v, { want, from: v.at, to: deckOut(d, want), t: 0, dur, ease });
}
// Tucked, only the box's open end and its label peek in at the edge (the lid closed over them).
const tuckAt = (d) => DECK_SHOW * d.w - (lidOf(d).w + 34 * (view.cs || 1));
function slideBox(d, to, dur, ease) { Object.assign(d.bx, { from: d.bx.at, to, t: 0, dur, ease }); }
// The deck as a pile, the box off screen (a page you turn to, or one put away out of sight).
function resetBox(d) {
  const off = deckOut(d, 'off');
  Object.assign(d, { mode: 'pile', phase: '', lidT: 0 });
  Object.assign(d.bx, { at: off, from: off, to: off, t: 1 });
  d.hit.setAttribute('aria-label', DECK_LABEL.pile);
}
// A page's deck comes in from off screen, `delay` s from now.
function arriveDeck(region, delay) {
  const d = pageDeck(region);
  if (!d || view.phone || !dealing) return;
  resetBox(d);
  Object.assign(d.slide, { want: 'off', at: deckOut(d, 'off'), to: deckOut(d, 'off'), t: 1, wait: delay });
  moveDeck(d);
}
// The deck's pile to its slide's offset, the box to its own, and the lid on its hinge (the box's open end): open, it lies
// flat beside the box, inside up; closing, it turns over about the hinge (its free edge rising) onto the box's front.
function moveDeck(d) {
  d.px = d.spot + d.slide.at;
  d.x = d.mode === 'box' ? d.spot + d.bx.at : d.px;
  d.gone = d.mode !== 'box';
  placeDom(d);
  for (const s of sources) if (s.fly?.deck === d && s.fly.at === Infinity) { [s.x, s.y, s.rot] = waitPose(s.fly); placeDom(s); }
  const lid = lidOf(d);
  if (!lid) return;
  const a = (d.rot * Math.PI) / 180, th = Math.PI * EASES.cubic(d.lidT || 0), hx = d.x - (d.w / 2) * Math.cos(a), hy = d.y - (d.w / 2) * Math.sin(a);
  Object.assign(lid, { x: hx - (lid.w / 2) * Math.cos(th) * Math.cos(a), y: hy - (lid.w / 2) * Math.cos(th) * Math.sin(a), rot: d.rot, flipA: th, gone: d.gone,
    flyLift: Math.max(((lid.w / 2) * Math.sin(th)) / T.lift, d.lift), z: th > Math.PI / 2 ? d.z + 0.5 : -1 }); // open: under every card; closed: on the box
}
function stepDecks(dt) {
  for (const d of sources) {
    if (!d.more || view.phone || !d.slide || !dealing) continue;
    const v = d.slide;
    if (v.wait > 0) v.wait -= dt;
    else if (v.want === 'off') slideDeck(d, 'out', MOTION.settle, easeOutQuart); // the arrival
    if (v.t < 1) v.t = Math.min(1, v.t + dt / v.dur);
    if (v.wait <= 0) v.at = v.from + (v.to - v.from) * v.ease(v.t);
    stepBox(d, dt);
    moveDeck(d);
  }
}
function stepBox(d, dt) {
  const b = d.bx;
  if (b.t < 1) { b.t = Math.min(1, b.t + dt / b.dur); b.at = b.from + (b.to - b.from) * b.ease(b.t); }
  const mine = sources.filter((s) => s.fly?.deck === d);
  const coming = mine.some((s) => s.fly.back && s.fly.at !== Infinity); // on their way in
  const held = mine.some((s) => s.fly.at === Infinity || (!s.fly.back && flights.t < s.fly.at + 0.3 * DRAW.dur)); // in it, or only just off it
  if (d.mode === 'pile') {
    if (held || coming || d.welcome || arriving(d)) return;
    Object.assign(d, { mode: 'box', phase: 'open', lidT: 1, outFor: 0, z: ++topZ }); // the last card is away: the box slides in, tucked, lid closed
    slideBox(d, tuckAt(d), MOTION.settle, easeOutQuart);
    d.hit.setAttribute('aria-label', DECK_LABEL.box);
  } else if (d.phase === 'open') {
    if (held && !coming && !d.welcome) { Object.assign(d, { phase: 'closing', pt: d.lidT * BOX.close }); return; } // everything is in: close up
    // Tucked unless it is wanted: a dragged card near it, cards on their way in, a gather asked for, keyboard focus. It
    // stays out 0.4 s after the last reason goes, then tucks back, its lid closing.
    if (d.near || d.welcome || coming || d.gatherAsk || d.focused) d.outFor = 0.4; else d.outFor -= dt;
    const out = d.outFor > 0, to = out ? 0 : tuckAt(d);
    if (b.to !== to) slideBox(d, to, MOTION.respond, out ? easeOutQuart : EASES.cubic);
    d.lidT = clamp(d.lidT + (out ? -dt : dt) / BOX.close);
    if (d.gatherAsk && b.t >= 1 && d.lidT === 0) { d.gatherAsk = false; boxGather(d); } // out and open: in they come
  } else if (d.phase === 'closing') {
    d.pt += dt; d.lidT = clamp(d.pt / BOX.close);
    if (d.pt >= BOX.close + BOX.pause) { d.phase = 'leaving'; slideBox(d, deckOut(d, 'off'), BOX.away, EASES.cubic); }
  } else if (d.phase === 'leaving' && b.t >= 1) resetBox(d); // the box is away: the cards it held are the pile
}
const arriving = (d) => d.slide.want !== 'out' || d.slide.t < 1 || d.slide.wait > 0; // the pile is still sliding in
// The page deck: holds a page's cards that are not on the desk, as a squared pile on it. Click draws the top card (to its
// slot, or the best free spot), an empty deck just nudges; double-click gathers every card on the page back onto it,
// or deals them all out when none are on the desk; a card dropped on it goes back on the pile. Enter draws,
// Shift+Enter gathers or deals.
const pageDeck = (r) => sources.find((s) => s.more && s.region === r);
const decked = (s) => s.kind === 'photo'; // project cards go in decks; the polaroid and the note never do
const pileOf = (r) => sources.filter((o) => o.region === r && o.inDeck).sort((a, b) => b.pileZ - a.pileZ); // top first
let deckTimer = 0, dealSeq = 0, pileSeq = 0;
function deckClick(deck, e) {
  if (deck.mode === 'box') { // the box: double-click or Enter puts every card back; a click is a tiny nudge
    if (e.type === 'keydown' || e.detail >= 2) boxGather(deck); else deck.squashV = (deck.squashV || 0) + 8;
    return;
  }
  if (e.type === 'keydown') { e.shiftKey ? deckDouble(deck) : drawMore(deck); return; }
  clearTimeout(deckTimer);
  if (e.detail >= 2) deckDouble(deck); else deckTimer = setTimeout(() => drawMore(deck), 230); // wait to see if it is a double-click
}
function drawMore(deck, all = false) {
  if (flights.on || view.phone) return;
  const pile = pileOf(deck.region), take = all ? pile : pile.slice(0, 1);
  if (!take.length) { deck.squashV = (deck.squashV || 0) + 8; return; } // empty: a tiny nudge
  take.forEach((s, i) => {
    const [x, y, r] = s.slot ? homeOf(s) : freeSlot(s);
    if (!s.slot) s.slot = { x: ((x - s.region * view.w) / view.w) * REF_W, y: (y / view.h) * REF_H, w: s.baseW, r };
    s.inDeck = false; s.shoveOnLand = !all;
    deal(s, deck, now() + i * T.drawStagger, { k: i, n: take.length, at: now() }, [x, y, r]);
  });
  flights.on = true;
  stepFlights(0);
}
// Every project card on the box's page goes back in, last dealt first.
function boxGather(deck) {
  if (deck.phase !== 'open' || flights.on || turn.on) return;
  if (deck.bx.at !== 0 || deck.lidT > 0) { deck.gatherAsk = true; return; } // tucked: it slides out and opens first
  const out = sources.filter((o) => o.region === deck.region && decked(o) && !o.inDeck && !o.flying && !o.dragging);
  if (out.length) gather(out, deck);
}
function deckDouble(deck) {
  const out = sources.filter((o) => o.region === deck.region && decked(o) && !o.inDeck && !o.flying && !o.dragging);
  if (out.length) gather(out, deck); else drawMore(deck, true);
}
// Gather: the deal played backward, last dealt first: each card lifts, turns square with the pile, turns face down, and
// slides back onto it; no burst on the way back.
// Returns when the last card starts back.
function gather(cards, deck) {
  if (flights.on) return 0;
  cards.sort((a, b) => (b.dealtAt || -b.order) - (a.dealtAt || -a.order)).forEach((s, i) => collect(s, deck, now() + i * GATHER.stagger));
  flights.on = true;
  stepFlights(0);
  return (cards.length - 1) * GATHER.stagger;
}
function collect(s, deck, at, dur = GATHER.dur) {
  Object.assign(s, { inDeck: true, pileZ: ++pileSeq, released: false, vx: 0, vy: 0, shove: null, kb: null });
  s.fly = { at, x: s.x, y: s.y, r: s.rot, deck, back: true, ur: upright(s), pw: Math.min(s.w, s.h), down: s.down || 0, dur, box: deck.mode === 'box' && deck.phase === 'open', // down: already face down; box: it goes in through the box's open end
    jit: [(hash01(s.id + 5) - 0.5) * 3, (hash01(s.id + 9) - 0.5) * 3, (hash01(s.id + 13) - 0.5) * 3] };
  Object.assign(s, { flying: true, turn: 1 - s.fly.down, down: 0, flip: 0, flipTo: 0 });
  s.el.classList.add('flying'); s.el.classList.remove('flipped'); s.hit.setAttribute('aria-expanded', 'false');
}
// Is a desk point over a page's deck (grown by pad px)?
function overDeck(deck, x, y, pad = 0) {
  const r = obb(deck), ex = reach(r, [1, 0]) + pad, ey = reach(r, [0, 1]) + pad;
  return Math.abs(x - deck.x) < ex && Math.abs(y - deck.y) < ey;
}
// The best free spot for a card on its page: a grid search for the least overlap with the other cards (24 px apart),
// the name, tagline, links, and decks, inside a 32 px margin, then nearest the middle; its angle is a flip's Gaussian.
function freeSlot(s) {
  const x0 = s.region * view.w, gauss = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const r = clamp(gauss * T.flipJitter, -T.maxAngle, T.maxAngle), b = obb({ ...s, rot: r }), ex = reach(b, [1, 0]), ey = reach(b, [0, 1]);
  const pad = 24 * view.k, m = 32 * view.k, step = 16, deck = dealing && pageDeck(s.region);
  const near = sources.filter((o) => o !== s && o.region === s.region && !o.inDeck && o.kind !== 'deck').concat(deck ? [{ ...deck, x: deck.spot }] : []);
  const boxes = keepOut(x0).concat(near.map((o) => {
    const q = obb(o), qx = reach(q, [1, 0]), qy = reach(q, [0, 1]);
    return { l: o.x - qx, r: o.x + qx, t: o.y - qy, b: o.y + qy };
  }));
  const over = (x, y, p) => boxes.reduce((sum, q) => sum + Math.max(0, Math.min(x + ex, q.r + p) - Math.max(x - ex, q.l - p)) * Math.max(0, Math.min(y + ey, q.b + p) - Math.max(y - ey, q.t - p)), 0);
  let best = [Infinity, x0 + view.w / 2, view.h / 2];
  for (let y = m + ey; y <= view.h - m - ey; y += step) for (let x = x0 + m + ex; x <= x0 + view.w - m - ex; x += step) {
    // touching anything is far worse than coming within 24 px of it, which is worse than being off center
    const score = over(x, y, 0) * 1e4 + over(x, y, pad) * 10 + Math.hypot(x - x0 - view.w / 2, y - view.h / 2);
    if (score < best[0]) best = [score, x, y];
  }
  return [best[1], best[2], r];
}

// ---------- media: crossfading playlists ----------

// media/clips.json maps a card key to { poster, clips }; new clips drop in with no code change. Cards without an entry
// fall back to their data-video source.
const clipLists = clips; // clips.json, built in; every media address carries its file's content hash
// Each clip is "file.mp4" or { "src": "file.mp4", "start": seconds } (default start 0).
function playlistFor(s) {
  if (!s.media) return null; // only cards with a media area can play clips
  const e = clipLists[s.key];
  if (e?.clips?.length) return e.clips.map((c) => (typeof c === 'string' ? { src: mediaUrl('/desk-media/' + c), start: 0 } : { src: mediaUrl('/desk-media/' + c.src), start: +c.start || 0 }));
  return s.videoSrc ? [{ src: s.videoSrc, start: 0 }] : null;
}
function makeVideo(src, lazy = false) {
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = lazy ? 'none' : 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.src = src;
  if (qs.has('mlog')) for (const ev of ['play', 'playing', 'pause', 'seeked', 'ended', 'waiting', 'stalled', 'error']) {
    v.addEventListener(ev, () => console.log('[media]', ev, v.currentSrc.split('/').pop(), v.currentTime.toFixed(2), 'rs', v.readyState));
  }
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  body.append(v);
  return v;
}
// Every play/pause/seek on an element runs in order, so a pending play() never races a pause().
const chain = (v, fn) => (v.op = (v.op || Promise.resolve()).then(fn, fn));
async function playWithRetry(v) {
  for (let k = 0; k < 5; k++) {
    try { await v.play(); return; } catch (err) {
      console.warn('play() rejected', v.currentSrc.split('/').pop(), err.name, err.message);
      await new Promise((r) => setTimeout(r, 120 * (k + 1)));
    }
  }
}
const play = (v) => chain(v, () => playWithRetry(v));
// Pause, load the given clip if it is a different one, and rewind to the clip's start.
const halt = (v, clip) => chain(v, () => {
  v.pause();
  if (!v.src.endsWith(clip.src)) { v.src = clip.src; v.load(); }
  v.clipStart = clip.start;
  v.currentTime = clip.start;
});
// Play from the clip's start: rewinds first unless it is already mid-clip.
const playFromStart = (v) => chain(v, () => { if (v.ended || v.currentTime < v.clipStart) v.currentTime = v.clipStart; }).then(() => play(v));

// A card's player: two video elements; the first clip loads now, the next only once this card's video starts.
function makePlayer(s) { s.player = new Player(s.playlist); }
const wake = (v) => chain(v, () => { v.preload = 'auto'; v.load(); v.currentTime = v.clipStart || 0; });
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
// Preload: once the intro is over and the page is idle, each card's first clip loads, one at a time, the page you are on
// first, so a first hover plays at once. Later clips stay lazy. Nothing preloads on Save-Data or a 2g connection, on
// phones (no hover), with reduced motion, or without WebGPU; then a player is made on first hover, as before.
function preloadClips() {
  const c = navigator.connection;
  if (dead || view.phone || reduced || !gpu || c?.saveData || /2g$/.test(c?.effectiveType || '')) return;
  const queue = sources.filter((s) => s.playlist && !s.player).sort((a, b) => (a.region !== page) - (b.region !== page) || a.order - b.order);
  const next = () => {
    const s = queue.shift();
    if (dead || !s) return;
    if (!s.player) makePlayer(s);
    const v = s.player.v[0];
    if (v.readyState >= 4) { idle(next); return; }
    let done = false;
    const go = () => { if (!done) { done = true; idle(next); } };
    for (const ev of ['canplaythrough', 'error', 'stalled']) v.addEventListener(ev, go, { once: true });
    setTimeout(go, 6000); // a slow clip does not hold up the rest
  };
  next();
}

// Hover playback, one state machine per media card:
//   rest: the card shows its thumbnail, both elements paused at their clip's start.
//   on:   the pointer is over the card. The video fades in (T.fadeIn) as it plays from 0, and the playlist runs with
//         T.xfade crossfades for as long as the pointer stays.
//   out:  the pointer left. The current clip plays to its end (T.finishFirst), then the card fades back to the
//         thumbnail (T.fadeOut) and only then pauses and rewinds. Re-entering during "out" just continues.
// Two elements take turns: the current one plays clip i; T.xfade before it ends (or before T.hold, if set) the other
// starts clip i + 1 and the shader crossfades. The idle element then preloads the clip after that.
class Player {
  constructor(list) {
    this.list = list;
    this.v = [makeVideo(list[0].src), makeVideo(list[1 % list.length].src, true)]; // the next clip waits until this one plays
    this.v.forEach((v, k) => halt(v, list[k % list.length]));
    this.cur = 0; this.i = 0; this.fade = 0; this.fading = false;
    this.state = 'rest'; this.outNow = false; this.mix = 0; this.retry = 0;
  }
  get a() { return this.v[this.cur]; }
  get b() { return this.v[1 - this.cur]; }
  // Showing video: an element has a frame and is playing, or holds its last frame (ended) while the card fades.
  playing() { return this.v.some((v) => v.readyState >= 2 && v.currentTime > (v.clipStart || 0) && (!v.paused || v.ended)); }
  // Another card wants the video: get out of its way quickly.
  forceOut() { if (this.state !== 'rest') { this.state = 'out'; this.outNow = true; this.quick = true; } }
  reset() {
    this.fading = false; this.fade = 0; this.i = 0; this.cur = 0; this.quick = false;
    halt(this.v[0], this.list[0]); halt(this.v[1], this.list[1 % this.list.length]);
  }
  step(dt, hovered) {
    if (hovered && this.state === 'rest') { this.state = 'on'; playFromStart(this.a); if (this.b.preload === 'none') wake(this.b); }
    else if (hovered && this.state === 'out') { this.state = 'on'; this.outNow = false; } // keep going from here
    else if (!hovered && this.state === 'on') { this.state = 'out'; this.outNow = !T.finishFirst; }
    if (this.state === 'rest') return;
    const { a, b } = this;
    const end = T.hold > 0 ? Math.min(a.duration, T.hold) : a.duration;
    if (this.state === 'on' && a.paused && !a.ended && (this.retry -= dt) < 0) { this.retry = 0.5; play(a); } // play() failed: try again
    if (!this.fading && a.duration) {
      if (this.state === 'on' && (a.ended || a.currentTime >= end - T.xfade - 0.05)) {
        this.fading = true; this.fade = 0; playFromStart(b);
        if (qs.has('mlog')) console.log('[media] crossfade', a.currentSrc.split('/').pop(), 'at', a.currentTime.toFixed(2), 'of', a.duration.toFixed(2), '->', b.currentSrc.split('/').pop(), 'from', b.currentTime.toFixed(2));
      } else if (this.state === 'out' && (a.ended || a.currentTime >= end - 0.02)) this.outNow = true; // clip finished
    }
    if (this.fading && b.readyState >= 2 && !b.paused) this.fade += dt / T.xfade;
    if (this.fading && this.fade >= 1) {
      this.fading = false; this.fade = 0;
      this.cur = 1 - this.cur; this.i = (this.i + 1) % this.list.length;
      halt(this.b, this.list[(this.i + 1) % this.list.length]); // the idle element preloads the next clip
      if (this.state === 'out') this.outNow = true; // the clip that was ending has ended
    }
    const target = this.state === 'on' ? (this.playing() ? 1 : 0) : this.outNow ? 0 : 1;
    this.mix = target > this.mix ? Math.min(target, this.mix + dt / T.fadeIn) : Math.max(target, this.mix - dt / (this.quick ? MOTION.quick : T.fadeOut));
    if (this.state === 'out' && this.outNow && this.mix === 0) {
      this.state = 'rest'; this.outNow = false; this.reset();
      if (qs.has('mlog')) console.log('[media] rest');
    }
  }
}

let videoSrc = null, videoMix = 0, probing = false, probeKey = null; // probeKey: the probe holds hover on that card
// Only one card shows video at a time: a newly hovered card waits until the previous one has faded back to rest.
function stepMedia(dt) {
  if (probing) return; // the crossfade probe drives the player by hand
  const now = performance.now();
  const hov = sources.find((s) => s.player && s.hoverOn && now - s.hoverSince >= T.hoverDelay) || null;
  if (hov && videoSrc && hov !== videoSrc) videoSrc.player.forceOut();
  if (hov && (!videoSrc || videoSrc.player.state === 'rest')) videoSrc = hov;
  for (const s of sources) s.player?.step(dt, s === hov && s === videoSrc);
  videoMix = videoSrc ? videoSrc.player.mix : 0;
  if (videoSrc && videoSrc.player.state === 'rest' && videoSrc !== hov) videoSrc = null;
}

// ---------- card textures ----------

// The part of an image (fractions) that covers a media area of aspect ma, zoomed by the card's framing [zoom, x, y].
// x and y place the crop like CSS object-position, so stills, clips, and the DOM fallback frame the same way.
function coverRect(ia, ma, [z, px, py]) {
  const w = Math.min(1, ma / ia) / z, h = Math.min(1, ia / ma) / z;
  return [px * (1 - w), py * (1 - h), w, h];
}

// The deck back: one design for every card while it is in a deck. Card stock, a fine inset ink
// frame, and a faint network of slime veins in the olive ink (seeded, so it is the same on every card).
function paintDeckBack(x, S, cw, ch) {
  x.fillStyle = TOK.stock; x.fillRect(0, 0, cw, ch);
  const inset = 10 * S;
  x.save(); x.beginPath(); x.rect(inset, inset, cw - 2 * inset, ch - 2 * inset); x.clip();
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pts = Array.from({ length: 16 }, () => [inset + rnd() * (cw - 2 * inset), inset + rnd() * (ch - 2 * inset)]);
  x.strokeStyle = TOK.ink; x.lineCap = 'round'; x.globalAlpha = 0.45;
  for (const [i, p] of pts.entries()) { // each node to its two nearest, a gently bent vein, thinner the longer it runs
    const near = pts.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j > i).sort((a, b) => a[0] - b[0]).slice(0, 2);
    for (const [d, j] of near) {
      const q = pts[j], bend = (rnd() - 0.5) * 0.4 * d;
      x.lineWidth = Math.max(0.6, 2.2 - d / (40 * S)) * S;
      x.beginPath(); x.moveTo(p[0], p[1]);
      x.quadraticCurveTo((p[0] + q[0]) / 2 - ((q[1] - p[1]) / d) * bend, (p[1] + q[1]) / 2 + ((q[0] - p[0]) / d) * bend, q[0], q[1]); x.stroke();
    }
  }
  x.restore(); x.globalAlpha = 1;
  x.strokeStyle = TOK.inkLine; x.lineWidth = S; x.strokeRect(inset + 0.5 * S, inset + 0.5 * S, cw - 2 * inset - S, ch - 2 * inset - S);
}
// The card box, in the desk's paper and ink: its front (the page's name handwritten on it, a thumb notch at the open end,
// a fine inset frame and a few faint veins), and its lid (inside: plain stock and the fold; outside: the tuck flap's
// pen outline). The box's open end is its left edge, toward the page; the lid is hinged there.
const BOX_NAMES = ['projects', 'research'];
function paintBox(x, s, S) {
  const w = s.w, h = s.h;
  x.save(); x.scale(S, S);
  x.fillStyle = TOK.stock; x.fillRect(0, 0, w, h);
  x.save(); x.beginPath(); x.rect(7, 7, w - 14, h - 14); x.clip();
  const r = rng(31 + s.region * 7), pts = Array.from({ length: 14 }, () => [7 + r() * (w - 14), 7 + r() * (h - 14)]);
  x.strokeStyle = TOK.ink; x.globalAlpha = 0.28; x.lineCap = 'round';
  for (const [i, p] of pts.entries()) {
    const near = pts.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j > i).sort((a, b) => a[0] - b[0]).slice(0, 2);
    for (const [d, j] of near) { const q = pts[j]; x.lineWidth = Math.max(0.6, 2 - d / 60); x.beginPath(); x.moveTo(p[0], p[1]); x.quadraticCurveTo((p[0] + q[0]) / 2 + (r() - 0.5) * 0.3 * d, (p[1] + q[1]) / 2 + (r() - 0.5) * 0.3 * d, q[0], q[1]); x.stroke(); }
  }
  x.restore(); x.globalAlpha = 1;
  x.strokeStyle = TOK.inkLine; x.lineWidth = 1; x.strokeRect(7.5, 7.5, w - 15, h - 15);
  x.fillStyle = '#e8e4d8'; x.beginPath(); x.arc(0, h / 2, 15, -Math.PI / 2, Math.PI / 2); x.fill(); // the thumb notch at the open end
  x.strokeStyle = TOK.inkLine; x.beginPath(); x.arc(0, h / 2, 15, -Math.PI / 2, Math.PI / 2); x.stroke();
  const lid = Math.round((h - 12) * 0.13); // the lid's width (boxSize); the label sits in the part that shows, clear of the closed lid
  x.font = font(500, 26, 'Caveat'); x.fillStyle = TOK.text2; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.translate(lid + 17, h / 2); x.rotate(-Math.PI / 2); x.fillText(BOX_NAMES[s.region], 0, 2); // along the upright box, like a spine, just past the closed lid so it shows when tucked
  x.restore();
}
function paintLid(x, s, S, outside) {
  const w = s.w, h = s.h, fold = 12; // the lid's top panel (the box's depth), then its tuck flap
  x.save(); x.scale(S, S);
  x.fillStyle = outside ? TOK.stock : '#f1ede3'; x.fillRect(0, 0, w, h);
  const f = outside ? fold : w - fold, tip = outside ? w - 1.5 : 1.5; // inside up, the hinge is its right edge; the outside is seen mirrored, the hinge on its left
  x.strokeStyle = TOK.inkLine; x.lineWidth = 1; x.globalAlpha = outside ? 1 : 0.7;
  x.beginPath(); x.moveTo(f, 4); x.lineTo(f, h - 4); x.stroke(); // the fold between the top panel and the flap
  const rr = Math.min(18, (w - fold) * 0.6), dir = outside ? 1 : -1; // the tuck flap's rounded corners, in pen
  x.beginPath(); x.moveTo(f + dir * 3, 5); x.lineTo(tip - dir * rr, 5); x.quadraticCurveTo(tip, 5, tip, 5 + rr); x.lineTo(tip, h - 5 - rr); x.quadraticCurveTo(tip, h - 5, tip - dir * rr, h - 5); x.lineTo(f + dir * 3, h - 5); x.stroke();
  x.globalAlpha = 1;
  x.restore();
}
function drawCard(s0, S0) {
  const cw = Math.ceil(s0.w * S0), ch = Math.ceil(s0.h * S0), S = S0 * (s0.k || 1), s = design(s0); // drawn in design px
  const c = new OffscreenCanvas(cw, ch), x = c.getContext('2d');
  x.fillStyle = s.kind === 'note' ? TOK.note : TOK.stock;
  x.fillRect(0, 0, cw, ch);
  if (s.kind === 'deck') (s.lid ? paintLid : paintBox)(x, s, S, false); // the card box's front, or its lid's inside
  if (s.kind === 'note') x.fillStyle = TOK.noteStrip, x.fillRect(0, 0, cw, 22 * S); // the sticky strip is a touch darker
  let mediaPx = null;
  if (s.media) {
    const m = s.media;
    mediaPx = { x: Math.round(m.x * S), y: Math.round(m.y * S), w: Math.round(m.w * S), h: Math.round(m.h * S) };
    const src = s.img;
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    const [fx, fy, fw, fh] = coverRect(iw / ih, mediaPx.w / mediaPx.h, s.frame);
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, fx * iw, fy * ih, fw * iw, fh * ih, mediaPx.x, mediaPx.y, mediaPx.w, mediaPx.h);
  }
  x.scale(S, S);
  x.textBaseline = 'alphabetic';
  if (s.kind === 'photo') {
    const y0 = s.media.y + s.media.h;
    x.font = font(600); x.fillStyle = TOK.text;
    if (s.oneLine) {
      x.fillText(s.title, 8, y0 + 8 + 13 * TS);
      x.font = font(400); x.fillStyle = TOK.muted; x.textAlign = 'right'; x.fillText(s.sub, s.w - 8, y0 + 8 + 13 * TS);
    } else {
      s.titleLines.forEach((l, i) => x.fillText(l, 8, y0 + 7 + 13 * TS + i * 18 * TS));
      x.font = font(400); x.fillStyle = TOK.muted; x.fillText(s.sub, 8, y0 + 7 + 13 * TS + s.titleLines.length * 18 * TS);
    }
  } else if (s.kind === 'paper') {
    x.fillStyle = TOK.body; x.fillRect(0, 0, 3, s.h);
    x.font = font(600, 16); x.fillStyle = TOK.text;
    s.lines.forEach((l, i) => x.fillText(l, 21, 16 + 16 + i * 21.5));
    x.font = font(400); x.fillStyle = TOK.muted;
    x.fillText(s.sub, 21, 16 + s.lines.length * 21.5 + 6 + 13);
  } else if (s.kind === 'polaroid') {
    x.font = font(500); x.fillStyle = TOK.body; x.textAlign = 'center';
    x.fillText(s.el.querySelector('.hand').textContent, s.w / 2, s.media.y + s.media.h + 10 + 13 * TS);
  } else if (s.kind === 'note') {
    x.font = HAND; x.fillStyle = TOK.text2;
    s.lines.forEach((l, i) => x.fillText(l, 16, 14 + 19 + i * 26.5));
  }
  return { canvas: c, mediaPx };
}

// ---------- card backs ----------
// The back of a card, in one of four styles (?backs=, or the panel):
//   postcard: a project card's back is a postcard's: the message on the left, a thin divider, and the links on ruled
//             address lines on the right under a small slime-cell stamp in the project's tint. It is also what a card
//             shows face down in a deck. The polaroid and the note keep pen backs.
//   quiet: type alone; links are ink text with a thin underline. The sticky note lists its links with small icons.
//   index: an index card: a label strip, a header rule, and body lines on faint rules. The note is ruled and handwritten.
//   pen:   quiet cards with a hand-drawn underline under each link; the note's links are handwritten in Caveat.
// Every back uses one type scale and an 8px spacing grid, and its first baseline sits 32px below its top edge. Material
// follows the front: paper cards stay paper, the polaroid's back is matte photo-paper stock, the note stays yellow.
// Layout is in CSS px, so the DOM can put the real links (hit areas) in the same places.
const BACK_STYLES = {
  postcard: { underline: 'pen', note: 'pen', postcard: true },
  quiet: { underline: 'line', note: 'icons' },
  index: { underline: 'line', note: 'ruled', ruled: true },
  pen: { underline: 'pen', note: 'pen' },
};
const INK = TOK.ink, INK_DEEP = TOK.inkDeep, NOTE_INK = TOK.text2;
const STOCK = { photo: TOK.stock, paper: TOK.stock, polaroid: TOK.stockWarm, note: TOK.note };
const lhBody = () => (T.backTight ? 19 : TOK.lhBody) * TS; // tighter backs set the copy 1 px closer
const TYPE = { // read when drawn: the type follows TS
  get title() { return { font: font(600), lh: lhBody(), color: TOK.text }; },
  get label() { return { font: font(400), lh: 16 * TS, color: TOK.muted }; },
  get body() { return { font: font(400), lh: lhBody(), color: TOK.body }; },
  get link() { return { font: font(500), color: INK_DEEP }; },
  get noteLink() { return { font: font(500), color: NOTE_INK }; },
  noteHand: { font: HAND, color: NOTE_INK },
};
// Back spacing in design px; T.backTight (an option) takes 4 px off the padding and the space between link rows.
const BK = {
  get pad() { return T.backTight ? 12 : 16; }, get first() { return BK.pad + 16 * TS; }, get row() { return (T.backTight ? 22 : 24) * TS; },
  get gap() { return (T.backTight ? 12 : 16) * TS; }, get bottom() { return BK.pad - 7 + 13 * TS; }, strip: 32,
};
// Small monochrome marks for the note's links (quiet), by link text; 24-unit boxes except GitHub (16).
const ICONS = {
  GitHub: [16, 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z'],
  Scholar: [24, 'M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z'],
  LinkedIn: [24, 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'],
  X: [24, 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'],
  Kaggle: [24, 'M18.825 23.859c-.022.092-.117.141-.281.141h-3.139c-.187 0-.351-.082-.492-.248l-5.178-6.589-1.448 1.374v5.111c0 .235-.117.352-.351.352H5.505c-.236 0-.354-.117-.354-.352V.353c0-.233.118-.353.354-.353h2.431c.234 0 .351.12.351.353v14.343l6.203-6.272c.165-.165.33-.246.495-.246h3.239c.144 0 .236.06.281.18.046.149.034.255-.036.315l-6.555 6.344 6.836 8.507c.095.104.117.208.075.339z'],
  Resume: [24, 'M6 1.5h8.5L20 7v14a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4.5 21V3A1.5 1.5 0 0 1 6 1.5zm7.5 1.8V8h4.7zM8 12v1.6h8V12zm0 4v1.6h8V16z'],
};
const backStyle = (s) => { const st = BACK_STYLES[T.backs] || BACK_STYLES.postcard; return st.postcard && s?.kind !== 'photo' ? BACK_STYLES.pen : st; };
// The postcard back: where the divider sits (a share of the width), the gap either side of it, the stamp (w, h), and how
// many ruled address lines it has (at least one per link).
const PC = { split: 0.62, get gutter() { return T.backTight ? 10 : 14; }, get stamp() { return T.backTight ? [34, 40] : [40, 48]; }, get lines() { return T.backTight ? 1 : 3; } };

// A link: its text at (x, base) and its hit area (a 24px row, 4px wider than the text on each side).
const linkAt = (a, x, base, tw, h = BK.row) => ({ a, x: x - 4, y: base - 16, w: tw + 8, h, tx: x, base, tw });

function backLayout(s, b = s) {
  const st = backStyle(s), w = b.w, m = measure(), { pad, row } = BK;
  if (st.postcard) return postcardLayout(s, b);
  if (s.kind === 'note') {
    // A tidy list, one link per line, from the same first baseline as every other back.
    const hand = st.note !== 'icons', f = hand ? TYPE.noteHand : TYPE.noteLink, x0 = pad + (hand ? 0 : 20);
    m.font = f.font;
    // Tighter backs set the list in two columns when one would not fit.
    const n = s.backLinks.length, two = T.backTight && BK.first + (n - 1) * row + BK.bottom > b.h, per = two ? Math.ceil(n / 2) : n;
    const links = s.backLinks.map((a, i) => linkAt(a, x0 + (i >= per ? Math.round((w - 2 * pad) / 2) : 0), BK.first + (i % per) * row, m.measureText(a.textContent).width));
    return { st, lines: [], links, w, h: b.h, need: BK.first + (per - 1) * row + BK.bottom };
  }
  // No label line: it only repeated the front's caption (Clark: no redundancy).
  const title = T.backTitle ? s.backTitle ?? (b.title || b.lines?.join(' ') || '') : '', label = ''; // the title can stay on the front only
  const strip = st.ruled && label && s.kind !== 'polaroid'; // index: the label gets its own strip along the top
  const lines = [];
  let y = BK.first + (strip ? BK.strip : 0) - TYPE.title.lh, gapNext = 0;
  const add = (t, kind) => {
    const f = TYPE[kind];
    y += gapNext;
    wrapLines(t, w - 2 * pad, f.font).forEach((l, i) => { y += i || kind !== 'label' ? f.lh : 18; lines.push({ t: l, f, y }); });
  };
  if (title) add(title, 'title');
  if (label && !strip) add(label, 'label');
  // Paragraphs: 8px apart; on ruled cards each one just starts on the next rule.
  let ruleTop = null;
  if (strip || (st.ruled && s.kind !== 'polaroid')) { ruleTop = y + 10; y = ruleTop + 15 - TYPE.body.lh; }
  gapNext = ruleTop == null ? 8 : 0;
  s.backParas.forEach((t) => { add(t, 'body'); gapNext = ruleTop == null ? 8 : 0; });
  // Links: ink text in rows along the bottom, the last baseline 22px above the bottom edge (top, on a back with no text).
  m.font = TYPE.link.font;
  const rows = [[]];
  let x = pad;
  for (const a of s.backLinks) {
    const tw = m.measureText(a.textContent).width;
    if (x + tw > w - pad && x > pad) { rows.push([]); x = pad; }
    rows.at(-1).push([a, x, tw]); x += tw + BK.gap;
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
function postcardLayout(s, b) {
  const st = backStyle(s), { w, h } = b, m = measure(), { pad, row } = BK;
  m.font = TYPE.link.font; // the divider moves left if a link would not fit on its address line
  const divX = Math.min(Math.round(w * PC.split), Math.floor(w - pad - PC.gutter - Math.max(...s.backLinks.map((a) => m.measureText(a.textContent).width)))), colW = divX - pad - PC.gutter, lines = [];
  let y = BK.first - TYPE.title.lh;
  const add = (t, kind, gap) => { y += gap; wrapLines(t, colW, TYPE[kind].font).forEach((l) => { y += TYPE[kind].lh; lines.push({ t: l, f: TYPE[kind], y }); }); };
  const title = T.backTitle ? s.backTitle ?? b.title ?? '' : ''; // the title can stay on the front only
  if (title) add(title, 'title', 0);
  s.backParas.forEach((t, i) => add(t, 'body', title || i ? 8 : 0));
  m.font = TYPE.link.font;
  const x0 = divX + PC.gutter, x1 = w - pad, n = Math.max(PC.lines, s.backLinks.length), base0 = h - BK.bottom - (n - 1) * row;
  const links = s.backLinks.map((a, i) => linkAt(a, x0, base0 + i * row, m.measureText(a.textContent).width));
  const stampBottom = pad - 2 + PC.stamp[1], wide = links.some((k) => k.tx + k.tw > x1);
  const need = wide ? Infinity : Math.max(Math.ceil(y + BK.bottom), stampBottom + 12 + 16 + (n - 1) * row + BK.bottom);
  if (need <= h) return { st, lines, links, w, h, need, postcard: { divX, x0, x1, base0, n } };
  return stackedPostcard(s, b) || { st, lines, links, w, h, need, postcard: { divX, x0, x1, base0, n } };
}
// A smaller card's postcard back when the columns will not hold its message: the message runs the full width (beside
// the stamp at the top), and the links share one ruled line along the bottom (a second if they must).
function stackedPostcard(s, b) {
  const st = backStyle(s), { w, h } = b, m = measure(), { pad, row } = BK, [sw, sh] = PC.stamp, stampBottom = pad - 2 + sh;
  const lines = []; let y = BK.first - TYPE.body.lh;
  s.backParas.forEach((t, i) => {
    y += i ? 8 : 0; m.font = TYPE.body.font;
    let line = '';
    const width = () => (y + TYPE.body.lh - 13 * TS < stampBottom + 4 ? w - 2 * pad - sw - 10 : w - 2 * pad); // beside the stamp, then full
    for (const word of t.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (line && m.measureText(test).width > width()) { y += TYPE.body.lh; lines.push({ t: line, f: TYPE.body, y }); line = word; } else line = test;
    }
    if (line) { y += TYPE.body.lh; lines.push({ t: line, f: TYPE.body, y }); }
  });
  m.font = TYPE.link.font;
  const rows = [[]]; let x = pad;
  for (const a of s.backLinks) { const tw = m.measureText(a.textContent).width; if (x + tw > w - pad && x > pad) { rows.push([]); x = pad; } rows.at(-1).push([a, x, tw]); x += tw + BK.gap; }
  const base0 = h - BK.bottom - (rows.length - 1) * row;
  const links = rows.flatMap((r, i) => r.map(([a, lx, tw]) => linkAt(a, lx, base0 + i * row, tw)));
  const need = Math.ceil(y + row + (rows.length - 1) * row + BK.bottom);
  return need <= h ? { st, lines, links, w, h, need, postcard: { stacked: true, base0, n: rows.length, x0: pad, x1: w - pad } } : null;
}
// OKLab blend of an sRGB hex toward another hex's hue at the first one's lightness and chroma (mix 0 to 1): the stamp's
// olive ink with a cast of the project's color.
function tintHex(baseHex, hueHex, mix) {
  const [L, a0, b0] = oklab(hexRGB(baseHex)), c = oklab(hexRGB(hueHex)), C = Math.hypot(a0, b0), hh = Math.atan2(c[2], c[1]);
  const [r, g, bl] = fromOklab([L, a0 + mix * (C * Math.cos(hh) - a0), b0 + mix * (C * Math.sin(hh) - b0)]);
  return `rgb(${r.toFixed(0)}, ${g.toFixed(0)}, ${bl.toFixed(0)})`;
}
// A small postage stamp: perforated paper, a fine frame, and a few slime cells (seeded by the card) in the tinted ink.
function paintStamp(x, x0, y0, sw, sh, ink, seed) {
  x.fillStyle = TOK.stockWarm; x.fillRect(x0, y0, sw, sh);
  x.fillStyle = TOK.stock; // the perforation: little bites along every edge
  const bite = (cx, cy) => { x.beginPath(); x.arc(cx, cy, 1.5, 0, 2 * Math.PI); x.fill(); };
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
function drawPostcard(x, s, L) {
  const P = L.postcard, { w, h } = L, { pad, row } = BK;
  if (!P.stacked) { x.fillStyle = '#a5a9708c'; x.fillRect(P.divX, pad, 1, h - 2 * pad); } // the divider, a thin olive rule
  const [sw, sh] = PC.stamp;
  paintStamp(x, w - pad - sw + 2, pad - 2, sw, sh, tintHex(TOK.inkLine, s.hueHex, 0.45), s.id + 1);
  x.fillStyle = '#a5a97059'; // the address lines
  for (let i = 0; i < P.n; i++) x.fillRect(P.x0 - 2, P.base0 + i * row + 5, P.x1 - P.x0 + 2, 1);
  for (const l of L.lines) { x.font = l.f.font; x.fillStyle = l.f.color; x.fillText(l.t, pad, l.y); }
  for (const k of L.links) { // written on its line, which darkens under it as its underline
    x.font = TYPE.link.font; x.fillStyle = TYPE.link.color; x.fillText(k.a.textContent, k.tx, k.base);
    x.fillStyle = TOK.inkLine; x.fillRect(k.tx, k.base + 5, k.tw, 1);
  }
}

// Deterministic noise, so the atlas looks the same on every build.
function rng(seed) { let t = seed >>> 0; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296); }
// Matte stock: a faint, fine grain (photo-paper backs and the note).
function grain(x, cw, ch, amt, seed) {
  const img = x.getImageData(0, 0, cw, ch), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}
// A hand-drawn underline: a slightly wavering, slightly tilted stroke that starts and ends a touch past the word.
function penLine(x, x0, x1, y, seed, width) {
  const r = rng(seed * 7919 + 17), tilt = (r() - 0.5) * 1.2, ph = r() * 6.28, n = Math.max(4, Math.round((x1 - x0) / 6));
  x.beginPath();
  for (let i = 0; i <= n; i++) {
    const u = i / n, px = x0 - 2 + (x1 - x0 + 3) * u;
    const py = y + tilt * (u - 0.5) + Math.sin(ph + u * 5) * 0.45;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.lineWidth = width; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();
}

function drawBack(s0, S0) {
  const S = S0 * (s0.k || 1), s = design(s0), L = backLayout(s), { st, lines, links, w, h } = L, { pad } = BK; // design px
  const cw = Math.ceil(s0.w * S0), chh = Math.ceil(s0.h * S0);
  const c = new OffscreenCanvas(cw, chh), x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = STOCK[s.kind]; x.fillRect(0, 0, cw, chh);
  if (s.kind === 'polaroid') grain(x, cw, chh, 9, 7); // the photo paper's back: warmer, matte, a little toothy
  if (s.kind === 'note') grain(x, cw, chh, 5, 11);
  x.scale(S, S);
  if (s.kind === 'note') { x.fillStyle = TOK.noteStrip; x.fillRect(0, 0, w, 22); } // the same sticky strip as the front
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
    for (let ry = L.ruleTop + TYPE.body.lh; ry <= L.ruleEnd; ry += TYPE.body.lh) x.fillRect(pad - 4, ry, w - 2 * pad + 8, 1);
  }
  if (s.kind === 'note' && st.note === 'ruled') {
    x.fillStyle = '#c9b95e66';
    for (let ry = BK.first + 5; ry < h - 6; ry += BK.row) x.fillRect(0, ry, w, 1);
  }
  for (const l of lines) { x.font = l.f.font; x.fillStyle = l.f.color; x.fillText(l.t, pad, l.y); }
  links.forEach((k, i) => {
    const t = k.a.textContent;
    if (s.kind === 'note') {
      const hand = st.note !== 'icons';
      x.font = hand ? TYPE.noteHand.font : TYPE.noteLink.font; x.fillStyle = NOTE_INK;
      x.fillText(t, k.tx, k.base);
      if (!hand && ICONS[t]) {
        const [vb, d] = ICONS[t], sz = 12;
        x.save(); x.translate(pad, k.base - 11); x.scale(sz / vb, sz / vb); x.fillStyle = NOTE_INK; x.fill(new Path2D(d)); x.restore();
      }
      if (st.note === 'pen') { x.strokeStyle = TOK.inkLine; penLine(x, k.tx, k.tx + k.tw, k.base + 4, i + 1, 1.3); }
      else if (st.note === 'icons') { x.fillStyle = INK; x.fillRect(k.tx, k.base + 3, k.tw, 1); }
      return;
    }
    x.font = TYPE.link.font; x.fillStyle = TYPE.link.color; x.fillText(t, k.tx, k.base);
    if (st.underline === 'pen') { x.strokeStyle = TOK.inkLine; penLine(x, k.tx, k.tx + k.tw, k.base + 4, s.id * 13 + i, 1.15); }
    else if (L.ruleTop == null) { x.fillStyle = INK; x.fillRect(k.tx, k.base + 3, k.tw, 1); }
    else { x.fillStyle = INK_DEEP; x.fillRect(k.tx, k.base + 5, k.tw, 1); } // the link's stretch of its rule
  });
  return { canvas: c, links, w, h };
}
function drawLidOutside(s, S) {
  const c = new OffscreenCanvas(Math.ceil(s.w * S), Math.ceil(s.h * S));
  paintLid(c.getContext('2d'), design(s), S * (s.k || 1), true);
  return { canvas: c, links: [], w: s.w, h: s.h };
}
// A card at its design size (what it is drawn and laid out in; the desk shows it at its card scale).
const design = (s) => (s.k && s.k !== 1 ? { ...s, w: s.w / s.k, h: s.h / s.k } : s);
// The DOM links sit exactly on the drawn ones, as their hit areas.
function placeBackLinks(s, links) {
  for (const k of links) Object.assign(k.a.style, { left: k.x + 'px', top: k.y + 'px', width: k.w + 'px', height: k.h + 'px' });
}
// Without WebGPU the DOM shows the same drawn back, as the .back's background, with the links over it.
function paintDomBack(s) {
  const S = Math.min(3, devicePixelRatio || 1), { canvas: oc, links } = drawBack(s, S);
  const c = Object.assign(document.createElement('canvas'), { width: oc.width, height: oc.height });
  c.getContext('2d').drawImage(oc, 0, 0);
  s.backEl.style.backgroundImage = `url(${c.toDataURL()})`;
  placeBackLinks(s, links);
}

// ---------- GPU ----------

let gpu = null, sim = null, tweakSync = null;
let dealing = !reduced; // decks deal cards (no deals with reduced motion or without WebGPU)

// ---------- auto quality ----------
// Clark's settings are the reference look at the reference desk (1440x900 CSS px): the agent count scales with the
// screen so the density per pixel stays the same. A device tier from cheap signals caps it, and a runtime check steps
// it down (30% at a time, then the sim resolution) if a frame's GPU work runs over budget. Fewer agents deposit more
// each, so the veins keep their weight. Never above the reference density.
const Q = { tier: { name: 'high', cap: 1 }, level: 1, shown: 1, resScale: 1, depMul: 1, gpuMs: 0, samples: [], cool: 0, calm: 0, nextCheck: 0, checkUntil: 2.5 };
function deviceTier(adapter) {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const phone = matchMedia('(pointer: coarse)').matches || view.phone;
  if (adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter) return { name: 'low', cap: 0.25 };
  if (phone || mem <= 4 || cores <= 4) return { name: 'low', cap: 0.35 };
  if (cores >= 8 && mem >= 8) return { name: 'high', cap: 1 };
  return { name: 'mid', cap: 0.6 };
}
const autoOn = () => !!T.auto;
const simRes = () => T.res * (autoOn() ? Q.resScale : 1);
// Agents for a page at the reference density, and how many of them run now.
const refAgents = (cssW, cssH) => Math.max(6000, Math.round((T.agents * cssW * cssH * (simRes() / 0.5) ** 2) / (REF_W * REF_H)));
const activeAgents = (sm) => Math.max(2000, Math.round(sm.n * (autoOn() ? Q.shown : 1))); // eased toward Q.level

const SB = { STORAGE: 0x80, COPY_DST: 0x08, UNIFORM: 0x40 };

async function initGpu() {
  if (qs.has('nogpu') || !navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const hasTs = adapter.features.has('timestamp-query');
    const device = await adapter.requestDevice({ requiredFeatures: hasTs ? ['timestamp-query'] : [], requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
    Q.tier = deviceTier(adapter);
    const ts = hasTs ? { set: device.createQuerySet({ type: 'timestamp', count: 2 }), resolve: device.createBuffer({ size: 16, usage: 0x0200 | 0x0004 }),
      read: device.createBuffer({ size: 16, usage: 0x0001 | 0x0008 }), busy: false } : null;
    const ctx = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque' });
    const mod = (code) => device.createShaderModule({ code });
    const comp = (code) => device.createComputePipelineAsync({ layout: 'auto', compute: { module: mod(code), entryPoint: 'main' } });
    const rend = (video) => { const m = mod(renderWGSL(video)); return device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format }] } }); };
    const grainMod = mod(GRAIN_WGSL);
    const grainPipe = device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: grainMod, entryPoint: 'vs' }, fragment: { module: grainMod, entryPoint: 'fs', targets: [{ format: 'rg8unorm' }] } });
    const [ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainP, tilePipe] = await Promise.all([comp(E_WGSL), comp(AGENT_WGSL), comp(DIFFUSE_WGSL), rend(false), rend(true), grainPipe, comp(TILE_WGSL)]);
    const uniform = device.createBuffer({ size: U.byteLength, usage: SB.UNIFORM | SB.COPY_DST });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    device.lost.then((i) => { console.warn('WebGPU device lost', i.message); });
    return { device, ctx, format, ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainPipe: grainP, tilePipe, uniform, sampler, ts };
  } catch (err) {
    console.warn('WebGPU unavailable', err);
    return null;
  }
}

// Canvas-sized resources every page shares: the canvas itself, the baked paper grain, and the frozen frame that the
// outgoing page leaves behind during a page change.
function createShared(g) {
  const { device } = g;
  const cap = view.phone ? 6.5e6 : 9e6;
  let dev = Math.min(devicePixelRatio || 1, 2);
  const cssH = view.phone ? view.docH : view.h;
  if (view.w * cssH * dev * dev > cap) dev = Math.sqrt(cap / (view.w * cssH));
  const CW = Math.round(view.w * dev), CH = Math.round(cssH * dev);
  dev = CW / view.w;
  view.dpr = dev;
  canvas.width = CW; canvas.height = CH;
  canvas.style.height = cssH + 'px';
  const tex = (format, usage) => device.createTexture({ size: [CW, CH], format, usage });
  // Two frozen textures alternate, so the pass that captures the outgoing page never samples the one it writes.
  const TX = Math.ceil(CW / TILE), nTiles = TX * Math.ceil(CH / TILE);
  const tiles = device.createBuffer({ size: nTiles * 8, usage: SB.STORAGE });
  const tileBG = device.createBindGroup({ layout: g.tilePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: g.uniform } }, { binding: 1, resource: { buffer: tiles } }] });
  return { CW, CH, dev, cssH, paper: tex('rg8unorm', 0x04 | 0x10), frozenTex: [tex(g.format, 0x04 | 0x10), tex(g.format, 0x04 | 0x10)], fz: 0, TX, nTiles, tiles, tileBG };
}

// One page (main desk or research) gets its own viewport-sized sim; only the active page steps and renders.
function createSim(g, page) {
  const { device } = g;
  const { CW, CH, dev, cssH } = shared;
  // The slime runs on a coarser grid (T.res sim px per CSS px), sampled smoothly under crisp cards and text.
  const res = simRes();
  const W = Math.round(view.w * res), H = Math.round(cssH * res), dpr = W / view.w;
  const tex = (w, h, format, usage) => device.createTexture({ size: [w, h], format, usage });
  const TU = { COPY_DST: 0x02, TEXTURE: 0x04, STORAGE: 0x08, RENDER: 0x10 };
  const trail = [0, 1].map(() => tex(W, H, 'rgba16float', TU.TEXTURE | TU.STORAGE));
  const EW = Math.ceil(W / 2), EH = Math.ceil(H / 2);
  const etex = [0, 1].map(() => tex(EW, EH, 'r32float', TU.TEXTURE | TU.STORAGE));
  const dep = device.createBuffer({ size: W * H * 16, usage: SB.STORAGE }); // rgb (hue-weighted) and density
  const ref = refAgents(view.w, cssH), n = Math.round(ref * (autoOn() ? Q.tier.cap : 1)); // allocated: the tier's cap
  // Scatter the agents; each carries the hue of the nearest card on this page.
  const origin = page * view.w, mine = sources.filter((x) => view.phone || x.region === page);
  const init = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    let best = 0, bd = Infinity;
    for (const c of mine) { const d = Math.hypot(x - (c.x - origin) * dpr, y - c.y * dpr); if (d < bd) { bd = d; best = c.id; } }
    init.set([x, y, Math.random() * 6.2832, best * 8], i * 4);
  }
  const agents = device.createBuffer({ size: init.byteLength, usage: SB.STORAGE | SB.COPY_DST });
  device.queue.writeBuffer(agents, 0, init);

  // Text mask for this page at device resolution: r = crisp signature, g = the tagline, b = where ink thins behind text.
  // Each layer paints one color channel and 'lighter' adds them, so one canvas uploads all three.
  const mask = tex(CW, CH, 'rgba8unorm', TU.TEXTURE | TU.COPY_DST | TU.RENDER);
  const mc = new OffscreenCanvas(CW, CH), mx = mc.getContext('2d');
  mx.fillStyle = '#000'; mx.fillRect(0, 0, CW, CH);
  mx.globalCompositeOperation = 'lighter';
  if (page === 0) {
    // The DOM name's own weight and tracking, so the two never drift; both sizes are past Inter's 32px optical size,
    // so the canvas gets the same display cut.
    const ns = getComputedStyle(nameEl);
    mx.font = `${ns.fontWeight} ${nameBox.size * dev}px Inter`;
    mx.letterSpacing = `${parseFloat(ns.letterSpacing) * dev}px`;
    const drawName = (color, blur) => { mx.filter = blur ? `blur(${blur * dev}px)` : 'none'; mx.fillStyle = color; mx.fillText('Clark Peng', nameBox.x * dev, nameBox.baseline * dev); };
    drawName('#f00', 0);
    drawName('#00f', 10); drawName('#00f', 10);
    // Element rects are on screen; the mask is on this page.
    const sy = view.phone ? scrollY : 0, sx = view.phone ? 0 : cam.x - origin;
    // The tagline, drawn here (not by the DOM) so it turns with its page: the DOM's own line breaks and positions.
    const ts = getComputedStyle(taglineEl), node = taglineEl.firstChild, range = document.createRange();
    // At its CSS size under a scale, so the canvas picks Inter's optical size for 16px, as the DOM does.
    mx.save(); mx.scale(dev, dev);
    mx.filter = 'none'; mx.letterSpacing = '0px'; mx.fillStyle = '#0f0';
    mx.font = `${ts.fontWeight} ${ts.fontSize} Inter`;
    const ascent = mx.measureText('Hg').fontBoundingBoxAscent;
    let line = null;
    const flush = () => line && mx.fillText(line.t.trimEnd(), line.x + sx, line.top + sy + ascent);
    for (let i = 0; i < node.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r) continue;
      if (!line || r.top > line.top + 2) { if (node.data[i] === ' ') continue; flush(); line = { t: '', x: r.left, top: r.top }; }
      line.t += node.data[i];
    }
    flush();
    mx.restore();
    mx.filter = `blur(${12 * dev}px)`; mx.fillStyle = '#00f';
    for (const el of [taglineEl, linksEl, regionLabel]) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      mx.beginPath(); mx.roundRect((r.left + sx - 10) * dev, (r.top + sy - 8) * dev, (r.width + 20) * dev, (r.height + 16) * dev, 10 * dev); mx.fill();
    }
  }
  device.queue.copyExternalImageToTexture({ source: mc }, { texture: mask }, [CW, CH]);

  const bg = (pipe, entries) => device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: entries.map((r, i) => ({ binding: i, resource: r })) });
  const U0 = { buffer: g.uniform };
  const view_ = (t) => t.createView();
  return {
    page, origin, W, H, EW, EH, n, ref, dpr, bloom: 0, trail, etex, dep, agents, mask, parity: 0, t: 0, warm: 0,
    eBG: [0, 1].map((p) => bg(g.ePipe, [U0, view_(etex[p]), view_(etex[1 - p])])),
    agentBG: [0, 1].map((p) => bg(g.agentPipe, [U0, { buffer: agents }, { buffer: dep }, view_(trail[p]), view_(etex[1 - p])])),
    diffuseBG: [0, 1].map((p) => bg(g.diffusePipe, [U0, { buffer: dep }, view_(trail[p]), view_(trail[1 - p])])),
  };
}
function renderEntries(g, sm, extra = []) {
  return [
    { binding: 0, resource: { buffer: g.uniform } }, { binding: 1, resource: sm.trail[sm.parity].createView() },
    { binding: 2, resource: sm.mask.createView() }, { binding: 3, resource: shared.atlas.createView() }, { binding: 4, resource: g.sampler },
    { binding: 5, resource: shared.paper.createView() }, { binding: 6, resource: shared.frozenTex[shared.fz].createView() }, { binding: 9, resource: { buffer: shared.tiles } }, ...extra];
}
// A card in a deck (on the pile, in the fan, on its way in or out) shows a plain paper back with only the deck's name
// on it, handwritten where the upright pile shows and reading up it like the box's spine; the card's own back shows
// only on the desk, when it is turned over. Drawn at the card's size on the desk, landscape or portrait.
function paintPlainBack(s, S) {
  const cs = view.cs || 1, region = s.region, portrait = s.w <= s.h, w = s.w, h = s.h;
  const c = new OffscreenCanvas(Math.ceil(w * S), Math.ceil(h * S)), x = c.getContext('2d');
  x.scale(S, S); x.fillStyle = TOK.stock; x.fillRect(0, 0, w, h);
  x.font = font(500, 26 * cs, 'Caveat'); x.fillStyle = TOK.text2; x.textAlign = 'center'; x.textBaseline = 'middle';
  // Upright in the pile a landscape card is turned a quarter turn clockwise, so its back's lower part is the part that
  // shows and the name is written upside down there; a portrait card's left part shows, the name turned to read up.
  if (portrait) { x.translate(w * 0.27, h / 2); x.rotate(-Math.PI / 2); } else { x.translate(w / 2, h * 0.73); x.rotate(Math.PI); }
  x.fillText(BOX_NAMES[region], 0, 2);
  return c;
}
async function buildAtlas(g) {
  const S = shared.dev; // cards rasterize at device resolution
  const drawn = [];
  for (const src of sources) drawn.push(drawCard(src, S));
  const backs = sources.filter((src) => src.backEl || src.lid).map((src) => ({ src, ...(src.lid ? drawLidOutside(src, S) : drawBack(src, S)) }));
  const dc = new OffscreenCanvas(Math.ceil(sources[0].w * S), Math.ceil(sources[0].h * S));
  paintDeckBack(dc.getContext('2d'), S, dc.width, dc.height); // what a card in a deck shows with the earlier backs (backs: pen)
  const plainFor = sources.filter(decked), plain = plainFor.map((s) => paintPlainBack(s, S)); // each card's plain deck back, at its own size
  // The corners' labels, in pen (transparent around the ink): one canvas size for both, the longer word's.
  const lf = font(500, T.cornerLabel * view.k * S, 'Caveat'), mc = measure();
  mc.font = lf;
  const lw = Math.ceil(Math.max(...NAMES.map((t) => mc.measureText(t).width)) + 6 * S), lh = Math.ceil(24 * view.k * S);
  const labels = NAMES.map((t) => {
    const c = new OffscreenCanvas(lw, lh), x = c.getContext('2d');
    Object.assign(x, { font: lf, fillStyle: '#000', textAlign: 'center', textBaseline: 'middle' });
    x.fillText(t, lw / 2, lh / 2);
    return c;
  });
  shared.label = { hw: lw / 2 / S, hh: lh / 2 / S };
  // Shelf-pack the cards into one atlas.
  const AW = Math.min(4096, g.device.limits.maxTextureDimension2D);
  let x = 0, y = 0, rowH = 0;
  const extra = [dc, ...plain, ...labels], places = [...drawn, ...backs, ...extra.map((c) => ({ canvas: c }))].map(({ canvas: c }) => {
    if (x + c.width > AW) { x = 0; y += rowH + 2; rowH = 0; }
    const p = { x, y }; x += c.width + 2; rowH = Math.max(rowH, c.height); return p;
  });
  const AH = y + rowH;
  const atlas = g.device.createTexture({ size: [AW, AH], format: 'rgba8unorm', usage: 0x04 | 0x02 | 0x10 });
  drawn.forEach(({ canvas: c, mediaPx }, i) => {
    const p = places[i], src = sources[i];
    g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
    src.atlasAt = { x: p.x, y: p.y };
    src.uv = [p.x / AW, p.y / AH, (p.x + src.w * S) / AW, (p.y + src.h * S) / AH];
    src.mediaUV = mediaPx ? [mediaPx.x / (src.w * S), mediaPx.y / (src.h * S), (mediaPx.x + mediaPx.w) / (src.w * S), (mediaPx.y + mediaPx.h) / (src.h * S)] : [0, 0, 0, 0];
  });
  backs.forEach(({ src, canvas: c, links }, i) => {
    const p = places[drawn.length + i];
    g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
    src.buv = [p.x / AW, p.y / AH, (p.x + src.w * S) / AW, (p.y + src.h * S) / AH];
    placeBackLinks(src, links);
  });
  const [deckUV, ...rest] = extra.map((c, i) => {
    const p = places[drawn.length + backs.length + i];
    g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
    return [p.x / AW, p.y / AH, (p.x + c.width) / AW, (p.y + c.height) / AH];
  });
  plainFor.forEach((s, i) => (s.puv = rest[i]));
  const labelUV = rest.slice(plainFor.length);
  Object.assign(shared, { deckUV, labelUV });
  shared.atlas = atlas;
}

// ---------- uniforms ----------

// Uniform layout: 25 vec4 of globals, MAX / 4 of draw order, 1 of video uv, then the cards (CARD_VEC4 vec4 each).
const G_HEAD = 25, VU_OFF = (G_HEAD + MAX / 4) * 4, CARD0 = G_HEAD + MAX / 4 + 1, CARD_VEC4 = 13;
const U = new Float32Array((CARD0 + MAX * CARD_VEC4) * 4);
function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}
const rodrigues = (v, a, phi) => {
  const c = Math.cos(phi), s = Math.sin(phi), dot = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const cr = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + a[i] * dot * (1 - c));
};
const easeFlip = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
// Card plane -> screen homography (sim px): lift height, in-plane rotation, the flip about the card's own vertical axis,
// and a 3D tilt toward velocity.
// OKLab <-> 8-bit sRGB, for the mild project inks.
const oklab = (rgb) => {
  const [r, g, b] = rgb.map(lin);
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const fromOklab = ([L, A, B]) => {
  const [l, m, s] = [L + 0.3963377774 * A + 0.2158037573 * B, L - 0.1055613458 * A - 0.0638541728 * B, L - 0.0894841775 * A - 1.291485548 * B].map((x) => x ** 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => 255 * clamp(c) ** (1 / 2.2));
};
// A closed card's mild ink: its own hue at the shared ink's lightness and chroma, so it sits on the page as calmly as the
// olive and only the hue changes.
function mildInk(hex, baseHex, mix = 1) {
  const [L, a0, b0] = oklab(hexRGB(baseHex)), c = oklab(hexRGB(hex)), C = Math.hypot(a0, b0);
  // Blend straight from the shared ink toward the card's own hue (at the shared lightness and chroma), so a small mix is
  // the olive with a faint cast of the card's color; rotating the hue instead would pass through unrelated hues (green).
  const h = Math.atan2(c[2], c[1]);
  return absorbance(fromOklab([L, a0 + mix * (C * Math.cos(h) - a0), b0 + mix * (C * Math.sin(h) - b0)]));
}
function cardUniform(s, dpr, o, originX = 0, jbloom = -1, tint = 0, base = null, hueMix = 1) {
  // Flip: lift in the first ~22%, turn over in the middle, lay back down in the last ~22% (same path in reverse).
  const tn = s.turn ?? (s.down > 0 ? 1 - s.down : null); // turned face down by its own clock: a draw, or over a deck
  const fa = s.flipA ?? (tn != null ? Math.PI * (1 - easeFlip(tn)) : Math.PI * easeFlip(clamp((s.flip - 0.22) / 0.56))), fc = Math.cos(fa); // a drawn card turns on its own clock; the box's lid by its angle
  const up = s.flip > 0 && s.flip < 1 ? smooth(s.flip / 0.22) * (1 - smooth((s.flip - 0.78) / 0.22)) : 0;
  const lift = Math.max(s.lift, (view.phone ? 0.3 : 0.9) * up, s.flyLift); // on a phone a flip lifts less, so the card stays inside the screen
  const th = (shownRot(s) * Math.PI) / 180 + s.sway, sc = (1 + 0.035 * lift) * (1 - 0.014 * (s.squash || 0));
  let mu = [Math.cos(th) * sc, Math.sin(th) * sc, 0], mv = [-Math.sin(th) * sc, Math.cos(th) * sc, 0];
  // Never exactly edge-on, where the homography would be singular.
  const fe = Math.sign(fc || 1) * Math.max(Math.abs(fc), 0.02), fs = Math.sqrt(1 - fe * fe) * (Math.sin(fa) < 0 ? -1 : 1);
  if (s.flip > 0 || tn != null || s.flipA) mu = rodrigues(mu, mv.map((v) => v / sc), Math.atan2(fs, fe));
  const phi = Math.hypot(s.tilt[0], s.tilt[1]);
  if (phi > 1e-5) { const ax = [-s.tilt[1] / phi, s.tilt[0] / phi, 0]; mu = rodrigues(mu, ax, phi); mv = rodrigues(mv, ax, phi); }
  const f = 1800 * dpr, zh = lift * T.lift * dpr, cx = (s.x - originX) * dpr, cy = s.y * dpr; // page-local
  const inv = invert3([f * mu[0] - cx * mu[2], f * mv[0] - cx * mv[2], cx * (f - zh), f * mu[1] - cy * mu[2], f * mv[1] - cy * mv[2], cy * (f - zh), -mu[2], -mv[2], f - zh]);
  const hw = (s.w * dpr) / 2, hh = (s.h * dpr) / 2;
  U.set([inv[0], inv[1], inv[2], s.playlist ? 1 : 0, inv[3], inv[4], inv[5], s.rel, inv[6], inv[7], inv[8], s.landS,
    hw, hh, 3 * dpr, Math.min(1, lift), cx, cy, Math.cos(th), Math.sin(th), sc, s.hover, s.burst, zh,
    ...s.uv, ...s.mediaUV, Math.hypot(hw, hh) * sc * 1.04 + 2, fc < 0 ? -1 : 1, s.landK ? 1 : 0, Math.abs(fe),
    ...((s.fly || s.down > 0) && shared.deckUV ? (backStyle(s).postcard && s.puv ? s.puv : shared.deckUV) : s.buv || s.uv), ...hexRGB(s.hueHex).map(lin), s.flip !== s.flipTo || s.landK || s.flying ? 1 : 0,
    // On a j page every card emits its J ink (blooming in from the shared ink on arrival); on paper every inked card
    // emits a mild share of its ink (tint) and the full ink while open.
    ...(jbloom >= 0 && s.jinkHex ? [...absorbance(hexRGB(s.jinkHex)), jbloom] : s.inkHex ? inkOn(s, tint, base, hueMix) : [0, 0, 0, 0]),
    ...(s.imp ? [(s.imp.x - originX) * dpr, s.imp.y * dpr, (1 - s.imp.t / IMPRINT_S) ** 2, 0] : [0, 0, 0, 0])], o);
}

// Paper: an open card emits its full ink; a closed one a tint share of its mild ink. Blends between them as it opens.
function inkOn(s, tint, base, hueMix = 1) {
  const full = absorbance(hexRGB(s.inkHex));
  if (!tint || !base) return [...full, s.emit];
  const mild = mildInk(s.inkHex, base, hueMix), w = Math.max(s.emit, tint), u = s.emit / w;
  return [...mild.map((m, i) => m + (full[i] - m) * u), w];
}

const clock = { t: 0, frame: 0 };
const NAME_ABS = absorbance(NAME_INK);
// capturing: drawing the frozen frame a page turn starts from (the page without its corner). trans.fade: the crossfade
// from the frame before a sim resolution change.
let capturing = false;
const trans = { fade: 0 };
function writeUniforms(g, sm = sim, hold = false) {
  const s = sm, d = s.dpr, dev = shared.dev, st = STYLE[PAGE_NAMES[s.page]], jm = isJ(s);
  // This page's cards whose shadows can reach the screen, bottom to top; the passes only visit these.
  const sx = view.phone ? 0 : s === sim ? cam.x : s.origin, sy = view.phone ? scrollY : 0; // a page warming in the background sees its own view
  const order = sources.filter((x) => {
    if ((!view.phone && x.region !== s.page) || x.gone) return false;
    const r = Math.hypot(x.w, x.h) / 2 + 100 * Math.max(T.shadowSoft, 1);
    return x.x + r > sx && x.x - r < sx + view.w && x.y + r > sy && x.y - r < sy + view.h;
  }).sort((a, b) => a.z - b.z).map((x) => x.id);
  const vs = videoSrc;
  let vu = [0, 0, 1, 1];
  if (vs) {
    const el = vs.player.a;
    vu = coverRect((el.videoWidth || 16) / (el.videoHeight || 9), vs.media.w / vs.media.h, vs.frame);
  }
  { const now = performance.now(), dt = Math.min(0.1, (now - (focusAt || now)) / 1000); focusAt = now;
    // While any card is flipping, the background snaps back toward sharp; afterwards it follows the hover again. Same smoothing.
    const flipping = sources.some((o) => o.flip !== o.flipTo);
    const want = hovered && !hovered.dragging && !flipping ? 1 : 0;
    focus += (want - focus) * (1 - Math.exp(-dt / hoverTau(want > focus))); }
  U.set([s.W, s.H, hold ? s.n : activeAgents(s), d,
    T.speed / 60 * d, T.deposit * Q.depMul, T.decay, T.diffuse,
    T.sd * d, T.sa, T.turn, 0,
    T.respawn, T.edge, sources.length, clock.frame,
    (cursor.x - s.origin) * d, cursor.y * d, cursor.amt, 0.94, 0.6, 0.4, st.gain, st.gamma,
    ...absorbance(hexRGB(st.ink)), s.W / shared.CW, ...NAME_ABS, Math.max(1, Math.round(1 / T.share)),
    vs ? vs.id : -1, videoMix, vs?.player.fading ? clamp(vs.player.fade) : 0, dev * view.k,
    EDGE_MODES.indexOf(T.edgeMode), T.ridge * d, T.ridgeW * d, T.landR * d,
    T.landBurst, T.landDecay, T.hoverE, T.cursorE,
    st.soft + (T.focusSoft - st.soft) * smooth(focus), st.grain, 0, order.length,
    T.edgeMode === 'ring2' ? 1 : T.ring2, T.ring2At, T.corner, st.opacity,
    T.shadowSoft, T.shadow, T.landRelease, shared.TX,
    CHOICES.mode.indexOf(st.mode), st.glow, st.halo, s.t,
    ...hexRGB(st.bg).map(lin), 0,
    shared.CW, shared.CH, trans.fade, turn.on && !capturing ? 1 : 0,
    st.stain, st.bleed * d, hold ? 1 : 0, 0,
    T.pDesat, T.pWarm, T.pBlack, T.pDuo,
    T.pGrain, T.pMatte, 0, 0,
    ...(turn.on && !capturing ? [...dirOf(turn.a), turn.d * dev, rollR(turn.d) * dev] : [0, 0, 0, 0]),
    ...(capturing || view.phone ? [0, 0, 0, 0] : [...dirOf(door.a), door.d * dev, rollR(door.d) * dev]),
    // the label sits on the flap at rest, its foot a few px from the fold
    (view.k * (T.cornerSize - Math.PI * DOOR.R - 4) - shared.label.hh) * dev, shared.label.hw * dev, shared.label.hh * dev, turn.on ? 1 - smooth((turn.d - turn.start) / (250 * view.k)) : 1,
    ...shared.labelUV[page], ...shared.labelUV[turn.from],
    ...order, ...Array(MAX - order.length).fill(0), ...vu], 0);
  for (const src of sources) cardUniform(src, d, (CARD0 + src.id * CARD_VEC4) * 4, s.origin, jm ? s.bloom : -1, st.mode === 'paper' ? st.tint : 0, st.ink, st.hueMix ?? 1);
  g.device.queue.writeBuffer(g.uniform, 0, U);
}

// ---------- frame ----------

// A step is the E pass, the agents, then the diffuse; a step spread over frames runs its agents in parts (see stepWarm), and
// only the part with the diffuse completes it.
function encodeStep(enc, only = 'ead', ts = null, sm = sim, count = activeAgents(sm)) {
  const s = sm, p = s.parity;
  const pass = enc.beginComputePass(ts ? { timestampWrites: { querySet: gpu.ts.set, beginningOfPassWriteIndex: 0 } } : undefined);
  if (only.includes('e')) { pass.setPipeline(gpu.ePipe); pass.setBindGroup(0, s.eBG[p]); pass.dispatchWorkgroups(Math.ceil(s.EW / 8), Math.ceil(s.EH / 8)); }
  if (only.includes('a')) { pass.setPipeline(gpu.agentPipe); pass.setBindGroup(0, s.agentBG[p]); pass.dispatchWorkgroups(Math.ceil(count / 64)); }
  if (only.includes('d')) { pass.setPipeline(gpu.diffusePipe); pass.setBindGroup(0, s.diffuseBG[p]); pass.dispatchWorkgroups(Math.ceil(s.W / 16), Math.ceil(s.H / 16)); }
  pass.end();
  if (only.includes('d')) { s.parity = 1 - p; s.t += STEP; }
}
function encodeRender(enc, target, ts = null, s = sim) {
  let pipe = gpu.renderPipe, bg = gpu.device.createBindGroup({ layout: gpu.renderPipe.getBindGroupLayout(0), entries: renderEntries(gpu, s) });
  if (videoSrc && videoMix > 0) {
    try {
      const pl = videoSrc.player;
      const ext = gpu.device.importExternalTexture({ source: pl.a });
      // The incoming clip only once it has a frame; until then both slots show the current one.
      const extB = pl.fading && pl.b.readyState >= 2 ? gpu.device.importExternalTexture({ source: pl.b }) : ext;
      pipe = gpu.videoPipe;
      bg = gpu.device.createBindGroup({ layout: gpu.videoPipe.getBindGroupLayout(0), entries: renderEntries(gpu, s, [{ binding: 7, resource: ext }, { binding: 8, resource: extB }]) });
    } catch { /* frame not ready yet: draw the poster */ }
  }
  const tp = enc.beginComputePass();
  tp.setPipeline(gpu.tilePipe); tp.setBindGroup(0, shared.tileBG); tp.dispatchWorkgroups(Math.ceil(shared.nTiles / 64)); tp.end();
  const pass = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    ...(ts ? { timestampWrites: { querySet: gpu.ts.set, endOfPassWriteIndex: 1 } } : {}) });
  pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
  if (ts) { enc.resolveQuerySet(gpu.ts.set, 0, 2, gpu.ts.resolve, 0); enc.copyBufferToBuffer(gpu.ts.resolve, 0, gpu.ts.read, 0, 16); }
}

// Runtime check: measure each frame's GPU work (timestamps, else the frame interval) in the first seconds and for a
// second now and then. Over budget: drop 30% of the agents (then sim resolution) and cool down; well under budget for
// a while: step back up toward the tier cap. The gap between the two thresholds keeps it from oscillating.
const BUDGET_MS = 12, CALM_MS = 5;
function qualityCheck(dt) {
  // A quality step eases the running agent count over about a second, and each agent's ink rises with it, so the
  // veins keep their weight through the change instead of dimming and recovering.
  Q.shown += (Q.level - Q.shown) * Math.min(1, dt * 3);
  Q.depMul = Math.max(1, sim.ref / activeAgents(sim));
  if (!autoOn() || turn.on) return; // a page turn holds the frozen frame a resolution change would need
  const t = clock.t;
  Q.vsync = Math.max(4, Math.min(...stats.intervals.filter((x) => x > 4), 16.7)); // the display's frame period
  if (t > Q.nextCheck && t > Q.checkUntil) { Q.checkUntil = t + 1.5; Q.nextCheck = t + 15; }
  if (t > Q.checkUntil || Q.samples.length < 20) return;
  const sorted = [...Q.samples].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
  Q.samples.length = 0;
  Q.gpuMs = med;
  if (t < Q.cool) return;
  const over = gpu.ts ? med > BUDGET_MS : med > 1.3 * Q.vsync;
  const calm = gpu.ts ? med < CALM_MS : med < 1.05 * Q.vsync;
  if (over) {
    Q.calm = 0; Q.cool = t + 2; Q.checkUntil = t + 2; // keep watching after a change
    if (Q.level > 0.36) Q.level = Math.max(0.35, Q.level * 0.7);
    else if (Q.resScale > 0.61) { Q.resScale *= 0.8; resizeSims(); }
    if (qs.has('mlog')) console.log('[quality] down: level', Q.level.toFixed(2), 'res', simRes().toFixed(2), 'median', med.toFixed(1));
  } else if (calm && Q.level < 1 && ++Q.calm >= 3) {
    Q.calm = 0; Q.cool = t + 4; Q.level = Math.min(1, Q.level / 0.7);
    if (qs.has('mlog')) console.log('[quality] up: level', Q.level.toFixed(2));
  }
}
// A lower sim resolution needs new sims: freeze the current frame and crossfade from it while the new sim warms up.
function resizeSims() {
  writeUniforms(gpu);
  const enc = gpu.device.createCommandEncoder();
  encodeRender(enc, shared.frozenTex[1 - shared.fz].createView());
  gpu.device.queue.submit([enc.finish()]);
  shared.fz = 1 - shared.fz; redraw = true;
  sims.forEach(destroySim);
  sims = (view.phone ? [0] : [0, 1]).map((pg) => Object.assign(createSim(gpu, pg), { t: 4.5, warm: WARM_STEPS, warmN: pg === page ? 25 : 1 }));
  sim = sims[page];
  trans.fade = 1;
}

let last = 0, acc = 0, running = true;
const stats = { intervals: [] };
// The uniforms the last drawn frame showed; redraw: a texture it reads has changed since.
const drawnU = new Float32Array(U.length);
let redraw = true;
// The cursor's stir (G.e.xyz) only moves the sim, which redraws when it steps.
const sameU = () => { const a = drawnU; for (let i = 0; i < U.length; i++) if (U[i] !== a[i] && (i < 16 || i > 18)) return false; return true; };
function frame(now) {
  if (!running || dead) return;
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
  if (last) { stats.intervals.push(now - last); if (stats.intervals.length > 240) stats.intervals.shift(); }
  last = now;
  stepDecks(dt); // first: cards waiting on a deck follow it this frame
  stepFlights(dt);
  syncInert();
  syncHover();
  stepCards(dt);
  stepTurn(dt);
  stepDoor(dt);
  stepMedia(dt);
  cursor.amt *= Math.exp(-dt * 2);
  acc += dt;
  let steps = 0;
  if (window.__j?.freeze) acc = 0; // test hook: hold the sim still while the render keeps drawing
  const measure = autoOn() && clock.t <= Q.checkUntil;
  const ts = measure && gpu.ts && !gpu.ts.busy ? gpu.ts : null;
  if (measure && !gpu.ts && last) Q.samples.push(dt * 1000); // no GPU timestamps: judge by the frame interval
  while (acc >= STEP && steps < 2) {
    acc -= STEP; steps++;
    clock.t += STEP; clock.frame++;
    writeUniforms(gpu);
    const enc = gpu.device.createCommandEncoder();
    encodeStep(enc, 'ead', steps === 1 ? ts : null);
    gpu.device.queue.submit([enc.finish()]);
    for (const s of sources) {
      if (s.landK && qs.has('mlog')) console.log('[land]', s.key, 'strength', s.landS.toFixed(2));
      s.landK = false; // a landing bursts the agents on exactly one step
    }
  }
  if (steps === 2) acc = Math.min(acc, STEP);
  if (sim.warm > 0) { // new sims after a resolution change: catch up a burst of steps, spread over the crossfade's frames
    const n = Math.min(sim.warm, sim.warmN || 1); // a resolution change catches up fast under its crossfade; a page warming before it showed keeps going one step a frame
    sim.warm -= n;
    writeUniforms(gpu);
    const enc = gpu.device.createCommandEncoder();
    for (let k = 0; k < n; k++) encodeStep(enc);
    gpu.device.queue.submit([enc.finish()]);
  }
  if (trans.fade > 0) trans.fade = Math.max(0, trans.fade - dt / 0.8); // crossfade from the frame before a resolution change
  // The page turning away keeps drawing its last gathered cards until they are down on its pile.
  const landing = turn.on && sources.some((s) => s.region === turn.from && s.fly && s.fly.at !== Infinity);
  if (landing) freeze(sims[turn.from]);
  if (!steps || landing) writeUniforms(gpu);
  // Draw only when the picture can change: the sim stepped (60 times a second, which also shows every video frame), something
  // drawn moved (the uniforms differ), or a texture it reads changed. On a display faster than the sim (120 Hz) the frames
  // between steps are otherwise the same picture, and drawing them doubled the GPU's work.
  const timed = ts && steps ? ts : null;
  if (steps || redraw || trans.fade > 0 || !sameU()) {
    const enc = gpu.device.createCommandEncoder();
    encodeRender(enc, gpu.ctx.getCurrentTexture().createView(), timed);
    gpu.device.queue.submit([enc.finish()]);
    drawnU.set(U); redraw = false;
  }
  if (timed) {
    timed.busy = true;
    timed.read.mapAsync(1).then(() => {
      const [t0, t1] = new BigInt64Array(timed.read.getMappedRange());
      if (t1 > t0) Q.samples.push(Number(t1 - t0) / 1e6);
      timed.read.unmap(); timed.busy = false;
    }).catch(() => { timed.busy = false; });
  }
  if (steps) stepWarm(); // at the sim's pace, whatever the display's
  qualityCheck(dt);
  if (isJ(sim)) sim.bloom = Math.min(1, sim.bloom + dt / STYLE[PAGE_NAMES[sim.page]].bloom); // olive -> the J desk's inks
  for (const s of sources) if (s.dragging || s.shove || s.kb || s.lift > 0.001 || s.squash || s.down || s.flip % 1 || Math.abs(s.vx) + Math.abs(s.vy) > 0.5 || Math.abs(s.sway) > 1e-4) placeDom(s);
  if (clock.t > 4) body.classList.add('settled');
  if (hud && clock.frame % 15 === 0) {
    const iv = [...stats.intervals].sort((a, b) => a - b);
    hud.textContent = `${sim.W}x${sim.H}  ${(sim.n / 1e6).toFixed(2)}M agents\nframe ${iv[iv.length >> 1]?.toFixed(1)} ms (p95 ${iv[Math.floor(iv.length * 0.95)]?.toFixed(1)})`;
  }
}

// GPU time per frame: n frames (one sim step + full render each) submitted back to back, then averaged.
async function bench(n = 120) {
  const target = gpu.device.createTexture({ size: [shared.CW, shared.CH], format: gpu.format, usage: 0x10 });
  const run = async (kind) => {
    await gpu.device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      writeUniforms(gpu);
      const enc = gpu.device.createCommandEncoder();
      if (kind !== 'render') encodeStep(enc, kind.length <= 3 && kind !== 'both' ? kind : 'ead');
      if (kind === 'render' || kind === 'both') encodeRender(enc, target.createView());
      gpu.device.queue.submit([enc.finish()]);
    }
    await gpu.device.queue.onSubmittedWorkDone();
    return +((performance.now() - t0) / n).toFixed(2);
  };
  running = false;
  const out = { page: PAGE_NAMES[sim.page], canvas: `${shared.CW}x${shared.CH}`, sim: `${sim.W}x${sim.H}`, agents: sim.n, eMs: await run('e'), agentsMs: await run('a'), diffuseMs: await run('d'), stepMs: await run('step'), renderMs: await run('render'), frameMs: await run('both') };
  running = true; last = 0; requestAnimationFrame(frame);
  target.destroy();
  return out;
}

let shared = null, sims = [];
const isJ = (sm) => !view.phone && STYLE[PAGE_NAMES[sm.page]].mode === 'j'; // a page in the J desk's look
const destroySim = (sm) => { for (const t of [...sm.trail, ...sm.etex, sm.mask]) t.destroy(); sm.dep.destroy(); sm.agents.destroy(); };
async function rebuild(first) {
  layout();
  if (!gpu) return;
  sims.forEach(destroySim);
  if (shared) for (const t of [shared.paper, ...shared.frozenTex, shared.atlas, shared.tiles]) t?.destroy();
  shared = createShared(gpu);
  await buildAtlas(gpu);
  redraw = true;
  // Phones scroll one long page; desktops get a main page and a research page, each with its own sim.
  sims = (view.phone ? [0] : [0, 1]).map((pg) => createSim(gpu, pg));
  page = view.phone ? 0 : regionFromUrl();
  sim = sims[page];
  // Bake the paper grain once (it never changes), so the per-frame pass reads it instead of computing noise.
  writeUniforms(gpu);
  const ge = gpu.device.createCommandEncoder(), gp = ge.beginRenderPass({ colorAttachments: [{ view: shared.paper.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  gp.setPipeline(gpu.grainPipe);
  gp.setBindGroup(0, gpu.device.createBindGroup({ layout: gpu.grainPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: gpu.uniform } }] }));
  gp.draw(3); gp.end(); gpu.device.queue.submit([ge.finish()]);
  // The page you land on forms in front of you (or grows out of its cards, with the fly-in); a page you go to later
  // grows out of its cards as they fly in.
  if (!first || reduced) { clock.t = 4.5; sim.t = 4.5; }
  for (const sm of sims) if (sm !== sim) sm.warm = WARM_STEPS;
}
const introOn = () => !!T.intro && !reduced;

// Rebuild the sim (new agent count or viewport) without reloading the page.
async function reseed() {
  if (dead) return;
  running = false;
  await gpu.device.queue.onSubmittedWorkDone();
  await rebuild(false);
  running = true; last = 0; requestAnimationFrame(frame);
}

// ---------- tweak panel (press t) ----------

// A quiet corner panel with a slider per tunable, the edge mode, the ink color, a copy-link and a reset button.
function tweakPanel() {
  const panel = Object.assign(document.createElement('div'), { className: 'tweak' });
  const inputs = {};
  let reseedTimer = 0;
  const set = (k, v) => {
    T[k] = v;
    if (k === 'print') { Object.assign(T, PRINTS[v]); sync(); } // a preset sets the print knobs
    if (k === 'cards') { Object.assign(T, CARD_PRESETS[v]); sync(); if (gpu) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); } }
    if (k === 'look') {
      const before = RESEED.map((r) => T[r]).join();
      applyLook(v); sync();
      if (gpu && before !== RESEED.map((r) => T[r]).join()) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); }
    }
    // a back style can change card sizes, so it rebuilds the desk too (and a corner label size, the card atlas)
    if ((RESEED.includes(k) || ['backs', 'cardScale', 'cardMax', 'backTitle', 'backTight', 'framing', 'cornerLabel'].includes(k)) && gpu) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); } // the label is in the atlas
    if (k === 'cornerSize' || k === 'cornerLift' || k === 'cornerLabel') placeDoor();
  };
  for (const [name, params] of Object.entries(GROUPS)) {
    const group = Object.assign(document.createElement('details'), { open: name === 'Agents' || name === 'Card outlines' });
    group.append(Object.assign(document.createElement('summary'), { textContent: name }));
    if (name === 'Performance') group.append(Object.assign(document.createElement('div'), { className: 'tweak-perf' }));
    for (const [k, d, min, max, step, label] of params) {
      let input, out;
      if (CHOICES[k]) {
        input = document.createElement('select');
        for (const m of CHOICES[k]) input.append(new Option(m, m));
        input.oninput = () => set(k, input.value);
      } else if (k === 'ink') {
        input = Object.assign(document.createElement('input'), { type: 'color' });
        input.oninput = () => set(k, input.value.slice(1));
      } else if (step === 1 && max === 1) {
        input = Object.assign(document.createElement('input'), { type: 'checkbox' });
        input.oninput = () => set(k, input.checked ? 1 : 0);
      } else {
        input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
        out = document.createElement('output');
        input.oninput = () => { set(k, +input.value); out.value = input.value; };
      }
      inputs[k] = Object.assign(input, { out });
      const r = document.createElement('label');
      r.append(Object.assign(document.createElement('span'), { textContent: label }), input);
      if (out) r.append(out);
      group.append(r);
    }
    panel.append(group);
  }
  // Style: the current page's own surface and ink.
  const styleGroup = Object.assign(document.createElement('details'), { open: true });
  const styleTitle = document.createElement('summary');
  styleGroup.append(styleTitle);
  const styleInputs = {};
  const curStyle = () => STYLE[PAGE_NAMES[page]];
  for (const [k, , min, max, step, label] of STYLE_PARAMS) {
    let input, out;
    if (CHOICES[k]) {
      input = document.createElement('select');
      for (const m of CHOICES[k]) input.append(new Option(m, m));
      input.oninput = () => { curStyle()[k] = input.value; sync(); };
    } else if (k === 'ink' || k === 'bg') {
      input = Object.assign(document.createElement('input'), { type: 'color' });
      input.oninput = () => (curStyle()[k] = input.value.slice(1));
    } else {
      input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
      out = document.createElement('output');
      input.oninput = () => { curStyle()[k] = +input.value; out.value = input.value; };
    }
    const r = document.createElement('label');
    styleInputs[k] = Object.assign(input, { out, row: r });
    r.append(Object.assign(document.createElement('span'), { textContent: label }), input);
    if (out) r.append(out);
    styleGroup.append(r);
  }
  panel.insertBefore(styleGroup, panel.children[1]);
  const sync = () => {
    for (const [k, el] of Object.entries(inputs)) {
      if (el.type === 'checkbox') el.checked = !!T[k];
      else el.value = k === 'ink' ? '#' + T[k] : T[k];
      if (el.out) el.out.value = T[k];
    }
    styleTitle.textContent = `Style (${PAGE_NAMES[page]} page)`;
    // Each mode shows only the controls that do something in it.
    const SHOWN = {
      paper: (k) => !J_KEYS.includes(k),
      spectrum: (k) => !J_KEYS.includes(k) && !['ink', 'grain', 'tint', 'hueMix'].includes(k),
      j: (k) => !['tint', 'hueMix', 'gamma', 'soft', 'grain', 'glow', 'halo'].includes(k),
    };
    for (const [k, el] of Object.entries(styleInputs)) {
      el.row.hidden = !SHOWN[curStyle().mode](k);
      const v = curStyle()[k];
      el.value = k === 'ink' || k === 'bg' ? '#' + v : v;
      if (el.out) el.out.value = v;
    }
  };
  tweakSync = sync;
  const bar = Object.assign(document.createElement('div'), { className: 'tweak-bar' });
  const copy = Object.assign(document.createElement('button'), { textContent: 'copy link' });
  copy.onclick = async () => {
    const q = new URLSearchParams([...Object.keys(DEFAULTS).map((k) => [k, String(T[k])]),
      ...PAGE_NAMES.flatMap((pg) => Object.keys(STYLE_DEFAULTS[pg]).map((k) => [`${pg}.${k}`, String(STYLE[pg][k])]))]);
    const url = `${location.origin}${location.pathname}?${q}${location.hash}`;
    history.replaceState(history.state, '', url);
    try { await navigator.clipboard.writeText(url); copy.textContent = 'copied'; } catch { copy.textContent = 'in the address bar'; }
    setTimeout(() => (copy.textContent = 'copy link'), 1400);
  };
  const reset = Object.assign(document.createElement('button'), { textContent: 'reset' });
  reset.onclick = () => {
    const before = RESEED.map((k) => T[k]).join();
    Object.assign(T, DEFAULTS);
    for (const pg of PAGE_NAMES) Object.assign(STYLE[pg], STYLE_DEFAULTS[pg]);
    applyLook(T.look); Object.assign(T, PRINTS[T.print]);
    sync();
    if (gpu && before !== RESEED.map((k) => T[k]).join()) reseed();
  };
  const replay = Object.assign(document.createElement('button'), { textContent: 'replay intro' });
  replay.onclick = () => drawFrom(page, { delay: INTRO_DELAY }); // starts over from bare paper
  bar.append(copy, reset, replay);
  panel.append(bar);
  // Live readout of the frame interval from requestAnimationFrame, twice a second.
  const perf = panel.querySelector('.tweak-perf');
  setInterval(() => {
    if (panel.hidden) return;
    const iv = [...stats.intervals].slice(-60).sort((a, b) => a - b), med = iv[iv.length >> 1] || 0;
    perf.textContent = `${med ? (1000 / med).toFixed(0) : '-'} fps · frame ${med.toFixed(1)} ms${Q.gpuMs ? ` · GPU ${Q.gpuMs.toFixed(1)} ms` : ''}\n` +
      (sim ? `${autoOn() ? `auto: ${Q.tier.name} tier, ` : ''}${(activeAgents(sim) / 1000).toFixed(0)}k agents, sim ${sim.W}x${sim.H}` : '');
  }, 500);
  addEventListener('keydown', (e) => {
    if (e.key === 't' && !e.metaKey && !e.ctrlKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) panel.hidden = !panel.hidden;
  });
  sync();
  body.append(panel);
}

async function warm(steps) {
  for (let i = 0; i < steps; i++) {
    clock.t += STEP; clock.frame++;
    writeUniforms(gpu);
    const enc = gpu.device.createCommandEncoder();
    encodeStep(enc);
    gpu.device.queue.submit([enc.finish()]);
    if (i % 20 === 19) await gpu.device.queue.onSubmittedWorkDone();
  }
}

async function main() {
  const t0 = performance.now(), mark = (k) => (bootLog[k] = Math.round(performance.now() - t0));
  // A card rests on its cover when it has one (an image not from its clips, kept like an explicit still: hover fades from
  // it into the clip and back), else on its poster (the frame its first clip starts from); an explicit still wins.
  for (const s of sources) {
    const e = clipLists[s.key];
    if (e?.cover && !s.still) { s.img.src = mediaUrl('/desk-media/' + e.cover); s.still = 'cover'; }
    else if (!s.still && e?.poster) s.img.src = mediaUrl('/desk-media/' + e.poster);
  }
  layout(); // the startup still uses the final layout right away
  const fontsReady = Promise.all([document.fonts.load('800 60px Inter'), document.fonts.load('500 23px Caveat'), document.fonts.load('600 13px Inter'), document.fonts.load('400 13px Inter')]);
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3000))]);
  mark('fonts');
  layout(); // card sizes measured with the real fonts
  if (view.phone && regionFromUrl()) scrollTo(0, regionLabel.getBoundingClientRect().top + scrollY - 24); // phones scroll to research
  await Promise.all(sources.map((s) => s.img?.decode().catch(() => {})));
  mark('images');
  // The desk fades in once, from bare paper: straight to the live field when WebGPU is quick, else the DOM still first.
  body.classList.toggle('intro', introOn()); // with the fly-in, the startup still is bare paper: the cards arrive with it
  const showStill = setTimeout(() => body.classList.add('ready'), 250);
  gpu = await initGpu();
  if (dead) { gpu?.device.destroy(); return; }
  mark('pipelines');
  if (!gpu) { clearTimeout(showStill); body.classList.remove('intro'); body.classList.add('nogpu', 'ready'); dealing = false; Object.assign(door, { amt: 1, d: restD(false) }); layout(); return; }
  await rebuild(true);
  if (introOn()) { arriveDeck(page, INTRO_DELAY - MOTION.settle); drawFrom(page, { delay: INTRO_DELAY }); } // the first visit (or a deep link): the deck comes in, then deals
  pileUp(0); pileUp(1); // each deck holds its page's cards that are not on the desk
  dest = page;
  door.amt = introOn() ? -1 : 0; // the corner folds back just after the deal starts
  if (reduced) Object.assign(door, { amt: 1, d: restD(false) }); // no frame loop: drawn folded
  // Draw the field's first frame under the DOM still, then hand over, so startup never flashes.
  writeUniforms(gpu);
  const enc0 = gpu.device.createCommandEncoder();
  encodeRender(enc0, gpu.ctx.getCurrentTexture().createView());
  gpu.device.queue.submit([enc0.finish()]);
  await gpu.device.queue.onSubmittedWorkDone();
  await new Promise(requestAnimationFrame);
  if (dead) return;
  clearTimeout(showStill);
  body.classList.add('gpu', 'ready');
  mark('sim');
  if (reduced) {
    // One settled still: start from a scattered desk, let the mesh form offscreen, then draw once and stop.
    await warm(Math.round(4 / STEP));
    const enc = gpu.device.createCommandEncoder();
    writeUniforms(gpu);
    encodeRender(enc, gpu.ctx.getCurrentTexture().createView());
    gpu.device.queue.submit([enc.finish()]);
    body.classList.add('settled');
    return;
  }
  for (const s of sources) s.playlist = playlistFor(s); // players are made when idle (preloadClips) or on first hover
  setTimeout(() => idle(preloadClips), (introOn() ? INTRO_DELAY + DRAW.fan + DRAW.dur + 8 * T.drawStagger : 0.3) * 1000); // after the intro
  setTimeout(() => dead || prewarm(1 - page), (introOn() ? INTRO_DELAY + DRAW.fan + DRAW.dur + 8 * T.drawStagger : 0.3) * 1000); // the other page, once
  requestAnimationFrame(frame);
  if (qs.has('tune')) tweakPanel();
  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (document.documentElement.clientWidth === view.w && innerHeight === view.h) return;
      await reseed();
    }, 200);
  });
}

// Debug probe for crossfades (used by the verification script): during a live crossfade on card key, renders the frame
// offscreen, reads back the media area, and checks every pixel against both source frames drawn in the same task.
// A pixel passes if each channel lies within the two frames' range over its 2x2 neighborhood, give or take paper grain.
async function probeFade(key, maxFrames = 20) {
  const s = sources.find((x) => x.key === key);
  probeKey = key;
  s.rot = 0; s.sway = 0; placeDom(s);
  setHover(s, true);
  const bgra = gpu.format.startsWith('bgra');
  const raf = () => new Promise(requestAnimationFrame);
  const t0 = performance.now();
  while (!(videoSrc === s && videoMix > 0.99 && s.player.fading && s.player.fade > 0.02)) { await raf(); if (performance.now() - t0 > 20000) return { error: 'no crossfade' }; }
  const target = gpu.device.createTexture({ size: [shared.CW, shared.CH], format: gpu.format, usage: 0x10 | 0x01 });
  const frames = [];
  // Freeze both clips mid-crossfade and step the fade by hand, so the rendered frame and the reference frames match.
  const pl = s.player, A = pl.a, B = pl.b;
  probing = true;
  await Promise.all([chain(A, () => A.pause()), chain(B, () => B.pause())]);
  await new Promise((r) => setTimeout(r, 200));
  for (let f = 0; f <= maxFrames; f++) {
    await raf();
    pl.fading = true; pl.fade = f / maxFrames;
    writeUniforms(gpu);
    const o = (CARD0 + s.id * CARD_VEC4) * 4, inv = [U[o], U[o + 1], U[o + 2], U[o + 4], U[o + 5], U[o + 6], U[o + 8], U[o + 9], U[o + 10]];
    const half = [U[o + 12], U[o + 13]], media = U.slice(o + 28, o + 32), vu = U.slice(VU_OFF, VU_OFF + 4), fade = U[34], q = U[27];
    // Media rect on screen (device px), shrunk so card edges and bilinear borders stay out of it.
    const dev = shared.dev, mx0 = Math.ceil((s.x - cam.x - s.w / 2 + s.media.x + 6) * dev), my0 = Math.ceil((s.y - s.h / 2 + s.media.y + 6) * dev);
    const mw = Math.floor((s.media.w - 12) * dev), mh = Math.floor((s.media.h - 12) * dev), bpr = Math.ceil((mw * 4) / 256) * 256;
    const buf = gpu.device.createBuffer({ size: bpr * mh, usage: 0x01 | 0x08 });
    const enc = gpu.device.createCommandEncoder();
    encodeRender(enc, target.createView());
    enc.copyTextureToBuffer({ texture: target, origin: [mx0, my0] }, { buffer: buf, bytesPerRow: bpr }, [mw, mh]);
    gpu.device.queue.submit([enc.finish()]);
    const grab = (v) => { const c = new OffscreenCanvas(v.videoWidth, v.videoHeight), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0); return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; };
    const ga = grab(A), gb = B.readyState >= 2 && fade > 0 ? grab(B) : ga;
    await buf.mapAsync(1);
    const out = new Uint8Array(buf.getMappedRange());
    let bad = 0, worst = 0, n = 0;
    const exp = new Uint8ClampedArray(mw * mh * 4), badMap = new Uint8ClampedArray(mw * mh * 4);
    for (let y = 0; y < mh; y += 2) for (let x = 0; x < mw; x += 2) {
      const px = (mx0 + x + 0.5 + (cam.x - sim.origin) * dev) * q, py = (my0 + y + 0.5) * q;
      const hz = inv[6] * px + inv[7] * py + inv[8], lx = (inv[0] * px + inv[1] * py + inv[2]) / hz, ly = (inv[3] * px + inv[4] * py + inv[5]) / hz;
      const ux = lx / (2 * half[0]) + 0.5, uy = ly / (2 * half[1]) + 0.5;
      const vx = vu[0] + ((ux - media[0]) / (media[2] - media[0])) * vu[2], vy = vu[1] + ((uy - media[1]) / (media[3] - media[1])) * vu[3];
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const g of fade > 0 ? [ga, gb] : [ga]) {
          const sx = Math.min(g.w - 2, Math.max(0, Math.floor(vx * g.w - 0.5))), sy = Math.min(g.h - 2, Math.max(0, Math.floor(vy * g.h - 0.5)));
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = g.d[((sy + dy) * g.w + sx + dx) * 4 + ch]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
        const v = out[y * bpr + x * 4 + (bgra ? 2 - ch : ch)];
        const err = Math.max(lo * 0.97 - 3 - v, v - (hi * 1.03 + 3), 0);
        exp[(y * mw + x) * 4 + ch] = (lo + hi) / 2; exp[(y * mw + x) * 4 + 3] = 255;
        badMap[(y * mw + x) * 4 + ch] = Math.min(255, err * 4); badMap[(y * mw + x) * 4 + 3] = 255;
        if (err > 0) bad++;
        worst = Math.max(worst, err); n++;
      }
    }
    let dump;
    if (bad / n > 0.03 && !frames.some((fr) => fr.dump)) { // keep one failing frame for inspection
      const toUrl = async (arr) => { const c2 = new OffscreenCanvas(mw, mh); c2.getContext('2d').putImageData(new ImageData(arr, mw, mh), 0, 0); const b = await c2.convertToBlob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); };
      var expUrl = await toUrl(exp), badUrl = await toUrl(badMap);
      const oc = new OffscreenCanvas(mw, mh), ox = oc.getContext('2d'), id = ox.createImageData(mw, mh);
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) for (let ch = 0; ch < 4; ch++) id.data[(y * mw + x) * 4 + ch] = ch === 3 ? 255 : out[y * bpr + x * 4 + (bgra ? 2 - ch : ch)];
      ox.putImageData(id, 0, 0);
      const url = async (c) => { const b = await c.convertToBlob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); };
      const vc = (v) => { const c = new OffscreenCanvas(v.videoWidth, v.videoHeight); c.getContext('2d').drawImage(v, 0, 0); return c; };
      dump = { exp: expUrl, bad: badUrl, out: await url(oc), a: await url(vc(A)), b: await url(vc(B)), aSrc: A.currentSrc, bSrc: B.currentSrc, aT: A.currentTime, bT: B.currentTime, vu: [...vu] };
    }
    buf.unmap(); buf.destroy();
    frames.push({ fade: +fade.toFixed(3), badFrac: +(bad / n).toFixed(4), worst: Math.round(worst), dump });
  }
  probing = false; play(A); play(B);
  target.destroy();
  probeKey = null;
  setHover(s, false);
  return frames;
}

const bootLog = {};
window.__j = { backsFit: () => sources.filter((x) => x.backEl).map((x) => { const d = design(x), n = backLayout(d).need; return [x.key, Math.round(d.h), Math.ceil(n), n <= d.h + 0.5]; }), Q, activeAgents: () => sim && activeAgents(sim), GROUPS, STYLE_PARAMS, probeFade, drawBack, drawCard, backLayout, view: () => view, sim: () => sim && { page: sim.page, W: sim.W, H: sim.H, n: sim.n, t: sim.t, CW: shared.CW, dev: shared.dev, dpr: sim.dpr }, turn: () => ({ ...turn }), door: () => door, sims: () => sims.map((x) => ({ page: x.page, t: +x.t.toFixed(2), parity: x.parity, warm: x.warm })), STYLE, cam: () => cam, U: () => U, media: () => ({ src: videoSrc?.key, mix: videoMix, playing: videoSrc?.player.playing(), fade: videoSrc?.player.fade, i: videoSrc?.player.i, state: videoSrc?.player.state, t: videoSrc && +videoSrc.player.a.currentTime.toFixed(2), clip: videoSrc?.player.a.currentSrc.split('/').pop() }), bootLog, bench: (n) => bench(n), drawFrom, flights, stats: () => ({ ...stats, t: clock.t, dpr: view.dpr, n: sim?.n, W: sim?.W, H: sim?.H }), sources, T };
main();
// Leaving the page: stop the frame loop and timers' effects, drop listeners, stop and release every video, free the GPU.
return () => {
  dead = true; running = false; ac.abort();
  for (const s of sources) for (const v of s.player?.v || []) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
  gpu?.ctx.unconfigure(); gpu?.device.destroy();
  delete window.__j;
};
}
