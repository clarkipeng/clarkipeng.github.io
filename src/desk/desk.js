// K. Desk, minimal: the B desk (sparse slime under paper cards), rebuilt as one WebGPU pass chain.
// Every step: excitation field E -> a few tens of thousands of agents (steer, deposit by atomics) -> trail diffuse/decay.
// The slime lives on a soft, lower-resolution grid under the whole desk; cards lie on top. Agents only find a little
// food in a thin band just outside each card's edge, so veins hug the cards as a soft outline that follows a dragged card.
// Clicking a card flips it in 3D to its back (details and links) and puffs the agents under it outward.
// One fragment pass at full device resolution draws paper grain, one muted ink (Beer-Lambert, so it darkens like dye),
// the crisp signature, and the cards (atlas texture, video via importExternalTexture) with soft drop shadows.
// The DOM keeps invisible hit targets and the accessible text.
// Site port of .context/mockups/k-desk-minimal.js: the same code, run inside mountDesk(root), which returns a teardown.

export function mountDesk(root) {
const ac = new AbortController(), signal = ac.signal;
const addEventListener = (type, fn, opts) => window.addEventListener(type, fn, { ...opts, signal });
let dead = false;

const MAX = 16;
const REF_W = 1440, REF_H = 900, PHONE = 700;
const STEP = 1 / 60;
const PAPER = [0xf3, 0xf1, 0xea];
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
    ['flipS', 0.7, 0.15, 1.5, 0.05, 'flip duration s'],
    ['puff', 1.6, 0, 6, 0.05, 'flip puff strength'],
    ['puffAt', 0, 0, 0.6, 0.02, 'puff after landing s'],
    ['emitIn', 0.8, 0.1, 4, 0.1, 'open card color in s'],
    ['emitOut', 4, 0.5, 12, 0.25, 'color fade after close s'],
    ['puffR', 29, 0, 60, 1, 'flip puff radius px'],
    ['puffDecay', 0.955, 0.8, 0.995, 0.001, 'flip puff decay / step'],
  ],
  Media: [
    ['fadeIn', 0.4, 0.05, 2, 0.05, 'fade in s'],
    ['fadeOut', 1, 0.1, 3, 0.05, 'fade out s'],
    ['finishFirst', 1, 0, 1, 1, 'finish clip before fading out'],
    ['xfade', 0.6, 0.1, 2, 0.05, 'crossfade s'],
    ['hold', 0, 0, 10, 0.25, 'clip hold s (0 = whole clip)'],
    ['hoverDelay', 0, 0, 800, 10, 'hover delay ms'],
    ['focusSoft', 1.5, 0, 2, 0.05, 'background softness while hovering a card'],
    ['focusS', 0.45, 0.05, 2, 0.05, 'focus fade s'],
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
  Camera: [
    ['panS', 0.9, 0.2, 2.5, 0.05, 'pan duration s'],
    ['panEase', 'cubic', 0, 0, 0, 'pan easing'],
  ],
};
// none: no food | max: a band of food that tops the trail up | plus: the band adds to the trail | corners: blobs at the
// four corners | center: one blob under the card | ring2: max plus a second ridge farther out
const EDGE_MODES = ['none', 'max', 'plus', 'corners', 'center', 'ring2'];
const EASES = {
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
const CHOICES = { look: Object.keys(LOOKS), edgeMode: EDGE_MODES, panEase: Object.keys(EASES), mode: ['paper', 'spectrum', 'j'], print: Object.keys(PRINTS) };
const PARAMS = Object.values(GROUPS).flat();
const DEFAULTS = Object.fromEntries(PARAMS.map(([k, d]) => [k, d]));
const T = { ...DEFAULTS };
for (const k of Object.keys(DEFAULTS)) {
  if (!qs.has(k)) continue;
  T[k] = typeof DEFAULTS[k] === 'string' ? qs.get(k) : parseFloat(qs.get(k));
}
for (const [k, list] of Object.entries(CHOICES)) if (!list.includes(T[k])) T[k] = DEFAULTS[k];
for (const [k, v] of Object.entries(PRINTS[T.print])) if (!qs.has(k)) T[k] = v;
const RESEED = ['agents', 'res', 'auto']; // the only settings that rebuild the sim
// Per-page styles: each page has its own surface and ink, tuned under Style in the panel (URL keys main.gain, research.mode,
// ...). paper: light paper, one muted ink that darkens like dye. spectrum: a dark surface where each card's veins glow
// in the card's own hue and add like light where they meet.
const PAGE_NAMES = ['main', 'research'];
const STYLE_PARAMS = [
  ['mode', 'paper', 0, 0, 0, 'style'],
  ['bg', 'f3f1ea', 0, 0, 0, 'background'],
  ['ink', '929664', 0, 0, 0, 'ink'],
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
struct Card { inv0: vec4f, inv1: vec4f, inv2: vec4f, geo: vec4f, flat: vec4f, misc: vec4f, uv: vec4f, media: vec4f, bound: vec4f, buv: vec4f, hue: vec4f, ink: vec4f };
// Sim px. geo: half size, corner radius, lift | flat: center, cos, sin | misc: scale, hover, burst, lift height
// uv: front atlas rect | media: media rect in card uv | bound: bounding radius, facing (+1 front, -1 back), puff trigger, |cos flip|
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
  v: vec4f,   // video card, video mix, crossfade to the next clip, camera x on the desk (device px)
  x: vec4f,   // edge mode, ridge distance, ridge width, puff margin (sim px)
  y: vec4f,   // puff boost, puff decay, hover excitation, cursor excitation
  z: vec4f,   // ink softness (texels), ink grain, unused, on-screen card count
  w: vec4f,   // second ring on, second ring at (x ridge distance), corner emphasis, ink opacity
  u: vec4f,   // shadow softness, shadow strength, unused, unused
  st: vec4f,  // style (0 paper, 1 spectrum, 2 j), glow, halo, page clock (s)
  bg: vec4f,  // page background, linear rgb
  pg: vec4f,  // page origin on the desk (device px), transition (1 slide, 2 + a: crossfade by a), frozen page origin (device px), canvas width (device px)
  jq: vec4f,  // j style: ink stain over cards, ink bleed into card borders (sim px), unused, unused
  pr: vec4f,  // prints: desaturate, white balance to paper, black lift, duotone at rest
  pq: vec4f,  // prints: paper grain, matte edge (CSS px), unused, unused
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
  let i = gid.x;
  if (i >= arrayLength(&agents) || f32(i) >= g.a.z) { return; } // auto quality runs only the first g.a.z agents
  rs = pcg(i * 1664525u + pcg(u32(g.d.w) + 17u));
  let a = agents[i];
  var pos = a.xy; var ang = a.z;
  // w packs the hue tag (index of the card whose color it carries) and the puff (1 right after a card flips over this
  // agent, decaying over about a second): w = tag * 2 + puff.
  var tag = floor(a.w * 0.5);
  var puff = a.w - tag * 2.0;
  if (rnd() < g.d.x) { // respawn anywhere, carrying the color of the nearest card
    let np = vec2f(rnd(), rnd()) * g.a.xy;
    var best = 0.0; var bd = 1e12;
    for (var j = 0u; j < u32(g.z.w); j++) { let k = cardAt(j); let dd = distance(np, g.cards[k].flat.xy); if (dd < bd) { bd = dd; best = f32(k); } }
    agents[i] = vec4f(np, rnd() * 6.2831853, best * 2.0);
    return;
  }
  // A flipping card puffs the agents under it and just around it radially outward.
  for (var j = 0u; j < u32(g.z.w); j++) {
    let k = cardAt(j);
    let c = g.cards[k];
    // A card that emits ink (an open card, or every card in the j style) colors the agents passing close to its edge;
    // they carry its ink out along the network, and inks mix like dye where the veins meet.
    if (c.ink.w > 0.02 && distance(pos, c.flat.xy) < c.bound.x + 24.0 * g.a.w && rnd() < 0.3 * c.ink.w && cardSd(k, pos) < 24.0 * g.a.w) { tag = f32(k); }
    if (c.bound.z > 0.5 && cardSd(k, pos) < g.x.w) {
      let r = pos - c.flat.xy;
      ang = atan2(r.y, r.x) + (rnd() - 0.5) * 0.6;
      puff = 1.0;
    }
  }
  puff *= g.y.y;
  let e = eAt(pos);
  let sd = g.c.x; let sa = g.c.y; let turn = g.c.z * (1.0 - puff);
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
  let amt = g.b.y * (1.0 + 2.0 * e) * (1.0 - 0.7 * puff) * 4096.0;
  // rgb carries color: on paper the ink's absorbance (the shared olive, or the agent's card ink while that card is open),
  // so overlapping inks darken like dye; in spectrum the card's hue as light, brighter while the card is open.
  let ck = g.cards[u32(tag)];
  var tint = mix(g.n.xyz, ck.ink.rgb, ck.ink.w);
  if (g.st.x > 0.5 && g.st.x < 1.5) { tint = ck.hue.rgb * (1.0 + ck.ink.w); }
  atomicAdd(&dep[at], u32(tint.r * amt)); atomicAdd(&dep[at + 1u], u32(tint.g * amt)); atomicAdd(&dep[at + 2u], u32(tint.b * amt));
  atomicAdd(&dep[at + 3u], u32(amt));
  agents[i] = vec4f(pos, ang, tag * 2.0 + puff);
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
  textureStore(dst, p, v);
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

@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let q = g.n.w;           // sim px per device px
  let wd = fp.xy + vec2f(g.v.w, 0.0); // device px on the desk, after the camera pan
  let pd = wd - vec2f(g.pg.x, 0.0);   // device px on the active page
  // During a page change the outgoing page slides out as the frozen image of its last frame.
  if (g.pg.y > 0.5 && g.pg.y < 1.5 && (pd.x < 0.0 || pd.x >= g.pg.w)) {
    return textureLoad(frozen, clamp(vec2i(wd - vec2f(g.pg.z, 0.0)), vec2i(0), vec2i(textureDimensions(frozen)) - 1), 0);
  }
  let p = pd * q;          // everything below is in sim px, except the crisp masks and edge coverage
  let s = g.a.w;           // sim px per CSS px
  let ip = vec2i(pd);
  let gr = textureLoad(paper, ip, 0).rg;
  let vq = (fp.xy / vec2f(g.pg.w, g.a.y / q) - 0.5) * vec2f(1.6, 1.2); // vignette follows the screen
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
  let fadeIn = smoothstep(0.6, 2.6, g.st.w) * (1.0 - 0.85 * m.b) * g.w.w;
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
    conc = localInk;
  } else if (spectrum) {
    // Dark surface, glowing veins: each vein carries its card's hue, added like light, with a soft halo around it.
    let core = pow(clamp(a * g.f.z, 0.0, 1.0), g.f.w) * fadeIn;
    let haloA = pow(clamp(halo4.a * g.f.z, 0.0, 1.0), 1.5) * g.st.z * fadeIn;
    col = g.bg.rgb * (1.0 - 0.25 * dot(vq, vq)) + (t4.rgb / max(a, 1e-4) * core + halo4.rgb / max(halo4.a, 1e-4) * haloA) * g.st.y;
    col = mix(col, vec3f(0.86), m.r); // the name, if this page has one, in light ink
    conc = core;
  } else {
    let grainAmp = g.z.y / 0.16; // paper grain: the paper's own texture (K8's at 0.16), and how unevenly it takes ink
    col = g.bg.rgb * (1.0 + ((gr.x - 0.5) * 0.06 + (gr.y - 0.5) * 0.045) * grainAmp) * (1.0 - 0.04 * dot(vq, vq));
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
  }

  for (var j = 0u; j < u32(g.z.w); j++) { // on-screen cards only, bottom to top
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
  var outc = vec4f(pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
  if (g.pg.y >= 2.0) { // crossfade from the frame before a sim resolution change
    outc = mix(outc, textureLoad(frozen, clamp(vec2i(wd - vec2f(g.pg.z, 0.0)), vec2i(0), vec2i(textureDimensions(frozen)) - 1), 0), g.pg.y - 2.0);
  }
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
const hud = qs.has('hud') ? body.appendChild(Object.assign(document.createElement('div'), { className: 'hud' })) : null;

const sources = [...root.querySelectorAll('.src')].map((el, id) => {
  const d = el.dataset;
  const [sx, sy, sw, sr] = d.slot.split(',').map(Number);
  const backEl = el.querySelector('.back');
  return {
    id, el, hit: el.querySelector('.hit'), img: el.querySelector('img'), key: d.key,
    kind: ['note', 'polaroid', 'paper'].find((k) => el.classList.contains(k)) || 'photo',
    // Back of the card: optional title, paragraphs, and link buttons, straight from the DOM. Nav notes pan instead of flipping.
    backEl, backTitle: backEl?.querySelector('b')?.textContent, backParas: backEl ? [...backEl.querySelectorAll('p')].map((x) => x.textContent) : null,
    region: d.region === 'research' ? 1 : 0, nav: d.nav, hueHex: d.hue || '888888', // the card's own hue (spectrum style)
    inkHex: d.ink, emit: 0, // the card's own ink (paper style), emitted while the card is open
    jinkHex: d.jink, still: d.still, // the J desk's ink for this card; an explicit still (a paper figure) that clips.json does not replace
    backLinks: backEl ? [...backEl.querySelectorAll('a')] : null, flip: 0, flipTo: 0, puffArm: false,
    frame: (d.frame || '1,0.5,0.5').split(',').map(Number), // zoom, then where the crop sits (like object-position)
    slot: { x: sx, y: sy, w: sw, r: sr }, order: +d.order, aspect: +(d.aspect || 1), videoSrc: d.video,
    x: 0, y: 0, w: 0, h: 0, rot: sr, vx: 0, vy: 0, lift: 0, liftV: 0, tilt: [0, 0], tiltV: [0, 0], sway: 0, swayV: 0,
    hover: 0, hoverOn: false, burst: 0, z: id, dragging: false, released: false,
  };
});

let view = { w: innerWidth, h: innerHeight, phone: innerWidth < PHONE, k: 1, docH: innerHeight, dpr: 1 };
let nameBox = null; // CSS px: { x, baseline, size }

// Card geometry in CSS px. Media rect is where the image (or video) sits.
function cardBox(s, w) {
  if (s.kind === 'note') {
    const lines = wrapLines(s.hit.innerText.replace(/\n/g, ' \n '), w - 32, '500 23px Caveat');
    return { w, h: 28 + lines.length * 26.5, media: null, lines };
  }
  if (s.kind === 'paper') {
    const lines = wrapLines(s.hit.querySelector('b').textContent, w - 39, '600 16px Inter');
    return { w, h: 16 + lines.length * 21.5 + 6 + 17 + 16, media: null, lines, sub: s.hit.querySelector('small').textContent };
  }
  if (s.kind === 'polaroid') {
    const mw = w - 16;
    return { w, h: 8 + mw / s.aspect + 36, media: { x: 8, y: 8, w: mw, h: mw / s.aspect } };
  }
  const mw = w - 12, mh = mw / s.aspect;
  const [title, sub] = [s.el.querySelector('.cap b').textContent, s.el.querySelector('.cap span').textContent];
  const m = measure();
  m.font = '600 13px Inter'; const tw = m.measureText(title).width;
  m.font = '400 13px Inter'; const sw = m.measureText(sub).width;
  const oneLine = tw + sw + 14 < mw - 4;
  const titleLines = oneLine ? [title] : wrapLines(title, mw - 4, '600 13px Inter'); // long titles wrap
  return { w, h: 6 + mh + (oneLine ? 32 : 31 + titleLines.length * 18), media: { x: 6, y: 6, w: mw, h: mh }, title, titleLines, sub, oneLine };
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
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const phone = vw < PHONE;
  body.classList.toggle('phone', phone);
  body.classList.toggle('desk', !phone);
  view = { ...view, w: vw, h: vh, phone };
  if (!phone) {
    const k = clamp(Math.min(vw / REF_W, vh / REF_H), 0.62, 1.35);
    view.k = k; view.docH = vh;
    nameBox = { x: 54 * k, baseline: 46 * k + 60 * k * 0.8, size: 60 * k };
    view.worldW = 2 * vw; // one continuous desk: main region, then research to the right
    for (const s of sources) {
      Object.assign(s, cardBox(s, Math.round(s.slot.w * k)));
      s.x = (s.region + s.slot.x / REF_W) * vw; s.y = (s.slot.y / REF_H) * vh; s.rot = s.slot.r;
    }
  } else {
    const pad = 22;
    view.labelY = 0;
    nameBox = { x: pad, baseline: 30 + 44 * 0.8, size: 44 };
    let y = 0;
    view.worldW = vw;
    for (const s of sources) if (s.nav) Object.assign(s, cardBox(s, 150)); // phones scroll to research; nav notes stay hidden
    const order = [...sources].filter((s) => !s.nav).sort((a, b) => a.order - b.order);
    for (const [i, s] of order.entries()) {
      if (s.region && !view.labelY) { view.labelY = y + 10; y += 56; } // research becomes a section further down
      const full = Math.min(vw - 56, 380);
      const w = Math.round(s.kind === 'polaroid' ? full * 0.56 : s.kind === 'note' || s.kind === 'paper' ? Math.min(full * 0.82, 280) : full);
      Object.assign(s, cardBox(s, w));
      s.rot = s.slot.r * 0.7;
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
  cam.x = cam.to = view.phone ? 0 : regionFromHash() * view.w; cam.t = 1; placePage(); setInert(regionFromHash());
  for (const s of sources) {
    if (s.backEl) ({ w: s.backW, h: s.backH } = backLayout(s));
    if (s.media) {
      const [z, px, py] = s.frame, v = 1 / z;
      Object.assign(s.img.style, { height: s.media.h + 'px', objectPosition: `${px * 100}% ${py * 100}%`,
        objectViewBox: z > 1 ? `inset(${py * (1 - v) * 100}% ${(1 - px) * (1 - v) * 100}% ${(1 - py) * (1 - v) * 100}% ${px * (1 - v) * 100}%)` : '' });
    }
    placeDom(s);
  }
}

function placeDom(s) {
  const r = s.rot + (s.sway * 180) / Math.PI, sc = 1 + 0.035 * s.lift, w = faceW(s), h = faceH(s);
  s.el.style.width = w + 'px'; s.el.style.height = h + 'px';
  s.el.style.transform = `translate(${(s.x - w / 2).toFixed(2)}px, ${(s.y - h / 2).toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${sc.toFixed(4)})`;
  s.el.style.zIndex = s.z;
}

// ---------- color ----------

const absorbance = (ink) => ink.map((c, i) => -Math.log(Math.max(lin(c), 1e-4) / lin(PAPER[i])));

// ---------- interaction ----------

const cursor = { x: -1e4, y: -1e4, amt: 0 };
let topZ = sources.length, hovered = null;
// Focus: the background eases from sharp to soft while a card is hovered (like depth of field), and back after.
let focus = 0, focusAt = 0;

// The camera pans across one continuous desk: x = 0 shows the main region, x = viewport width shows research.
const cam = { x: 0, from: 0, to: 0, t: 1 };
const regionFromHash = () => (location.hash === '#research' ? 1 : 0);
const WARM_STEPS = 150; // a page you have not seen yet arrives already formed
let page = 0;
// Tab stays on the page you see: the other page's cards are inert (focusing one would scroll the desk sideways).
const setInert = (region) => { for (const s of sources) s.el.inert = !view.phone && s.region !== region; };
function panTo(region, instant = false) {
  const to = view.phone ? 0 : region * view.w;
  if (gpu && sims.length > 1 && region !== page) switchPage(region, instant || reduced);
  setInert(region);
  if (instant || reduced) {
    Object.assign(cam, { x: to, from: to, to, t: 1 }); trans.on = false; placePage();
    if (reduced && gpu && sim) drawStill(); // no frame loop with reduced motion: settle this page and draw it once
    return;
  }
  Object.assign(cam, { from: cam.x, to, t: 0 });
}
function drawStill() {
  const enc = gpu.device.createCommandEncoder();
  for (; sim.warm > 0; sim.warm--) { writeUniforms(gpu); encodeStep(enc); }
  writeUniforms(gpu);
  encodeRender(enc, gpu.ctx.getCurrentTexture().createView());
  gpu.device.queue.submit([enc.finish()]);
}
// Freeze the outgoing page's current frame; it slides out as an image while the incoming page's own sim runs.
function switchPage(region, instant) {
  if (!instant) {
    writeUniforms(gpu);
    const enc = gpu.device.createCommandEncoder();
    encodeRender(enc, shared.frozenTex[1 - shared.fz].createView());
    gpu.device.queue.submit([enc.finish()]);
    shared.fz = 1 - shared.fz;
    trans.on = true; trans.frozenX = page * view.w;
  }
  for (const s of sources) if (s.player && s.player.state !== 'rest') { s.player.state = 'rest'; s.player.mix = 0; s.player.reset(); } // no decoding off-page
  videoSrc = null; videoMix = 0;
  page = region; sim = sims[page];
  tweakSync?.();
}
function stepCam(dt) {
  if (cam.t >= 1) return;
  cam.t = Math.min(1, cam.t + dt / T.panS);
  cam.x = lerp(cam.from, cam.to, EASES[T.panEase](cam.t));
  if (cam.t >= 1) trans.on = false;
  placePage();
}
function placePage() { pageEl.style.transform = view.phone ? '' : `translate3d(${(-cam.x).toFixed(2)}px, 0, 0)`; }
addEventListener('hashchange', () => panTo(regionFromHash()));
function navigate(s) {
  if (s.nav === 'research') { history.pushState({ fromMain: true }, '', '#research'); panTo(1); }
  else if (history.state?.fromMain) history.back(); // returns to the main desk and keeps the history tidy
  else { history.pushState(null, '', location.pathname + location.search); panTo(0); }
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
  if (!e.target.closest?.('.src')) cursor.amt = 1;
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => (mouse = null), { signal });
function syncHover() {
  if (view.phone || probeKey || sources.some((o) => o.dragging)) return;
  const el = mouse && document.elementFromPoint(mouse.x, mouse.y)?.closest('.src');
  const over = el && sources.find((o) => o.el === el && !o.nav);
  for (const s of sources) setHover(s, s === over);
}

function setHover(s, on) {
  if (view.phone || s.hoverOn === on || (on && s.flipTo)) return;
  s.hoverOn = on;
  if (on && s.playlist && !s.player) { s.player = new Player(s.playlist); if (!s.still) matchThumbnail(s); }
  if (on) { hovered = s; s.hoverSince = performance.now(); } else if (hovered === s) hovered = null;
}

for (const s of sources) {
  const hit = s.hit;
  hit.addEventListener('click', (e) => {
    e.preventDefault();
    if (s.suppressClick) { s.suppressClick = false; return; }
    s.nav ? navigate(s) : flip(s);
  });
  hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.nav ? navigate(s) : flip(s); } });
  hit.addEventListener('pointerdown', (e) => {
    if (view.phone || !gpu || reduced || e.button !== 0) return; // reduced motion: cards stay put (a click still flips)
    const press = { x: deskX(e), y: deskY(e), ox: s.x - deskX(e), oy: s.y - deskY(e), moved: false };
    hit.setPointerCapture(e.pointerId);
    let lt = performance.now();
    const move = (m) => {
      if (!press.moved && Math.hypot(deskX(m) - press.x, deskY(m) - press.y) < 4) return;
      if (!press.moved) { press.moved = true; s.dragging = true; s.released = false; s.z = ++topZ; s.el.classList.add('dragging'); }
      const now = performance.now(), dt = Math.max(1, now - lt) / 1000;
      const nx = deskX(m) + press.ox, ny = deskY(m) + press.oy;
      const k = 1 - Math.exp(-dt / 0.05);
      s.vx = lerp(s.vx, (nx - s.x) / dt, k); s.vy = lerp(s.vy, (ny - s.y) / dt, k);
      s.x = nx; s.y = ny; lt = now;
    };
    const up = () => {
      hit.removeEventListener('pointermove', move);
      if (press.moved) {
        s.suppressClick = true; s.dragging = false; s.released = true; s.el.classList.remove('dragging');
        const keep = performance.now() - lt > 80 ? 0 : 0.35; // a little momentum, none if held still before letting go
        s.vx *= keep; s.vy *= keep;
        if (!hit.matches(':hover')) setHover(s, false);
      }
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerup', up, { once: true });
    hit.addEventListener('pointercancel', up, { once: true });
  });
}

// Click turns a card over to its details (and back): it lifts, turns, and lays back down. While it is off the desk it
// leaves the slime alone (no outline food), and the agents under it get a puff when it lands.
function flip(s) {
  if (!s.backEl) return;
  s.flipTo = s.flipTo ? 0 : 1;
  s.hit.setAttribute('aria-expanded', String(!!s.flipTo));
  if (s.flipTo) { setHover(s, false); s.z = ++topZ; }
  if (!gpu || reduced) { // the still fallback and reduced motion just swap faces
    s.flip = s.emit = s.flipTo; s.el.classList.toggle('flipped', !!s.flipTo); placeDom(s);
    if (gpu) drawStill();
  }
}

// Springs: lift rises while dragging, tilt leans toward velocity (max ~8 deg), released cards glide and settle.
function stepCards(dt) {
  const maxTilt = (T.tilt * Math.PI) / 180;
  for (const s of sources) {
    if (view.phone && s.nav) continue; // hidden on phones, parked off the desk
    if (!s.dragging) {
      const f = Math.exp(-dt * 7);
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= f; s.vy *= f;
      const mx = s.w * 0.25, my = s.h * 0.25;
      const x0 = view.phone ? 0 : s.region * view.w; // cards stay on their own page
      if (s.x < x0 + mx || s.x > x0 + view.w - mx) { s.x = clamp(s.x, x0 + mx, x0 + view.w - mx); s.vx *= -0.4; }
      if (s.y < my || s.y > view.docH - my) { s.y = clamp(s.y, my, view.docH - my); s.vy *= -0.4; }
    }
    const liftT = s.dragging ? 1 : s.hoverOn ? 0.1 : 0;
    s.liftV += (170 * (liftT - s.lift) - 17 * s.liftV) * dt; s.lift = Math.max(0, s.lift + s.liftV * dt);
    let tx = 0, ty = 0;
    if (s.dragging) { tx = s.vx * 0.00045; ty = s.vy * 0.00045; const m = Math.hypot(tx, ty); if (m > maxTilt) { tx *= maxTilt / m; ty *= maxTilt / m; } }
    for (const [i, t] of [tx, ty].entries()) { s.tiltV[i] += (150 * (t - s.tilt[i]) - 9 * s.tiltV[i]) * dt; s.tilt[i] += s.tiltV[i] * dt; }
    const swayT = s.dragging ? clamp(s.vx * 0.00005, -0.05, 0.05) : 0;
    s.swayV += (120 * (swayT - s.sway) - 10 * s.swayV) * dt; s.sway += s.swayV * dt;
    s.hover = lerp(s.hover, s.hoverOn ? 1 : 0, 1 - Math.exp(-dt / 0.25));
    if (s.flip !== s.flipTo) {
      s.flip = s.flipTo ? Math.min(1, s.flip + dt / T.flipS) : Math.max(0, s.flip - dt / T.flipS);
      s.el.classList.toggle('flipped', s.flipTo === 1 && s.flip > 0.6); // the real links become clickable as the back faces up
      if (s.flip === s.flipTo) { s.landT = 0; s.puffPending = true; s.squash = 1; s.squashV = 0; placeDom(s); } // laid down
    }
    // An open card emits its ink: it ramps up while open and fades back to the shared ink slowly after closing.
    s.emit = s.flipTo ? Math.min(1, s.emit + dt / T.emitIn) : Math.max(0, s.emit - dt / T.emitOut);
    if (s.puffPending && (s.landT += dt) >= T.puffAt) { s.puffPending = false; s.puffArm = true; } // puff, then outline food returns
    if (s.squash) { // landing settle: a small damped squash
      s.squashV += (-260 * s.squash - 16 * s.squashV) * dt; s.squash += s.squashV * dt;
      if (Math.abs(s.squash) + Math.abs(s.squashV) < 1e-3) s.squash = s.squashV = 0;
    }
    s.burst *= Math.exp(-dt * 7);
    if (s.released && s.lift < 0.04 && Math.hypot(s.vx, s.vy) < 60) { s.released = false; s.burst = 1; }
  }
}

// ---------- media: crossfading playlists ----------

// media/clips.json maps a card key to { poster, clips }; new clips drop in with no code change. Cards without an entry
// fall back to their data-video source.
let clipLists = {};
async function loadClipLists() {
  try { clipLists = await (await fetch('/desk-media/clips.json', { cache: 'no-cache' })).json(); } catch { clipLists = {}; }
}
// Each clip is "file.mp4" or { "src": "file.mp4", "start": seconds } (default start 0).
function playlistFor(s) {
  if (!s.media) return null; // only cards with a media area can play clips
  const e = clipLists[s.key];
  if (e?.clips?.length) return e.clips.map((c) => (typeof c === 'string' ? { src: '/desk-media/' + c, start: 0 } : { src: '/desk-media/' + c.src, start: +c.start || 0 }));
  return s.videoSrc ? [{ src: s.videoSrc, start: 0 }] : null;
}
function makeVideo(src) {
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
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
    this.v = [makeVideo(list[0].src), makeVideo(list[1 % list.length].src)];
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
    if (hovered && this.state === 'rest') { this.state = 'on'; playFromStart(this.a); }
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
    this.mix = target > this.mix ? Math.min(target, this.mix + dt / T.fadeIn) : Math.max(target, this.mix - dt / (this.quick ? 0.25 : T.fadeOut));
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

// The resting thumbnail should match the video's first frame, so the fade-in reads as the image coming alive. If the
// poster does not (mean difference above about 10%), the card rests on the decoded first frame instead.
async function matchThumbnail(s) {
  const v = s.player.v[0];
  if (v.readyState < 2) await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
  await v.op;
  if (v.seeking) await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  const grab = (src) => { const c = new OffscreenCanvas(32, 18), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, 32, 18); return x.getImageData(0, 0, 32, 18).data; };
  const fa = grab(v), fb = grab(s.img);
  let diff = 0;
  for (let k = 0; k < fa.length; k += 4) diff += Math.abs(fa[k] - fb[k]) + Math.abs(fa[k + 1] - fb[k + 1]) + Math.abs(fa[k + 2] - fb[k + 2]);
  diff /= (fa.length / 4) * 3 * 255;
  if (diff < 0.1) return;
  const c = new OffscreenCanvas(v.videoWidth, v.videoHeight);
  c.getContext('2d').drawImage(v, 0, 0);
  s.thumb = c;
  if (shared?.atlas && s.atlasAt) { const { canvas: cc } = drawCard(s, shared.dev); gpu.device.queue.copyExternalImageToTexture({ source: cc }, { texture: shared.atlas, origin: s.atlasAt }, [cc.width, cc.height]); }
  if (qs.has('mlog')) console.log('[media] thumbnail for', s.key, 'is its first frame (poster differs by', diff.toFixed(2) + ')');
}

// ---------- card textures ----------

// The part of an image (fractions) that covers a media area of aspect ma, zoomed by the card's framing [zoom, x, y].
// x and y place the crop like CSS object-position, so stills, clips, and the DOM fallback frame the same way.
function coverRect(ia, ma, [z, px, py]) {
  const w = Math.min(1, ma / ia) / z, h = Math.min(1, ia / ma) / z;
  return [px * (1 - w), py * (1 - h), w, h];
}

function drawCard(s, S) {
  const cw = Math.ceil(s.w * S), ch = Math.ceil(s.h * S);
  const c = new OffscreenCanvas(cw, ch), x = c.getContext('2d');
  x.fillStyle = s.kind === 'note' ? '#fff4a8' : '#fffdf8';
  x.fillRect(0, 0, cw, ch);
  if (s.kind === 'note') x.fillStyle = '#f7ea98', x.fillRect(0, 0, cw, 22 * S); // the sticky strip is a touch darker
  let mediaPx = null;
  if (s.media) {
    const m = s.media;
    mediaPx = { x: Math.round(m.x * S), y: Math.round(m.y * S), w: Math.round(m.w * S), h: Math.round(m.h * S) };
    const src = s.thumb || s.img;
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    const [fx, fy, fw, fh] = coverRect(iw / ih, mediaPx.w / mediaPx.h, s.frame);
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, fx * iw, fy * ih, fw * iw, fh * ih, mediaPx.x, mediaPx.y, mediaPx.w, mediaPx.h);
  }
  x.scale(S, S);
  x.textBaseline = 'alphabetic';
  if (s.kind === 'photo') {
    const y0 = s.media.y + s.media.h;
    x.font = '600 13px Inter'; x.fillStyle = '#1d1d1b';
    if (s.oneLine) {
      x.fillText(s.title, 8, y0 + 21);
      x.font = '400 13px Inter'; x.fillStyle = '#6f6d66'; x.textAlign = 'right'; x.fillText(s.sub, s.w - 8, y0 + 21);
    } else {
      s.titleLines.forEach((l, i) => x.fillText(l, 8, y0 + 20 + i * 18));
      x.font = '400 13px Inter'; x.fillStyle = '#6f6d66'; x.fillText(s.sub, 8, y0 + 20 + s.titleLines.length * 18);
    }
  } else if (s.kind === 'paper') {
    x.fillStyle = '#3a3a36'; x.fillRect(0, 0, 3, s.h);
    x.font = '600 16px Inter'; x.fillStyle = '#1d1d1b';
    s.lines.forEach((l, i) => x.fillText(l, 21, 16 + 16 + i * 21.5));
    x.font = '400 13px Inter'; x.fillStyle = '#6f6d66';
    x.fillText(s.sub, 21, 16 + s.lines.length * 21.5 + 6 + 13);
  } else if (s.kind === 'polaroid') {
    x.font = '500 13px Inter'; x.fillStyle = '#4a4945'; x.textAlign = 'center';
    x.fillText(s.el.querySelector('.hand').textContent, s.w / 2, s.media.y + s.media.h + 23);
  } else {
    x.font = '500 23px Caveat'; x.fillStyle = '#2a2a26';
    s.lines.forEach((l, i) => x.fillText(l, 16, 14 + 19 + i * 26.5));
  }
  return { canvas: c, mediaPx };
}

// Back of a card: its title, the details, and link buttons along the bottom, in one type scale on every card. A back
// whose text needs more room than the front gets a bigger sheet instead of smaller type: at least minW wide, so the
// buttons pair up on narrow cards, and as tall as its text (s.backW, s.backH). Rects are CSS px, so the DOM can put the
// real links in the same places.
const BACK = { pad: 14, size: 13, lh: 13 * 1.4, bf: 12, bh: 26, bp: 22, gap: 6, minW: 200 };
function backLayout(s) {
  const { pad, size, lh, bf, bh, bp, gap } = BACK, m = measure(), w = Math.max(s.w, BACK.minW);
  const title = s.backTitle ?? (s.kind === 'note' ? '' : s.title || s.lines?.join(' ') || '');
  // Title, then each paragraph after a half-line gap.
  const lines = [];
  let y = pad;
  const add = (t, wgt, para) => { if (lines.length && para) y += lh * 0.5; for (const l of wrapLines(t, w - 2 * pad, `${wgt} ${size}px Inter`)) { lines.push([l, wgt, y]); y += lh; } };
  if (title) add(title, 600, false);
  s.backParas.forEach((t) => add(t, 400, true));
  // Buttons in reading order, left to right and wrapping down; the block sits at the bottom (at the top on a back with no
  // text), at least 8px below the text.
  m.font = `600 ${bf}px Inter`;
  const buttons = [];
  let bx = pad, row = 0;
  for (const a of s.backLinks) {
    const bw = Math.ceil(m.measureText(a.textContent).width) + bp;
    if (bx + bw > w - pad && bx > pad) { bx = pad; row++; }
    buttons.push({ a, x: bx, y: row * (bh + gap), w: bw, h: bh }); bx += bw + gap;
  }
  const blockH = buttons.length ? (row + 1) * bh + row * gap : 0;
  const h = Math.max(s.h, Math.ceil(lines.length ? y + 8 + blockH + pad : pad + blockH + pad));
  const by = lines.length ? h - pad - blockH : pad;
  for (const b of buttons) b.y += by;
  return { lines, buttons, w, h };
}
// The card's size now: the front's, growing to the back's while the card is edge-on in the middle of the turn.
const toBack = (s) => (s.flip ? smooth((easeFlip(clamp((s.flip - 0.22) / 0.56)) - 0.3) / 0.4) : 0);
const faceW = (s) => (s.backW > s.w ? lerp(s.w, s.backW, toBack(s)) : s.w);
const faceH = (s) => (s.backH > s.h ? lerp(s.h, s.backH, toBack(s)) : s.h);
function drawBack(s, S) {
  const { lines, buttons, w, h } = backLayout(s), { size, bf, bh } = BACK;
  const c = new OffscreenCanvas(Math.ceil(w * S), Math.ceil(h * S)), x = c.getContext('2d');
  x.fillStyle = s.kind === 'note' ? '#fff4a8' : '#fffdf8'; x.fillRect(0, 0, c.width, c.height);
  x.scale(S, S);
  x.textBaseline = 'alphabetic';
  for (const [t, wgt, y] of lines) { x.font = `${wgt} ${size}px Inter`; x.fillStyle = wgt === 600 ? '#1d1d1b' : '#3d3c38'; x.fillText(t, BACK.pad, y + size - 2); }
  for (const b of buttons) {
    x.beginPath(); x.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, b.h / 2);
    x.strokeStyle = '#1d1d1b40'; x.lineWidth = 1; x.stroke();
    x.font = `600 ${bf}px Inter`; x.fillStyle = '#1d1d1b'; x.textAlign = 'center';
    x.fillText(b.a.textContent, b.x + b.w / 2, b.y + bh / 2 + bf * 0.36); x.textAlign = 'left';
  }
  return { canvas: c, buttons, size, w, h };
}
// The DOM links sit exactly on the drawn buttons.
function placeBackLinks(s, buttons) {
  for (const b of buttons) Object.assign(b.a.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
}

// ---------- GPU ----------

let gpu = null, sim = null, tweakSync = null;

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
    const [ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainP] = await Promise.all([comp(E_WGSL), comp(AGENT_WGSL), comp(DIFFUSE_WGSL), rend(false), rend(true), grainPipe]);
    const uniform = device.createBuffer({ size: U.byteLength, usage: SB.UNIFORM | SB.COPY_DST });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    device.lost.then((i) => { console.warn('WebGPU device lost', i.message); });
    return { device, ctx, format, ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainPipe: grainP, uniform, sampler, ts };
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
  return { CW, CH, dev, cssH, paper: tex('rg8unorm', 0x04 | 0x10), frozenTex: [tex(g.format, 0x04 | 0x10), tex(g.format, 0x04 | 0x10)], fz: 0 };
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
    init.set([x, y, Math.random() * 6.2832, best * 2], i * 4);
  }
  const agents = device.createBuffer({ size: init.byteLength, usage: SB.STORAGE | SB.COPY_DST });
  device.queue.writeBuffer(agents, 0, init);

  // Text mask for this page at device resolution: r = crisp signature, b = where ink thins behind text.
  // Each layer paints one color channel and 'lighter' adds them, so one canvas uploads all three.
  const mask = tex(CW, CH, 'rgba8unorm', TU.TEXTURE | TU.COPY_DST | TU.RENDER);
  const mc = new OffscreenCanvas(CW, CH), mx = mc.getContext('2d');
  mx.fillStyle = '#000'; mx.fillRect(0, 0, CW, CH);
  mx.globalCompositeOperation = 'lighter';
  if (page === 0) {
    mx.font = `700 ${nameBox.size * dev}px Inter`;
    mx.letterSpacing = `${-0.035 * nameBox.size * dev}px`; // matches the DOM name (Inter, -0.035em)
    const drawName = (color, blur) => { mx.filter = blur ? `blur(${blur * dev}px)` : 'none'; mx.fillStyle = color; mx.fillText('Clark Peng', nameBox.x * dev, nameBox.baseline * dev); };
    drawName('#f00', 0);
    drawName('#00f', 10); drawName('#00f', 10);
    // Element rects are on screen; the mask is on this page.
    const sy = view.phone ? scrollY : 0, sx = view.phone ? 0 : cam.x - origin;
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
    { binding: 5, resource: shared.paper.createView() }, { binding: 6, resource: shared.frozenTex[shared.fz].createView() }, ...extra];
}
async function buildAtlas(g) {
  const S = shared.dev; // cards rasterize at device resolution
  const drawn = [];
  for (const src of sources) drawn.push(drawCard(src, S));
  const backs = sources.filter((src) => src.backEl).map((src) => ({ src, ...drawBack(src, S) }));
  // Shelf-pack the cards into one atlas.
  const AW = Math.min(4096, g.device.limits.maxTextureDimension2D);
  let x = 0, y = 0, rowH = 0;
  const places = [...drawn, ...backs].map(({ canvas: c }) => {
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
  backs.forEach(({ src, canvas: c, buttons }, i) => {
    const p = places[drawn.length + i];
    g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
    src.buv = [p.x / AW, p.y / AH, (p.x + src.backW * S) / AW, (p.y + src.backH * S) / AH];
    placeBackLinks(src, buttons);
  });
  shared.atlas = atlas;
}

// ---------- uniforms ----------

// Uniform layout: 18 vec4 of globals, MAX / 4 of draw order, 1 of video uv, then the cards (12 vec4 each).
const G_HEAD = 20, VU_OFF = (G_HEAD + MAX / 4) * 4, CARD0 = G_HEAD + MAX / 4 + 1, CARD_VEC4 = 12;
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
  const fa = Math.PI * easeFlip(clamp((s.flip - 0.22) / 0.56)), fc = Math.cos(fa);
  const up = s.flip > 0 && s.flip < 1 ? smooth(s.flip / 0.22) * (1 - smooth((s.flip - 0.78) / 0.22)) : 0;
  const lift = Math.max(s.lift, 0.9 * up);
  const th = (s.rot * Math.PI) / 180 + s.sway, sc = (1 + 0.035 * lift) * (1 - 0.014 * (s.squash || 0));
  let mu = [Math.cos(th) * sc, Math.sin(th) * sc, 0], mv = [-Math.sin(th) * sc, Math.cos(th) * sc, 0];
  // Never exactly edge-on, where the homography would be singular.
  const fe = Math.sign(fc || 1) * Math.max(Math.abs(fc), 0.02), fs = Math.sqrt(1 - fe * fe) * (Math.sin(fa) < 0 ? -1 : 1);
  if (s.flip > 0) mu = rodrigues(mu, mv.map((v) => v / sc), Math.atan2(fs, fe));
  const phi = Math.hypot(s.tilt[0], s.tilt[1]);
  if (phi > 1e-5) { const ax = [-s.tilt[1] / phi, s.tilt[0] / phi, 0]; mu = rodrigues(mu, ax, phi); mv = rodrigues(mv, ax, phi); }
  const f = 1800 * dpr, zh = lift * T.lift * dpr, cx = (s.x - originX) * dpr, cy = s.y * dpr; // page-local
  const inv = invert3([f * mu[0] - cx * mu[2], f * mv[0] - cx * mv[2], cx * (f - zh), f * mu[1] - cy * mu[2], f * mv[1] - cy * mv[2], cy * (f - zh), -mu[2], -mv[2], f - zh]);
  const hw = (faceW(s) * dpr) / 2, hh = (faceH(s) * dpr) / 2;
  U.set([inv[0], inv[1], inv[2], s.playlist ? 1 : 0, inv[3], inv[4], inv[5], 0, inv[6], inv[7], inv[8], 0,
    hw, hh, 3 * dpr, Math.min(1, lift), cx, cy, Math.cos(th), Math.sin(th), sc, s.hover, s.burst, zh,
    ...s.uv, ...s.mediaUV, Math.hypot(hw, hh) * sc * 1.04 + 2, fc < 0 ? -1 : 1, s.puffArm ? 1 : 0, Math.abs(fe),
    ...(s.buv || s.uv), ...hexRGB(s.hueHex).map(lin), s.flip !== s.flipTo || s.puffPending ? 1 : 0,
    // On a j page every card emits its J ink (blooming in from the shared ink on arrival); on paper every inked card
    // emits a mild share of its ink (tint) and the full ink while open.
    ...(jbloom >= 0 && s.jinkHex ? [...absorbance(hexRGB(s.jinkHex)), jbloom] : s.inkHex ? inkOn(s, tint, base, hueMix) : [0, 0, 0, 0])], o);
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
// The page change in progress: the outgoing page is a frozen image whose desk origin is frozenX (CSS px).
const trans = { on: false, frozenX: 0, fade: 0 };
function writeUniforms(g, sm = sim) {
  const s = sm, d = s.dpr, dev = shared.dev, st = STYLE[PAGE_NAMES[s.page]], jm = isJ(s);
  // This page's cards whose shadows can reach the screen, bottom to top; the passes only visit these.
  const sx = view.phone ? 0 : s === sim ? cam.x : s.origin, sy = view.phone ? scrollY : 0; // a page warming in the background sees its own view
  const order = sources.filter((x) => {
    if (!view.phone && x.region !== s.page) return false;
    const r = Math.hypot(Math.max(x.w, x.backW || 0), Math.max(x.h, x.backH || 0)) / 2 + 100 * Math.max(T.shadowSoft, 1);
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
    focus += ((hovered && !hovered.dragging && !flipping ? 1 : 0) - focus) * (1 - Math.exp(-dt / Math.max(0.01, T.focusS / 3))); }
  U.set([s.W, s.H, activeAgents(s), d,
    T.speed / 60 * d, T.deposit * Q.depMul, T.decay, T.diffuse,
    T.sd * d, T.sa, T.turn, 0,
    T.respawn, T.edge, sources.length, clock.frame,
    (cursor.x - s.origin) * d, cursor.y * d, cursor.amt, 0.94, 0.6, 0.4, st.gain, st.gamma,
    ...absorbance(hexRGB(st.ink)), s.W / shared.CW, ...NAME_ABS, Math.max(1, Math.round(1 / T.share)),
    vs ? vs.id : -1, videoMix, vs?.player.fading ? clamp(vs.player.fade) : 0, cam.x * dev,
    EDGE_MODES.indexOf(T.edgeMode), T.ridge * d, T.ridgeW * d, T.puffR * d,
    T.puff, T.puffDecay, T.hoverE, T.cursorE,
    st.soft + (T.focusSoft - st.soft) * smooth(focus), st.grain, 0, order.length,
    T.edgeMode === 'ring2' ? 1 : T.ring2, T.ring2At, T.corner, st.opacity,
    T.shadowSoft, T.shadow, 0, 0,
    CHOICES.mode.indexOf(st.mode), st.glow, st.halo, s.t,
    ...hexRGB(st.bg).map(lin), 0,
    s.origin * dev, trans.on ? 1 : trans.fade > 0 ? 2 + trans.fade : 0, trans.frozenX * dev, shared.CW,
    st.stain, st.bleed * d, 0, 0,
    T.pDesat, T.pWarm, T.pBlack, T.pDuo,
    T.pGrain, T.pMatte, 0, 0,
    ...order, ...Array(MAX - order.length).fill(0), ...vu], 0);
  for (const src of sources) cardUniform(src, d, (CARD0 + src.id * CARD_VEC4) * 4, s.origin, jm ? s.bloom : -1, st.mode === 'paper' ? st.tint : 0, st.ink, st.hueMix ?? 1);
  g.device.queue.writeBuffer(g.uniform, 0, U);
}

// ---------- frame ----------

function encodeStep(enc, only = 'ead', ts = null, sm = sim) {
  const s = sm, p = s.parity;
  const pass = enc.beginComputePass(ts ? { timestampWrites: { querySet: gpu.ts.set, beginningOfPassWriteIndex: 0 } } : undefined);
  if (only.includes('e')) { pass.setPipeline(gpu.ePipe); pass.setBindGroup(0, s.eBG[p]); pass.dispatchWorkgroups(Math.ceil(s.EW / 8), Math.ceil(s.EH / 8)); }
  if (only.includes('a')) { pass.setPipeline(gpu.agentPipe); pass.setBindGroup(0, s.agentBG[p]); pass.dispatchWorkgroups(Math.ceil(activeAgents(s) / 64)); }
  if (only.includes('d')) { pass.setPipeline(gpu.diffusePipe); pass.setBindGroup(0, s.diffuseBG[p]); pass.dispatchWorkgroups(Math.ceil(s.W / 16), Math.ceil(s.H / 16)); }
  pass.end();
  s.parity = 1 - p;
  s.t += STEP;
}
function encodeRender(enc, target, ts = null) {
  const s = sim;
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
  if (!autoOn()) return;
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
  shared.fz = 1 - shared.fz;
  sims.forEach(destroySim);
  sims = (view.phone ? [0] : [0, 1]).map((pg) => Object.assign(createSim(gpu, pg), { t: 4.5, warm: WARM_STEPS }));
  sim = sims[page];
  trans.fade = 1; trans.frozenX = cam.x;
}

let last = 0, acc = 0, running = true;
const stats = { intervals: [] };
function frame(now) {
  if (!running || dead) return;
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
  if (last) { stats.intervals.push(now - last); if (stats.intervals.length > 240) stats.intervals.shift(); }
  last = now;
  syncHover();
  stepCards(dt);
  stepCam(dt);
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
      if (s.puffArm && qs.has('mlog')) console.log('[flip] puff', s.key, 'at flip', s.flip);
      s.puffArm = false; // a landing puffs the agents on exactly one step
    }
  }
  if (steps === 2) acc = Math.min(acc, STEP);
  // Once the landing page has settled, warm the other page in the background (a couple of steps a frame, one time only),
  // so it arrives formed and the pan has nothing to catch up on. After that the inactive page costs nothing.
  const other = sims.length > 1 ? sims[1 - page] : null;
  if (other && other.warm > 0 && !trans.on && clock.t > 5) {
    const n = Math.min(other.warm, 2);
    other.warm -= n;
    const enc = gpu.device.createCommandEncoder();
    for (let k = 0; k < n; k++) { writeUniforms(gpu, other); encodeStep(enc, 'ead', null, other); }
    gpu.device.queue.submit([enc.finish()]);
    writeUniforms(gpu); // back to the active page's uniforms for the render below
  }
  if (sim.warm > 0) { // a page seen for the first time: catch up a burst of steps, spread over the transition's frames
    const n = Math.min(sim.warm, 25);
    sim.warm -= n;
    writeUniforms(gpu);
    const enc = gpu.device.createCommandEncoder();
    for (let k = 0; k < n; k++) encodeStep(enc);
    gpu.device.queue.submit([enc.finish()]);
  }
  if (trans.fade > 0) trans.fade = Math.max(0, trans.fade - dt / 0.8); // crossfade from the frame before a resolution change
  if (!steps) writeUniforms(gpu);
  const enc = gpu.device.createCommandEncoder();
  const timed = ts && steps ? ts : null;
  encodeRender(enc, gpu.ctx.getCurrentTexture().createView(), timed);
  gpu.device.queue.submit([enc.finish()]);
  if (timed) {
    timed.busy = true;
    timed.read.mapAsync(1).then(() => {
      const [t0, t1] = new BigInt64Array(timed.read.getMappedRange());
      if (t1 > t0) Q.samples.push(Number(t1 - t0) / 1e6);
      timed.read.unmap(); timed.busy = false;
    }).catch(() => { timed.busy = false; });
  }
  qualityCheck(dt);
  if (isJ(sim)) sim.bloom = Math.min(1, sim.bloom + dt / STYLE[PAGE_NAMES[sim.page]].bloom); // olive -> the J desk's inks
  for (const s of sources) if (s.dragging || s.lift > 0.001 || s.flip % 1 || Math.abs(s.vx) + Math.abs(s.vy) > 0.5 || Math.abs(s.sway) > 1e-4) placeDom(s);
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
  if (shared) for (const t of [shared.paper, ...shared.frozenTex, shared.atlas]) t?.destroy();
  shared = createShared(gpu);
  await buildAtlas(gpu);
  // Phones scroll one long page; desktops get a main page and a research page, each with its own sim.
  sims = (view.phone ? [0] : [0, 1]).map((pg) => createSim(gpu, pg));
  page = view.phone ? 0 : regionFromHash();
  sim = sims[page];
  // Bake the paper grain once (it never changes), so the per-frame pass reads it instead of computing noise.
  writeUniforms(gpu);
  const ge = gpu.device.createCommandEncoder(), gp = ge.beginRenderPass({ colorAttachments: [{ view: shared.paper.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  gp.setPipeline(gpu.grainPipe);
  gp.setBindGroup(0, gpu.device.createBindGroup({ layout: gpu.grainPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: gpu.uniform } }] }));
  gp.draw(3); gp.end(); gpu.device.queue.submit([ge.finish()]);
  // The page you land on forms in front of you; a page you have not visited yet is warmed up when you go there.
  if (!first || reduced) { clock.t = 4.5; sim.t = 4.5; }
  for (const sm of sims) if (sm !== sim) sm.warm = WARM_STEPS;
}

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
    if (k === 'look') {
      const before = RESEED.map((r) => T[r]).join();
      applyLook(v); sync();
      if (gpu && before !== RESEED.map((r) => T[r]).join()) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); }
    }
    if (RESEED.includes(k) && gpu) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); }
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
  bar.append(copy, reset);
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
  await loadClipLists();
  for (const s of sources) if (!s.still && clipLists[s.key]?.poster) s.img.src = '/desk-media/' + clipLists[s.key].poster; // an explicit still wins
  layout(); // the startup still uses the final layout right away
  panTo(regionFromHash(), true);
  const fontsReady = Promise.all([document.fonts.load('700 60px Inter'), document.fonts.load('500 23px Caveat'), document.fonts.load('600 13px Inter'), document.fonts.load('400 13px Inter')]);
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3000))]);
  mark('fonts');
  layout(); // card sizes measured with the real fonts
  await Promise.all(sources.map((s) => s.img?.decode().catch(() => {})));
  mark('images');
  // The desk fades in once, from bare paper: straight to the live field when WebGPU is quick, else the DOM still first.
  const showStill = setTimeout(() => body.classList.add('ready'), 250);
  gpu = await initGpu();
  if (dead) { gpu?.device.destroy(); return; }
  mark('pipelines');
  if (!gpu) { clearTimeout(showStill); body.classList.add('nogpu', 'ready'); layout(); return; }
  await rebuild(true);
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
  for (const s of sources) s.playlist = playlistFor(s); // players are made on first hover
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
window.__j = { Q, activeAgents: () => sim && activeAgents(sim), GROUPS, STYLE_PARAMS, probeFade, drawBack, drawCard, view: () => view, sim: () => sim && { page: sim.page, W: sim.W, H: sim.H, n: sim.n, t: sim.t, CW: shared.CW, dev: shared.dev, dpr: sim.dpr }, trans: () => ({ ...trans, camT: cam.t }), sims: () => sims.map((x) => ({ page: x.page, t: +x.t.toFixed(2), parity: x.parity, warm: x.warm })), STYLE, cam: () => cam, U: () => U, media: () => ({ src: videoSrc?.key, mix: videoMix, playing: videoSrc?.player.playing(), fade: videoSrc?.player.fade, i: videoSrc?.player.i, state: videoSrc?.player.state, t: videoSrc && +videoSrc.player.a.currentTime.toFixed(2), clip: videoSrc?.player.a.currentSrc.split('/').pop() }), bootLog, bench: (n) => bench(n), stats: () => ({ ...stats, t: clock.t, dpr: view.dpr, n: sim?.n, W: sim?.W, H: sim?.H }), sources, T };
main();
// Leaving the page: stop the frame loop and timers' effects, drop listeners, stop and release every video, free the GPU.
return () => {
  dead = true; running = false; ac.abort();
  for (const s of sources) for (const v of s.player?.v || []) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
  gpu?.ctx.unconfigure(); gpu?.device.destroy();
  delete window.__j;
};
}
