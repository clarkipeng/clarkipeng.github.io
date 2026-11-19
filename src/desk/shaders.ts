// WGSL for the desk. Every step: excitation field E -> agents (steer, deposit by atomics) -> trail diffuse/decay.
// One fragment pass at full device resolution draws paper grain, the ink, the crisp signature, and the cards (atlas
// texture, video via importExternalTexture) with soft drop shadows.

export const MAX = 16; // cards per desk
export const PAPER = [0xf3, 0xf1, 0xea];
const lin = (c: number) => Math.pow(c / 255, 2.2);

export const COMMON = /* wgsl */ `
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

export const AGENT_WGSL = COMMON + /* wgsl */ `
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
export const GRAIN_WGSL = COMMON + PAPER_FNS + /* wgsl */ `
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f { return vec4f(grain(fp.xy * g.n.w / g.a.w), 0.0, 1.0); }`;

export const renderWGSL = (video: boolean) => COMMON + /* wgsl */ `
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
