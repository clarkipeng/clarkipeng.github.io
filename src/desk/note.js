// The sticky note turning over its strip, as paper: a column of quads bent along the note about the strip's edge (the
// profile, desk.js noteProfile), seen by the desk's camera, each face lit by its normal. One small pass draws it into a
// tile the desk's render reads where it lays the note: the top half the paper (where on the note, its light, negative
// for the back, coverage), the bottom half its shadows on the desk (near, far; as strong as at that height).
// The bend is along the note only, so one column is the exact surface; drawn from the strip out, each row lies over
// the ones before it where they overlap on screen (its free part only folds back over the rest), so no depth buffer.
export const NS = 64; // the profile's samples, strip edge to free edge

const WGSL = /* wgsl */ `
struct NU {
  a: vec4f, // half size, corner radius, the strip's edge (CSS px, from the note's middle along it)
  b: vec4f, // its middle on the page (CSS px), cos and sin of its turn
  c: vec4f, // the tile's corner on the page, its size (device px)
  d: vec4f, // device px per CSS px, the camera's height, how high the note is lifted, the shadows' margin (CSS px)
  e: vec4f, // the light, in the note's frame; how high is fully lifted (CSS px)
  f: vec4f, // shadow softness, the sheet's length, unused x2
  p: array<vec4f, ${NS + 1}>, // along the note and up from the strip's edge, and its angle there
};
@group(0) @binding(0) var<uniform> u: NU;

fn boxSd(l: vec2f, half: vec2f, r: f32) -> f32 {
  let q = abs(l) - half + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn tile(w: vec2f) -> vec4f { // a point on the page (CSS px, from the note's middle) in the tile
  let px = (u.b.xy + vec2f(u.b.z * w.x - u.b.w * w.y, u.b.w * w.x + u.b.z * w.y)) * u.d.x - u.c.xy;
  return vec4f(px.x / u.c.z * 2.0 - 1.0, 1.0 - px.y / u.c.w * 2.0, 0.0, 1.0);
}

struct VO { @builtin(position) pos: vec4f, @location(0) l: vec2f, @location(1) th: f32, @location(2) z: f32, @location(3) @interpolate(flat) i: u32 };
// Instance 0 the paper, 1 its near shadow, 2 its far one. Row 0 is the strip's top (past it by the margin), rows 1 to
// NS + 1 the profile, the last row past the free edge: straight on for the paper, level for a shadow.
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> VO {
  var cs = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
  let r = vi / 6u + cs[vi % 6u].y;
  let m = select(2.0 / u.d.x, u.d.w, i > 0u);
  let x = (f32(cs[vi % 6u].x) * 2.0 - 1.0) * (u.a.x + m);
  var yu = -u.a.y - m; var P = vec3f(x, yu, 0.0); var th = 0.0;
  if (r > 0u) {
    let s = u.p[min(r - 1u, ${NS}u)];
    th = s.z; yu = u.a.w + f32(min(r - 1u, ${NS}u)) / ${NS}.0 * u.f.y; P = vec3f(x, u.a.w + s.x, s.y);
    if (r > ${NS + 1}u) {
      let k = select(0.0, select(16.0, 2.0, i == 1u) / u.e.w, i > 0u); // how far its shadow falls per px of height
      let e = select(vec2f(cos(th), sin(th)), vec2f(sign(cos(th) + k * sin(th)), 0.0), i > 0u);
      yu = u.a.y + m; P += vec3f(0.0, e * m);
    }
  }
  if (i == 0u) { return VO(tile(P.xy * u.d.y / (u.d.y - P.z)), vec2f(x, yu), th, P.z, i); }
  let h = P.z + u.d.z; let l = h / u.e.w; // its shadow on the desk: as the desk's cards cast theirs, by its height
  let o = select(vec2f(0.25, 1.0) * (5.0 + 16.0 * l), vec2f(0.0, 0.6 + 2.0 * l), i == 1u);
  let rot = vec2f(u.b.z * o.x + u.b.w * o.y, -u.b.w * o.x + u.b.z * o.y); // the offset falls down the screen, not the note
  return VO(tile(P.xy + rot), vec2f(x, yu), th, h, i);
}
// How far outside the note (device px): its distance on the paper over how fast that changes across the screen, at most
// 4 times as fast as lying flat. A row seen edge-on (in the crease) changes far faster, but only across itself: its
// slope says nothing of an edge further along the bending paper.
fn edge(v: VO) -> f32 { let sd = boxSd(v.l, u.a.xy, u.a.z); return sd / clamp(length(vec2f(dpdx(sd), dpdy(sd))), 1e-6, 4.0 / u.d.x); }

@fragment fn fsPaper(v: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let cov = clamp(0.5 - edge(v), 0.0, 1.0);
  if (cov <= 0.0) { discard; }
  let n = vec3f(0.0, -sin(v.th), cos(v.th)) * select(-1.0, 1.0, ff);
  // Paper is thin: mostly lit by the room (a), and a face turned from the light glows with half what comes through it.
  let d = dot(n, u.e.xyz); let a = 0.8;
  let lit = (a + (1.0 - a) * (max(d, 0.0) + 0.5 * max(-d, 0.0))) / (a + (1.0 - a) * u.e.z); // 1 lying flat, either face up
  return vec4f(v.l / (2.0 * u.a.xy) + 0.5, select(-lit, lit, ff), cov);
}
@fragment fn fsShadow(v: VO) -> @location(0) vec4f {
  let ds = edge(v) / u.d.x; let l = min(v.z / u.e.w, 1.0);
  if (v.i == 1u) { let b = (1.2 + 3.0 * l) * u.f.x; return vec4f((1.0 - smoothstep(-b, b, ds)) * (1.0 - l), 0.0, 0.0, 0.0); }
  let b = (14.0 + 22.0 * l) * u.f.x;
  return vec4f(0.0, (1.0 - smoothstep(-b, b, ds)) * (0.06 + 0.1 * l), 0.0, 0.0);
}`;

export function createNote(device) {
  const ub = device.createBuffer({ size: (6 + NS + 1) * 16, usage: 0x40 | 0x08 }), module = device.createShaderModule({ code: WGSL });
  const pipe = (entryPoint, op, dstFactor) => device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, primitive: { frontFace: 'cw' }, // the front: seen with the strip up
    fragment: { module, entryPoint, targets: [{ format: 'rgba16float', blend: { color: { operation: op, srcFactor: 'one', dstFactor }, alpha: { operation: op, srcFactor: 'one', dstFactor: op === 'max' ? 'one' : 'one-minus-src-alpha' } } }] } });
  // The paper: each row replaces what it covers (one face shows), its coverage over; shadows: the darkest of the rows.
  const pipes = [pipe('fsPaper', 'add', 'zero'), pipe('fsShadow', 'max', 'one')];
  const bgs = pipes.map((p) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }] }));
  let tex = null;
  const note = {
    view: null,
    // The tile (device px, each half), made again only when it must grow.
    size(w, h) {
      if (tex && tex.width >= w && tex.height >= 2 * h) return;
      tex?.destroy();
      tex = device.createTexture({ size: [Math.max(w, tex?.width || 1), 2 * Math.max(h, (tex?.height || 2) / 2)], format: 'rgba16float', usage: 0x04 | 0x10 });
      note.view = tex.createView(); note.w = tex.width; note.h = tex.height / 2;
    },
    encode(enc, data) {
      device.queue.writeBuffer(ub, 0, data);
      const h = tex.height / 2, pass = enc.beginRenderPass({ colorAttachments: [{ view: note.view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      pass.setViewport(0, 0, tex.width, h, 0, 1); pass.setPipeline(pipes[0]); pass.setBindGroup(0, bgs[0]); pass.draw(6 * (NS + 2));
      pass.setViewport(0, h, tex.width, h, 0, 1); pass.setPipeline(pipes[1]); pass.setBindGroup(0, bgs[1]); pass.draw(6 * (NS + 2), 2, 0, 1);
      pass.end();
    },
  };
  note.size(1, 1);
  return note;
}

// The sheet past the strip, as paper: one cross-section, a chain of n equal links from the strip's edge (fixed) to the
// free edge, along the note (y) and up from the desk (z), design px. Links never stretch; each joint resists bending
// (the strip's edge is a free hinge), gravity pulls it down, the air pushes back on its face, and the desk holds it up.
// A finger lifts the free edge toward the other side and lets go once it is past upright; the rest is the sim.
export function paperChain(n, L, flip) { // lying flat (flip 0), or turned over onto the strip (1)
  const x = new Float64Array(2 * n + 2);
  for (let i = 0; i <= n; i++) x[2 * i] = ((flip ? -1 : 1) * i * L) / n;
  return { n, l: L / n, x, p: x.slice(), dir: 0, push: false, slap: false, rest: true };
}
const H = 1 / 3000; // the sim's step (s): fine enough that the stiffest joints stay stable
// P: g (px/s^2), drag (1/px: quadratic, across the face), bend (px: the length paper holds itself out straight against
// gravity), lift (px/s^2: the finger on the free edge, per link). Returns the free edge's downward speed the step it first
// touches the desk after the finger lets go (the slap), else 0; c.rest once it lies still on the desk.
export function stepChain(c, dt, P) {
  const { n, l, x, p } = c, B = P.g * P.bend ** 3 / l ** 2, f = new Float64Array(2 * n + 2);
  let slap = 0;
  for (let t = 0; t < dt - 1e-9; t += H) {
    const h = Math.min(H, dt - t);
    f.fill(0);
    for (let j = 1; j < n; j++) { // the joint at node j turns link j-1 into link j (the strip's edge is a free hinge)
      const ay = x[2 * j] - x[2 * j - 2], az = x[2 * j + 1] - x[2 * j - 1], by = x[2 * j + 2] - x[2 * j], bz = x[2 * j + 3] - x[2 * j + 1];
      const k = (-B * Math.atan2(ay * bz - az * by, ay * by + az * bz)) / l; // the torque, as a force on the link ends (all links are l long)
      f[2 * j + 2] -= (k * bz) / l; f[2 * j + 3] += (k * by) / l; f[2 * j - 2] -= (k * az) / l; f[2 * j - 1] += (k * ay) / l;
      f[2 * j] += (k * (bz + az)) / l; f[2 * j + 1] -= (k * (by + ay)) / l;
    }
    for (let i = 1; i <= n; i++) { // the air across the face (the normal: averaged over the links either side)
      const a = Math.max(i - 1, 0), b = Math.min(i + 1, n), ny = -(x[2 * b + 1] - x[2 * a + 1]), nz = x[2 * b] - x[2 * a], m = Math.hypot(ny, nz) || 1;
      const vn = ((x[2 * i] - p[2 * i]) * ny + (x[2 * i + 1] - p[2 * i + 1]) * nz) / m / h;
      f[2 * i] -= (P.drag * vn * Math.abs(vn) * ny) / m; f[2 * i + 1] -= (P.drag * vn * Math.abs(vn) * nz) / m + P.g;
    }
    const ey = x[2 * n], ez = x[2 * n + 1], r = Math.hypot(ey, ez) || 1;
    if (c.push) {
      f[2 * n] -= (P.lift * n * c.dir * ez) / r; f[2 * n + 1] += (P.lift * n * c.dir * ey) / r; // across the chord, toward the other side
      if (c.dir * ey < -0.1 * r) c.push = false; // past upright: let go
    }
    const vz = (x[2 * n + 1] - p[2 * n + 1]) / h;
    for (let i = 2; i < 2 * n + 2; i++) { const v = x[i] - p[i]; p[i] = x[i]; x[i] += v * (1 - 2 * h) + f[i] * h * h; }
    for (let it = 0; it < 6; it++) for (let i = 0; i < n; i++) { // links keep their length, from the strip out
      const dy = x[2 * i + 2] - x[2 * i], dz = x[2 * i + 3] - x[2 * i + 1], d = Math.hypot(dy, dz) || 1, e = (d - l) / d;
      const w = i ? 0.5 : 0; x[2 * i] += w * e * dy; x[2 * i + 1] += w * e * dz; x[2 * i + 2] -= (1 - w) * e * dy; x[2 * i + 3] -= (1 - w) * e * dz;
    }
    for (let i = 1; i <= n; i++) if (x[2 * i + 1] < 0) { // the desk: no sinking in, no sliding along it
      if (i === n && !c.push && c.slap) { slap = Math.max(slap, -vz); c.slap = false; }
      x[2 * i + 1] = 0; p[2 * i + 1] = 0; p[2 * i] = x[2 * i];
    }
  }
  let m = 0;
  for (let i = 1; i <= n; i++) m = Math.max(m, x[2 * i + 1], Math.hypot(x[2 * i] - p[2 * i], x[2 * i + 1] - p[2 * i + 1]) / H);
  c.rest = !c.push && m < 1; // within a px of the desk, slower than a px/s
  return slap;
}
