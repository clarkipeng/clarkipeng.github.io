import { currentDesk } from './state.ts';
import { MAX, PAPER, lin } from './tunables.ts';
import { NCH } from './chips.ts';

// ---------- WGSL ----------

const COMMON = /* wgsl */ `
struct Card { inv0: vec4f, inv1: vec4f, inv2: vec4f, geo: vec4f, flat: vec4f, misc: vec4f, uv: vec4f, media: vec4f, bound: vec4f, buv: vec4f, hue: vec4f, ink: vec4f, imp: vec4f, shd: vec4f, obj: vec4f, pat: vec4f };
// imp: where the card was just picked up (page sim px) and how strongly its imprint shows (fades over IMPRINT_S); w: how far its shadow has faded (a box flying off)
// shd: the footprint its shadow falls from (center offset, half size; sim px, in the card's frame): the whole card, or a
// card box's base on the desk | obj: x = its texture's alpha is part of its shape (the box and its lid), y = extra contact shadow,
// z = how much higher than a flat card its far shadow falls from (CSS px), w = 4 x flags + how long its vertical axis looks
// (0 to 1, as it turns); flags: 1 its back is turned over its horizontal axis (the note), 4 a face of the flying box (y: its
// opacity; bound.w: its light), 8 only its shadow (the flying box's base)
// Sim px. geo: half size, corner radius, lift | flat: center, cos, sin | misc: scale, hover, burst, lift height
// uv: front atlas rect | media: media rect in card uv | bound: bounding radius, facing (+1 front, -1 back), landing now, how long its horizontal axis looks (0 to 1)
// inv1.w: seconds since the card last landed (< 0 while it is flying in, 1e3 once its release is over) | inv2.w: how hard it last landed
// pat: the patch that just came into contact, in the card's frame as fractions of its half size: center, half size
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
  z: vec4f,   // ink softness (texels), ink grain, cards flying off the page you left (after this page's in ord), on-screen card count
  w: vec4f,   // second ring on, second ring at (x ridge distance), corner emphasis, ink opacity
  u: vec4f,   // shadow softness, shadow strength, release window (s), tiles per row (TILE device px each)
  st: vec4f,  // style (0 paper, 1 spectrum, 2 j), glow, halo, page clock (s)
  bg: vec4f,  // page background, linear rgb
  pg: vec4f,  // canvas size (device px), crossfade from the frozen frame (a sim resolution change), page turn on
  jq: vec4f,  // j style: ink stain over cards, ink bleed into card borders (sim px); hold (1: clear the ink, hold the agents), the note drawn as paper (-1: none)
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
  ch: vec4f,  // chips on this page (food count), chip layer drawn, tile count, chips thrown off the page you left
  chipf: array<vec4f, ${NCH * 2}>, // per chip: center, food radius, food strength (sim px); then per chip: the patch that just came down (contact): center, radius, strength
  chipt: array<vec4f, ${NCH}>, // each chip's tile: its corner and size on the canvas (device px), its layer in chipTex
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
fn patchSd(c: Card, p: vec2f) -> f32 { return boxSd(toLocal(c, p) - c.geo.xy * c.pat.xy, c.geo.xy * c.pat.zw, c.geo.z * min(c.pat.z, c.pat.w)) * c.misc.x; }
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
`;

// Hovering a card excites the ink around it; a drop sends a soft pulse; the cursor stirs a little.
export const E_WGSL = COMMON + /* wgsl */ `
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

export const DIFFUSE_WGSL = COMMON + /* wgsl */ `
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
export const TILE = 16;
export const TILE_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> tiles: array<vec4u>; // per tile: the cards that can reach it, their imprints, the chips
fn rectDist(c: vec2f, lo: vec2f, hi: vec2f) -> f32 { return length(max(max(lo - c, c - hi), vec2f(0.0))); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tx = u32(g.u.w);
  let ty = (u32(g.pg.y) + ${TILE}u - 1u) / ${TILE}u;
  if (gid.x >= tx * ty) { return; }
  let q = g.n.w; let s = g.a.w;
  let lo = vec2f(f32(gid.x % tx), f32(gid.x / tx)) * ${TILE}.0 * q;
  let hi = lo + vec2f(${TILE}.0 * q);
  var m = vec4u(0u);
  for (var j = 0u; j < u32(g.z.w + g.z.z); j++) { // the page's cards and the box flying off it
    let k = u32(g.ord[j / 4u][j % 4u]);
    let face = (u32(g.cards[k].obj.w * 0.25) & 4u) != 0u;
    let reach = g.cards[k].bound.x + select((40.0 + 60.0 * g.cards[k].geo.w) * s * max(g.u.x, 1.0), 0.0, face);
    if (rectDist(g.cards[k].flat.xy, lo, hi) <= reach + 1.0) { m.x |= 1u << j; }
  }
  for (var k = 0u; k < u32(g.d.z); k++) {
    let im = g.cards[k].imp;
    if (im.z < 0.002) { continue; }
    if (rectDist(im.xy, lo, hi) <= length(g.cards[k].geo.xy) + 6.0 * s + 1.0) { m.y |= 1u << k; } // the rounded box lies inside its corners' circle
  }
  let dlo = vec2f(f32(gid.x % tx), f32(gid.x / tx)) * ${TILE}.0;
  for (var i = 0u; i < u32(g.ch.z); i++) { // the chips' tiles (device px)
    let t = g.chipt[i];
    if (all(t.xy < dlo + ${TILE}.0) && all(t.xy + t.z > dlo)) { m.z |= 1u << i; }
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
export const GRAIN_WGSL = COMMON + PAPER_FNS + /* wgsl */ `
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f { return vec4f(grain(fp.xy * g.n.w / g.a.w), 0.0, 1.0); }`;

export function mountWgsl() {
const desk = currentDesk();
const { qs } = desk;
const SLOW = Math.max(0, Math.round(Number(qs.get('slow')) || 0)); // test hook: artificial GPU work per agent
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
// Heading straight out through the nearest edge of card c's contact patch from p (under it or just outside it).
fn outward(c: Card, p: vec2f) -> f32 {
  let r = p - c.flat.xy; let cs = c.flat.zw;
  let l = vec2f(cs.x * r.x + cs.y * r.y, -cs.y * r.x + cs.x * r.y) - c.geo.xy * c.misc.x * c.pat.xy;
  let q = abs(l) - c.geo.xy * c.misc.x * c.pat.zw;
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
  for (var i = 0u; i < u32(g.ch.x); i++) { // chips are food: veins grow toward them and under them
    let c = g.chipf[i]; let r = (p - c.xy) / c.z; let d2 = dot(r, r);
    if (d2 < 9.0) { v = max(v, c.w * exp(-d2)); }
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
    if (c.bound.z > 0.5 && patchSd(c, pos) < g.x.w) {
      ang = outward(c, pos) + (rnd() - 0.5) * 1.2;
      puff = max(puff, c.inv2.w * (0.8 + 0.2 * rnd()));
    }
  }
  for (var ci = 0u; ci < u32(g.ch.x); ci++) { // a chip's patch landing: out from its middle
    let l = g.chipf[${NCH}u + ci];
    if (l.w > 0.0 && distance(pos, l.xy) < l.z + g.x.w) { ang = atan2(pos.y - l.y, pos.x - l.x) + (rnd() - 0.5) * 1.2; puff = max(puff, l.w * (0.8 + 0.2 * rnd())); }
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

const renderWGSL = (video: boolean) => COMMON + /* wgsl */ `
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var atlas: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;
@group(0) @binding(5) var paper: texture_2d<f32>;
@group(0) @binding(6) var frozen: texture_2d<f32>;
${video ? '@group(0) @binding(7) var vidA: texture_external;\n@group(0) @binding(8) var vidB: texture_external;' : ''}
@group(0) @binding(9) var<storage, read> tiles: array<vec4u>;
@group(0) @binding(10) var chipTex: texture_2d_array<f32>;
@group(0) @binding(11) var chipZ: texture_2d_array<f32>;
@group(0) @binding(12) var noteTex: texture_2d<f32>; // the turning note, drawn as paper (note.js)
// The chips, drawn on their own (chip-render.ts) as premultiplied linear color, over the desk and the resting cards: at
// each pixel, the lowest of what they show there first.
fn chipsAt(ip: vec2i, near: u32) -> vec4f {
  var cs: array<vec4f, ${NCH}>; var zs: array<f32, ${NCH}>; var n = 0u; var m = near;
  while (m != 0u) { // the chips whose tiles reach this screen tile, in order of height here
    let i = firstTrailingBit(m); m &= m - 1u;
    let t = g.chipt[i]; let p = vec2f(ip) - t.xy;
    if (any(p < vec2f(0.0)) || any(p >= vec2f(t.z))) { continue; }
    let c = textureLoad(chipTex, vec2i(p), i32(t.w), 0);
    if (c.a <= 0.0) { continue; }
    let z = textureLoad(chipZ, vec2i(p), i32(t.w), 0).r;
    var k = n;
    while (k > 0u && zs[k - 1u] > z) { cs[k] = cs[k - 1u]; zs[k] = zs[k - 1u]; k--; }
    cs[k] = c; zs[k] = z; n++;
  }
  var o = vec4f(0.0);
  for (var k = 0u; k < n; k++) { o = o * (1.0 - cs[k].a) + cs[k]; }
  return o;
}
fn layChips(col: vec3f, c: vec4f) -> vec3f { return col * (1.0 - c.a) + c.rgb; }

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
// Signed distance to card c's flat footprint at q from its center (sim px).
fn footSd(c: Card, q: vec2f) -> f32 {
  let l = vec2f(c.flat.z * q.x + c.flat.w * q.y, -c.flat.w * q.x + c.flat.z * q.y) / c.misc.x / max(vec2f(c.bound.w, fract(c.obj.w * 0.25) * 4.0), vec2f(0.05)); // squashed as the card turns
  return boxSd(l - c.shd.xy, c.shd.zw, c.geo.z) * c.misc.x;
}
// Soft shadow of card c's flat footprint, offset by o and blurred by b (sim px).
fn shadow(c: Card, p: vec2f, o: vec2f, b: f32) -> f32 { return 1.0 - smoothstep(-b, b, footSd(c, p - c.flat.xy - o)); }

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

// One card over col at p (sim px): its soft shadow, then the card. gr, t4, conc, localInk, fadeIn: the paper and ink under it.
fn layCard(col0: vec3f, k: u32, p: vec2f, gr: vec2f, t4: vec4f, conc: f32, localInk: f32, fadeIn: f32) -> vec3f {
  var col = col0;
  let q = g.n.w; let s = g.a.w;
  let spectrum = g.st.x > 0.5 && g.st.x < 1.5;
  let jmode = g.st.x > 1.5;
  let c = g.cards[k];
  let lift = c.geo.w;
  let ow = u32(c.obj.w * 0.25);
  let face = (ow & 4u) != 0u; // a face of the flying box: no shadow of its own, lit by its turn
  let base = (ow & 8u) != 0u; // the flying box's base: only its shadow, from its footprint, the contact one gone once it lifts
  if (distance(p, c.flat.xy) > c.bound.x + select((40.0 + 60.0 * lift) * s * max(g.u.x, 1.0), 0.0, face)) { return col; }
  let lp = toLocal(c, p);
  let d = select(boxSd(lp, c.geo.xy, c.geo.z) * c.misc.x, footSd(c, p - c.flat.xy), base);
  let mesh = f32(k) == g.jq.w;
  var nm = vec4f(0.0); // the note as paper: where on it, its light (< 0: its back), coverage; shd.xy: its tile's corner
  var fp = vec2f(0.0); // and how much of the note this pixel spans (the most across to a neighbor on the same face)
  if (mesh) {
    let n = vec2i(textureDimensions(noteTex)) / vec2i(1, 2); let t = vec2i(p / q - c.shd.xy);
    if (all(t >= vec2i(0)) && all(t < n)) {
      nm = textureLoad(noteTex, t, 0);
      for (var i = 0; i < 4; i++) {
        let o = textureLoad(noteTex, clamp(t + vec2i(select(vec2i(0, 1), vec2i(1, 0), (i & 1) == 0) * select(1, -1, i > 1)), vec2i(0), n - 1), 0);
        if (o.a > 0.0 && (o.z < 0.0) == (nm.z < 0.0) && distance(o.xy, nm.xy) > length(fp)) { fp = o.xy - nm.xy; }
      }
      let sh = textureLoad(noteTex, t + vec2i(0, n.y), 0);
      col *= (1.0 - sh.x * (0.09 + 0.08 * conc) * g.u.y) * (1.0 - sh.y * g.u.y);
    }
  } else if (jmode && !face) {
    // J: a contact shadow from local ink density (ink pools against the edge), plus a soft shadow while lifted.
    if (d > -1.0) {
      let dd = max(d, 0.0) / s;
      let contact = (exp(-dd / 1.1) * (0.13 + 0.45 * localInk) + exp(-dd / (3.0 + 6.0 * localInk)) * (0.04 + 0.3 * localInk)) * (1.0 - min(lift * 2.5, 1.0));
      var ls = 0.0;
      if (lift > 0.001) { let b = (2.0 + 20.0 * lift) * s; ls = shadow(c, p, vec2f(0.35, 1.0) * c.misc.w * 1.3, b) * 0.24 * lift; }
      col *= (1.0 - contact * (1.0 - c.imp.w)) * (1.0 - ls * (1.0 - c.imp.w));
    }
  } else if (!face) {
    // A paper card's soft drop shadow: a tight contact line plus a wide, faint ambient one that grows as it lifts.
    let near = shadow(c, p, vec2f(0.0, (0.6 + 2.0 * lift) * s), (1.2 + 3.0 * lift) * s * g.u.x) * (0.09 + 0.08 * conc + c.obj.y) * (1.0 - select(0.6, 1.0, base) * lift) * g.u.y;
    let far = shadow(c, p, vec2f(0.25, 1.0) * (5.0 + 16.0 * lift + c.obj.z) * s, (14.0 + 22.0 * lift + c.obj.z) * s * g.u.x) * (0.06 + 0.1 * lift + 0.005 * c.obj.z) * g.u.y;
    col *= (1.0 - near * (1.0 - c.imp.w)) * (1.0 - far * (1.0 - c.imp.w)); // imp.w: its shadow fades as it flies off
  }
  if (base) { return col; }
  let cov = select(clamp(0.5 - d / q, 0.0, 1.0), nm.a, mesh);
  if (cov > 0.0) {
    var un = select(lp / (2.0 * c.geo.xy) + 0.5, clamp(nm.xy, vec2f(0.0), vec2f(1.0)), mesh);
    let back = select(c.bound.y < 0.0, nm.z < 0.0, mesh);
    if (back) { if ((ow & 1u) != 0u) { un.y = 1.0 - un.y; fp.y = -fp.y; } else { un.x = 1.0 - un.x; fp.x = -fp.x; } } // seen from behind (turned over its horizontal or vertical axis), so the back reads the right way round
    let ua = select(c.uv.xy, c.buv.xy, back); let ub = select(c.uv.zw, c.buv.zw, back);
    var tex = textureSampleLevel(atlas, samp, mix(ua, ub, un), 0.0);
    // The atlas has no mipmaps, and paper seen steeply squeezes much of the note into a pixel: average taps across it.
    let nt = min(i32(length(fp * (ub - ua) * vec2f(textureDimensions(atlas))) / 1.5), 16);
    if (nt > 1) {
      tex = vec4f(0.0);
      for (var i = 0; i < nt; i++) { tex += textureSampleLevel(atlas, samp, mix(ua, ub, clamp(un + fp * ((f32(i) + 0.5) / f32(nt) - 0.5), vec2f(0.0), vec2f(1.0))), 0.0) / f32(nt); }
    }
    var cc = pow(tex.rgb, vec3f(2.2));
    ${video ? `if (!back && f32(k) == g.v.x && g.v.y > 0.0) {
      let mu = (un - c.media.xy) / (c.media.zw - c.media.xy);
      if (all(mu >= vec2f(0.0)) && all(mu <= vec2f(1.0))) {
        let vuv = g.vu.xy + mu * g.vu.zw;
        // Video YUV->RGB can land slightly outside [0, 1] (limited-range blacks); pow() of a negative is undefined and
        // showed up as inverted colors. Clamp each frame, then crossfade in linear light.
        // A video has no mipmaps, so one tap aliases its grain when shrunk; average four bilinear taps across the
        // device pixel's footprint (q / scale local units) so a clip downsamples as smoothly as the stills do.
        let o = 0.25 * g.vu.zw * q / (max(c.misc.x, 1e-3) * (c.media.zw - c.media.xy) * 2.0 * c.geo.xy);
        var ra = vec3f(0.0); var rb = vec3f(0.0);
        for (var i = 0; i < 4; i++) {
          let t = vuv + o * vec2f(f32(i & 1) * 2.0 - 1.0, f32(i >> 1) * 2.0 - 1.0);
          ra += 0.25 * textureSampleBaseClampToEdge(vidA, samp, t).rgb;
          rb += 0.25 * textureSampleBaseClampToEdge(vidB, samp, t).rgb;
        }
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
      // The picture lies under the frame's glossy window: a hairline of shadow where the frame's edge overlaps it, and a
      // faint sheen that holds still as the card turns and slides toward the top as it lifts.
      cc *= 1.0 - 0.09 * (1.0 - smoothstep(0.0, 1.5, edge));
      let sq = (p - c.flat.xy) / max(c.bound.x, 1.0);
      let band = dot(sq, vec2f(0.55, 0.83)) + 0.3 + 0.5 * lift;
      cc += 0.015 * exp(-band * band * 6.0) * (1.0 - cc);
    }
    cc *= (1.0 + (gr.y - 0.5) * 0.03) * select(select(0.82 + 0.18 * c.bound.w * fract(c.obj.w * 0.25) * 4.0, c.bound.w, face), abs(nm.z), mesh) * select(1.0, 0.9, spectrum); // a turning card catches less light; on the dark surface cards sit a touch dimmer
    if (jmode) {
      // J: ink runs under the card and shows through as a light stain, soaking in harder along the border's fibers;
      // over captions it stays faint so the text reads. A lifted card is above the ink and comes away clean.
      let band = 1.0 - smoothstep(0.0, g.jq.y * (0.35 + 1.3 * gr.y), max(-d, 0.0));
      let onMedia = all(un >= c.media.xy) && all(un <= c.media.zw);
      cc *= pow(inkJ(t4, gr.y, fadeIn), vec3f(mix(g.jq.x * select(0.35, 1.0, onMedia), 0.6, band) * (1.0 - lift)));
    }
    col = mix(col, cc, cov * select(1.0, tex.a, c.obj.x > 0.5) * select(1.0, c.obj.y, face)); // a box's open end and cut corners are see-through; a face of the flying box fades by obj.y
  }
  return col;
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

  // This page's cards first (g.z.w of them); the rest (g.z.z) are the page you left's card box, flying off over the turn.
  let nPage = u32(g.z.w);
  let pageBits = select((1u << nPage) - 1u, 0xffffffffu, nPage >= 32u);
  var cards = tm.x & pageBits;
  var chipsLaid = g.ch.y < 0.5 || g.ch.w > 0.5;
  let chip = chipsAt(ip, tm.z);
  while (cards != 0u) { // on-screen cards that can reach this tile, bottom to top
    let j = firstTrailingBit(cards); cards &= cards - 1u;
    let k = u32(g.ord[j / 4u][j % 4u]);
    if (!chipsLaid && g.cards[k].geo.w > 0.01) { col = layChips(col, chip); chipsLaid = true; } // chips lie on the desk, under any lifted card
    col = layCard(col, k, p, gr, t4, conc, localInk, fadeIn);
  }
  if (!chipsLaid) { col = layChips(col, chip); }
  // This page's folded corner, over a sliver of the next page and the edges of the pages below.
  col = rolled(pd, bare(gr, vq) * stacked(pd, 1.0), col, false, g.dr, g.la);
  // A page turn: the page you left (its frozen last frame) rolls away over this one. What it uncovers fades from the bare
  // paper the resting corner shows to this page as the fold opens (the same 250 px as the stacked edges), so the sliver
  // never switches in one frame, at the start or when a turn by hand falls back.
  if (g.pg.w > 0.5) { col = rolled(pd, mix(col, bare(gr, vq), g.lb.w) * stacked(pd, g.lb.w), pow(textureLoad(frozen, ip, 0).rgb, vec3f(2.2)), true, g.cu, g.lt); }
  if (g.ch.w > 0.5) { col = layChips(col, chip); } // the chips the turn throws off the page you left, over it
  var over = tm.x & ~pageBits; // the box you left, above both pages
  while (over != 0u) {
    let j = firstTrailingBit(over); over &= over - 1u;
    col = layCard(col, u32(g.ord[j / 4u][j % 4u]), p, gr, t4, conc, localInk, fadeIn);
  }
  var outc = vec4f(pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
  if (g.pg.z > 0.0) { outc = mix(outc, textureLoad(frozen, ip, 0), g.pg.z); } // crossfade from the frame before a sim resolution change
  return outc;
}`;
return { renderWGSL, AGENT_WGSL };
}
