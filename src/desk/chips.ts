// Potato chips the slime eats. Each chip is a thin curved shell on a saddle, CN x CN columns across, each column the slab
// of its thickness that is left (lo to hi, 0 its underside to 1 its top): a rigid body in the desk's one sim (physics.ts)
// that falls, tumbles, bounces and rocks to rest on its curve, bumps other chips, and is thrown with the card box by a page
// turn. The slime eats a column's slab from whichever face is on the desk; as it goes, its mass, centre of mass and
// support are recomputed from what is left, so it tips and settles lower until nothing is left. Units: CSS px, seconds; z
// is height above the desk. The render (chip-render.ts) draws the same shape analytically, so the columns never show.

export const CN = 40, NCH = 12, FEED = 16, DIST = 10; // columns per side, bodies, slime grid size, mask b's range
const NX = [-1, 0, -1, 1, 1, 0, 1, -1], NY = [0, -1, -1, -1, 0, 1, 1, 1], NW = [1, 1, Math.SQRT2, Math.SQRT2, 1, 1, Math.SQRT2, Math.SQRT2]; // a column's 8 neighbours: the 4 before it in scan order, then the 4 after
const SOLID = 0.07; // a column holds (and is a contact point) while more than this share of its thickness is left
const STEP = 1 / 3; // its shape is remade each time a column loses this share of its thickness (or gives way)
const BITE = 0.375; // the share of its thickness a face loses per second at eating speed 1 on full slime
const RIM = 12; // directions its contact points are found in (props)
const EAT_HZ = 15; // times a second the chips are eaten (and their eaten edge redrawn)

import type { Body as PBody, World } from './physics.ts';
import { touchdown } from './tunables.ts';

// The tunables chips read (desk.ts T); see createChips.
type ChipKey = 'chipCurl' | 'friction' | 'bounce' | 'chipEat' | 'chipBand' | 'landH';
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
  inside: Uint8Array; // set by the first body made on it
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
  declare px: Float32Array; // each column's centre (body frame, before the centre of mass is taken off)
  declare py: Float32Array;
  declare lo: Float32Array; // the slab of each column's thickness that is left, 0 its underside to 1 its top (lo = hi: none)
  declare hi: Float32Array;
  declare lo0: Float32Array; declare hi0: Float32Array; // each column's slab at the last remake (props): what it stands on
  declare crumb: Uint8Array;
  declare stain: Float32Array;
  declare mass0: number;
  declare p: PBody; // its body in the shared sim: set by props once it has columns
  declare c: number[];
  declare landed: boolean;
  declare dirty: boolean;
  declare cutT: number; declare ate: number; // when it was last remade, and last eaten (s)
  declare feed: Feed | null;
  declare m: number;
  declare foot: number;
  declare mid: number; declare half: number; // its slabs' live bounds through, about its mid-surface: middle, half thickness (sdf)
  declare box: [number[], number[]];
  declare frozen?: boolean;
  declare gone?: boolean;
  declare at?: Float32Array; // contact (touchdown): each column's lowest solid point on the desk, now and the frame before
  declare atWas?: Float32Array;
  declare armed?: Uint8Array; // touchdown: which columns may land
  declare land?: number[] | null; // the patch that just came down: center, radius (desk px), strength
  constructor(S: Shape, chip: Chip) {
    this.S = S; this.chip = chip; this.id = nextId++;
    const n = CN * CN, cell = (2 * S.B) / CN;
    this.cell = cell;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.lo = new Float32Array(n); this.hi = new Float32Array(n);
    this.crumb = new Uint8Array(n); this.stain = new Float32Array(n);
    S.hf = new Float32Array(n * 3); // its surface's height and slope over each column, for what hits it
    S.inside = new Uint8Array(n); // its outline, which never changes (maskBytes)
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const ci = j * CN + i, x = -S.B + (i + 0.5) * cell, y = -S.B + (j + 0.5) * cell, inside = outlineR(S, x, y) - Math.hypot(x, y) > 0;
      S.hf.set(surf(S, x, y), ci * 3); S.inside[ci] = +inside;
      this.px[ci] = x; this.py[ci] = y; this.hi[ci] = +inside;
    }
    this.lo0 = this.lo.slice(); this.hi0 = this.hi.slice(); this.mass0 = this.hi.reduce((a, v) => a + v, 0);
    this.p = null!; this.c = [0, 0, 0]; this.landed = false; this.dirty = true; this.cutT = -1;
    this.feed = null; // the slime under it, read back from the GPU: { cx, cy, h, v: Float32Array(FEED * FEED) }
  }
  // Its pose and motion are its body's in the shared sim (physics.ts).
  get x() { return this.p.x; } get q() { return this.p.q; } get R() { return this.p.R; } get v() { return this.p.v; } get w() { return this.p.w; } get sleep() { return this.p.sleep; }
  // Mass, centre of mass, inertia and contact points from the slabs that are left, and its body in the shared sim made
  // again from them where `from` (its old body) was, so the shape stays where it is.
  props(world: World, P: ChipTunables, from: Pose = this.p) {
    const { px, py, lo, hi } = this, H = this.S.hf, t = this.S.t, n = CN * CN;
    const mz = (ci: number) => H[ci * 3] + ((lo[ci] + hi[ci]) / 2 - 0.5) * t; // the middle of a column's slab
    let m = 0, sx = 0, sy = 0, sz = 0;
    for (let ci = 0; ci < n; ci++) { const w = hi[ci] - lo[ci]; if (w <= 0) continue; m += w; sx += w * px[ci]; sy += w * py[ci]; sz += w * mz(ci); }
    this.m = m;
    this.lo0.set(lo); this.hi0.set(hi);
    if (m < 1e-6) return;
    const c = [sx / m, sy / m, sz / m];
    let xx = 0, yy = 0, zz = 0, foot = 0;
    for (let ci = 0; ci < n; ci++) {
      const w = hi[ci] - lo[ci]; if (w <= 0) continue;
      const rx = px[ci] - c[0], ry = py[ci] - c[1], rz = mz(ci) - c[2];
      xx += w * rx * rx; yy += w * ry * ry; zz += w * (rz * rz + (w * t) ** 2 / 12); // a slab's own spread through its thickness
      if (w > SOLID) foot = Math.max(foot, rx * rx + ry * ry);
    }
    this.foot = Math.sqrt(foot) + this.cell * 0.5;
    // What hits it meets a thin cylinder about its centre of mass, its foot across and its slabs' live bounds through (sdf).
    // What it stands on meets its real surface at a few points: the solid column furthest out in each of RIM directions and
    // the one nearest its centre, each at its underside and top, so a saddle still rocks on its curve as it is eaten.
    let slo = 1, shi = 0;
    const blo = [Infinity, Infinity, Infinity], bhi = [-Infinity, -Infinity, -Infinity], far = new Float64Array(RIM + 1).fill(-Infinity), at = new Int32Array(RIM + 1).fill(-1);
    for (let ci = 0; ci < n; ci++) {
      if (!this.colSolid(ci)) continue;
      const z0 = H[ci * 3] + (lo[ci] - 0.5) * t, z1 = H[ci * 3] + (hi[ci] - 0.5) * t, rx = px[ci] - c[0], ry = py[ci] - c[1]; // its underside and top
      blo[0] = Math.min(blo[0], px[ci]); blo[1] = Math.min(blo[1], py[ci]); blo[2] = Math.min(blo[2], z0);
      bhi[0] = Math.max(bhi[0], px[ci]); bhi[1] = Math.max(bhi[1], py[ci]); bhi[2] = Math.max(bhi[2], z1);
      slo = Math.min(slo, lo[ci]); shi = Math.max(shi, hi[ci]);
      for (let k = 0; k <= RIM; k++) {
        const f = k < RIM ? rx * Math.cos((2 * Math.PI * k) / RIM) + ry * Math.sin((2 * Math.PI * k) / RIM) : -(rx * rx + ry * ry);
        if (f > far[k]) { far[k] = f; at[k] = ci; }
      }
    }
    const pts: number[] = [];
    for (const ci of new Set(at)) if (ci >= 0) for (const f of [lo[ci], hi[ci]]) pts.push(px[ci] - c[0], py[ci] - c[1], H[ci * 3] + (f - 0.5) * t - c[2]);
    this.mid = ((slo + shi) / 2 - 0.5) * t; this.half = ((shi - slo) / 2) * t;
    if (!pts.length) return this.freeze(world); // nothing left to stand on: it stays put while the last of it goes
    this.box = [blo, bhi]; this.dirty = true;
    const R = from.R, dc = c.map((v, i) => v - this.c[i]), x = R ? [0, 3, 6].map((r, i) => from.x[i] + R[r] * dc[0] + R[r + 1] * dc[1] + R[r + 2] * dc[2]) : from.x;
    if (this.p) world.remove(this.p);
    this.c = c;
    const s = CHIP_MASS / this.mass0, e = (m * this.cell * this.cell) / 6; // e: each column's own spread across
    this.p = world.add({ points: pts, bound: Math.hypot(this.foot, Math.max(c[2] - blo[2], bhi[2] - c[2])), sdf: (io: Float64Array) => this.sdf(io),
      mass: m * s, inertia: [(yy + zz + e) * s, (xx + zz + e) * s, (xx + yy + 2 * e) * s], friction: P.friction, bounce: P.bounce, damp: CHIP.damp, x, q: from.q, v: from.v, w: from.w });
  }
  // Out of the sim: it stays where it is while the last of it is eaten.
  freeze(world: World) { if (this.p && !this.frozen) { this.p.v.fill(0); this.p.w.fill(0); this.p.sleep = true; world.remove(this.p); } this.frozen = true; }
  // What hits it meets a thin cylinder (physics.ts's sdf), its faces bent to its surface: out to its foot, and through
  // its slabs' live bounds about its mid-surface (bilinear between the columns' centres). A point in its body's frame in,
  // out its normal and distance. Through a face, the side it came from (io[3]) holds, so a point pushed in past the
  // middle goes back out its own side.
  sdf(io: Float64Array) {
    const S = this.S, H = S.hf, x = io[0], y = io[1], r = Math.sqrt(x * x + y * y), ux = r ? x / r : 1, uy = r ? y / r : 0;
    const u = Math.min(CN - 1, Math.max(0, (x + this.c[0] + S.B) / this.cell - 0.5)), v = Math.min(CN - 1, Math.max(0, (y + this.c[1] + S.B) / this.cell - 0.5));
    const i = Math.min(CN - 2, Math.floor(u)), j = Math.min(CN - 2, Math.floor(v)), a = u - i, b = v - j;
    const w0 = (1 - a) * (1 - b), w1 = a * (1 - b), w2 = (1 - a) * b, w3 = a * b, k = (j * CN + i) * 3, k1 = k + 3, k2 = k + CN * 3, k3 = k2 + 3;
    const hx = w0 * H[k + 1] + w1 * H[k1 + 1] + w2 * H[k2 + 1] + w3 * H[k3 + 1], hy = w0 * H[k + 2] + w1 * H[k1 + 2] + w2 * H[k2 + 2] + w3 * H[k3 + 2];
    const dz = io[2] + this.c[2] - (w0 * H[k] + w1 * H[k1] + w2 * H[k2] + w3 * H[k3]) - this.mid, l = Math.sqrt(hx * hx + hy * hy + 1);
    const s = io[3] || (dz < 0 ? -1 : 1), qr = r - this.foot, qz = (s * dz) / l - this.half, fx = (-hx / l) * s, fy = (-hy / l) * s, fz = s / l;
    if (qr > 0 || qz > 0) {
      const p = Math.max(qr, 0), q = Math.max(qz, 0), d = Math.sqrt(p * p + q * q);
      io[0] = (p * ux + q * fx) / d; io[1] = (p * uy + q * fy) / d; io[2] = (q * fz) / d; io[3] = d;
    } else if (qr > qz) { io[0] = ux; io[1] = uy; io[2] = 0; io[3] = qr; }
    else { io[0] = fx; io[1] = fy; io[2] = fz; io[3] = qz; }
  }
  colSolid(ci: number) { return this.hi[ci] - this.lo[ci] > SOLID; }
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
// How far (x, y) is outside a card (desk px; < 0 inside).
function cardSd(p: Pusher, x: number, y: number) {
  const dx = x - p.x, dy = y - p.y, qx = Math.abs(dx * p.c + dy * p.s) - p.hw, qy = Math.abs(-dx * p.s + dy * p.c) - p.hh;
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0);
}
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
    const b = new Body(S, { seed, region, born, hurry: 1 }); b.ate = clock;
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
  // Faces within chipBand of the desk are eaten where the slime is; a column that wears down or gives way changes the
  // body's mass, centre and support, so it tips and settles lower. A body that comes apart becomes two (the crumbs are just
  // eaten up). Each body is eaten EAT_HZ times a second, in steps too small to see, so the edge creeps; the bodies take
  // turns, so no frame eats them all. Remaking a body (props, split) is the costly part, so one body a frame is remade, the
  // one waiting longest, and a body at most every 0.05 s.
  function eat(dt: number) {
    const out: Body[] = [], W = world();
    const due = bodies.filter((b) => b.m && clock - b.ate >= 1 / EAT_HZ).sort((a, b) => a.ate - b.ate).slice(0, Math.ceil(bodies.length * dt * EAT_HZ));
    for (const b of due) {
      const dt = clock - b.ate; b.ate = clock;
      const R = b.R, c = b.c, base = b.x[2] - (R[6] * c[0] + R[7] * c[1] + R[8] * c[2]);
      const rate = P.chipEat * BITE * b.chip.hurry * dt, H = b.S.hf, t = b.S.t, { lo, hi, lo0, hi0 } = b;
      let changed = false;
      for (let ci = 0; ci < CN * CN; ci++) {
        const w = hi[ci] - lo[ci];
        if (w <= 0) continue;
        let dd = 0, under = true; // under: it is eaten from its underside (else from its top, when that is on the desk)
        if (b.crumb[ci]) dd = dt / Math.max(0.05, CHIP.crumbS);
        else {
          if (!b.landed) continue;
          const zc = base + R[6] * b.px[ci] + R[7] * b.py[ci], z0 = zc + R[8] * (H[ci * 3] + (lo0[ci] - 0.5) * t), z1 = zc + R[8] * (H[ci * 3] + (hi0[ci] - 0.5) * t);
          const z = Math.min(z0, z1); // the faces it stands on, until it settles on what is left
          if (z > P.chipBand) continue;
          under = z0 <= z1;
          const lx = b.px[ci] - c[0], ly = b.py[ci] - c[1], lz = H[ci * 3] - c[2];
          const sl = Math.max(b.slime(b.x[0] + R[0] * lx + R[1] * ly + R[2] * lz, b.x[1] + R[3] * lx + R[4] * ly + R[5] * lz), b.chip.hurry > 1 ? 0.6 : 0);
          dd = rate * sl * (1 - 0.5 * clamp01(z / Math.max(P.chipBand, 1e-3))); // the parts lowest down go first
          if (dd > 0) b.stain[ci] = Math.min(1, b.stain[ci] + (dd / BITE) * 2);
        }
        if (dd <= 0) continue;
        if (under) lo[ci] = Math.min(hi[ci], lo[ci] + dd); else hi[ci] = Math.max(lo[ci], hi[ci] - dd);
        const nw = hi[ci] - lo[ci];
        if ((w > SOLID && nw <= SOLID) || nw < hi0[ci] - lo0[ci] - STEP) b.gone = true; // it gives way, or has worn down enough to settle
        changed = true;
      }
      if (changed) b.dirty = true;
    }
    let cut: Body | null = null;
    for (const b of bodies) if (b.gone && !b.frozen && clock - b.cutT >= 0.05 && !(cut && cut.cutT <= b.cutT)) cut = b;
    if (cut) {
      cut.gone = false; cut.cutT = clock;
      split(cut, out);
      cut.props(W, P);
      if (cut.m && cut.solidCols < CHIP.crumbs) { cut.crumb.fill(1); cut.freeze(W); } // the last bit is just eaten up where it lies
    }
    bodies.push(...out);
    for (const b of new Set([...due, ...(cut ? [cut] : [])])) if (!b.hi.some((v, ci) => v - b.lo[ci] > 0.004)) remove(b);
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
      if (big) { // a piece of its own: the same shape and pose, only its own columns
        nb = Object.create(Body.prototype) as Body;
        Object.assign(nb, { ...b, id: nextId++, p: null, lo: new Float32Array(CN * CN), hi: new Float32Array(CN * CN), lo0: new Float32Array(CN * CN), hi0: new Float32Array(CN * CN), crumb: new Uint8Array(CN * CN), stain: b.stain.slice(), c: [...b.c] });
      }
      for (let ci = 0; ci < CN * CN; ci++) {
        if (comp[ci] !== id) continue;
        if (!big) { b.crumb[ci] = 1; continue; }
        nb!.lo[ci] = b.lo[ci]; nb!.hi[ci] = b.hi[ci]; b.lo[ci] = b.hi[ci] = 0;
      }
      // what is not part of any piece (columns worn to under SOLID) stays with the body it was in
      if (nb) { nb.props(world(), P, b.p); if (nb.p) out.push(nb); }
    }
    if (out.length) b.id = nextId++; // a new id draws it afresh in the frame its pieces first show, so no piece shows twice
  }
  function remove(b: Body) { world().remove(b.p); bodies.splice(bodies.indexOf(b), 1); }

  // Cards (pushers: { x, y, hw, hh, c, s, vx, vy } in desk px) shove the chips down on the desk out from under them, at least
  // as fast as the card moves, toward the nearest spot clear of every card and of the other chips there: a chip wedged
  // between two cards goes out along the gap, and chips pushed together come to rest side by side, not in a pile. It
  // starts only a little further in than where it ends, so a chip whose shape shifts as it is eaten does not creep.
  function push(pushers: Pusher[]) {
    const low = bodies.filter((b) => !b.frozen && b.x[2] - b.S.hb <= b.foot * 0.5), reach = (b: Body) => b.foot * 0.92;
    const clear = (b: Body, x: number, y: number) => pushers.every((p) => cardSd(p, x, y) >= reach(b))
      && low.every((o) => o === b || (x - o.x[0]) ** 2 + (y - o.x[1]) ** 2 >= (0.85 * (reach(b) + reach(o))) ** 2);
    for (const b of low) {
      const r = reach(b), x = b.x[0], y = b.x[1], on = pushers.filter((p) => cardSd(p, x, y) < r * 0.85); // hysteresis: an eaten chip's foot grows
      if (!on.length) continue;
      let tx = 0, ty = 0, best = Infinity;
      const tryAt = (X: number, Y: number) => { const d = (X - x) ** 2 + (Y - y) ** 2; if (d < best && clear(b, X, Y)) { best = d; tx = X; ty = Y; } };
      for (const p of pushers) { // just past each side of each card, level with the chip
        const dx = x - p.x, dy = y - p.y, lx = dx * p.c + dy * p.s, ly = -dx * p.s + dy * p.c;
        for (const [X, Y] of [[p.hw + r, ly], [-p.hw - r, ly], [lx, p.hh + r], [lx, -p.hh - r]]) tryAt(p.x + X * p.c - Y * p.s, p.y + X * p.s + Y * p.c);
      }
      for (let k = 1; k <= 16 && (k * r) / 2 < Math.sqrt(best); k++) for (let a = 0; a < 24; a++) tryAt(x + ((k * r) / 2) * Math.cos(a * Math.PI / 12), y + ((k * r) / 2) * Math.sin(a * Math.PI / 12));
      if (best === Infinity) continue;
      const d = Math.sqrt(best), nx = (tx - x) / d, ny = (ty - y) / d;
      const want = Math.max(Math.min(d * 10, 260), ...on.map((p) => p.vx * nx + p.vy * ny)), dv = want - (b.v[0] * nx + b.v[1] * ny);
      if (dv <= 0) continue;
      b.v[0] += nx * dv; b.v[1] += ny * dv; b.p.sleep = false;
    }
  }

  // Contact (tunables.ts touchdown) on each column's lowest face: a rocking chip lands strip by strip as its curve rolls
  // down; a slide or a lift brings no new part down, so it pushes no slime.
  function land(b: Body, dt: number) {
    const R = b.R, c = b.c, H = b.S.hf, t = b.S.t, was = b.at, at = b.at = b.atWas || new Float32Array(CN * CN * 3);
    b.atWas = was;
    for (let ci = 0, o = 0; ci < CN * CN; ci++, o += 3) { // each column's lowest face, if it holds, on the desk (desk px)
      if (!b.colSolid(ci)) { at[o + 2] = Infinity; continue; }
      const lx = b.px[ci] - c[0], ly = b.py[ci] - c[1], zc = R[6] * lx + R[7] * ly - R[8] * c[2];
      const f0 = H[ci * 3] + (b.lo0[ci] - 0.5) * t, f1 = H[ci * 3] + (b.hi0[ci] - 0.5) * t, z0 = zc + R[8] * f0, z1 = zc + R[8] * f1, lz = (z0 < z1 ? f0 : f1) - c[2];
      at[o + 2] = b.x[2] + Math.min(z0, z1);
      at[o] = b.x[0] + R[0] * lx + R[1] * ly + R[2] * lz; at[o + 1] = b.x[1] + R[3] * lx + R[4] * ly + R[5] * lz;
    }
    const l = was && touchdown(at, was, (b.armed ??= new Uint8Array(CN * CN)), P.chipBand, P.landH, dt, Math.sqrt(b.solidCols / Math.PI) * b.cell);
    if (l) b.land = [l[1], l[2], Math.sqrt(l[0] / Math.PI) * b.cell, l[3]]; // center, radius (desk px), strength
  }

  // After the sim has advanced: a chip's first touch is its landing (contact); then eating.
  function step(dt: number, eatOn: boolean) {
    for (const b of bodies) {
      if (b.frozen || b.sleep) continue;
      if (b.p.touch) b.landed = true;
      land(b, dt);
    }
    clock += dt;
    if (eatOn) eat(dt); else for (const b of bodies) b.ate = clock; // off its page it is not eaten
  }

  // ---------- what the GPU draws ----------
  // The eaten field (r: how much of the column's thickness is left, g: slime stain, b: how far past what is left, in DIST
  // columns), r dilated one column past the rim so the analytic outline, not the columns, decides the edge. b makes the
  // eaten edge a true distance, so the soft shadow fades away from it instead of veiling the eaten part.
  function maskBytes(b: Body, out: Uint8Array<ArrayBuffer>) {
    const N = CN * CN, m = new Float32Array(N), D = new Float32Array(N), S = b.S;
    for (let ci = 0; ci < N; ci++) { m[ci] = b.hi[ci] - b.lo[ci]; D[ci] = m[ci] >= 0.5 && S.inside[ci] ? 0 : 1e9; }
    chamfer(D);
    for (let ci = 0; ci < N; ci++) {
      const i = ci % CN, j = (ci - i) / CN;
      let v = m[ci];
      if (!S.inside[ci]) { v = 0; for (let q = 0; q < 8; q++) { const x = i + NX[q], y = j + NY[q]; if (x >= 0 && y >= 0 && x < CN && y < CN && S.inside[y * CN + x]) v = Math.max(v, m[y * CN + x]); } }
      out[ci * 4] = Math.round(clamp01(v) * 255); out[ci * 4 + 1] = Math.round(b.stain[ci] * 255); out[ci * 4 + 2] = Math.round(clamp01((D[ci] - 1) / DIST) * 255); out[ci * 4 + 3] = 255;
    }
    return out;
  }
  // Screen bounds of a body (desk px): its columns' box, turned and moved.
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
