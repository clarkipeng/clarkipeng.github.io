// Drawing the chips (chips.ts): each one as a fine mesh of its curved surface, posed in 3D, so its voxels never show and
// its curl shows in its shading and its shadow. A small pass draws each chip that changed, with its shadow, into its own
// layer of a small texture array, with the height of what it shows at each pixel; the desk's render lays the tiles over
// the resting cards (at each pixel, the lowest chip first) and under any lifted one, so a frame costs only what changed.
// A second small pass reads the slime under each chip back to the physics, which eats only where it is.

import { CN, NCH, FEED, DIST, CHIP, type Body, type Chips } from './chips.ts';

// The tunables the chips' look reads (desk.ts T).
type LookKey = 'chipGold' | 'chipShadow' | 'chipSize';
// The chips' fixed look; the panel tunes their gold and their shadow.
const LOOK = {
  crisp: 0.8, // browning along the rim
  salt: 0.6, // salt flecks
  edge: 1.5, // how much of its thickness shows along a tilted edge
  light: 2.5, // how strongly light falls across the curl
  fill: 0.6, // the darkest the side turned away from the light gets
  relief: 0.3, // bright crests and dark troughs
  gloss: 0.8, // the broad shine
  cam: 1200, // the camera's height, px (lower looks nearer and larger)
  soft: 0.5, // the shadow blurs this much per px of height
  shadowH: 80, // the shadow fades out by this height, px
  contact: 1, // the dark shadow right where it touches
  nibble: 0.6, // how ragged the eaten edges look
  stain: 0.4, // the slime stain left on it
};
// A body's tile this frame (place): its pose's height span, tile corner and size (device px), and its origin in the world.
interface Box { b: Body; lo: number; hi: number; c: number[]; o: number[]; size: number }
// A body as last drawn: origin, orientation, tile corner and size.
interface Drawn { o: number[]; q: number[]; c: number[]; n: number }

const BODY_VEC4 = 14, HEAD_VEC4 = 6, G = 40; // a chip's mesh: G x G quads
const NP = 64, NT = 4; // the noise: a lattice NP cells around, wrapping, NT texels a cell
// A shadow falls this far right and down per px of height, like the cards' far shadows.
const LS = [0.15, 0.6];

const CHIP_WGSL = /* wgsl */ `
struct Body {
  r0: vec4f, r1: vec4f, r2: vec4f, // rows of its rotation; w: its position (page CSS px, z its height)
  c: vec4f,     // its centre of mass in its shape's frame, w: its mask layer
  s0: vec4f,    // radius, grid half size, thickness, saddle sag
  s1: vec4f,    // bowl, the saddle axis's cos and sin, tone
  h0: vec4f, h1: vec4f, // the rim's waves (amplitude, phase) for 2, 3, 4 and 5 lobes
  w0: vec4f, w1: vec4f, // two slow warps: wave vector, amplitude, phase
  f0: vec4f, f1: vec4f, // two folded edges: direction, crease, lift
  z: vec4f,     // its lowest and highest point (desk z), grid cell, seed
  tile: vec4f,  // its tile's corner on the canvas (device px)
};
struct CU {
  a: vec4f,  // device px per CSS px, tile size (device px), the shadow's margin past the rim, the height it fades out by (px)
  l0: vec4f, // gold, browned rim, salt, the edge's thickness showing
  l1: vec4f, // shadow, nibbled edges, slime stain, light contrast
  l2: vec4f, // light (x, y toward it), crests and troughs, broad highlight
  l3: vec4f, // the camera's height (px), shadow softening per px of height, contact shadow, how gradually the edges curl
  l4: vec4f, // the soft light from the sky and the desk that fills the side turned away, unused x3
  b: array<Body, ${NCH}>,
};
@group(0) @binding(0) var<uniform> u: CU;
@group(0) @binding(1) var mask: texture_2d_array<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var noiseTex: texture_2d<f32>;
@group(0) @binding(4) var wrap: sampler;
var<private> bi: u32; // the chip being drawn: read in place from the uniforms, never copied

const LS = vec2f(${LS.join(', ')});

fn hash(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn hash2(p: vec2f) -> vec2f { return vec2f(hash(p), hash(p + vec2f(17.3, 5.1))); }
// Smooth value noise, from a small wrapping texture made once (valueNoise below): one tap instead of four hashes.
fn vnoise(p: vec2f) -> f32 { return textureSampleLevel(noiseTex, wrap, p / ${NP}.0, 0.0).r; }

// Height of the mid-surface over p (the shape's frame), and its slope: chips.js's surf().
fn surf(p: vec2f) -> vec3f {
  let b = &u.b[bi];
  let uu = b.s1.y * p.x + b.s1.z * p.y; let vv = -b.s1.z * p.x + b.s1.y * p.y; let R2 = b.s0.x * b.s0.x;
  let p1 = b.w0.x * p.x + b.w0.y * p.y + b.w0.w; let p2 = b.w1.x * p.x + b.w1.y * p.y + b.w1.w;
  let h = (b.s0.w * (uu * uu - vv * vv) + b.s1.x * dot(p, p)) / R2 + b.w0.z * sin(p1) + b.w1.z * sin(p2);
  let hu = 2.0 * b.s0.w * uu / R2; let hv = -2.0 * b.s0.w * vv / R2;
  let hx = b.s1.y * hu - b.s1.z * hv + 2.0 * b.s1.x * p.x / R2 + b.w0.z * b.w0.x * cos(p1) + b.w1.z * b.w1.x * cos(p2);
  let hy = b.s1.z * hu + b.s1.y * hv + 2.0 * b.s1.x * p.y / R2 + b.w0.z * b.w0.y * cos(p1) + b.w1.z * b.w1.y * cos(p2);
  return vec3f(h, hx, hy) + fold(p, b.f0) + fold(p, b.f1);
}
fn fold(p: vec2f, f: vec4f) -> vec3f {
  let w = u.l3.w; let span = u.b[bi].s0.x - f.z; let e = (dot(f.xy, p) - f.z) / span; let r = length(vec2f(e, w));
  let q1 = 0.5 * (1.0 + length(vec2f(1.0, w))); let q = 0.5 * (e + r) / q1;
  return vec3f(f.w * q * q, f.w * q * (1.0 + e / r) / (q1 * span) * f.xy);
}
// How far inside its rim p is (px; < 0 outside): chips.js's outlineR().
fn rimSd(p: vec2f) -> f32 {
  let b = &u.b[bi];
  let th = atan2(p.y, p.x);
  let r = b.s0.x * (1.0 + b.h0.x * cos(2.0 * th + b.h0.y) + b.h0.z * cos(3.0 * th + b.h0.w) + b.h1.x * cos(4.0 * th + b.h1.y) + b.h1.z * cos(5.0 * th + b.h1.w));
  return r - length(p);
}
// What is left of it over p: r how much of its thickness, g the slime's stain, b how far past it (chips.js maskBytes). A cubic B-spline through the voxel columns
// (four bilinear taps), so the eaten edge is a smooth curve, never the grid.
fn field(p: vec2f) -> vec3f {
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
  let a = textureSampleLevel(mask, samp, vec2f(h0.x, h0.y), l, 0.0).rgb; let c = textureSampleLevel(mask, samp, vec2f(h1.x, h0.y), l, 0.0).rgb;
  let d = textureSampleLevel(mask, samp, vec2f(h0.x, h1.y), l, 0.0).rgb; let e = textureSampleLevel(mask, samp, vec2f(h1.x, h1.y), l, 0.0).rgb;
  return g0.y * (g0.x * a + g1.x * c) + g1.y * (g0.x * d + g1.x * e);
}
// Inside the chip (px; < 0 outside): its rim, and the edge where it has been eaten, a little ragged.
struct Sd { all: f32, rim: f32, eat: f32, left: f32, stain: f32 };
fn chipSd(p: vec2f) -> Sd {
  let b = &u.b[bi];
  let fl = field(p); let cell = b.z.z;
  let q = p / cell + b.z.w;
  let rag = (vnoise(q * 0.4) * 0.7 + vnoise(q * 0.9) * 0.3 - 0.5) * u.l1.y * cell * 2.0; // soft bites, never fuzz
  let eat = (fl.r - 0.5) * 6.0 * cell + rag * (1.0 - smoothstep(0.75, 1.0, fl.r)) - fl.b * ${DIST}.0 * cell; // steep, so the edge stays crisp where it was eaten slowly
  let rim = rimSd(p);
  return Sd(min(rim, eat), rim, eat, fl.r, fl.g);
}
// A point of its shape's frame in the world (page CSS px, z its height).
fn world(l: vec3f) -> vec3f {
  let b = &u.b[bi]; let r = l - b.c.xyz;
  return vec3f(b.r0.w, b.r1.w, b.r2.w) + vec3f(dot(b.r0.xyz, r), dot(b.r1.xyz, r), dot(b.r2.xyz, r));
}
// Page px to its tile; nearer the camera is nearer in depth.
fn clip(s: vec2f, z: f32) -> vec4f {
  let b = &u.b[bi];
  let px = (s * u.a.x - b.tile.xy) / u.a.y;
  return vec4f(px.x * 2.0 - 1.0, 1.0 - px.y * 2.0, clamp(0.5 - z / 4096.0, 0.0, 1.0), 1.0);
}
// The corner of the mesh's quad this vertex is, from 0 to 1 over the grid.
fn corner(vi: u32) -> vec2f {
  var cs = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  let q = vi / 6u;
  return (vec2f(f32(q % ${G}u), f32(q / ${G}u)) + cs[vi % 6u]) / ${G}.0;
}

struct VO { @builtin(position) pos: vec4f, @location(0) p: vec2f, @location(1) z: f32, @location(2) @interpolate(flat) id: u32 };
// The chip: its surface, posed, seen from a camera u.l3.x px above the desk, so the higher it is the larger it looks.
@vertex fn vsChip(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  bi = ii; let b = &u.b[bi];
  let p = mix(vec2f(-b.s0.y), vec2f(b.s0.y), corner(vi));
  let w = world(vec3f(p, surf(p).x));
  let x = vec2f(b.r0.w, b.r1.w);
  return VO(clip(x + (w.xy - x) * u.l3.x / max(u.l3.x - w.z, u.l3.x * 0.25), w.z), p, w.z, ii);
}
// Its shadow: the same surface carried level past its rim by the shadow's margin, laid on the desk along the light.
@vertex fn vsShadow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  bi = ii; let b = &u.b[bi];
  let p = mix(vec2f(-b.s0.y - u.a.z), vec2f(b.s0.y + u.a.z), corner(vi));
  let lp = max(length(p), 1e-3);
  let w = world(vec3f(p, surf(p * min(1.0, (rimSd(p) + lp) / lp)).x));
  let h = max(w.z, 0.0);
  return VO(clip(w.xy + LS * h, 0.0), p, h, ii);
}
// What a layer holds at a pixel: its color, and the height of what shows there (the chip's surface, or for its shadow,
// the part of it that casts it), so the desk's render lays the chips there in order of height.
struct FO { @location(0) col: vec4f, @location(1) z: f32 };
// Tight and dark where it touches the desk; under a lifted rim, fainter, softer and shifted along the light.
@fragment fn fsShadow(v: VO) -> FO {
  bi = v.id;
  let s = chipSd(v.p).all; let h = v.z;
  let contact = exp(-h / 2.0) * smoothstep(-(1.0 + 0.4 * h), 0.5, s);
  let ws = min(1.0 + u.l3.y * h, u.a.z);
  let soft = smoothstep(-ws, ws, s) / (1.0 + h / 20.0);
  let room = smoothstep(-u.a.z, 0.0, s) * exp(-h / 30.0); // the room's light, blocked a little all round it
  let fade = 1.0 - smoothstep(0.5, 1.0, h / u.a.w);
  return FO(vec4f(0.0, 0.0, 0.0, clamp(u.l1.x * (0.55 * u.l3.z * contact + 0.6 * soft + 0.2 * room * room) * fade, 0.0, 1.0)), h);
}

const GOLD0 = vec3f(0.90, 0.74, 0.30); const GOLD1 = vec3f(0.80, 0.55, 0.14); // pale and deep gold (linear)
const BROWN = vec3f(0.42, 0.21, 0.06); const OLIVE = vec3f(0.36, 0.37, 0.20);

@fragment fn fsChip(v: VO) -> FO {
  bi = v.id; let b = &u.b[bi];
  let l = v.p;
  let sd = chipSd(l);
  var cover = clamp(sd.all / max(fwidth(sd.all), 0.05) + 0.5, 0.0, 1.0);
  if (cover <= 0.0) { discard; }
  let sg = surf(l);
  let nl = normalize(vec3f(-sg.y, -sg.z, 1.0));
  var n = vec3f(dot(b.r0.xyz, nl), dot(b.r1.xyz, nl), dot(b.r2.xyz, nl));
  if (n.z < 0.0) { n = -n; } // the side that faces up
  let q = l / b.z.z + b.z.w;
  let hn = smoothstep(0.0, 1.0, clamp((v.z - b.z.x) / max(b.z.y - b.z.x, 1.0), 0.0, 1.0)); // 0 down on the desk, 1 its highest
  // Color: a mottled gold, browned along its rim (most where the rim curls up), an olive stain where the
  // slime has been.
  var alb = mix(GOLD0, GOLD1, clamp(u.l0.x + (b.s1.w - 0.5) * 0.3, 0.0, 1.0)) * (0.9 + 0.12 * vnoise(q * 0.12) + 0.08 * vnoise(q * 0.6));
  let crisp = (1.0 - smoothstep(0.2, (1.5 + 2.0 * vnoise(q * 0.7)) * (1.0 + 2.0 * hn), sd.rim)) * (0.5 + 0.5 * vnoise(q * 1.7 + 4.0)) * u.l0.y;
  alb = mix(alb, BROWN, clamp(crisp, 0.0, 1.0) * 0.7);
  alb = mix(alb, OLIVE, clamp(sd.stain * u.l1.z * (1.0 - smoothstep(0.0, 4.0, sd.eat)) * 1.5, 0.0, 0.8));
  // Light from the top of the page, as on the paper: the slopes that face it bright, the ones that turn away dim; its
  // crests catch more of the room's light than its troughs, and a broad sheen where it faces the light.
  let L = normalize(vec3f(u.l2.xy, 0.8)); let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  let lam = dot(n, L) - L.z; // 0 lying flat
  // The side turned away still gets the sky's and the desk's soft light, and light passes into it, so it dims only so
  // far (to the fill), to a warmer gold, never to brown or grey.
  let dl = 1.0 + u.l1.w * lam; let dk = max(1.0 - dl, 0.0);
  let f = select(1.0 - (1.0 - u.l4.x) * dk / (1.0 + dk), dl, dl > 1.0) * (1.0 - u.l2.z * (0.4 - 0.5 * hn));
  var col = alb * select(pow(vec3f(f), vec3f(0.75, 1.0, 1.4)), vec3f(f), f > 1.0);
  col += vec3f(1.0, 0.9, 0.7) * pow(max(dot(n, H), 0.0), 16.0) * 0.3 * u.l2.w * (0.4 + 0.6 * hn);
  // Its cut edge: where it tilts, its thickness shows along the edge as a thin band of its side, in shade.
  let side = 1.0 - smoothstep(0.0, b.s0.z * sqrt(max(1.0 - n.z * n.z, 0.0)) * u.l0.w + 0.2, sd.all);
  col *= 1.0 - 0.45 * side;
  // Salt: a few specks, catching the light.
  let cq = l / 4.0; let ci = floor(cq); let sp = hash2(ci + b.z.w); let dd = length((cq - ci - (0.2 + 0.6 * sp)) * 4.0);
  let salt = select(0.0, 1.0 - smoothstep(0.2, 0.75, dd), hash(ci * 1.7 + 4.2 + b.z.w) < 0.12 * u.l0.z);
  col = mix(col, vec3f(0.95, 0.92, 0.84) * (0.8 + 0.4 * lam), salt * 0.35);
  return FO(vec4f(col * cover, cover), v.z);
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

// Smooth value noise over a wrapping NP-cell lattice, sampled NT times a cell (r8, row by row).
function valueNoise() {
  const lat = Float32Array.from({ length: NP * NP }, () => Math.random()), at = (i: number, j: number) => lat[((j + NP) % NP) * NP + ((i + NP) % NP)];
  const out = new Uint8Array(NP * NT * NP * NT), n = NP * NT, sm = (f: number) => f * f * (3 - 2 * f);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = (x + 0.5) / NT, py = (y + 0.5) / NT, i = Math.floor(px), j = Math.floor(py), sx = sm(px - i), sy = sm(py - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    out[y * n + x] = Math.round((a + (b - a) * sy) * 255);
  }
  return out;
}

export async function createChipRenderer(device: GPUDevice) {
  const mod = (code: string) => device.createShaderModule({ code });
  const cm = mod(CHIP_WGSL), over: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, max: GPUBlendComponent = { operation: 'max', srcFactor: 'one', dstFactor: 'one' };
  // The shadow first (the darkest of where its surface falls, and the highest part casting it), then the chip over it,
  // its nearest surface in front.
  const draw = (vs: string, fs: string, blend: GPUBlendState, zBlend: GPUBlendState | undefined, depthWriteEnabled: boolean, depthCompare: GPUCompareFunction) => device.createRenderPipelineAsync({
    layout: 'auto', vertex: { module: cm, entryPoint: vs }, fragment: { module: cm, entryPoint: fs, targets: [{ format: 'rgba8unorm-srgb', blend }, { format: 'r16float', blend: zBlend }] },
    depthStencil: { format: 'depth16unorm', depthWriteEnabled, depthCompare },
  });
  const [shadowPipe, pipe, feedPipe] = await Promise.all([
    draw('vsShadow', 'fsShadow', { color: max, alpha: max }, { color: max, alpha: max }, false, 'always'),
    draw('vsChip', 'fsChip', { color: over, alpha: over }, undefined, true, 'less'),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: mod(FEED_WGSL), entryPoint: 'main' } }),
  ]);
  const U = new Float32Array((HEAD_VEC4 + NCH * BODY_VEC4) * 4);
  const ubuf = device.createBuffer({ size: U.byteLength, usage: 0x40 | 0x08 });
  const masks = device.createTexture({ size: [CN, CN, NCH], format: 'rgba8unorm', usage: 0x04 | 0x02 });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const noise = device.createTexture({ size: [NP * NT, NP * NT], format: 'r8unorm', usage: 0x04 | 0x02 });
  device.queue.writeTexture({ texture: noise }, valueNoise(), { bytesPerRow: NP * NT }, [NP * NT, NP * NT]);
  const wrap = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
  const bgOf = (p: GPURenderPipeline) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: masks.createView({ dimension: '2d-array' }) }, { binding: 2, resource: sampler },
    { binding: 3, resource: noise.createView() }, { binding: 4, resource: wrap }] });
  const bg = bgOf(pipe), sbg = bgOf(shadowPipe);
  const blank = device.createTexture({ size: [1, 1, 1], format: 'rgba8unorm-srgb', usage: 0x04 }), blankZ = device.createTexture({ size: [1, 1, 1], format: 'r16float', usage: 0x04 });
  let layers: GPUTexture | null = null, zs: GPUTexture | null = null, depth: GPUTexture | null = null, side = 0, look0 = '', pending: number[] = [], tiles: number[][] = [];
  const drawn = new Map<number, Drawn>(); // each body as last drawn: pose, its tile's corner and size
  const slots = new Map<number, number>(), bytes = new Uint8Array(CN * CN * 4);
  // Feed read-back: one in flight at a time.
  const FU = new Float32Array(4 + NCH * 4), fbuf = device.createBuffer({ size: FU.byteLength, usage: 0x40 | 0x08 });
  const fout = device.createBuffer({ size: NCH * FEED * FEED * 4, usage: 0x80 | 0x04 }), fread = device.createBuffer({ size: NCH * FEED * FEED * 4, usage: 0x01 | 0x08 });
  let busy = false;

  // Every chip's mask layer: a body keeps its slot while it lives; a new one (a drop, a piece that broke off) takes a free one.
  function assign(bodies: Body[]) {
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
  // each tile: its corner and size on the canvas (device px), its layer. A chip is redrawn only when it shows: it moved by
  // a tenth of a px, or was eaten, or the look changed. A pile lying still costs nothing.
  function place(world: Chips, { x0, dev, T }: { x0: number; dev: number; T: Record<LookKey, number> }) {
    const look = [T.chipGold, LOOK.crisp, LOOK.salt, LOOK.edge, T.chipShadow, LOOK.nibble, LOOK.stain, LOOK.light,
      LOOK.relief, LOOK.gloss, LOOK.cam, LOOK.soft, LOOK.contact, CHIP.bend, LOOK.fill, 0, 0, 0];
    const bodies = world.bodies.filter((b) => b.m > 0 && b.box);
    assign(bodies);
    for (const id of drawn.keys()) if (!slots.has(id)) drawn.delete(id);
    const F = LOOK.cam, M = 3 + T.chipSize * 0.3; // the camera's height, the shadow's margin past the rim
    const HS = LOOK.shadowH; // the shadow fades out by this height, so a chip high in the air needs no larger tile
    const boxes = bodies.map((b): Box => {
      const [rx0, ry0, rx1, ry1] = world.rect(b), [lo, hi] = world.zspan(b), m = F / Math.max(F - hi, F * 0.25), pad = 2;
      const r = [b.x[0] + (rx0 - b.x[0]) * m - x0 - pad, b.x[1] + (ry0 - b.x[1]) * m - pad, b.x[0] + (rx1 - b.x[0]) * m - x0 + pad, b.x[1] + (ry1 - b.x[1]) * m + pad];
      // The shadow: its box, widened by the margin, laid along the light.
      const R = b.R, [blo, bhi] = b.box, sr = [Infinity, Infinity, -Infinity, -Infinity];
      for (const X of [blo[0] - M, bhi[0] + M]) for (const Y of [blo[1] - M, bhi[1] + M]) for (const Z of [blo[2], bhi[2]]) {
        const p = b.toWorld(R, [X, Y, Z]), h = Math.min(HS, Math.max(0, p[2])), sx = p[0] + LS[0] * h - x0, sy = p[1] + LS[1] * h;
        sr[0] = Math.min(sr[0], sx - pad); sr[1] = Math.min(sr[1], sy - pad); sr[2] = Math.max(sr[2], sx + pad); sr[3] = Math.max(sr[3], sy + pad);
      }
      const c = [Math.floor(Math.min(r[0], sr[0]) * dev), Math.floor(Math.min(r[1], sr[1]) * dev)];
      return { b, lo, hi, c, o: b.toWorld(R, [0, 0, 0]), size: Math.max(Math.ceil(Math.max(r[2], sr[2]) * dev) - c[0], Math.ceil(Math.max(r[3], sr[3]) * dev) - c[1]) };
    });
    // Every layer the size of the largest tile, in steps; it shrinks only once every chip is down, so drops never
    // reallocate (and redraw) the whole pile.
    const need = Math.min(1024, Math.max(192, Math.ceil(Math.max(0, ...boxes.map((x) => x.size)) / 64) * 64));
    let all = `${x0} ${dev} ${look}` !== look0;
    look0 = `${x0} ${dev} ${look}`;
    if (need > side || (need < side / 2 && bodies.every((b) => b.sleep || b.landed))) {
      layers?.destroy(); zs?.destroy(); depth?.destroy(); side = need; all = true;
      layers = device.createTexture({ size: [side, side, NCH], format: 'rgba8unorm-srgb', usage: 0x04 | 0x10 });
      zs = device.createTexture({ size: [side, side, NCH], format: 'r16float', usage: 0x04 | 0x10 });
      depth = device.createTexture({ size: [side, side], format: 'depth16unorm', usage: 0x10 });
    }
    const L = Math.hypot(LS[0], LS[1]);
    U.set([dev, side, M, HS, ...look.slice(0, 8), -LS[0] / L, -LS[1] / L, ...look.slice(8)]);
    // How far its shape moved since it was drawn (px, its rim's travel included). Its shape's origin, not its centre of
    // mass, which shifts as it is eaten.
    const moved = ({ b, o }: Box, d: Drawn) => {
      const dq = Math.abs(b.q[0] * d.q[0] + b.q[1] * d.q[1] + b.q[2] * d.q[2] + b.q[3] * d.q[3]);
      return Math.abs(o[0] - d.o[0]) + Math.abs(o[1] - d.o[1]) + Math.abs(o[2] - d.o[2]) + b.S.B * 2 * Math.sqrt(Math.max(0, 2 * (1 - dq)));
    };
    // Drawn again: each chip that moved enough to show (or was eaten), and with it every chip its tile overlaps that moved
    // at all, so no layer shows a chip where its neighbours, drawn now, disagree.
    const turn = new Set(all ? boxes : boxes.filter((x) => !drawn.has(x.b.id) || x.b.dirty || moved(x, drawn.get(x.b.id)!) > 0.12));
    const meets = (x: Box, y: Box) => x.c[0] < y.c[0] + y.size && y.c[0] < x.c[0] + x.size && x.c[1] < y.c[1] + y.size && y.c[1] < x.c[1] + x.size;
    for (let grew = true; grew;) { grew = false; for (const x of boxes) if (!turn.has(x) && moved(x, drawn.get(x.b.id)!) > 0 && [...turn].some((y) => meets(x, y))) { turn.add(x); grew = true; } }
    for (const x of boxes) {
      if (!turn.has(x)) continue;
      const { b, lo, hi, c, o, size } = x, sl = slots.get(b.id)!; // assign gave every body a slot
      if (b.dirty) { device.queue.writeTexture({ texture: masks, origin: [0, 0, sl] }, world.maskBytes(b, bytes), { bytesPerRow: CN * 4 }, [CN, CN, 1]); b.dirty = false; }
      drawn.set(b.id, { o, q: [...b.q], c, n: Math.min(size, side) });
      const R = b.R, S = b.S;
      U.set([R[0], R[1], R[2], b.x[0] - x0, R[3], R[4], R[5], b.x[1], R[6], R[7], R[8], b.x[2], ...b.c, sl,
        S.R, S.B, S.t, S.sag, S.bowl, S.ca, S.sa, S.tone, ...S.harm, ...S.warp, ...S.folds, lo, hi, b.cell, (S.seed % 997) * 0.137,
        ...c, 0, 0], (HEAD_VEC4 + sl * BODY_VEC4) * 4);
      if (!pending.includes(sl)) pending.push(sl);
    }
    tiles = boxes.map(({ b }) => { const d = drawn.get(b.id)!; return [...d.c, d.n, slots.get(b.id)!]; });
    return tiles;
  }
  // Draw the chips place() found changed, each into its own layer.
  function encode(enc: GPUCommandEncoder) {
    if (!pending.length) return;
    device.queue.writeBuffer(ubuf, 0, U);
    for (const sl of pending) {
      const pass = enc.beginRenderPass({
        colorAttachments: [layers!, zs!].map((x) => ({ view: x.createView({ dimension: '2d', baseArrayLayer: sl, arrayLayerCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] })),
        depthStencilAttachment: { view: depth!.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      });
      pass.setPipeline(shadowPipe); pass.setBindGroup(0, sbg); pass.draw(G * G * 6, 1, 0, sl);
      pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(G * G * 6, 1, 0, sl); pass.end();
    }
    pending = [];
  }
  // The slime under each chip, read back a few times a second into body.feed.
  function feed(world: Chips, trail: GPUTexture, { x0, dpr, gain }: { x0: number; dpr: number; gain: number }) {
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
    zView: () => (zs || blankZ).createView({ dimension: '2d-array' }),
    destroy() { for (const t of [layers, zs, depth, blank, blankZ, masks, ubuf, fbuf, fout, fread]) t?.destroy(); },
  };
}
