// Potato chips the slime eats. Each chip is a thin curved shell of voxels (CN x CN columns, CL layers through its
// thickness) on a saddle: a rigid body in the desk's one sim (physics.ts) that falls, tumbles, bounces and rocks to rest on
// its curve, bumps other chips, and is thrown with the card box by a page turn. The slime eats only the voxels where it
// touches the desk; as they go, its mass, centre of mass and support are recomputed from what is left, so it tips and
// settles lower until nothing is left. Units: CSS px, seconds; z is height above the desk. The render (chip-render.ts)
// draws the same shape analytically, so the voxels never show.

export const CN = 40, CL = 3, NCH = 12, FEED = 16, DIST = 10; // columns per side, layers, bodies, slime grid size, mask b's range
const NX = [-1, 0, -1, 1, 1, 0, 1, -1], NY = [0, -1, -1, -1, 0, 1, 1, 1], NW = [1, 1, Math.SQRT2, Math.SQRT2, 1, 1, Math.SQRT2, Math.SQRT2]; // a column's 8 neighbours: the 4 before it in scan order, then the 4 after
const SOLID = 0.2; // a voxel holds (and is a contact point) while its density is above this

import type { Body as PBody, World } from './physics.ts';
import { LAND } from './tunables.ts';

// The tunables chips read (desk.ts T); see createChips.
type ChipKey = 'chipCurl' | 'friction' | 'bounce' | 'chipEat';
export type ChipTunables = Record<ChipKey, number>;
const CHIP_MASS = 0.05; // a chip's mass, against the card box's 1 (box.ts)
// A chip's fixed shape and feel; the panel tunes its size, curl and eating speed. Lengths are for a chip of radius 31.
export const CHIP = {
  thick: 2, // thickness px
  fold: 1, // how far its edges curl up
  bend: 0.8, // how gradually its edges curl (chip-render.ts shades the same curve)
  drop: 150, // the height it falls from, px
  spin: 10, // how fast it tumbles as it falls, rad/s
  damp: 16, // its rocking dies at x/s on the desk
  band: 1, // a voxel within this many px of the desk is eaten
  crumbs: 30, // a broken-off piece under this many columns is crumbs
  crumbS: 0.6, // crumbs are eaten in s
};
// A chip's outline and surface (makeShape).
export interface Shape {
  seed: number;
  R: number;
  B: number;
  t: number;
  sag: number;
  bowl: number;
  ca: number;
  sa: number;
  harm: number[];
  warp: number[];
  folds: number[];
  bend: number;
  tone: number;
  hb: number;
  hf: Float32Array; // set by the first body made on it
  inside?: Uint8Array; // set by maskBytes
}
// The chip a body is part of (its pieces share it).
export interface Chip {
  seed: number;
  region: number;
  born: number;
  hurry: number;
  crumbles?: boolean;
}
// The slime under a chip, read back from the GPU (chip-render.ts).
export interface Feed { cx: number; cy: number; h: number; v: Float32Array }
// Where a body's shape is (props): its old body, or a pose to drop it at.
interface Pose { x: ArrayLike<number>; q: ArrayLike<number>; R: Float64Array | null; v?: ArrayLike<number>; w?: ArrayLike<number> }
// A card pushing chips (desk px).
export interface Pusher { x: number; y: number; hw: number; hh: number; c: number; s: number; vx: number; vy: number }

// ---------- shape ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// A chip's outline (radius by angle, a slightly oval, wavy rim) and its surface (a saddle, a little bowl, two slow warps,
// one or two edges folded up).
function makeShape(seed: number, R: number, thick: number, curl: number, fold = 1, bend = 0.8): Shape {
  const r = rng(seed), u = (a: number, b: number) => a + (b - a) * r(), ph = () => r() * 6.2832;
  const harm = [u(0.06, 0.13), ph(), u(0.03, 0.06), ph(), u(0.015, 0.035), ph(), u(0.008, 0.02), ph()];
  const sag = u(0.1, 0.16) * R * curl, bowl = u(-0.03, 0.03) * R * curl, ax = ph();
  const k = 6.2832 / (R * u(1.6, 2.6)), k2 = 6.2832 / (R * u(0.9, 1.4)), a1 = ph(), a2 = ph();
  const warp = [k * Math.cos(a1), k * Math.sin(a1), u(0.25, 0.5) * curl, ph(), k2 * Math.cos(a2), k2 * Math.sin(a2), u(0.1, 0.22) * curl, ph()];
  const B = R * 1.28, tone = r();
  // Its edges curl up: toward the rim past a line (o from the centre, along a direction) the surface bends up gradually,
  // over a width of bend times the distance to the rim, so there is never a crease.
  const folds = [0, 1].flatMap((i) => { const a = ph(), o = u(0.3, 0.6) * R; return [Math.cos(a), Math.sin(a), o, u(i ? 0 : 0.15, 0.32) * R * fold]; });
  const hb = sag + Math.abs(bowl) + warp[2] + warp[6] + folds[3] + folds[7] + thick;
  return { seed, R, B, t: thick, sag, bowl, ca: Math.cos(ax), sa: Math.sin(ax), harm, warp, folds, bend, tone, hb } as Shape; // hf: set by Body
}
function outlineR(S: Shape, x: number, y: number) {
  const th = Math.atan2(y, x), h = S.harm;
  return S.R * (1 + h[0] * Math.cos(2 * th + h[1]) + h[2] * Math.cos(3 * th + h[3]) + h[4] * Math.cos(4 * th + h[5]) + h[6] * Math.cos(5 * th + h[7]));
}
// Height of the mid-surface over (x, y), and its slope.
function surf(S: Shape, x: number, y: number) {
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

// ---------- a body ----------
let nextId = 1;
export class Body {
  // Fields set in the constructor or later (declare: no class field is emitted, so the object is built as before).
  declare S: Shape;
  declare chip: Chip;
  declare id: number;
  declare cell: number;
  declare rs: number;
  declare px: Float32Array;
  declare py: Float32Array;
  declare pz: Float32Array;
  declare d: Float32Array;
  declare crumb: Uint8Array;
  declare stain: Float32Array;
  declare mass0: number;
  declare p: PBody; // its body in the shared sim: set by props once it has voxels
  declare c: number[];
  declare landed: boolean;
  declare dirty: boolean;
  declare cutT: number;
  declare feed: Feed | null;
  declare m: number;
  declare foot: number;
  declare edge: Float32Array;
  declare box: [number[], number[]];
  declare frozen?: boolean;
  declare gone?: boolean;
  declare at?: Float32Array; // contact (touchdown): each column's lowest solid point on the desk, now and the frame before
  declare atWas?: Float32Array;
  declare land?: number[] | null; // the patch that just came down: center, radius (desk px), strength
  constructor(S: Shape, chip: Chip) {
    this.S = S; this.chip = chip; this.id = nextId++;
    const n = CN * CN * CL, cell = (2 * S.B) / CN;
    this.cell = cell; this.rs = S.t / (2 * CL); // a voxel's half thickness
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.d = new Float32Array(n); this.crumb = new Uint8Array(CN * CN); this.stain = new Float32Array(CN * CN);
    this.mass0 = 0; S.hf = new Float32Array(CN * CN * 3); // its surface's height and slope over each column, for what hits it
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const x = -S.B + (i + 0.5) * cell, y = -S.B + (j + 0.5) * cell, inside = outlineR(S, x, y) - Math.hypot(x, y) > 0, f = surf(S, x, y), h = f[0];
      S.hf.set(f, (j * CN + i) * 3);
      for (let l = 0; l < CL; l++) {
        const k = (j * CN + i) * CL + l;
        this.px[k] = x; this.py[k] = y; this.pz[k] = h + ((l + 0.5) / CL - 0.5) * S.t; this.d[k] = inside ? 1 : 0; this.mass0 += this.d[k];
      }
    }
    this.p = null!; this.c = [0, 0, 0]; this.landed = false; this.dirty = true; this.cutT = -1;
    this.feed = null; // the slime under it, read back from the GPU: { cx, cy, h, v: Float32Array(FEED * FEED) }
  }
  // Its pose and motion are its body's in the shared sim (physics.ts).
  get x() { return this.p.x; } get q() { return this.p.q; } get R() { return this.p.R; } get v() { return this.p.v; } get w() { return this.p.w; } get sleep() { return this.p.sleep; }
  // Mass, centre of mass, inertia and contact points from the voxels that are left, and its body in the shared sim made
  // again from them where `from` (its old body) was, so the shape stays where it is.
  props(world: World, P: ChipTunables, from: Pose = this.p) {
    const { px, py, pz, d } = this;
    let m = 0, sx = 0, sy = 0, sz = 0;
    for (let k = 0; k < d.length; k++) { const w = d[k]; if (w <= 0) continue; m += w; sx += w * px[k]; sy += w * py[k]; sz += w * pz[k]; }
    this.m = m;
    if (m < 1e-6) return;
    const c = [sx / m, sy / m, sz / m];
    let xx = 0, yy = 0, zz = 0, foot = 0;
    for (let k = 0; k < d.length; k++) {
      const w = d[k]; if (w <= 0) continue;
      const rx = px[k] - c[0], ry = py[k] - c[1], rz = pz[k] - c[2];
      xx += w * rx * rx; yy += w * ry * ry; zz += w * rz * rz;
      if (w > SOLID) foot = Math.max(foot, rx * rx + ry * ry);
    }
    this.foot = Math.sqrt(foot) + this.cell * 0.5;
    // Contact points: the outer faces of the rim's columns, and of every third column inside it.
    const solid = Uint8Array.from({ length: CN * CN }, (_, ci) => +this.colSolid(ci));
    // Its rim, for what hits it side on: each column's distance out past the edge of the solid ones (inside: negative), px.
    const din = chamfer(Float32Array.from(solid, (s) => (s ? 1e9 : 0))), dout = chamfer(Float32Array.from(solid, (s) => (s ? 0 : 1e9)));
    this.edge = Float32Array.from(solid, (s, ci) => (s ? 0.5 - din[ci] : dout[ci] - 0.5) * this.cell);
    const col = (i: number, j: number) => i >= 0 && j >= 0 && i < CN && j < CN && solid[j * CN + i];
    const pts: number[] = [], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], xyz = [px, py, pz];
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      if (!col(i, j)) continue;
      const rim = !col(i - 1, j) || !col(i + 1, j) || !col(i, j - 1) || !col(i, j + 1);
      for (let l = 0; l < CL; l++) {
        const k = (j * CN + i) * CL + l;
        if (d[k] <= SOLID) continue;
        if ((l === 0 || l === CL - 1) && (rim || (i % 3 === 0 && j % 3 === 0))) pts.push(px[k] - c[0], py[k] - c[1], pz[k] - c[2] + (l ? this.rs : -this.rs));
        for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], xyz[a][k]); hi[a] = Math.max(hi[a], xyz[a][k]); }
      }
    }
    if (!pts.length) return this.freeze(world); // nothing left to stand on: it stays put while the last of it goes
    this.box = [lo, hi]; this.dirty = true;
    const R = from.R, dc = c.map((v, i) => v - this.c[i]), x = R ? [0, 3, 6].map((r, i) => from.x[i] + R[r] * dc[0] + R[r + 1] * dc[1] + R[r + 2] * dc[2]) : from.x;
    if (this.p) world.remove(this.p);
    this.c = c;
    const s = CHIP_MASS / this.mass0, e = (m * this.cell * this.cell) / 6; // e: each voxel's own spread
    this.p = world.add({ points: pts, bound: Math.hypot(...[0, 1, 2].map((i) => Math.max(Math.abs(lo[i] - c[i]), Math.abs(hi[i] - c[i])))) + this.cell, sdf: (io: Float64Array) => this.sdf(io),
      mass: m * s, inertia: [(yy + zz + e) * s, (xx + zz + e) * s, (xx + yy + 2 * e) * s], friction: P.friction, bounce: P.bounce, damp: CHIP.damp, x, q: from.q, v: from.v, w: from.w });
  }
  // Out of the sim: it stays where it is while the last of it is eaten.
  freeze(world: World) { if (this.p && !this.frozen) { this.p.v.fill(0); this.p.w.fill(0); this.p.sleep = true; world.remove(this.p); } this.frozen = true; }
  // Its shell, for what hits it: a point in its body's frame in, out its normal and distance (physics.ts's sdf). Its
  // surface and rim between the columns' centres, bilinear (it is called for every point near it, every step); a point
  // nearer the rim than either face goes out through the rim, so what comes at it edge on meets the edge.
  sdf(io: Float64Array) {
    const S = this.S, u = (io[0] + this.c[0] + S.B) / this.cell - 0.5, v = (io[1] + this.c[1] + S.B) / this.cell - 0.5;
    if (u < -0.5 || v < -0.5 || u >= CN - 0.5 || v >= CN - 0.5) { io[3] = Infinity; return; }
    const i = Math.min(CN - 2, Math.max(0, Math.floor(u))), j = Math.min(CN - 2, Math.max(0, Math.floor(v))), a = clamp01(u - i), b = clamp01(v - j);
    const w0 = (1 - a) * (1 - b), w1 = a * (1 - b), w2 = (1 - a) * b, w3 = a * b, n = j * CN + i, E = this.edge, e0 = E[n], e1 = E[n + 1], e2 = E[n + CN], e3 = E[n + CN + 1];
    const H = S.hf, k = n * 3, k1 = k + 3, k2 = k + CN * 3, k3 = k2 + 3;
    const hx = w0 * H[k + 1] + w1 * H[k1 + 1] + w2 * H[k2 + 1] + w3 * H[k3 + 1], hy = w0 * H[k + 2] + w1 * H[k1 + 2] + w2 * H[k2 + 2] + w3 * H[k3 + 2];
    const dz = io[2] + this.c[2] - (w0 * H[k] + w1 * H[k1] + w2 * H[k2] + w3 * H[k3]), s = io[3] || (dz < 0 ? -1 : 1), l = Math.sqrt(hx * hx + hy * hy + 1), d = (s * dz) / l - S.t / 2;
    const e = w0 * e0 + w1 * e1 + w2 * e2 + w3 * e3;
    if (e > d) { const ex = (1 - b) * (e1 - e0) + b * (e3 - e2), ey = (1 - a) * (e2 - e0) + a * (e3 - e1), el = Math.hypot(ex, ey) || 1; io[0] = ex / el; io[1] = ey / el; io[2] = 0; io[3] = e; return; }
    io[0] = (-hx / l) * s; io[1] = (-hy / l) * s; io[2] = s / l; io[3] = d;
  }
  colSolid(ci: number) { for (let l = 0; l < CL; l++) if (this.d[ci * CL + l] > SOLID) return true; return false; }
  get solidCols() { let n = 0; for (let ci = 0; ci < CN * CN; ci++) if (this.colSolid(ci)) n++; return n; }
  // A body-frame point to the world.
  toWorld(R: Float64Array, p: number[]) { const x = p[0] - this.c[0], y = p[1] - this.c[1], z = p[2] - this.c[2]; return [0, 3, 6].map((r, i) => this.x[i] + R[r] * x + R[r + 1] * y + R[r + 2] * z); }
  // The slime under a desk point (0 to 1), from the last read-back.
  slime(x: number, y: number) {
    const f = this.feed;
    if (!f) return 0;
    const u = clamp01((x - f.cx + f.h) / (2 * f.h)) * FEED - 0.5, v = clamp01((y - f.cy + f.h) / (2 * f.h)) * FEED - 0.5;
    const i = Math.max(0, Math.min(FEED - 2, Math.floor(u))), j = Math.max(0, Math.min(FEED - 2, Math.floor(v))), a = clamp01(u - i), b = clamp01(v - j), g = f.v;
    return (g[j * FEED + i] * (1 - a) + g[j * FEED + i + 1] * a) * (1 - b) + (g[(j + 1) * FEED + i] * (1 - a) + g[(j + 1) * FEED + i + 1] * a) * b;
  }
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// D (per column: 0 where a distance starts, else large) becomes each column's distance, in columns, to the nearest start:
// two chamfer passes, forward from the neighbours before, back from those after.
function chamfer(D: Float32Array) {
  for (let p = 0; p < 2; p++) for (let n = 0; n < D.length; n++) {
    const k = p ? D.length - 1 - n : n, i = k % CN, j = (k - i) / CN;
    for (let q = p * 4; q < p * 4 + 4; q++) { const x = i + NX[q], y = j + NY[q]; if (x >= 0 && y >= 0 && x < CN && y < CN) D[k] = Math.min(D[k], D[y * CN + x] + NW[q]); }
  }
  return D;
}

// ---------- the chips ----------
// P: the tunables (desk.ts T): bounce and friction (the box's too), chipCurl its curl, chipEat eating speed.
// world: () => the shared sim (physics.ts) they fall, tumble and are thrown in.
export type Chips = ReturnType<typeof createChips>;
export function createChips(P: ChipTunables, world: () => World) {
  const bodies: Body[] = [];
  let clock = 0;

  function drop(x: number, y: number, R: number, seed: number, { region = 0, born = 0, still = false }: { region?: number; born?: number; still?: boolean } = {}) {
    const r = rng(seed ^ 0x51ed), W = world();
    const S = makeShape(seed, R, CHIP.thick * (R / 31), P.chipCurl, CHIP.fold, CHIP.bend);
    const b = new Body(S, { seed, region, born, hurry: 1 });
    const tilt = (r() - 0.5) * 2 * 0.6, yaw = r() * 6.2832, ax = r() * 6.2832; // tipped about a level axis, then turned
    b.props(W, P, { x: [x, y, CHIP.drop * (R / 31) + S.hb], q: [Math.cos(tilt / 2) * Math.cos(yaw / 2), Math.sin(tilt / 2) * Math.cos(ax), Math.sin(tilt / 2) * Math.sin(ax), Math.cos(tilt / 2) * Math.sin(yaw / 2)], R: null });
    const spin = (0.5 + r()) * CHIP.spin, sa = r() * 6.2832;
    b.w.set([Math.cos(sa) * spin, Math.sin(sa) * spin, (r() - 0.5) * 6]);
    b.v.set([(r() - 0.5) * 40, (r() - 0.5) * 40, 0]);
    bodies.push(b);
    if (still) { // reduced motion: it appears where it comes to rest, without being seen to fall
      b.v.fill(0); b.w.fill(0); b.x[2] = S.hb + 1;
      for (let i = 0; i < W.hz * 6 && !b.sleep; i++) W.advance(W.time + 1 / W.hz);
      b.landed = true;
    }
    return b;
  }

  // ---------- eating ----------
  // Voxels within CHIP.band of the desk are eaten where the slime is; a voxel that gives way changes the body's mass,
  // centre and support, so it tips and settles lower. A body that comes apart becomes two (the crumbs are just eaten up).
  // The voxels are eaten every frame, so the edge creeps; remaking a body (props, split) is the costly part, so one body a
  // frame is remade, the one waiting longest, and a body at most every 0.05 s.
  function eat(dt: number) {
    const out: Body[] = [], W = world();
    let cut: Body | null = null;
    for (const b of bodies) {
      if (!b.m) continue;
      const R = b.R, c = b.c, base = b.x[2] - (R[6] * c[0] + R[7] * c[1] + R[8] * c[2]);
      const rate = P.chipEat * b.chip.hurry * dt, band = CHIP.band + b.rs;
      let changed = false;
      for (let ci = 0; ci < CN * CN; ci++) {
        const crumb = b.crumb[ci];
        for (let l = 0; l < CL; l++) {
          const k = ci * CL + l, d = b.d[k];
          if (d <= 0) continue;
          let dd = 0;
          if (crumb) dd = dt / Math.max(0.05, CHIP.crumbS);
          else {
            const z = base + R[6] * b.px[k] + R[7] * b.py[k] + R[8] * b.pz[k];
            if (z > band || !b.landed) continue;
            const lx = b.px[k] - c[0], ly = b.py[k] - c[1], lz = b.pz[k] - c[2];
            const sl = Math.max(b.slime(b.x[0] + R[0] * lx + R[1] * ly + R[2] * lz, b.x[1] + R[3] * lx + R[4] * ly + R[5] * lz), b.chip.hurry > 1 ? 0.6 : 0);
            dd = rate * sl * (1 - 0.5 * clamp01((z - b.rs) / Math.max(CHIP.band, 1e-3))); // the voxels lowest down go first
            if (dd > 0) b.stain[ci] = Math.min(1, b.stain[ci] + dd * 2);
          }
          if (dd <= 0) continue;
          const nd = Math.max(0, d - dd);
          if (d > SOLID && nd <= SOLID) b.gone = true;
          b.d[k] = nd; changed = true;
        }
      }
      if (changed) b.dirty = true;
      if (b.gone && !b.frozen && clock - b.cutT >= 0.05 && !(cut && cut.cutT <= b.cutT)) cut = b;
    }
    if (cut) {
      cut.gone = false; cut.cutT = clock;
      split(cut, out);
      cut.props(W, P);
      if (cut.m && cut.solidCols < CHIP.crumbs) { cut.crumb.fill(1); cut.freeze(W); } // the last bit is just eaten up where it lies
    }
    bodies.push(...out);
    for (const b of bodies.filter((b) => !b.d.some((v) => v > 0.004))) remove(b);
  }
  function split(b: Body, out: Body[]) {
    const comp = new Int16Array(CN * CN).fill(-1), sizes: number[] = [];
    for (let s = 0; s < CN * CN; s++) {
      if (comp[s] >= 0 || !b.colSolid(s) || b.crumb[s]) continue;
      const id = sizes.length, st = [s]; comp[s] = id; let n = 0;
      while (st.length) {
        const c = st.pop()!; n++;
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
      const big = sizes[id] >= CHIP.crumbs && bodies.length + out.length < NCH;
      let nb: Body | null = null;
      if (big) { // a piece of its own: the same shape and pose, only its own voxels
        nb = Object.create(Body.prototype) as Body;
        Object.assign(nb, { ...b, id: nextId++, p: null, d: new Float32Array(b.d.length), crumb: new Uint8Array(CN * CN), stain: b.stain.slice(), c: [...b.c] });
      }
      for (let ci = 0; ci < CN * CN; ci++) {
        if (comp[ci] !== id) continue;
        if (!big) { b.crumb[ci] = 1; continue; }
        for (let l = 0; l < CL; l++) { const k = ci * CL + l; nb!.d[k] = b.d[k]; b.d[k] = 0; }
      }
      // what is not part of any piece (partly eaten voxels below SOLID) stays with the body it was in
      if (nb) { nb.props(world(), P, b.p); if (nb.p) out.push(nb); }
    }
    if (out.length) b.id = nextId++; // a new id draws it afresh in the frame its pieces first show, so no piece shows twice
  }
  function remove(b: Body) { world().remove(b.p); bodies.splice(bodies.indexOf(b), 1); }

  // Cards (pushers: { x, y, hw, hh, c, s, vx, vy } in desk px) shove the chips down on the desk out from under them, at least
  // as fast as the card moves. A chip's pushes add, so one wedged between two cards settles where they balance.
  function push(pushers: Pusher[]) {
    for (const b of bodies) {
      const r = b.foot;
      if (b.frozen || b.x[2] - b.S.hb > r * 0.5) continue;
      let tx = 0, ty = 0;
      for (const p of pushers) {
        const dx = b.x[0] - p.x, dy = b.x[1] - p.y, lx = dx * p.c + dy * p.s, ly = -dx * p.s + dy * p.c;
        const cx = Math.max(-p.hw, Math.min(p.hw, lx)), cy = Math.max(-p.hh, Math.min(p.hh, ly)), ex = p.hw - Math.abs(lx), ey = p.hh - Math.abs(ly);
        const d = Math.hypot(lx - cx, ly - cy), under = !d; // under: out through the nearest edge
        if (!under && d >= r * 0.92) continue;
        const [nx, ny, pen] = !under ? [(lx - cx) / d, (ly - cy) / d, r * 0.92 - d] : ex < ey ? [Math.sign(lx) || 1, 0, ex + r] : [0, Math.sign(ly) || 1, ey + r];
        const wx = nx * p.c - ny * p.s, wy = nx * p.s + ny * p.c, want = Math.max(p.vx * wx + p.vy * wy, Math.min(pen * 10, 260));
        if (b.sleep && p.vx * wx + p.vy * wy < 2) continue; // asleep (wedged against the rest), only a card moving into it moves it
        tx += wx * want; ty += wy * want;
      }
      const t = Math.hypot(tx, ty), dv = t - (b.v[0] * tx + b.v[1] * ty) / (t || 1);
      if (t < 2 || dv <= 0) continue;
      b.v[0] += (tx / t) * dv; b.v[1] += (ty / t) * dv; b.p.sleep = false;
    }
  }

  // Contact, the cards' rule (desk.ts contact) on the part of it that has just come within CHIP.band of the desk: that patch
  // lands with the motion it sheds there, (LAND.wn x coming down + along) / LAND.p. A rocking chip lands strip by strip as
  // its curve rolls down; a slide or a lift brings no new part down, so it pushes no slime.
  function touchdown(b: Body, dt: number) {
    const R = b.R, c = b.c, band = CHIP.band + b.rs, was = b.at, at = b.at = b.atWas || new Float32Array(CN * CN * 3);
    let n = 0, sx = 0, sy = 0, vn = 0, vt = 0;
    b.atWas = was;
    for (let ci = 0, o = 0; ci < CN * CN; ci++, o += 3) { // each column's lowest voxel that holds, on the desk (desk px)
      let lo = -1, z = Infinity;
      for (let k = ci * CL; k < ci * CL + CL; k++) {
        const zk = R[6] * (b.px[k] - c[0]) + R[7] * (b.py[k] - c[1]) + R[8] * (b.pz[k] - c[2]);
        if (b.d[k] > SOLID && zk < z) { z = zk; lo = k; }
      }
      at[o + 2] = b.x[2] + z;
      if (lo < 0) continue;
      const lx = b.px[lo] - c[0], ly = b.py[lo] - c[1], lz = b.pz[lo] - c[2];
      at[o] = b.x[0] + R[0] * lx + R[1] * ly + R[2] * lz; at[o + 1] = b.x[1] + R[3] * lx + R[4] * ly + R[5] * lz;
      if (!was || at[o + 2] > band || was[o + 2] <= band) continue; // only a part that has just come down
      n++; sx += at[o]; sy += at[o + 1]; vn += Math.max(0, was[o + 2] - at[o + 2]) / dt; vt += Math.hypot(at[o] - was[o], at[o + 1] - was[o + 1]) / dt;
    }
    if (n) b.land = [sx / n, sy / n, Math.sqrt(n / Math.PI) * b.cell, Math.min(1, (LAND.wn * vn + vt) / n / LAND.p)]; // center, radius (desk px), strength
  }

  // After the sim has advanced: a chip's first touch is its landing (contact); then eating.
  function step(dt: number, eatOn: boolean) {
    for (const b of bodies) {
      if (b.frozen || b.sleep) continue;
      if (b.p.touch) b.landed = true;
      touchdown(b, dt);
    }
    clock += dt;
    if (eatOn) eat(dt);
  }

  // ---------- what the GPU draws ----------
  // The eaten field (r: how much of the column's thickness is left, g: slime stain, b: how far past what is left, in DIST
  // columns), r dilated one column past the rim so the analytic outline, not the voxels, decides the edge. b makes the
  // eaten edge a true distance, so the soft shadow fades away from it instead of veiling the eaten part.
  function maskBytes(b: Body, out: Uint8Array<ArrayBuffer>) {
    const N = CN * CN, m = new Float32Array(N), D = new Float32Array(N), S = b.S;
    if (!S.inside) { S.inside = new Uint8Array(N); for (let ci = 0; ci < N; ci++) S.inside[ci] = outlineR(S, b.px[ci * CL], b.py[ci * CL]) - Math.hypot(b.px[ci * CL], b.py[ci * CL]) > 0 ? 1 : 0; } // the outline never changes
    for (let ci = 0; ci < N; ci++) { let s = 0; for (let l = 0; l < CL; l++) s += b.d[ci * CL + l]; m[ci] = s / CL; D[ci] = m[ci] >= 0.5 && S.inside[ci] ? 0 : 1e9; }
    chamfer(D);
    for (let ci = 0; ci < N; ci++) {
      const i = ci % CN, j = (ci - i) / CN;
      let v = m[ci];
      if (!S.inside[ci]) { v = 0; for (let q = 0; q < 8; q++) { const x = i + NX[q], y = j + NY[q]; if (x >= 0 && y >= 0 && x < CN && y < CN && S.inside[y * CN + x]) v = Math.max(v, m[y * CN + x]); } }
      out[ci * 4] = Math.round(clamp01(v) * 255); out[ci * 4 + 1] = Math.round(b.stain[ci] * 255); out[ci * 4 + 2] = Math.round(clamp01((D[ci] - 1) / DIST) * 255); out[ci * 4 + 3] = 255;
    }
    return out;
  }
  // Screen bounds of a body (desk px): its voxels' box, turned and moved.
  function rect(b: Body) {
    const R = b.R, [lo, hi] = b.box, pad = b.S.t + b.cell;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const X of [lo[0] - pad, hi[0] + pad]) for (const Y of [lo[1] - pad, hi[1] + pad]) for (const Z of [lo[2] - pad, hi[2] + pad]) {
      const p = b.toWorld(R, [X, Y, Z]); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    return [x0, y0, x1, y1];
  }
  // Its lowest and highest point above the desk, the same way.
  function zspan(b: Body) {
    const R = b.R, [lo, hi] = b.box, pad = b.S.t;
    let z0 = Infinity, z1 = -Infinity;
    for (const X of [lo[0], hi[0]]) for (const Y of [lo[1], hi[1]]) for (const Z of [lo[2] - pad, hi[2] + pad]) { const z = b.toWorld(R, [X, Y, Z])[2]; z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [Math.max(0, z0), z1];
  }
  return { bodies, drop, step, push, remove, maskBytes, rect, zspan, clear: () => { while (bodies.length) remove(bodies[0]); } };
}
