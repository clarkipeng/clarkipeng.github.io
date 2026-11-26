// One small rigid-body sim for everything on the desk that falls, tumbles and gets thrown (the card box now, chips next).
// Fixed timestep; sequential impulses with warm starting, and overlap pushed apart by split impulses (so it never adds
// speed); contacts thinned to the deepest point per direction around a body; speculative contacts (a gap that closes
// within a step is a contact), so nothing tunnels; sweep and prune between bodies; bodies at rest sleep and cost nothing.
// No allocation per step. Units: CSS px and seconds; x right, y down the desk, z up toward you (gravity pulls -z).
//
//   const world = createWorld({ hz: 480, iters: 6 });
//   const b = world.add({
//     points,          // contact points x, y, z in the body's frame, about its centre of mass (a few dozen to ~100 is plenty)
//     bound,           // radius about the centre of mass that holds every point
//     mass, inertia,   // inertia: its body-frame diagonal (3)
//     sdf,             // optional (io) => void: io[0..2] a body-frame point in; out, its outward normal (io[0..2]) and
//                      //   signed distance to the surface (io[3]); other bodies' points hit this one only if it has one.
//                      //   io[3] in: the side (of its z = 0 plane) the point touched it from last step, 0 if it did not:
//                      //   a thin shape keeps a point pushed in past its middle on that side, not out through the other
//     friction, bounce, // Coulomb mu; restitution
//     damp,            // optional: angular velocity decays as exp(-damp t) while it touches something (0: none)
//     x, q, v, w,      // position, rotation quaternion [w, x, y, z] (body to world), velocity, angular velocity
//     render,          // optional (b) => void, after each advance it moved in: read world.pose(b, pos, rot)
//   });
//   world.surface = { top, speed, prepare(t), at(io, vel), moving(x, y, r) }: what everything rests on (the desk and the
//     turning page, curl.ts). top: its highest point; speed: its fastest; prepare(t): set it to time t; at: io[0..1] x, y
//     in; out, its height and normal (io[0..3]) there and, if vel, its velocity (io[4..6]); moving: whether it moves under
//     a circle (a body asleep there wakes).
//   Floats cross these calls in arrays, not as arguments or return values: V8 allocates for those (and for Math.hypot).
//   world.g = 9000;    // gravity, px/s²
//   world.advance(t);  // fixed steps up to time t (s); world.pose(b, pos, rot) is interpolated between the last two
//   world.stepped = () => {}; // optional: after each step (to act at an exact moment of the sim, whatever the frame rate)
//   world.remove(b); const s = world.save(); world.load(s); // a load replays exactly (deterministic)

const SEC = 8, MAXC = 4096; // directions contacts are thinned to, per body and partner; contacts per step
// Per contact: ra (0), rb (3), overlap (6), wanted normal speed (7), impulses n, t1, t2 (8), push (11), surface
// velocity (12), 1 / mass of A and B (15), friction (17); then 3 rows of 16: d, ra x d, rb x d, IA (ra x d),
// IB (rb x d), 1 / k.
const CF = 66, ROW = 18, RW = 16;
const V = 12; // per body velocity floats: v, w, and the overlap push's v, w

// A body-frame point in io[0..2]; out, its outward normal (io[0..2]) and signed distance (io[3]). See the header.
export type Sdf = (io: Float64Array) => void;
// What everything rests on (the desk and the turning page, curl.ts).
export interface Surface {
  top: number;
  speed: number;
  prepare(t: number): void;
  at(io: Float64Array, vel: boolean): void;
  moving(x: number, y: number, r: number): boolean;
}
export interface BodyOptions {
  points: ArrayLike<number>;
  bound: number;
  sdf?: Sdf | null;
  mass: number;
  inertia: ArrayLike<number>;
  friction?: number;
  bounce?: number;
  damp?: number;
  x?: ArrayLike<number>;
  q?: ArrayLike<number>;
  v?: ArrayLike<number>;
  w?: ArrayLike<number>;
  render?: ((b: Body) => void) | null;
}
export interface Body {
  points: Float64Array;
  n: number;
  bound: number;
  sdf: Sdf | null;
  friction: number;
  bounce: number;
  keep: number;
  render: ((b: Body) => void) | null;
  im: number;
  Ib: Float64Array;
  Iw: Float64Array;
  R: Float64Array;
  x: Float64Array;
  q: Float64Array;
  v: Float64Array; // views into the world's velocities (reindex)
  w: Float64Array;
  px: Float64Array;
  pq: Float64Array;
  ax: Float64Array;
  aq: Float64Array;
  warm: Float64Array;
  wid: Int32Array;
  wstep: Int32Array;
  wside: Int8Array;
  sleep: boolean;
  still: number;
  touch: boolean;
  moved: boolean;
  reach: number;
  id: number;
}
export interface World {
  g: number;
  rest: number;
  surface: Surface | null;
  hz: number;
  bodies: Body[];
  time: number;
  stepped?: (() => void) | null;
  add(o: BodyOptions): Body;
  remove(b: Body): void;
  advance(t: number): void;
  pose(b: Body, pos: Float64Array, rot: Float64Array): void;
  save(): Float64Array;
  load(s: Float64Array): void;
}
export interface Shape {
  points: Float64Array;
  sdf: Sdf;
  bound: number;
  inertia: (m: number) => [number, number, number];
}

export function createWorld({ hz = 480, iters = 6, pushIters = 3 } = {}): World {
  const h = 1 / hz, bodies: Body[] = [];
  let time = 0, alpha = 0, stepN = 0, order = new Int32Array(0), vel = new Float64Array(0);
  const cf = new Float64Array(MAXC * CF), ci = new Int32Array(MAXC * 4); // A, B (-1: the surface or a sleeping body), point, B's id
  let nc = 0;
  const pick = new Int32Array(SEC), pd = new Float64Array(SEC), pk = new Float64Array(SEC * 6), cd = new Float64Array(7), so = new Float64Array(7), sn = new Float64Array(4);
  const world = { g: 9000, rest: 0.5, surface: null, hz, bodies } as World; // add, remove, ... and time are set below

  world.add = (o) => {
    const n = o.points.length / 3, I = o.inertia;
    const b: Body = {
      points: Float64Array.from(o.points), n, bound: o.bound, sdf: o.sdf || null,
      friction: o.friction ?? 0.5, bounce: o.bounce ?? 0.2, keep: Math.exp(-(o.damp || 0) * h), render: o.render || null,
      im: 1 / o.mass, Ib: Float64Array.of(1 / I[0], 0, 0, 0, 1 / I[1], 0, 0, 0, 1 / I[2]), Iw: new Float64Array(9), R: new Float64Array(9),
      x: Float64Array.from(o.x || [0, 0, 0]), q: Float64Array.from(o.q || [1, 0, 0, 0]), v: null!, w: null!, // set by reindex, below
      px: new Float64Array(3), pq: new Float64Array(4), ax: new Float64Array(3), aq: new Float64Array(4), // ax, aq: where it came to rest
      warm: new Float64Array(n * 3), wid: new Int32Array(n), wstep: new Int32Array(n).fill(-9), wside: new Int8Array(n),
      sleep: false, still: 0, touch: false, moved: true, reach: 0, id: bodies.length,
    };
    b.px.set(b.x); b.pq.set(b.q); b.ax.set(b.x); b.aq.set(b.q); orient(b);
    bodies.push(b); reindex();
    b.v.set(o.v || [0, 0, 0]); b.w.set(o.w || [0, 0, 0]);
    return b;
  };
  const wake = (b: Body) => { b.sleep = false; b.still = 0; };
  // Gone: what rested on it wakes, and falls.
  world.remove = (b) => { const i = bodies.indexOf(b); if (i < 0) return; bodies.splice(i, 1); reindex(); for (const o of bodies) if (Math.hypot(o.x[0] - b.x[0], o.x[1] - b.x[1], o.x[2] - b.x[2]) < o.bound + b.bound + 2) wake(o); };
  // Velocities live side by side (the solver's hot loop reads them); each body's v and w are views into them.
  // Ids follow too, and so what each point touched last step (a gone body: -2, nothing's id).
  function reindex() {
    const nv = new Float64Array(bodies.length * V), to = new Int32Array(bodies.length + 1).fill(-2);
    bodies.forEach((b, i) => { to[b.id] = i; });
    for (const b of bodies) b.wid.forEach((w, k) => { if (w >= 0) b.wid[k] = to[w]; });
    bodies.forEach((b, i) => { if (b.v) { nv.set(b.v, i * V); nv.set(b.w, i * V + 3); } b.id = i; b.v = nv.subarray(i * V, i * V + 3); b.w = nv.subarray(i * V + 3, i * V + 6); });
    vel = nv; order = Int32Array.from(bodies.keys());
  }
  Object.defineProperty(world, 'time', { get: () => time, set: (t: number) => { time = t; } });

  // Fixed steps up to time t; poses in between are interpolated (alpha).
  world.advance = (t) => {
    for (const b of bodies) b.moved = !b.sleep;
    let k = 0;
    while (time + h <= t + 1e-9 && k++ < 240) { step(); time += h; world.stepped?.(); }
    if (time + h <= t) time = t - h * 0.999; // far behind (a hidden tab): the backlog is dropped, not caught up
    alpha = Math.min(1, Math.max(0, (t - time) / h));
    for (const b of bodies) if (b.moved && b.render) b.render(b);
  };
  // The interpolated pose: position (3) and rotation (9, row major, body to world).
  world.pose = (b, pos, rot) => {
    const a = alpha, q = b.q, p = b.pq, s = q[0] * p[0] + q[1] * p[1] + q[2] * p[2] + q[3] * p[3] < 0 ? -1 : 1;
    for (let i = 0; i < 3; i++) pos[i] = b.px[i] + (b.x[i] - b.px[i]) * a;
    const w = p[0] * s + (q[0] - p[0] * s) * a, x = p[1] * s + (q[1] - p[1] * s) * a, y = p[2] * s + (q[2] - p[2] * s) * a, z = p[3] * s + (q[3] - p[3] * s) * a;
    const l = Math.sqrt(w * w + x * x + y * y + z * z);
    qmat(w / l, x / l, y / l, z / l, rot);
  };
  const SV = 29;
  world.save = () => {
    const s = new Float64Array(2 + bodies.length * SV); s[0] = time; s[1] = alpha;
    bodies.forEach((b, i) => { const o = 2 + i * SV; s.set(b.x, o); s.set(b.v, o + 3); s.set(b.w, o + 6); s.set(b.q, o + 9); s.set(b.px, o + 13); s.set(b.pq, o + 16); s[o + 20] = b.sleep ? 1 : 0; s[o + 21] = b.still; s.set(b.ax, o + 22); s.set(b.aq, o + 25); });
    return s;
  };
  world.load = (s) => {
    time = s[0]; alpha = s[1]; stepN += 2; // warm starts from before are stale
    bodies.forEach((b, i) => { const o = 2 + i * SV; b.x.set(s.subarray(o, o + 3)); b.v.set(s.subarray(o + 3, o + 6)); b.w.set(s.subarray(o + 6, o + 9)); b.q.set(s.subarray(o + 9, o + 13)); b.px.set(s.subarray(o + 13, o + 16)); b.pq.set(s.subarray(o + 16, o + 20)); b.sleep = s[o + 20] > 0; b.still = s[o + 21]; b.ax.set(s.subarray(o + 22, o + 25)); b.aq.set(s.subarray(o + 25, o + 29)); orient(b); });
  };

  function step() {
    stepN++;
    const S = world.surface!;
    S.prepare(time);
    for (const b of bodies) {
      b.px.set(b.x); b.pq.set(b.q);
      if (b.sleep) { if (!S.moving(b.x[0], b.x[1], b.bound)) continue; wake(b); b.moved = true; } // the paper moves under it
      const o = b.id * V;
      vel[o + 2] -= world.g * h;
      vel.fill(0, o + 6, o + 12);
      b.touch = false;
    }
    nc = 0;
    for (const b of bodies) if (!b.sleep) surfaceContacts(b, S);
    if (bodies.length > 1) pairs();
    solve();
    for (const b of bodies) {
      if (b.sleep) continue;
      const o = b.id * V, q = b.q;
      if (b.touch) for (let i = 3; i < 6; i++) vel[o + i] *= b.keep;
      for (let i = 0; i < 3; i++) b.x[i] += (vel[o + i] + vel[o + 6 + i]) * h;
      const wx = (vel[o + 3] + vel[o + 9]) * h * 0.5, wy = (vel[o + 4] + vel[o + 10]) * h * 0.5, wz = (vel[o + 5] + vel[o + 11]) * h * 0.5;
      const a = q[0] - wx * q[1] - wy * q[2] - wz * q[3], x = q[1] + wx * q[0] + wy * q[3] - wz * q[2], y = q[2] - wx * q[3] + wy * q[0] + wz * q[1], z = q[3] + wx * q[2] - wy * q[1] + wz * q[0];
      const l = Math.sqrt(a * a + x * x + y * y + z * z); q[0] = a / l; q[1] = x / l; q[2] = y / l; q[3] = z / l;
      orient(b);
      // Still while it touches something and stays within world.rest px (its rim's travel included) of where it came to
      // rest: a pile's jitter never adds up to that.
      const A = b.ax, Q = b.aq, dq = Math.abs(q[0] * Q[0] + q[1] * Q[1] + q[2] * Q[2] + q[3] * Q[3]);
      const off = Math.abs(b.x[0] - A[0]) + Math.abs(b.x[1] - A[1]) + Math.abs(b.x[2] - A[2]) + 2 * b.bound * Math.sqrt(Math.max(0, 2 * (1 - dq)));
      if (b.touch && off < world.rest) b.still += h; else { b.still = 0; A.set(b.x); Q.set(q); }
    }
    // Asleep once it has been still a moment, and so has everything awake it touches (a pile sleeps together, so nothing
    // settles onto one asleep); then it costs nothing until something moves it.
    for (let c = 0; c < nc; c++) { const a = bodies[ci[c * 4]], b = ci[c * 4 + 1]; if (b >= 0 && Math.min(a.still, bodies[b].still) <= 0.4) a.still = bodies[b].still = Math.min(a.still, bodies[b].still, 0.4); }
    for (const b of bodies) if (!b.sleep && b.still > 0.4 && !S.moving(b.x[0], b.x[1], b.bound)) { b.sleep = true; vel.fill(0, b.id * V, b.id * V + 6); }
  }
  function orient(b: Body) {
    const q = b.q; qmat(q[0], q[1], q[2], q[3], b.R);
    const R = b.R, I = b.Ib, W = b.Iw; // the world inverse inertia, R Ib R^T
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let i = 0; i < 3; i++) s += R[r * 3 + i] * (I[i * 3] * R[c * 3] + I[i * 3 + 1] * R[c * 3 + 1] + I[i * 3 + 2] * R[c * 3 + 2]);
      W[r * 3 + c] = s;
    }
  }

  // ---------- contacts ----------
  // Against the surface: every point near it, the deepest per direction kept.
  function surfaceContacts(b: Body, S: Surface) {
    const top = S.top, R = b.R, P = b.points, x = b.x, o = b.id * V;
    const vx0 = vel[o], vy0 = vel[o + 1], vz0 = vel[o + 2], wx = vel[o + 3], wy = vel[o + 4], wz = vel[o + 5];
    const fast = (Math.max(0, -vz0) + S.speed + b.bound * Math.sqrt(wx * wx + wy * wy + wz * wz)) * h + 1; // as far as anything can close in a step
    if (x[2] - b.bound > top + fast) return;
    pick.fill(-1);
    for (let i = 0; i < b.n; i++) {
      const lx = P[i * 3], ly = P[i * 3 + 1], lz = P[i * 3 + 2];
      const rz = R[6] * lx + R[7] * ly + R[8] * lz, pz = x[2] + rz;
      if (pz > top + fast) continue;
      const rx = R[0] * lx + R[1] * ly + R[2] * lz, ry = R[3] * lx + R[4] * ly + R[5] * lz;
      so[0] = x[0] + rx; so[1] = x[1] + ry; S.at(so, false);
      const nx = so[1], ny = so[2], nz = so[3], gap = (pz - so[0]) * nz;
      if (gap > fast) continue;
      const vn = (vx0 + wy * rz - wz * ry) * nx + (vy0 + wz * rx - wx * rz) * ny + (vz0 + wx * ry - wy * rx) * nz;
      if (gap > Math.max(0, -vn) * h + S.speed * h + 0.5) continue;
      cd[0] = rx; cd[1] = ry; cd[2] = rz; cd[3] = nx; cd[4] = ny; cd[5] = nz; cd[6] = -gap; keep(i);
    }
    for (let k = 0; k < SEC; k++) if (pick[k] >= 0) {
      const p = k * 6;
      so[0] = x[0] + pk[p]; so[1] = x[1] + pk[p + 1]; S.at(so, true);
      emit(b, null, k);
    }
  }
  // Point i (its candidate contact in cd) kept if it is the deepest yet in its direction from the middle.
  function keep(i: number) {
    const ax = cd[0], ay = cd[1], l = Math.abs(ax) + Math.abs(ay), u = l > 1e-9 ? ay / l : 0; // a cheap angle, 0 to 4
    const k = Math.min(SEC - 1, Math.floor(((ax >= 0 ? 1 - u : 3 + u) * SEC) / 4));
    if (pick[k] >= 0 && pd[k] >= cd[6]) return;
    pick[k] = i; pd[k] = cd[6];
    for (let j = 0; j < 6; j++) pk[k * 6 + j] = cd[j];
  }
  // Bodies near each other: sweep and prune along x (an insertion sort, as the order barely changes step to step), then
  // each one's points against the other's shape. Each reaches as far as it moves in a step, so a fast one meets what it
  // is about to pass through, not just what it is already in (a chip is thinner than it falls in a step).
  function pairs() {
    for (const b of bodies) { const o = b.id * V; b.reach = (Math.hypot(vel[o], vel[o + 1], vel[o + 2]) + b.bound * Math.hypot(vel[o + 3], vel[o + 4], vel[o + 5])) * h; }
    const lo = (b: Body) => b.x[0] - b.bound - b.reach;
    for (let i = 1; i < order.length; i++) {
      const o = order[i], l = lo(bodies[o]);
      let j = i - 1;
      while (j >= 0 && lo(bodies[order[j]]) > l) { order[j + 1] = order[j]; j--; }
      order[j + 1] = o;
    }
    for (let i = 0; i < order.length; i++) {
      const A = bodies[order[i]], hi = A.x[0] + A.bound + A.reach;
      for (let j = i + 1; j < order.length; j++) {
        const B = bodies[order[j]];
        if (lo(B) > hi) break;
        if (A.sleep && B.sleep) continue;
        const m = A.reach + B.reach, r = A.bound + B.bound + 1 + m;
        if ((A.x[0] - B.x[0]) ** 2 + (A.x[1] - B.x[1]) ** 2 + (A.x[2] - B.x[2]) ** 2 > r * r) continue;
        if (B.sdf) pointsInto(A, B, m);
        if (A.sdf) pointsInto(B, A, m);
      }
    }
  }
  function pointsInto(A: Body, B: Body, m: number) {
    const RA = A.R, RB = B.R, P = A.points, r2 = (B.bound + 1 + m) ** 2;
    pick.fill(-1);
    for (let i = 0; i < A.n; i++) {
      const lx = P[i * 3], ly = P[i * 3 + 1], lz = P[i * 3 + 2];
      const rx = RA[0] * lx + RA[1] * ly + RA[2] * lz, ry = RA[3] * lx + RA[4] * ly + RA[5] * lz, rz = RA[6] * lx + RA[7] * ly + RA[8] * lz;
      const dx = A.x[0] + rx - B.x[0], dy = A.x[1] + ry - B.x[1], dz = A.x[2] + rz - B.x[2];
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      sn[0] = RB[0] * dx + RB[3] * dy + RB[6] * dz; sn[1] = RB[1] * dx + RB[4] * dy + RB[7] * dz; sn[2] = RB[2] * dx + RB[5] * dy + RB[8] * dz; // in B's frame
      sn[3] = A.wstep[i] === stepN - 1 && A.wid[i] === B.id ? A.wside[i] : 0;
      B.sdf!(sn); // pairs() only calls this when B has one
      const dist = sn[3];
      if (dist > 0.5 + m) continue;
      if (A.sleep) { if (dist < -0.25) { wake(A); A.moved = true; return; } continue; } // pressed into: it wakes, and is pushed out from the next step
      cd[0] = rx; cd[1] = ry; cd[2] = rz; cd[6] = -dist;
      cd[3] = RB[0] * sn[0] + RB[1] * sn[1] + RB[2] * sn[2]; cd[4] = RB[3] * sn[0] + RB[4] * sn[1] + RB[5] * sn[2]; cd[5] = RB[6] * sn[0] + RB[7] * sn[1] + RB[8] * sn[2];
      keep(i);
    }
    for (let k = 0; k < SEC; k++) if (pick[k] >= 0) emit(A, B, k);
  }
  // One contact: A's picked point k pushed along its normal, out of B (null: the surface, moving at so[4..6] there).
  function emit(A: Body, B: Body | null, k: number) {
    if (nc >= MAXC) return;
    const o = nc * CF, p = k * 6, i = pick[k], asleep = B && B.sleep, live = B && !B.sleep;
    ci[nc * 4] = A.id; ci[nc * 4 + 1] = live ? B.id : -1; ci[nc * 4 + 2] = i; ci[nc * 4 + 3] = B ? B.id : -1;
    for (let j = 0; j < 3; j++) { cf[o + j] = pk[p + j]; cf[o + 3 + j] = live ? A.x[j] + pk[p + j] - B.x[j] : 0; }
    cf[o + 6] = pd[k]; cf[o + 12] = B ? 0 : so[4]; cf[o + 13] = B ? 0 : so[5]; cf[o + 14] = B ? 0 : so[6];
    cf[o + 15] = A.im; cf[o + 16] = live ? B.im : 0; cf[o + 17] = B ? Math.sqrt(A.friction * B.friction) : A.friction;
    const nx = pk[p + 3], ny = pk[p + 4], nz = pk[p + 5];
    // Tangents by one fixed rule from the normal, so warm-started friction lines up step to step.
    let tx, ty, tz;
    if (Math.abs(nz) < 0.9) { tx = ny; ty = -nx; tz = 0; } else { tx = 0; ty = nz; tz = -ny; }
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz); tx /= tl; ty /= tl; tz /= tl;
    const q = o + ROW, Bl = live ? B : null;
    cf[q] = nx; cf[q + 1] = ny; cf[q + 2] = nz; cf[q + RW] = tx; cf[q + RW + 1] = ty; cf[q + RW + 2] = tz;
    cf[q + 2 * RW] = ny * tz - nz * ty; cf[q + 2 * RW + 1] = nz * tx - nx * tz; cf[q + 2 * RW + 2] = nx * ty - ny * tx;
    for (let r = 0; r < 3; r++) row(o, q + r * RW, A, Bl);
    const fresh = A.wstep[i] === stepN - 1 && A.wid[i] === ci[nc * 4 + 3];
    for (let r = 0; r < 3; r++) cf[o + 8 + r] = fresh ? A.warm[i * 3 + r] : 0;
    cf[o + 11] = 0;
    // The speed it wants along the normal: a bounce if it hits in this step, or no faster than closes the gap in this step.
    ia = A.id * V; ib = live ? B.id * V : -1;
    closing(o);
    const vn = RV[0], e = B ? Math.max(A.bounce, B.bounce) : A.bounce;
    cf[o + 7] = Math.max(vn < -30 && vn * h < pd[k] + 0.5 ? -e * vn : 0, pd[k] < 0 ? pd[k] / h : 0);
    if (asleep && vn < -20 - world.g * h) wake(B); // knocked: it moves from the next step
    A.touch = true; if (B) B.touch = true;
    nc++;
  }
  // Row q of contact o (its direction d in cf[q..q+2]): ra x d, rb x d, I (r x d) for each, and 1 / its effective mass.
  function row(o: number, q: number, A: Body, B: Body | null) {
    cf[q + 15] = A.im;
    arm(q, q + 3, q + 9, o, A.Iw);
    if (B) { cf[q + 15] += B.im; arm(q, q + 6, q + 12, o + 3, B.Iw); }
    else for (let j = 6; j < 9; j++) cf[q + j] = cf[q + j + 6] = 0;
    cf[q + 15] = 1 / cf[q + 15];
  }
  // r (at cf[r]) x d (cf[q]) into cf[at], I (r x d) into cf[at2], and (r x d) . I (r x d) added to cf[q + 15].
  function arm(q: number, at: number, at2: number, r: number, I: Float64Array) {
    const rx = cf[r], ry = cf[r + 1], rz = cf[r + 2], dx = cf[q], dy = cf[q + 1], dz = cf[q + 2];
    const ax = ry * dz - rz * dy, ay = rz * dx - rx * dz, az = rx * dy - ry * dx;
    const bx = I[0] * ax + I[1] * ay + I[2] * az, by = I[3] * ax + I[4] * ay + I[5] * az, bz = I[6] * ax + I[7] * ay + I[8] * az;
    cf[at] = ax; cf[at + 1] = ay; cf[at + 2] = az; cf[at2] = bx; cf[at2 + 1] = by; cf[at2 + 2] = bz;
    cf[q + 15] += ax * bx + ay * by + az * bz;
  }
  let ia = 0, ib = -1; // the contact being solved: its bodies' offsets into vel (ib -1: the surface, or a body asleep)
  // One row of contact o solved: r 0 the normal (pushing apart, toward its wanted speed), 1 and 2 friction (within mu of
  // the normal impulse), 3 the overlap push (on the push velocities). Floats are never passed or returned here: V8 boxes
  // those that cross a call.
  function solveRow(o: number, r: number) {
    const push = r === 3 ? 6 : 0, q = o + ROW + (push ? 0 : r) * RW, a = ia + push, at = o + (push ? 11 : 8 + r);
    let s = cf[q] * vel[a] + cf[q + 1] * vel[a + 1] + cf[q + 2] * vel[a + 2] + cf[q + 3] * vel[a + 3] + cf[q + 4] * vel[a + 4] + cf[q + 5] * vel[a + 5];
    if (ib >= 0) { const b = ib + push; s -= cf[q] * vel[b] + cf[q + 1] * vel[b + 1] + cf[q + 2] * vel[b + 2] + cf[q + 6] * vel[b + 3] + cf[q + 7] * vel[b + 4] + cf[q + 8] * vel[b + 5]; }
    else if (!push) s -= cf[q] * cf[o + 12] + cf[q + 1] * cf[o + 13] + cf[q + 2] * cf[o + 14];
    let l = cf[at] - cf[q + 15] * (s - (r === 0 ? cf[o + 7] : r === 3 ? (0.2 / h) * Math.max(0, cf[o + 6] - 0.05) : 0));
    if (r === 0 || r === 3) l = Math.max(0, l);
    else { const lim = cf[o + 17] * cf[o + 8]; l = Math.max(-lim, Math.min(lim, l)); }
    const dl = l - cf[at];
    cf[at] = l;
    if (dl !== 0) { KV[0] = dl; kick(o, q, a, push); }
  }
  // The impulse KV[0] along row q of contact o (a: A's offset into vel, plus push's).
  function kick(o: number, q: number, a: number, push: number) {
    const l = KV[0], ma = cf[o + 15] * l;
    vel[a] += cf[q] * ma; vel[a + 1] += cf[q + 1] * ma; vel[a + 2] += cf[q + 2] * ma;
    vel[a + 3] += cf[q + 9] * l; vel[a + 4] += cf[q + 10] * l; vel[a + 5] += cf[q + 11] * l;
    if (ib >= 0) {
      const b = ib + push, mb = cf[o + 16] * l;
      vel[b] -= cf[q] * mb; vel[b + 1] -= cf[q + 1] * mb; vel[b + 2] -= cf[q + 2] * mb;
      vel[b + 3] -= cf[q + 12] * l; vel[b + 4] -= cf[q + 13] * l; vel[b + 5] -= cf[q + 14] * l;
    }
  }
  const KV = new Float64Array(1), RV = new Float64Array(1);
  // How fast contact o closes, along its normal, into RV[0] (negative: closing).
  function closing(o: number) {
    const q = o + ROW, a = ia;
    let s = cf[q] * vel[a] + cf[q + 1] * vel[a + 1] + cf[q + 2] * vel[a + 2] + cf[q + 3] * vel[a + 3] + cf[q + 4] * vel[a + 4] + cf[q + 5] * vel[a + 5];
    if (ib >= 0) s -= cf[q] * vel[ib] + cf[q + 1] * vel[ib + 1] + cf[q + 2] * vel[ib + 2] + cf[q + 6] * vel[ib + 3] + cf[q + 7] * vel[ib + 4] + cf[q + 8] * vel[ib + 5];
    else s -= cf[q] * cf[o + 12] + cf[q + 1] * cf[o + 13] + cf[q + 2] * cf[o + 14];
    RV[0] = s;
  }
  const use = (c: number) => { ia = ci[c * 4] * V; const b = ci[c * 4 + 1]; ib = b >= 0 ? b * V : -1; };
  function solve() {
    for (let c = 0; c < nc; c++) { // the warm start
      use(c);
      const o = c * CF;
      for (let r = 0; r < 3; r++) if (cf[o + 8 + r] !== 0) { KV[0] = cf[o + 8 + r]; kick(o, o + ROW + r * RW, ia, 0); }
    }
    for (let it = 0; it < iters; it++) for (let c = 0; c < nc; c++) { use(c); const o = c * CF; solveRow(o, 0); solveRow(o, 1); solveRow(o, 2); }
    for (let it = 0; it < pushIters; it++) for (let c = 0; c < nc; c++) { use(c); solveRow(c * CF, 3); } // overlap pushed apart, adding no speed
    for (let c = 0; c < nc; c++) { // kept for the next step's warm start
      const o = c * CF, A = bodies[ci[c * 4]], i = ci[c * 4 + 2], B = ci[c * 4 + 3] >= 0 ? bodies[ci[c * 4 + 3]].R : null;
      A.wstep[i] = stepN; A.wid[i] = ci[c * 4 + 3];
      if (B) A.wside[i] = Math.sign(B[2] * cf[o + ROW] + B[5] * cf[o + ROW + 1] + B[8] * cf[o + ROW + 2]);
      for (let r = 0; r < 3; r++) A.warm[i * 3 + r] = cf[o + 8 + r];
    }
  }
  return world;
}

// ---------- shapes ----------
// A solid box W x H x D (along its x, y, z): contact points on a grid over its faces (no further apart than spacing),
// its signed distance, its bound, and its inertia for a mass.
export function boxShape(W: number, H: number, D: number, spacing: number): Shape {
  const hx = W / 2, hy = H / 2, hz = D / 2, pts: number[] = [];
  const grid = (a: number) => { const n = Math.max(1, Math.ceil(a / spacing)); return Array.from({ length: n + 1 }, (_, i) => -a / 2 + (a * i) / n); };
  const gx = grid(W), gy = grid(H), gz = grid(D), add = (x: number, y: number, z: number) => pts.push(x, y, z);
  for (const x of gx) for (const y of gy) { add(x, y, -hz); add(x, y, hz); }
  for (const x of gx) for (const z of gz.slice(1, -1)) { add(x, -hy, z); add(x, hy, z); }
  for (const y of gy.slice(1, -1)) for (const z of gz.slice(1, -1)) { add(-hx, y, z); add(hx, y, z); }
  const sdf = (n: Float64Array) => {
    const x = n[0], y = n[1], z = n[2], qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz, mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0), out = Math.sqrt(mx * mx + my * my + mz * mz);
    if (out > 0) { n[0] = (mx / out) * Math.sign(x); n[1] = (my / out) * Math.sign(y); n[2] = (mz / out) * Math.sign(z); n[3] = out; return; }
    n[0] = n[1] = n[2] = 0;
    if (qx >= qy && qx >= qz) n[0] = Math.sign(x) || 1; else if (qy >= qz) n[1] = Math.sign(y) || 1; else n[2] = Math.sign(z) || 1;
    n[3] = Math.max(qx, qy, qz);
  };
  return { points: Float64Array.from(pts), sdf, bound: Math.hypot(hx, hy, hz), inertia: (m: number): [number, number, number] => [(m * (H * H + D * D)) / 12, (m * (W * W + D * D)) / 12, (m * (W * W + H * H)) / 12] };
}

function qmat(w: number, x: number, y: number, z: number, m: Float64Array) {
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z); m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y); m[7] = 2 * (y * z + w * x); m[8] = 1 - 2 * (x * x + y * y);
}
