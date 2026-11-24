// Potato chips the slime eats. Each chip is a thin curved shell of voxels (CN x CN columns, CL layers through its
// thickness) on a saddle: a rigid body that falls, tumbles, bounces and rocks to rest on its curve, bumps other chips, and
// is nudged by cards. The slime eats only the voxels where it touches the desk; as they go, its mass, centre of mass and
// support are recomputed from what is left, so it tips and settles lower until nothing is left. Units: CSS px, seconds;
// z is height above the desk. The render (WGSL below) draws the same shape analytically, so the voxels never show.

export const CN = 40, CL = 3, NCH = 12, FEED = 16; // columns per side, layers, bodies, slime grid size
const SOLID = 0.2; // a voxel holds (and is a contact point) while its density is above this

// ---------- shape ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// A chip's outline (radius by angle, a slightly oval, wavy rim) and its surface (a saddle, a little bowl, two slow warps,
// one or two edges folded up).
export function makeShape(seed, R, thick, curl, fold = 1, bend = 0.8) {
  const r = rng(seed), u = (a, b) => a + (b - a) * r(), ph = () => r() * 6.2832;
  const harm = [u(0.06, 0.13), ph(), u(0.03, 0.06), ph(), u(0.015, 0.035), ph(), u(0.008, 0.02), ph()];
  const sag = u(0.1, 0.16) * R * curl, bowl = u(-0.03, 0.03) * R * curl, ax = ph();
  const k = 6.2832 / (R * u(1.6, 2.6)), k2 = 6.2832 / (R * u(0.9, 1.4)), a1 = ph(), a2 = ph();
  const warp = [k * Math.cos(a1), k * Math.sin(a1), u(0.25, 0.5) * curl, ph(), k2 * Math.cos(a2), k2 * Math.sin(a2), u(0.1, 0.22) * curl, ph()];
  const B = R * 1.28, tone = r();
  // Its edges curl up: toward the rim past a line (o from the centre, along a direction) the surface bends up gradually,
  // over a width of bend times the distance to the rim, so there is never a crease.
  const folds = [0, 1].flatMap((i) => { const a = ph(), o = u(0.3, 0.6) * R; return [Math.cos(a), Math.sin(a), o, u(i ? 0 : 0.15, 0.32) * R * fold]; });
  const hb = sag + Math.abs(bowl) + warp[2] + warp[6] + folds[3] + folds[7] + thick;
  return { seed, R, B, t: thick, sag, bowl, ca: Math.cos(ax), sa: Math.sin(ax), harm, warp, folds, bend, tone, hb };
}
export function outlineR(S, x, y) {
  const th = Math.atan2(y, x), h = S.harm;
  return S.R * (1 + h[0] * Math.cos(2 * th + h[1]) + h[2] * Math.cos(3 * th + h[3]) + h[4] * Math.cos(4 * th + h[5]) + h[6] * Math.cos(5 * th + h[7]));
}
// Height of the mid-surface over (x, y), and its slope.
export function surf(S, x, y) {
  const u = S.ca * x + S.sa * y, v = -S.sa * x + S.ca * y, R2 = S.R * S.R, w = S.warp;
  const p1 = w[0] * x + w[1] * y + w[3], p2 = w[4] * x + w[5] * y + w[7];
  const h = (S.sag * (u * u - v * v) + S.bowl * (x * x + y * y)) / R2 + w[2] * Math.sin(p1) + w[6] * Math.sin(p2);
  const hu = (2 * S.sag * u) / R2, hv = (-2 * S.sag * v) / R2;
  let hx = S.ca * hu - S.sa * hv + (2 * S.bowl * x) / R2 + w[2] * w[0] * Math.cos(p1) + w[6] * w[4] * Math.cos(p2);
  let hy = S.sa * hu + S.ca * hv + (2 * S.bowl * y) / R2 + w[2] * w[1] * Math.cos(p1) + w[6] * w[5] * Math.cos(p2);
  let hf = h;
  for (let i = 0; i < 8; i += 4) {
    const f = S.folds, span = S.R - f[i + 2], e = (f[i] * x + f[i + 1] * y - f[i + 2]) / span, r = Math.hypot(e, S.bend);
    const q1 = 0.5 * (1 + Math.hypot(1, S.bend)), q = (0.5 * (e + r)) / q1, g = (f[i + 3] * q * (1 + e / r)) / (q1 * span); // its full lift at the rim
    hf += f[i + 3] * q * q; hx += g * f[i]; hy += g * f[i + 1];
  }
  return [hf, hx, hy];
}

// ---------- small linear algebra ----------
const qmat = ([w, x, y, z]) => [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const mtv = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C || 1e-9;
  return [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det];
}
const mmul = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const tr = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
function qmul(a, b) {
  return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
}
const qaxis = (ax, an) => { const s = Math.sin(an / 2), l = Math.hypot(...ax) || 1; return [Math.cos(an / 2), (ax[0] / l) * s, (ax[1] / l) * s, (ax[2] / l) * s]; };
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const qnorm = (q) => { const l = Math.hypot(...q); return q.map((v) => v / l); };

// ---------- a body ----------
let nextId = 1;
class Body {
  constructor(S, chip) {
    this.S = S; this.chip = chip; this.id = nextId++;
    const n = CN * CN * CL, cell = (2 * S.B) / CN;
    this.cell = cell; this.rs = S.t / (2 * CL); // a voxel's half thickness: the radius it touches with
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.d = new Float32Array(n); this.crumb = new Uint8Array(CN * CN); this.stain = new Float32Array(CN * CN);
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const x = -S.B + (i + 0.5) * cell, y = -S.B + (j + 0.5) * cell, inside = outlineR(S, x, y) - Math.hypot(x, y) > 0, h = surf(S, x, y)[0];
      for (let l = 0; l < CL; l++) {
        const k = (j * CN + i) * CL + l;
        this.px[k] = x; this.py[k] = y; this.pz[k] = h + ((l + 0.5) / CL - 0.5) * S.t; this.d[k] = inside ? 1 : 0;
      }
    }
    this.x = [0, 0, 0]; this.v = [0, 0, 0]; this.w = [0, 0, 0]; this.q = [1, 0, 0, 0]; this.c = [0, 0, 0];
    this.sleep = false; this.still = 0; this.touch = false; this.landed = false; this.pulse = 0;
    this.dirty = true; this.alpha = 1;
    this.feed = null; // the slime under it, read back from the GPU: { cx, cy, h, v: Float32Array(FEED * FEED) }
    this.mass0 = 0; this.props(true);
    this.mass0 = this.m;
  }
  // Mass, centre of mass, inertia, contact points and footprint from the voxels that are left; the shape stays where it is in the world.
  props(first = false) {
    const { px, py, pz, d } = this;
    let m = 0, sx = 0, sy = 0, sz = 0;
    for (let k = 0; k < d.length; k++) { const w = d[k]; if (w <= 0) continue; m += w; sx += w * px[k]; sy += w * py[k]; sz += w * pz[k]; }
    if (m < 1e-6) { this.m = 0; return; }
    const c = [sx / m, sy / m, sz / m];
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0, foot = 0;
    for (let k = 0; k < d.length; k++) {
      const w = d[k]; if (w <= 0) continue;
      const rx = px[k] - c[0], ry = py[k] - c[1], rz = pz[k] - c[2];
      xx += w * rx * rx; yy += w * ry * ry; zz += w * rz * rz; xy += w * rx * ry; xz += w * rx * rz; yz += w * ry * rz;
      if (w > SOLID) foot = Math.max(foot, rx * rx + ry * ry);
    }
    const e = (m * this.cell * this.cell) / 6; // each voxel's own spread
    const I = [yy + zz + e, -xy, -xz, -xy, xx + zz + e, -yz, -xz, -yz, xx + yy + 2 * e];
    if (!first) { const dc = mv(qmat(this.q), [c[0] - this.c[0], c[1] - this.c[1], c[2] - this.c[2]]); for (let i = 0; i < 3; i++) this.x[i] += dc[i]; }
    this.m = m; this.c = c; this.Ib = inv3(I); this.foot = Math.sqrt(foot) + this.cell * 0.5;
    // Contact points: the outer layers' voxels on the rim, and every third column of them inside it.
    const col = (i, j) => i >= 0 && j >= 0 && i < CN && j < CN && this.colSolid(j * CN + i);
    const s = [];
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      if (!col(i, j)) continue;
      const rim = !col(i - 1, j) || !col(i + 1, j) || !col(i, j - 1) || !col(i, j + 1);
      for (let l = 0; l < CL; l++) {
        const k = (j * CN + i) * CL + l;
        if (d[k] <= SOLID) continue;
        if ((l === 0 || l === CL - 1) && (rim || (i % 3 === 0 && j % 3 === 0))) s.push(k);
        lo = [Math.min(lo[0], px[k]), Math.min(lo[1], py[k]), Math.min(lo[2], pz[k])]; hi = [Math.max(hi[0], px[k]), Math.max(hi[1], py[k]), Math.max(hi[2], pz[k])];
      }
    }
    this.samples = Int32Array.from(s);
    this.sp = new Float64Array(s.length * 3);
    s.forEach((k, n) => { this.sp[n * 3] = px[k] - c[0]; this.sp[n * 3 + 1] = py[k] - c[1]; this.sp[n * 3 + 2] = pz[k] - c[2]; });
    if (!s.length) { this.frozen = true; return; } // nothing left to stand on: it stays put while the last of it goes
    this.box = [lo, hi];
    this.bound = Math.hypot(...[0, 1, 2].map((i) => Math.max(Math.abs(lo[i] - c[i]), Math.abs(hi[i] - c[i])))) + this.cell;
    this.dirty = true;
  }
  colSolid(ci) { for (let l = 0; l < CL; l++) if (this.d[ci * CL + l] > SOLID) return true; return false; }
  get solidCols() { let n = 0; for (let ci = 0; ci < CN * CN; ci++) if (this.colSolid(ci)) n++; return n; }
  wake() { this.sleep = false; this.still = 0; this.rest = null; }
  // World position of voxel k (R: this.q's matrix).
  at(R, k) { const r = mv(R, [this.px[k] - this.c[0], this.py[k] - this.c[1], this.pz[k] - this.c[2]]); return [this.x[0] + r[0], this.x[1] + r[1], this.x[2] + r[2]]; }
  // A body-frame point to the world, and back.
  toWorld(R, p) { const r = mv(R, [p[0] - this.c[0], p[1] - this.c[1], p[2] - this.c[2]]); return [this.x[0] + r[0], this.x[1] + r[1], this.x[2] + r[2]]; }
  toLocal(R, p) { const r = mtv(R, [p[0] - this.x[0], p[1] - this.x[1], p[2] - this.x[2]]); return [r[0] + this.c[0], r[1] + this.c[1], r[2] + this.c[2]]; }
  // The slime under a desk point (0 to 1), from the last read-back.
  slime(x, y) {
    const f = this.feed;
    if (!f) return 0;
    const u = clamp01((x - f.cx + f.h) / (2 * f.h)) * FEED - 0.5, v = clamp01((y - f.cy + f.h) / (2 * f.h)) * FEED - 0.5;
    const i = Math.max(0, Math.min(FEED - 2, Math.floor(u))), j = Math.max(0, Math.min(FEED - 2, Math.floor(v))), a = clamp01(u - i), b = clamp01(v - j), g = f.v;
    return (g[j * FEED + i] * (1 - a) + g[j * FEED + i + 1] * a) * (1 - b) + (g[(j + 1) * FEED + i] * (1 - a) + g[(j + 1) * FEED + i + 1] * a) * b;
  }
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------- the world ----------
// P: the tunables (desk.js T): chipG gravity, chipAir air drag, chipBend how gradually the edges curl, chipE bounce, chipMu friction, chipRock rocking damping, chipEat eating speed,
// chipBand how close to the desk a voxel is eaten, chipHurry the speed-up for the oldest chip over the cap.
export function createWorld(P) {
  const bodies = [];
  const contacts = []; // reused
  let acc = 0, eatAcc = 0;
  const STEP = 1 / 360;

  function drop(x, y, R, seed, { region = 0, born = 0, still = false } = {}) {
    const r = rng(seed ^ 0x51ed);
    const S = makeShape(seed, R, P.chipThick * (R / 31), P.chipCurl, P.chipFold, P.chipBend);
    const chip = { seed, region, born, hurry: 1 };
    const b = new Body(S, chip);
    const tilt = (r() - 0.5) * 2 * 0.6, yaw = r() * 6.2832, ax = r() * 6.2832;
    b.q = qnorm(qmul(qaxis([Math.cos(ax), Math.sin(ax), 0], tilt), qaxis([0, 0, 1], yaw)));
    b.x = [x, y, P.chipDrop * (R / 31) + S.hb];
    const spin = (0.5 + r()) * P.chipSpin, sa = r() * 6.2832;
    b.w = [Math.cos(sa) * spin, Math.sin(sa) * spin, (r() - 0.5) * 6];
    b.v = [(r() - 0.5) * 40, (r() - 0.5) * 40, 0];
    bodies.push(b);
    if (still) settle(b);
    return b;
  }
  // Reduced motion: the chip appears where it would come to rest, without being seen to fall.
  function settle(b) {
    b.v = [0, 0, 0]; b.w = [0, 0, 0]; b.x[2] = b.S.hb + 1;
    for (let i = 0; i < 360 * 6 && !b.sleep; i++) substep(STEP, true);
    b.landed = true; b.pulse = 0;
  }

  // ---------- contacts ----------
  // Sequential impulses with split impulses: velocities see only bounce and friction, and overlap is pushed apart by a
  // separate pseudo-velocity that moves the body without speeding it up, so a chip at rest stays at rest.
  const MAXC = 2048, CF = 56; // floats per contact
  const cb = new Float64Array(MAXC * CF), ca = new Int32Array(MAXC * 2);
  let nc = 0;
  // per contact: 0..2 ra, 3..5 rb, 6 overlap, 7 target speed, 8 normal impulse, 9 overlap impulse, 10..11 friction impulses,
  // then one row of 14 per direction (normal, two tangents): d, ra x d, rb x d, A's inverse inertia times ra x d, 1 / mass.
  // B's inverse inertia times rb x d is in mb.
  const ROW = 12;
  // Each contact keeps its impulses to start the next step from (warm starting), so stacks rest instead of jittering.
  const ck = new Float64Array(MAXC), warm = new Map();
  function addContact(a, b, p, n, pen, key) { // b null: the desk
    if (nc >= MAXC) return;
    ck[nc] = key;
    if (a.sleep && b && !b.sleep) { const t = a; a = b; b = t; n = [-n[0], -n[1], -n[2]]; }
    const o = nc * CF;
    ca[nc * 2] = bodies.indexOf(a); ca[nc * 2 + 1] = b ? bodies.indexOf(b) : -1;
    for (let i = 0; i < 3; i++) { cb[o + i] = p[i] - a.x[i]; cb[o + 3 + i] = b ? p[i] - b.x[i] : 0; }
    cb[o + 6] = pen; cb[o + 8] = cb[o + 9] = cb[o + 10] = cb[o + 11] = 0;
    const t1 = Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]), l = Math.hypot(...t1);
    for (let i = 0; i < 3; i++) t1[i] /= l;
    const t2 = cross(n, t1);
    [n, t1, t2].forEach((d, r) => { const q = o + ROW + r * 14; cb[q] = d[0]; cb[q + 1] = d[1]; cb[q + 2] = d[2]; });
    nc++;
  }
  function gather(dt) {
    nc = 0;
    for (const b of bodies) {
      b.touch = b.carried = false;
      b.R = qmat(b.q); b.Iw = mmul(mmul(b.R, b.Ib), tr(b.R));
    }
    for (const b of bodies) {
      if (b.sleep || !b.m || b.frozen) continue;
      const R = b.R, spec = Math.max(0, -b.v[2]) * dt + 0.2;
      if (b.x[2] - b.bound > spec) continue;
      const sp = b.sp, s = b.samples;
      pick.fill(-1);
      for (let n = 0; n < s.length; n++) {
        const x = sp[n * 3], y = sp[n * 3 + 1], z = sp[n * 3 + 2], gap = b.x[2] + R[6] * x + R[7] * y + R[8] * z - b.rs;
        if (gap >= spec || b.d[s[n]] <= SOLID) continue;
        const wx = R[0] * x + R[1] * y + R[2] * z, wy = R[3] * x + R[4] * y + R[5] * z;
        keep(Math.atan2(wy, wx), -gap, n, b.x[0] + wx, b.x[1] + wy, gap, 0, 0, 1);
      }
      for (let k = 0; k < SEC; k++) if (pick[k] >= 0) { const o = k * 7; addContact(b, null, [pk[o], pk[o + 1], pk[o + 2]], [0, 0, 1], pkd[k], b.id * 67108864 + pick[k]); }
    }
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if ((A.sleep && B.sleep) || !A.m || !B.m || A.frozen || B.frozen) continue;
      if (Math.hypot(A.x[0] - B.x[0], A.x[1] - B.x[1], A.x[2] - B.x[2]) > A.bound + B.bound + 2) continue;
      if (A.x[2] >= B.x[2]) pairContacts(A, B); else pairContacts(B, A); // the upper one's points against the lower one's shell
    }
  }
  // Contacts are thinned to the deepest in each of SEC directions around the body: a few points hold it as well as hundreds.
  const SEC = 12, pick = new Int32Array(SEC), pkd = new Float64Array(SEC), pk = new Float64Array(SEC * 7);
  function keep(ang, depth, n, px, py, pz, nx, ny, nz) {
    const k = Math.min(SEC - 1, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * SEC));
    if (pick[k] >= 0 && pkd[k] >= depth) return;
    pick[k] = n; pkd[k] = depth;
    const o = k * 7; pk[o] = px; pk[o + 1] = py; pk[o + 2] = pz; pk[o + 3] = nx; pk[o + 4] = ny; pk[o + 5] = nz;
  }
  // A's contact points against B's shell: a point inside B's slab, over a solid column, is pushed out on A's side of it.
  function pairContacts(A, B) {
    const S = B.S, half = S.t / 2 + A.rs, RA = A.R, RB = B.R;
    const ac = B.toLocal(RB, A.x), side = ac[2] - surf(S, clampB(S, ac[0]), clampB(S, ac[1]))[0] >= 0 ? 1 : -1;
    const sp = A.sp, s = A.samples, r2 = (B.bound + 1) ** 2, reach = S.hb + half + 0.5;
    pick.fill(-1);
    for (let n = 0; n < s.length; n++) {
      const x = sp[n * 3], y = sp[n * 3 + 1], z = sp[n * 3 + 2];
      const p = [A.x[0] + RA[0] * x + RA[1] * y + RA[2] * z, A.x[1] + RA[3] * x + RA[4] * y + RA[5] * z, A.x[2] + RA[6] * x + RA[7] * y + RA[8] * z];
      if ((p[0] - B.x[0]) ** 2 + (p[1] - B.x[1]) ** 2 + (p[2] - B.x[2]) ** 2 > r2 || A.d[s[n]] <= SOLID) continue;
      const q = B.toLocal(RB, p);
      if (Math.abs(q[0]) >= S.B || Math.abs(q[1]) >= S.B || Math.abs(q[2]) > reach) continue;
      const ci = Math.floor((q[1] + S.B) / B.cell) * CN + Math.floor((q[0] + S.B) / B.cell);
      if (!B.colSolid(ci)) continue;
      const [h, hx, hy] = surf(S, q[0], q[1]), dz = q[2] - h, pen = half - side * dz;
      if (pen < -0.3 || pen > S.t * 1.5 + half) continue;
      const l = Math.hypot(hx, hy, 1), nw = mv(RB, [(-hx / l) * side, (-hy / l) * side, (1 / l) * side]);
      keep(Math.atan2(p[1] - A.x[1], p[0] - A.x[0]), pen, n, p[0], p[1], p[2], nw[0], nw[1], nw[2]);
    }
    for (let k = 0; k < SEC; k++) if (pick[k] >= 0) { const o = k * 7; addContact(A, B, [pk[o], pk[o + 1], pk[o + 2]], [pk[o + 3], pk[o + 4], pk[o + 5]], pkd[k], (A.id * 65536 + B.id) * 1024 + pick[k]); }
  }
  const clampB = (S, v) => Math.max(-S.B, Math.min(S.B, v));
  const dyn = (b) => b && !b.sleep && !b.frozen;

  function solve(dt) {
    const mu = P.chipMu, e = P.chipE, beta = 0.25, slop = 0.04;
    for (const b of bodies) { b.vp = [0, 0, 0]; b.wp = [0, 0, 0]; }
    for (let c = 0; c < nc; c++) { // effective masses, and the bounce each contact wants
      const o = c * CF, A = bodies[ca[c * 2]], B = ca[c * 2 + 1] >= 0 ? bodies[ca[c * 2 + 1]] : null, Bd = dyn(B) ? B : null;
      const ra = [cb[o], cb[o + 1], cb[o + 2]], rb = [cb[o + 3], cb[o + 4], cb[o + 5]];
      for (let r = 0; r < 3; r++) {
        const q = o + ROW + r * 14, d = [cb[q], cb[q + 1], cb[q + 2]], Ja = cross(ra, d), Jb = cross(rb, d), Ma = mv(A.Iw, Ja), Mb = Bd ? mv(B.Iw, Jb) : [0, 0, 0];
        let k = 1 / A.m + dot(Ja, Ma);
        if (Bd) k += 1 / B.m + dot(Jb, Mb);
        for (let i = 0; i < 3; i++) { cb[q + 3 + i] = Ja[i]; cb[q + 6 + i] = Jb[i]; cb[q + 9 + i] = Ma[i]; }
        cb[q + 12] = 1 / k;
        mb[c * 9 + r * 3] = Mb[0]; mb[c * 9 + r * 3 + 1] = Mb[1]; mb[c * 9 + r * 3 + 2] = Mb[2];
      }
      const vn = relVel(c, 0, A, Bd, false), pen = cb[o + 6];
      if (B && B.sleep && !B.frozen && vn < -40 - P.chipG * dt) B.wake(); // knocked (more than its weight settling on it)
      if (B && pen > -0.05) { // a chip resting on one that moves cannot sleep, so the two settle together
        const lo = A.x[2] < B.x[2] ? A : B, up = lo === A ? B : A;
        if (dyn(lo)) { if (up.sleep && !up.frozen) up.wake(); up.carried = true; }
      }
      cb[o + 7] = Math.max(vn < -60 ? -e * vn : 0, pen < 0 ? pen / dt : 0); // bounce, or close a gap no faster than in one step
      if (vn < -150 && !B) A.pulse = Math.max(A.pulse, Math.min(1, -vn / 900));
    }
    for (let c = 0; c < nc; c++) { // warm start
      const w = warm.get(ck[c]);
      if (!w) continue;
      const o = c * CF, A = bodies[ca[c * 2]], B = ca[c * 2 + 1] >= 0 ? bodies[ca[c * 2 + 1]] : null, Bd = dyn(B) ? B : null;
      for (let r = 0; r < 3; r++) { const l = w[r] * 0.85; cb[o + (r ? 9 + r : 8)] = l; impulse(c, r, A, Bd, l, false); }
    }
    for (let it = 0; it < 10; it++) for (let c = 0; c < nc; c++) {
      const o = c * CF, A = bodies[ca[c * 2]], B = ca[c * 2 + 1] >= 0 ? bodies[ca[c * 2 + 1]] : null, Bd = dyn(B) ? B : null;
      let dl = -cb[o + ROW + 12] * (relVel(c, 0, A, Bd, false) - cb[o + 7]);
      const ln = Math.max(0, cb[o + 8] + dl); dl = ln - cb[o + 8]; cb[o + 8] = ln;
      impulse(c, 0, A, Bd, dl, false);
      const lim = mu * ln;
      for (const r of [1, 2]) {
        const q = o + ROW + r * 14;
        let d2 = -cb[q + 12] * relVel(c, r, A, Bd, false);
        const lt = Math.max(-lim, Math.min(lim, cb[o + 9 + r] + d2)); d2 = lt - cb[o + 9 + r]; cb[o + 9 + r] = lt;
        impulse(c, r, A, Bd, d2, false);
      }
    }
    for (let it = 0; it < 6; it++) for (let c = 0; c < nc; c++) { // push overlap apart
      const o = c * CF, A = bodies[ca[c * 2]], B = ca[c * 2 + 1] >= 0 ? bodies[ca[c * 2 + 1]] : null, Bd = dyn(B) ? B : null;
      const want = (beta / dt) * Math.max(0, cb[o + 6] - slop);
      let dl = -cb[o + ROW + 12] * (relVel(c, 0, A, Bd, true) - want);
      const lp = Math.max(0, cb[o + 9] + dl); dl = lp - cb[o + 9]; cb[o + 9] = lp;
      impulse(c, 0, A, Bd, dl, true);
    }
    warm.clear();
    for (let c = 0; c < nc; c++) { const o = c * CF; if (cb[o + 8] > 0) warm.set(ck[c], [cb[o + 8], cb[o + 10], cb[o + 11]]); }
    for (let c = 0; c < nc; c++) if (cb[c * CF + 8] > 0 || cb[c * CF + 6] > 0) { bodies[ca[c * 2]].touch = true; if (ca[c * 2 + 1] >= 0) bodies[ca[c * 2 + 1]].touch = true; }
  }
  const mb = new Float64Array(MAXC * 9);
  function relVel(c, r, A, B, pseudo) {
    const o = c * CF, q = o + ROW + r * 14, v = pseudo ? A.vp : A.v, w = pseudo ? A.wp : A.w;
    let s = cb[q] * v[0] + cb[q + 1] * v[1] + cb[q + 2] * v[2] + cb[q + 3] * w[0] + cb[q + 4] * w[1] + cb[q + 5] * w[2];
    if (B) { const vb = pseudo ? B.vp : B.v, wb = pseudo ? B.wp : B.w; s -= cb[q] * vb[0] + cb[q + 1] * vb[1] + cb[q + 2] * vb[2] + cb[q + 6] * wb[0] + cb[q + 7] * wb[1] + cb[q + 8] * wb[2]; }
    return s;
  }
  function impulse(c, r, A, B, l, pseudo) {
    const q = c * CF + ROW + r * 14, m = c * 9 + r * 3, v = pseudo ? A.vp : A.v, w = pseudo ? A.wp : A.w;
    for (let i = 0; i < 3; i++) { v[i] += (cb[q + i] * l) / A.m; w[i] += cb[q + 9 + i] * l; }
    if (B) { const vb = pseudo ? B.vp : B.v, wb = pseudo ? B.wp : B.w; for (let i = 0; i < 3; i++) { vb[i] -= (cb[q + i] * l) / B.m; wb[i] -= mb[m + i] * l; } }
  }

  // Cards nudge chips (pushers: { x, y, hw, hh, c, s, vx, vy } in desk px), and the page's edges keep them on it.
  function push(pushers, bounds, dt) {
    for (const b of bodies) {
      if (!b.m) continue;
      const r = b.foot, low = b.x[2] - b.S.hb < r * 0.5; // a card sweeps along only the chips on the desk under it
      for (const p of low ? pushers : []) {
        const dx = b.x[0] - p.x, dy = b.x[1] - p.y, lx = dx * p.c + dy * p.s, ly = -dx * p.s + dy * p.c;
        const cx = Math.max(-p.hw, Math.min(p.hw, lx)), cy = Math.max(-p.hh, Math.min(p.hh, ly));
        let nx, ny, pen;
        if (cx === lx && cy === ly) { // its middle is under the card: out through the nearest edge
          const ex = p.hw - Math.abs(lx), ey = p.hh - Math.abs(ly);
          if (ex < ey) { nx = Math.sign(lx) || 1; ny = 0; pen = ex + r; } else { nx = 0; ny = Math.sign(ly) || 1; pen = ey + r; }
        } else {
          const ox = lx - cx, oy = ly - cy, d = Math.hypot(ox, oy);
          if (d >= r * 0.92) continue;
          nx = ox / d; ny = oy / d; pen = r * 0.92 - d;
        }
        const wx = nx * p.c - ny * p.s, wy = nx * p.s + ny * p.c; // to the desk's axes
        const vp = p.vx * wx + p.vy * wy, want = Math.max(vp, Math.min(pen * 10, 260)), vn = b.v[0] * wx + b.v[1] * wy;
        if (vn >= want) continue;
        const dv = want - vn;
        b.v[0] += wx * dv; b.v[1] += wy * dv;
        if (dv > 60 && b.v[2] < 30) { b.v[2] += Math.min(dv, 400) * 0.15; b.w[0] += -wy * dv * 0.02; b.w[1] += wx * dv * 0.02; b.w[2] += (Math.random() - 0.5) * dv * 0.02; } // a knock tips it and turns it a little, once
        b.wake();
      }
      const [x0, y0, x1, y1] = bounds, m = r * 0.6;
      for (const [d, nx, ny] of [[b.x[0] - (x0 + m), 1, 0], [x1 - m - b.x[0], -1, 0], [b.x[1] - (y0 + m), 0, 1], [y1 - m - b.x[1], 0, -1]]) {
        if (d >= 0) continue;
        const vn = b.v[0] * nx + b.v[1] * ny, want = Math.min(-d * 10, 200);
        if (vn < want) { b.v[0] += nx * (want - vn); b.v[1] += ny * (want - vn); b.wake(); }
      }
    }
  }

  function substep(dt, settling = false) {
    const g = P.chipG, ad = Math.exp(-0.4 * dt), aw = Math.exp(-0.6 * dt);
    for (const b of bodies) {
      if (!dyn(b) || !b.m) continue;
      // Air holds a light chip back (drag growing with its speed), so it drifts down tumbling instead of dropping like a stone.
      b.v[2] -= g * dt;
      const air = 1 / (1 + P.chipAir * Math.hypot(...b.v) * dt);
      for (let i = 0; i < 3; i++) { b.v[i] *= ad * air; b.w[i] *= aw; }
    }
    gather(dt);
    solve(dt);
    for (const b of bodies) {
      if (!dyn(b) || !b.m) continue;
      // Rocking and creeping die away, fastest once slow: a chip is light and catches on whatever it lies on.
      if (b.touch) {
        const k = Math.exp(-P.chipRock * (1 + 3 / (1 + Math.hypot(...b.w))) * dt), kv = Math.exp(-P.chipRock * (b.carried ? 4 : 2) / (1 + Math.hypot(...b.v) / 20) * dt);
        for (let i = 0; i < 3; i++) { b.w[i] *= k; b.v[i] *= kv; }
        if (!b.carried && Math.hypot(...b.v) < 2 && Math.hypot(...b.w) < 0.15) { const f = Math.exp(-25 * dt); for (let i = 0; i < 3; i++) { b.w[i] *= f; b.v[i] *= f; } } // a last creep catches and stops
        b.landed = true;
      }
      for (let i = 0; i < 3; i++) b.x[i] += (b.v[i] + b.vp[i]) * dt;
      const w = [b.w[0] + b.wp[0], b.w[1] + b.wp[1], b.w[2] + b.wp[2]], wl = Math.hypot(...w);
      if (wl > 1e-9) b.q = qnorm(qmul(qaxis(w, wl * dt), b.q));
      // It sleeps once it has barely moved for a moment: a tiny jitter on its contacts is not worth simulating.
      const calm = b.touch && !b.carried && Math.hypot(...b.v) < 8 && Math.hypot(...b.w) < 0.6 && b.rest && Math.hypot(b.x[0] - b.rest[0], b.x[1] - b.rest[1], b.x[2] - b.rest[2]) < 0.35 && Math.abs(dot4(b.q, b.rest[3])) > 0.9999;
      if (!calm) b.rest = [...b.x, [...b.q]];
      b.still = calm ? b.still + dt : 0;
      if (b.still > (settling ? 0.15 : 0.35)) { b.sleep = true; b.v = [0, 0, 0]; b.w = [0, 0, 0]; }
    }
  }

  // ---------- eating ----------
  // Voxels within P.chipBand of the desk are eaten where the slime is; a voxel that gives way changes the body's mass,
  // centre and support, and wakes it to settle. A body that comes apart becomes two (the crumbs are just eaten up).
  function eat(dt, onSplit) {
    const out = [];
    for (const b of bodies) {
      if (!b.m) continue;
      b.pulse *= Math.exp(-dt * 3);
      const R = qmat(b.q), r2 = R.slice(6, 9), base = b.x[2] - dot(r2, b.c);
      const rate = P.chipEat * b.chip.hurry * dt, band = P.chipBand + b.rs;
      let gone = false, changed = false, held = false;
      for (let ci = 0; ci < CN * CN; ci++) {
        const crumb = b.crumb[ci];
        for (let l = 0; l < CL; l++) {
          const k = ci * CL + l, d = b.d[k];
          if (d <= 0) continue;
          let dd = 0;
          if (crumb) dd = dt / Math.max(0.05, P.chipCrumbS);
          else {
            const z = base + r2[0] * b.px[k] + r2[1] * b.py[k] + r2[2] * b.pz[k];
            if (z > band || !b.landed) continue;
            const wx = b.x[0] + R[0] * (b.px[k] - b.c[0]) + R[1] * (b.py[k] - b.c[1]) + R[2] * (b.pz[k] - b.c[2]);
            const wy = b.x[1] + R[3] * (b.px[k] - b.c[0]) + R[4] * (b.py[k] - b.c[1]) + R[5] * (b.pz[k] - b.c[2]);
            const sl = Math.max(b.slime(wx, wy), b.chip.hurry > 1 ? 0.6 : 0);
            dd = rate * sl * (1 - 0.5 * clamp01((z - b.rs) / Math.max(P.chipBand, 1e-3))); // the voxels lowest down go first
            if (dd > 0) b.stain[ci] = Math.min(1, b.stain[ci] + dd * 2);
          }
          if (dd <= 0) continue;
          const nd = Math.max(0, d - dd);
          if (d > SOLID && nd <= SOLID) { gone = true; if (!crumb && base + r2[0] * b.px[k] + r2[1] * b.py[k] + r2[2] * b.pz[k] < b.rs + 0.4) held = true; }
          b.d[k] = nd; changed = true;
        }
      }
      if (changed) b.dirty = true;
      if (!gone) continue;
      const n0 = bodies.length + out.length;
      b.props();
      if (!b.m) continue;
      split(b, onSplit, out);
      // It lost something it stood on. Resting, it just sinks onto what is left while it still balances there, and only
      // wakes to tip over when it no longer does; what rests on it wakes to follow it down.
      if (held || bodies.length + out.length > n0) {
        const sank = b.sleep && bodies.length + out.length === n0 ? sink(b) : -1;
        if (sank < 0 || !supported(b)) b.wake();
        if (sank !== 0) nudge(b);
      }
      if (b.solidCols < P.chipCrumbs) { b.crumb.fill(1); b.frozen = true; } // the last bit is just eaten up where it lies
    }
    for (const b of out) bodies.push(b);
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      let any = false;
      for (let k = 0; k < b.d.length && !any; k++) any = b.d[k] > 0.004;
      if (!any) { bodies.splice(i, 1); nudge(b); }
    }
  }
  // Lower a resting body onto the desk by its lowest remaining point; returns how far (-1 if it has nothing to stand on).
  function sink(b) {
    const R = qmat(b.q), sp = b.sp, s = b.samples;
    let lo = Infinity;
    for (let n = 0; n < s.length; n++) if (b.d[s[n]] > SOLID) lo = Math.min(lo, b.x[2] + R[6] * sp[n * 3] + R[7] * sp[n * 3 + 1] + R[8] * sp[n * 3 + 2] - b.rs);
    if (!isFinite(lo)) return -1;
    const dz = Math.max(0, lo);
    b.x[2] -= dz; b.dirty = true;
    return dz;
  }
  // Does a sleeping body still stand where it is: its lowest points touch the desk, and its centre is over them?
  function supported(b) {
    const R = qmat(b.q), sp = b.sp, s = b.samples, pts = [];
    for (let n = 0; n < s.length; n++) {
      if (b.d[s[n]] <= SOLID) continue;
      const x = sp[n * 3], y = sp[n * 3 + 1], z = sp[n * 3 + 2];
      if (b.x[2] + R[6] * x + R[7] * y + R[8] * z - b.rs < 0.25) pts.push([R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z]);
    }
    if (pts.length < 3) return false;
    pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]); // a convex hull (monotone chain), then is the centre (0, 0) inside it with a margin
    const cr = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]), h = [];
    for (const list of [pts, [...pts].reverse()]) { const st = []; for (const p of list) { while (st.length >= 2 && cr(st[st.length - 2], st[st.length - 1], p) <= 0) st.pop(); st.push(p); } st.pop(); h.push(...st); }
    if (h.length < 3) return false;
    for (let i = 0; i < h.length; i++) { const a = h[i], c = h[(i + 1) % h.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; if (cr(a, c, [0, 0]) / l < 1) return false; }
    return true;
  }
  // Wake what might rest on b.
  function nudge(b) {
    for (const o of bodies) if (o !== b && o.sleep && Math.hypot(o.x[0] - b.x[0], o.x[1] - b.x[1], o.x[2] - b.x[2]) < o.bound + b.bound + 2) o.wake();
  }
  function split(b, onSplit, out) {
    const comp = new Int16Array(CN * CN).fill(-1), sizes = [];
    for (let s = 0; s < CN * CN; s++) {
      if (comp[s] >= 0 || !b.colSolid(s) || b.crumb[s]) continue;
      const id = sizes.length, st = [s]; comp[s] = id; let n = 0;
      while (st.length) {
        const c = st.pop(); n++;
        const i = c % CN, j = (c / CN) | 0;
        for (const [a, bb] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
          if (a < 0 || bb < 0 || a >= CN || bb >= CN) continue;
          const nc = bb * CN + a;
          if (comp[nc] < 0 && b.colSolid(nc) && !b.crumb[nc]) { comp[nc] = id; st.push(nc); }
        }
      }
      sizes.push(n);
    }
    if (sizes.length < 2) return;
    const keep = sizes.indexOf(Math.max(...sizes));
    for (let id = 0; id < sizes.length; id++) {
      if (id === keep) continue;
      const big = sizes[id] >= P.chipCrumbs && bodies.length + out.length < NCH;
      let nb = null;
      if (big) { // a piece of its own: the same shape and pose, only its own voxels
        nb = Object.create(Body.prototype);
        Object.assign(nb, { ...b, id: nextId++, d: new Float32Array(b.d.length), crumb: new Uint8Array(CN * CN), stain: b.stain.slice(), x: [...b.x], v: [...b.v], w: [...b.w], q: [...b.q], c: [...b.c], feed: b.feed });
      }
      for (let ci = 0; ci < CN * CN; ci++) {
        if (comp[ci] !== id) continue;
        if (!big) { b.crumb[ci] = 1; continue; }
        for (let l = 0; l < CL; l++) { const k = ci * CL + l; nb.d[k] = b.d[k]; b.d[k] = 0; }
      }
      // what is not part of any piece (partly eaten voxels below SOLID) stays with the body it was in
      if (nb) { nb.props(); nb.wake(); out.push(nb); onSplit?.(nb); }
    }
    b.props();
  }

  function step(dt, { pushers = [], bounds = [-1e9, -1e9, 1e9, 1e9], eatOn = true, onSplit } = {}) {
    if (!bodies.length) return false;
    acc = Math.min(acc + dt, 0.05);
    let any = false;
    while (acc >= STEP) {
      acc -= STEP;
      push(pushers, bounds, STEP);
      if (bodies.some((b) => dyn(b))) { substep(STEP); any = true; }
    }
    eatAcc += eatOn ? dt : 0;
    if (eatAcc >= 0.05) { eat(eatAcc, onSplit); eatAcc = 0; }
    return any;
  }

  // ---------- what the GPU draws ----------
  // The eaten field (r: how much of the column's thickness is left, g: slime stain), dilated one column past the rim so the
  // analytic outline, not the voxels, decides the edge.
  function maskBytes(b, out) {
    const m = new Float32Array(CN * CN);
    for (let ci = 0; ci < CN * CN; ci++) { let s = 0; for (let l = 0; l < CL; l++) s += b.d[ci * CL + l]; m[ci] = s / CL; }
    const S = b.S;
    if (!S.inside) { S.inside = new Uint8Array(CN * CN); for (let ci = 0; ci < CN * CN; ci++) S.inside[ci] = outlineR(S, b.px[ci * CL], b.py[ci * CL]) - Math.hypot(b.px[ci * CL], b.py[ci * CL]) > 0 ? 1 : 0; } // the outline never changes
    const inside = (ci) => S.inside[ci];
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const ci = j * CN + i;
      let v = m[ci];
      if (!inside(ci)) { v = 0; for (const [a, c] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1], [i - 1, j - 1], [i + 1, j + 1], [i - 1, j + 1], [i + 1, j - 1]]) if (a >= 0 && c >= 0 && a < CN && c < CN && inside(c * CN + a)) v = Math.max(v, m[c * CN + a]); }
      out[ci * 4] = Math.round(clamp01(v) * 255); out[ci * 4 + 1] = Math.round(b.stain[ci] * 255); out[ci * 4 + 2] = 0; out[ci * 4 + 3] = 255;
    }
    return out;
  }
  // Screen bounds of a body (desk px): its voxels' box, turned and moved.
  function rect(b) {
    const R = qmat(b.q), [lo, hi] = b.box, pad = b.S.t + b.cell;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const X of [lo[0] - pad, hi[0] + pad]) for (const Y of [lo[1] - pad, hi[1] + pad]) for (const Z of [lo[2] - pad, hi[2] + pad]) {
      const p = b.toWorld(R, [X, Y, Z]); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    return [x0, y0, x1, y1];
  }
  // Its lowest and highest point above the desk, the same way.
  function zspan(b) {
    const R = qmat(b.q), [lo, hi] = b.box, pad = b.S.t;
    let z0 = Infinity, z1 = -Infinity;
    for (const X of [lo[0], hi[0]]) for (const Y of [lo[1], hi[1]]) for (const Z of [lo[2] - pad, hi[2] + pad]) { const z = b.toWorld(R, [X, Y, Z])[2]; z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [Math.max(0, z0), z1];
  }
  return { bodies, drop, step, settle, maskBytes, rect, zspan, qmat, clear: () => { bodies.length = 0; } };
}
