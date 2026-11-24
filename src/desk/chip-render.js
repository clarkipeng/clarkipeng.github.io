// Drawing the chips (chips.js): each one analytically, from its shape and pose, so its voxels never show. A small pass
// draws each chip that changed, with its shadow, into its own layer of a small texture array; the desk's render lays
// the tiles over the resting cards (lowest chip first) and under any lifted one, so a frame costs only what changed. A second small pass reads the slime under each chip back to the
// physics, which eats only where it is.

import { CN, NCH, FEED } from './chips.js';

const BODY_VEC4 = 14, HEAD_VEC4 = 4;
// A shadow falls this far right and down per px of height, like the cards' far shadows.
const LS = [0.15, 0.6];

const CHIP_WGSL = /* wgsl */ `
struct Body {
  r0: vec4f, r1: vec4f, r2: vec4f, // rows of its rotation; w: its position (page CSS px, z its height)
  c: vec4f,     // its centre of mass in its shape's frame, w: its mask layer
  rect: vec4f,  // its box on screen (page CSS px)
  srect: vec4f, // its shadow's box
  s0: vec4f,    // radius, grid half size, thickness, saddle sag
  s1: vec4f,    // bowl, the saddle axis's cos and sin, tone
  h0: vec4f, h1: vec4f, // the rim's waves (amplitude, phase) for 2, 3, 4 and 5 lobes
  w0: vec4f, w1: vec4f, // two slow warps: wave vector, amplitude, phase
  z: vec4f,     // its lowest and highest point (desk z), grid cell, seed
  tile: vec4f,  // its tile's corner on the canvas (device px)
};
struct CU {
  a: vec4f,  // device px per CSS px, tile size (device px)
  l0: vec4f, // gold, browned rim, ripples, salt
  l1: vec4f, // translucent edges, oil sheen, shadow, nibbled edges
  l2: vec4f, // slime stain, light (x, y toward it), unused
  b: array<Body, ${NCH}>,
};
@group(0) @binding(0) var<uniform> u: CU;
@group(0) @binding(1) var mask: texture_2d_array<f32>;
@group(0) @binding(2) var samp: sampler;
var<private> bi: u32; // the chip being drawn: read in place from the uniforms, never copied

const LS = vec2f(${LS.join(', ')});

struct VO { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) id: u32, @location(1) @interpolate(flat) kind: u32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  o.id = ii / 2u; o.kind = ii % 2u; // a chip's shadow, then the chip
  let b = u.b[o.id];
  var cs = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  let r = select(b.rect, b.srect, o.kind == 0u) * u.a.x;
  let px = clamp(mix(r.xy, r.zw, cs[vi]) - b.tile.xy, vec2f(0.0), vec2f(u.a.y)) / u.a.y;
  o.pos = vec4f(px.x * 2.0 - 1.0, 1.0 - px.y * 2.0, 0.0, 1.0);
  return o;
}

fn hash(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn hash2(p: vec2f) -> vec2f { return vec2f(hash(p), hash(p + vec2f(17.3, 5.1))); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i; let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), s.x), mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), s.x), s.y);
}

// Height of the mid-surface over p (the shape's frame), and its slope: chips.js's surf().
fn surf(p: vec2f) -> vec3f {
  let b = &u.b[bi];
  let uu = b.s1.y * p.x + b.s1.z * p.y; let vv = -b.s1.z * p.x + b.s1.y * p.y; let R2 = b.s0.x * b.s0.x;
  let p1 = b.w0.x * p.x + b.w0.y * p.y + b.w0.w; let p2 = b.w1.x * p.x + b.w1.y * p.y + b.w1.w;
  let h = (b.s0.w * (uu * uu - vv * vv) + b.s1.x * dot(p, p)) / R2 + b.w0.z * sin(p1) + b.w1.z * sin(p2);
  let hu = 2.0 * b.s0.w * uu / R2; let hv = -2.0 * b.s0.w * vv / R2;
  let hx = b.s1.y * hu - b.s1.z * hv + 2.0 * b.s1.x * p.x / R2 + b.w0.z * b.w0.x * cos(p1) + b.w1.z * b.w1.x * cos(p2);
  let hy = b.s1.z * hu + b.s1.y * hv + 2.0 * b.s1.x * p.y / R2 + b.w0.z * b.w0.y * cos(p1) + b.w1.z * b.w1.y * cos(p2);
  return vec3f(h, hx, hy);
}
// How far inside its rim p is (px; < 0 outside): chips.js's outlineR().
fn rimSd(p: vec2f) -> f32 {
  let b = &u.b[bi];
  let th = atan2(p.y, p.x);
  let r = b.s0.x * (1.0 + b.h0.x * cos(2.0 * th + b.h0.y) + b.h0.z * cos(3.0 * th + b.h0.w) + b.h1.x * cos(4.0 * th + b.h1.y) + b.h1.z * cos(5.0 * th + b.h1.w));
  return r - length(p);
}
// What is left of it over p: r how much of its thickness, g the slime's stain. A cubic B-spline through the voxel columns
// (four bilinear taps), so the eaten edge is a smooth curve, never the grid.
fn field(p: vec2f) -> vec2f {
  let b = &u.b[bi];
  let N = f32(${CN});
  let st = (p + b.s0.y) / (2.0 * b.s0.y) * N - 0.5;
  let i = floor(st); let f = st - i;
  let f2 = f * f; let f3 = f2 * f;
  let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0; let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0; let w3 = f3 / 6.0;
  let g0 = w0 + w1; let g1 = w2 + w3;
  let h0 = (i - 1.0 + w1 / g0 + 0.5) / N; let h1 = (i + 1.0 + w3 / g1 + 0.5) / N;
  let l = i32(b.c.w);
  let a = textureSampleLevel(mask, samp, vec2f(h0.x, h0.y), l, 0.0).rg; let c = textureSampleLevel(mask, samp, vec2f(h1.x, h0.y), l, 0.0).rg;
  let d = textureSampleLevel(mask, samp, vec2f(h0.x, h1.y), l, 0.0).rg; let e = textureSampleLevel(mask, samp, vec2f(h1.x, h1.y), l, 0.0).rg;
  return g0.y * (g0.x * a + g1.x * c) + g1.y * (g0.x * d + g1.x * e);
}
// Inside the chip (px; < 0 outside): its rim, and the edge where it has been eaten, a little ragged.
struct Sd { all: f32, rim: f32, eat: f32, left: f32, stain: f32 };
fn chipSd(p: vec2f) -> Sd {
  let b = &u.b[bi];
  let fl = field(p); let cell = b.z.z;
  let q = p / cell + b.z.w;
  let rag = (vnoise(q * 0.4) * 0.7 + vnoise(q * 0.9) * 0.3 - 0.5) * u.l1.w * cell * 2.0; // soft bites, never fuzz
  let eat = (fl.r - 0.5) * 6.0 * cell + rag * (1.0 - smoothstep(0.75, 1.0, fl.r)); // steep, so the edge stays crisp where it was eaten slowly
  let rim = rimSd(p);
  return Sd(min(rim, eat), rim, eat, fl.r, fl.g);
}
fn fz(l: vec3f) -> f32 { return l.z - surf(l.xy).x; }

// A chip's shadow on the desk under p: follow the light up to the chip (a few fixed-point steps: the point of the chip
// over q, at height h, shades p = q + LS h), then a tight contact shadow where it is low and a soft one that widens with height.
fn shade(P: vec2f) -> vec4f {
  let b = &u.b[bi];
  let x = vec3f(b.r0.w, b.r1.w, b.r2.w); let d = b.r2.xyz;
  var q = P; var h = 0.0; var s = -1e3; var ao = 0.0;
  for (var it = 0; it < 3; it++) {
    let rel = vec3f(q - x.xy, -x.z);
    let a = b.r0.xyz * rel.x + b.r1.xyz * rel.y + b.r2.xyz * rel.z + b.c.xyz;
    var t = select(x.z, -a.z / d.z, abs(d.z) > 0.2);
    for (var k = 0; k < 2; k++) {
      let l = a + t * d; let sg = surf(l.xy);
      t -= (l.z - sg.x) / max(d.z - sg.y * d.x - sg.z * d.y, 0.2);
    }
    t = clamp(t, 0.0, b.z.y);
    h = t; s = chipSd((a + t * d).xy).all;
    if (it == 0) {
      if (s > 1.0) { return vec4f(0.0); } // the chip itself covers this
      ao = exp(-h / 5.0) * smoothstep(-(1.2 + 0.4 * h), 0.6, s); // the desk darkens just around its rim, most where it is low
    }
    q = P - LS * h;
  }
  let near = exp(-h / 1.4) * smoothstep(-(0.7 + 0.25 * h), 0.7 + 0.25 * h, s);
  let soft = smoothstep(-(2.5 + 0.7 * h), 2.5 + 0.7 * h, s) * (1.0 - 0.6 * smoothstep(0.0, 40.0, h));
  return vec4f(0.0, 0.0, 0.0, clamp(u.l1.z * (0.4 * ao + 0.45 * near + 0.25 * soft), 0.0, 1.0));
}

const GOLD0 = vec3f(0.84, 0.60, 0.17); const GOLD1 = vec3f(0.74, 0.45, 0.08); // pale and deep gold (linear)
const BROWN = vec3f(0.42, 0.21, 0.06); const OLIVE = vec3f(0.36, 0.37, 0.20); const AMBER = vec3f(1.0, 0.76, 0.32);

@fragment fn fs(v: VO) -> @location(0) vec4f {
  bi = v.id; let b = &u.b[bi];
  let P = (v.pos.xy + b.tile.xy) / u.a.x;
  if (v.kind == 0u) { return shade(P); }
  // The view looks straight down: walk its ray (in the chip's frame) from above the chip down to the desk, and take the
  // first crossing of its mid-surface that is still chip.
  let x = vec3f(b.r0.w, b.r1.w, b.r2.w);
  let rel = vec3f(P - x.xy, -x.z);
  let a = b.r0.xyz * rel.x + b.r1.xyz * rel.y + b.r2.xyz * rel.z + b.c.xyz; // the desk point under P
  let d = b.r2.xyz; // straight up
  // Far outside its rim (allowing for how far a tilted ray drifts sideways), nothing to find.
  if (rimSd(a.xy) < -(2.0 + (b.z.y + 2.0) * length(d.xy) / max(d.z, 0.2)) && d.z > 0.5) { discard; }
  let t0 = b.z.y + 1.0; let t1 = max(b.z.x - 1.0, -1.0);
  var tp = t0; var fp = fz(a + t0 * d);
  var hit = -1e3; var sd: Sd;
  let steps = select(20, 6, d.z > 0.9); // lying nearly flat, the ray crosses it once
  for (var k = 1; k <= steps; k++) {
    let t = mix(t0, t1, f32(k) / f32(steps)); let fc = fz(a + t * d);
    if (fp * fc <= 0.0) {
      var lo = tp; var hi = t; var fl = fp;
      for (var j = 0; j < 7; j++) { let m = 0.5 * (lo + hi); let fm = fz(a + m * d); if (fl * fm <= 0.0) { hi = m; } else { lo = m; fl = fm; } }
      let tm = 0.5 * (lo + hi); let s = chipSd((a + tm * d).xy);
      if (s.all * u.a.x > -1.0) { hit = tm; sd = s; break; }
    }
    tp = t; fp = fc;
  }
  if (hit < -100.0) { discard; }
  let l = a + hit * d;
  let sg = surf(l.xy);
  // A fried surface: faint ripples across it and soft blisters, as a bump on the normal only.
  let q = l.xy / b.z.z + b.z.w;
  let ra = b.z.w * 2.1;
  let rip = cos(dot(l.xy, vec2f(cos(ra), sin(ra))) * 0.55 + vnoise(q * 0.5) * 2.0) * 0.12 * u.l0.z;
  let bl = vec2f(vnoise(q * 0.45 + 3.1) - vnoise(q * 0.45 - 2.7), vnoise(q * 0.45 + 7.7) - vnoise(q * 0.45 + 1.3)) * 0.12 * u.l0.z;
  let nl = normalize(vec3f(-sg.y + rip * cos(ra) + bl.x, -sg.z + rip * sin(ra) + bl.y, 1.0));
  var n = vec3f(dot(b.r0.xyz, nl), dot(b.r1.xyz, nl), dot(b.r2.xyz, nl));
  if (n.z < 0.0) { n = -n; } // the side that faces up
  // Color: gold, browned where it crisped along the rim and in a few blisters, an olive stain where the slime has been.
  var alb = mix(GOLD0, GOLD1, clamp(u.l0.x + (b.s1.w - 0.5) * 0.3, 0.0, 1.0)) * (0.93 + 0.14 * vnoise(q * 0.12));
  // Thin where its edge is, or where it has been eaten thin: light comes through, a deeper, clearer amber.
  let thin = max(1.0 - smoothstep(0.0, 4.0, min(sd.rim * 1.4, sd.eat)), 1.0 - sd.left) * u.l1.x;
  let oil = smoothstep(0.55, 0.85, vnoise(q * 0.12 + 5.3) * 0.7 + vnoise(q * 0.31 - 2.2) * 0.3) * u.l1.x; // soaked, see-through patches
  alb = mix(alb, alb * AMBER, clamp(thin * 0.6 + oil * 0.3, 0.0, 0.6));
  let crisp = (1.0 - smoothstep(0.2, 2.2 + 2.5 * vnoise(q * 0.7), sd.rim)) * (0.4 + 0.6 * vnoise(q * 1.7 + 4.0)) * u.l0.y
    + smoothstep(0.66, 0.9, vnoise(q * 0.22 + 9.0) * 0.75 + vnoise(q * 0.7 - 3.0) * 0.25) * 0.3 * u.l0.y;
  alb = mix(alb, BROWN, clamp(crisp, 0.0, 1.0) * 0.7);
  alb = mix(alb, OLIVE, clamp(sd.stain * u.l2.x * (1.0 - smoothstep(0.0, 4.0, sd.eat)) * 1.5, 0.0, 0.8));
  // Light from the upper left, as on the paper: soft diffuse over its curl, an oily sheen on the slopes that face it.
  let L = normalize(vec3f(u.l2.yz, 0.8));
  let diff = clamp(dot(n, L) * 0.75 + 0.25, 0.0, 1.0);
  var col = alb * (0.42 + 0.78 * diff);
  let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  col += vec3f(1.0, 0.95, 0.82) * pow(max(dot(n, H), 0.0), 40.0) * 0.5 * u.l1.y * (0.6 + 0.8 * vnoise(q * 0.3));
  // Salt: a few specks, catching the light.
  let cq = l.xy / 4.0; let ci = floor(cq); let sp = hash2(ci + b.z.w); let dd = length((cq - ci - (0.2 + 0.6 * sp)) * 4.0);
  let salt = select(0.0, 1.0 - smoothstep(0.2, 0.75, dd), hash(ci * 1.7 + 4.2 + b.z.w) < 0.12 * u.l0.w);
  col = mix(col, vec3f(0.95, 0.92, 0.84) * (0.7 + 0.4 * diff), salt * 0.35);
  let cover = clamp(sd.all * u.a.x * 0.9 + 0.5, 0.0, 1.0) * (1.0 - clamp(thin * 0.1, 0.0, 0.12));
  return vec4f(col * cover, cover);
}`;

// The slime under each chip, FEED x FEED over its square, back to the physics.
const FEED_WGSL = /* wgsl */ `
struct FU { n: vec4f, r: array<vec4f, ${NCH}> }; // n: chip count, gain; r: centre, half size (sim px)
@group(0) @binding(0) var<uniform> fu: FU;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(${FEED}, ${FEED})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.z >= u32(fu.n.x)) { return; }
  let r = fu.r[gid.z];
  let p = r.xy + ((vec2f(gid.xy) + 0.5) / ${FEED}.0 * 2.0 - 1.0) * r.z;
  let hi = vec2i(textureDimensions(trail)) - 1;
  var a = 0.0;
  for (var k = 0; k < 4; k++) { let o = vec2f(f32(k & 1), f32(k >> 1)) * 2.0 - 1.0; a += textureLoad(trail, clamp(vec2i(p + o), vec2i(0), hi), 0).a; }
  out[(gid.z * ${FEED}u + gid.y) * ${FEED}u + gid.x] = clamp(a * 0.25 * fu.n.y, 0.0, 1.0);
}`;

export async function createChipRenderer(device) {
  const mod = (code) => device.createShaderModule({ code });
  const cm = mod(CHIP_WGSL), blend = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const [pipe, feedPipe] = await Promise.all([
    device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: cm, entryPoint: 'vs' }, fragment: { module: cm, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb', blend }] } }),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: mod(FEED_WGSL), entryPoint: 'main' } }),
  ]);
  const U = new Float32Array((HEAD_VEC4 + NCH * BODY_VEC4) * 4);
  const ubuf = device.createBuffer({ size: U.byteLength, usage: 0x40 | 0x08 });
  const masks = device.createTexture({ size: [CN, CN, NCH], format: 'rgba8unorm', usage: 0x04 | 0x02 });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: masks.createView({ dimension: '2d-array' }) }, { binding: 2, resource: sampler }] });
  const blank = device.createTexture({ size: [1, 1, 1], format: 'rgba8unorm-srgb', usage: 0x04 });
  let layers = null, side = 0, look0 = '', pending = [], tiles = [];
  const drawn = new Map(); // each body as last drawn: pose, when, its tile's corner and size
  const slots = new Map(), bytes = new Uint8Array(CN * CN * 4);
  // Feed read-back: one in flight at a time.
  const FU = new Float32Array(4 + NCH * 4), fbuf = device.createBuffer({ size: FU.byteLength, usage: 0x40 | 0x08 });
  const fout = device.createBuffer({ size: NCH * FEED * FEED * 4, usage: 0x80 | 0x04 }), fread = device.createBuffer({ size: NCH * FEED * FEED * 4, usage: 0x01 | 0x08 });
  let busy = false;

  // Every chip's mask layer: a body keeps its slot while it lives; a new one (a drop, a piece that broke off) takes a free one.
  function assign(bodies) {
    const live = new Set(bodies.map((b) => b.id));
    for (const id of slots.keys()) if (!live.has(id)) slots.delete(id);
    const used = new Set(slots.values());
    for (const b of bodies) {
      if (slots.has(b.id)) continue;
      let s = 0; while (used.has(s)) s++;
      slots.set(b.id, s); used.add(s); b.dirty = true;
    }
  }
  // Place the chips (bodies, desk px) in their layers: x0 the page's left edge (desk px), dev device px per CSS px. Returns
  // each tile, lowest first: its corner and size on the canvas (device px), its layer. A chip is redrawn only when it
  // shows: it moved by a tenth of a px, or was eaten (a few times a second is plenty for an edge that creeps), or the
  // look changed. A pile lying still costs nothing.
  function place(world, { x0, dev, T, t }) {
    const look = [T.chipGold, T.chipCrisp, T.chipRipple, T.chipSalt, T.chipGlow, T.chipSheen, T.chipShadow, T.chipNibble, T.chipStain];
    const bodies = world.bodies.filter((b) => b.m > 0 && b.box);
    assign(bodies);
    for (const id of drawn.keys()) if (!slots.has(id)) drawn.delete(id);
    const boxes = bodies.map((b) => {
      const [rx0, ry0, rx1, ry1] = world.rect(b), [lo, hi] = world.zspan(b), pad = 2, sh = 4 + hi * 0.7;
      const r = [rx0 - x0 - pad, ry0 - pad, rx1 - x0 + pad, ry1 + pad], sr = [rx0 - x0 - sh, ry0 - sh, rx1 - x0 + sh + LS[0] * hi, ry1 + sh + LS[1] * hi];
      const c = [Math.floor(Math.min(r[0], sr[0]) * dev), Math.floor(Math.min(r[1], sr[1]) * dev)];
      return { b, r, sr, lo, hi, c, size: Math.max(Math.ceil(Math.max(r[2], sr[2]) * dev) - c[0], Math.ceil(Math.max(r[3], sr[3]) * dev) - c[1]) };
    });
    // Every layer the size of the largest tile, in steps so a falling chip does not reallocate them each frame.
    const need = Math.min(1024, Math.max(192, Math.ceil(Math.max(0, ...boxes.map((x) => x.size)) / 64) * 64));
    let all = `${x0} ${dev} ${look}` !== look0;
    look0 = `${x0} ${dev} ${look}`;
    if (need > side || need < side / 2) { layers?.destroy(); side = need; layers = device.createTexture({ size: [side, side, NCH], format: 'rgba8unorm-srgb', usage: 0x04 | 0x10 }); all = true; }
    const L = Math.hypot(LS[0], LS[1]);
    U.set([dev, side, 0, 0, ...look, -LS[0] / L, -LS[1] / L, 0]);
    for (const { b, r, sr, lo, hi, c, size } of boxes) {
      const d = drawn.get(b.id), sl = slots.get(b.id);
      if (!all && d && !(b.dirty && t - d.at > 0.15)) {
        const dq = Math.abs(b.q[0] * d.q[0] + b.q[1] * d.q[1] + b.q[2] * d.q[2] + b.q[3] * d.q[3]);
        if (Math.abs(b.x[0] - d.x[0]) + Math.abs(b.x[1] - d.x[1]) + Math.abs(b.x[2] - d.x[2]) + b.S.B * 2 * Math.sqrt(Math.max(0, 2 * (1 - dq))) <= 0.12) continue;
      }
      if (b.dirty) { device.queue.writeTexture({ texture: masks, origin: [0, 0, sl] }, world.maskBytes(b, bytes), { bytesPerRow: CN * 4 }, [CN, CN, 1]); b.dirty = false; }
      drawn.set(b.id, { x: [...b.x], q: [...b.q], at: t, c, n: Math.min(size, side) });
      const R = world.qmat(b.q), S = b.S;
      U.set([R[0], R[1], R[2], b.x[0] - x0, R[3], R[4], R[5], b.x[1], R[6], R[7], R[8], b.x[2], ...b.c, sl, ...r, ...sr,
        S.R, S.B, S.t, S.sag, S.bowl, S.ca, S.sa, S.tone, ...S.harm, ...S.warp, lo, hi, b.cell, (S.seed % 997) * 0.137,
        ...c, 0, 0], (HEAD_VEC4 + sl * BODY_VEC4) * 4);
      if (!pending.includes(sl)) pending.push(sl);
    }
    tiles = boxes.sort((a, b) => a.b.x[2] - b.b.x[2]).map(({ b }) => { const d = drawn.get(b.id); return [...d.c, d.n, slots.get(b.id)]; });
    return tiles;
  }
  // Draw the chips place() found changed, each into its own layer.
  function encode(enc) {
    if (!pending.length) return;
    device.queue.writeBuffer(ubuf, 0, U);
    for (const sl of pending) {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: layers.createView({ dimension: '2d', baseArrayLayer: sl, arrayLayerCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(6, 2, 0, 2 * sl); pass.end();
    }
    pending = [];
  }
  // The slime under each chip, read back a few times a second into body.feed.
  function feed(world, trail, { x0, dpr, gain }) {
    const bodies = world.bodies.filter((b) => b.m > 0 && b.box).slice(0, NCH);
    if (busy || !bodies.length) return;
    busy = true;
    const rects = bodies.map((b) => ({ b, cx: b.x[0], cy: b.x[1], h: b.foot + 2 * b.cell }));
    FU.set([rects.length, gain, 0, 0]);
    rects.forEach((r, i) => FU.set([(r.cx - x0) * dpr, r.cy * dpr, r.h * dpr, 0], 4 + i * 4));
    device.queue.writeBuffer(fbuf, 0, FU);
    const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(feedPipe);
    pass.setBindGroup(0, device.createBindGroup({ layout: feedPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fbuf } }, { binding: 1, resource: trail.createView() }, { binding: 2, resource: { buffer: fout } }] }));
    pass.dispatchWorkgroups(1, 1, rects.length); pass.end();
    enc.copyBufferToBuffer(fout, 0, fread, 0, rects.length * FEED * FEED * 4);
    device.queue.submit([enc.finish()]);
    fread.mapAsync(1, 0, rects.length * FEED * FEED * 4).then(() => {
      const v = new Float32Array(fread.getMappedRange(0, rects.length * FEED * FEED * 4));
      rects.forEach((r, i) => { r.b.feed = { cx: r.cx, cy: r.cy, h: r.h, v: v.slice(i * FEED * FEED, (i + 1) * FEED * FEED) }; });
      fread.unmap(); busy = false;
    }).catch(() => { busy = false; });
  }
  return {
    place, encode, feed,
    view: () => (layers || blank).createView({ dimension: '2d-array' }),
    destroy() { for (const t of [layers, blank, masks, ubuf, fbuf, fout, fread]) t?.destroy(); },
  };
}
