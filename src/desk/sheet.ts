// The turning page as paper, one shape for the physics (world.surface in physics.ts) and the picture (wgsl.ts sheet()):
// its profile, the cross-section along the turn, swept across it and cut to the page. From the page's bottom-right
// corner C along dir (up and left, at angle a), each of NODES points of the profile is where the paper m from the corner
// (its material) lies now: X along dir, Z up, and its angle TH (0: lying face up, PI: turned over, back up). The models:
//   curl (0): the corner rolls up a cylinder of radius R whose foot (the fold) is d from the corner; the rest (the flap)
//     lies turned over on top, 2R up.
//   board (1): a stiff page, swung over about the spine (the line across the turn through the far corner, which stays
//     down), as the fold goes from where the turn began to the spine (progress p, 0 to 1).
//   bend (2): the same, bending in one arc that rises off the spine as it swings over.
//   paper (3): the note's sheet (note.ts stepChain) pinned at the spine: a hand carries the corner from where it lay
//     over the spine, just above the page (lift: how high, of the way to the spine), folding it over flat, and lays it
//     down on the other side; the rest is the sim.
// Things on it rest on the highest paper under them, never on paper passing over them. The curl's turned-over free
// edge sags to the paper under it, so it slides under what lies ahead of it instead of meeting it as a wall (the physics
// only; the other models turn their free edge over the spine, through the air, and a sagging one would sweep the desk
// at the hand's speed).
//
//   const sheet = createSheet({ state(t, out) { out[0] = d; out[1] = a; out[2] = d0; }, rollR, model: () => 0 });
//   sheet.page(ox, w, h, k); // where the page is (world CSS px: its left edge, its size) and its scale
//   world.surface = sheet;   // prepare / at / moving / top, as physics.ts asks
import type { Surface } from './physics.ts';
import { paperChain, stepChain, type Chain } from './note.ts';

export const NODES = 48;
const EPS = 1 / 2000; // s: the step a point of paper's velocity is measured over
const SAG = 40; // CSS px at k = 1: the length of a turned-over free edge that sags to the paper under it
const PAPER = { h: 1 / 480, drag: 0.03, bend: 80 }; // the page's sim: its step (s), the air on its face, its stiffness (stepChain)

export interface SheetOptions {
  state: (t: number, out: Float64Array) => void; // out: the fold d, its angle a, and the fold where the turn began
  rollR: (d: number) => number;
  model: () => number;
  gravity?: () => number;
  lift?: () => number;
}
export interface Sheet extends Surface {
  still: boolean;
  X: Float64Array; Z: Float64Array; M: Float64Array; TH: Float64Array;
  dx: number; dy: number; // dir
  reach: number; // how far along dir any paper is off the desk (-1: none)
  low: number; // the nearest any is (along dir)
  R: number; // the roll's radius (curl)
  page(x: number, w: number, h: number, k: number): void;
  at(out: Float64Array, vel?: boolean, z?: number): void;
}

export function createSheet({ state, rollR, model, gravity = () => 0, lift = () => 0.15 }: SheetOptions): Sheet {
  const N = NODES, X = new Float64Array(N), Z = new Float64Array(N), M = new Float64Array(N), TH = new Float64Array(N);
  const BX = new Float64Array(N), BZ = new Float64Array(N); // EPS later, the same paper
  const A = new Float64Array(3), B = new Float64Array(3), q = new Float64Array(3), was = new Float64Array(2 * N);
  let ox = 0, W = 0, H = 0, L = SAG, sagL = L, S = 1, bdx = -1, bdy = 0, ch: Chain | null = null, simT = -1, simD0 = NaN;
  const from = new Float64Array(2); // where the hand took the corner from (from the spine, up)
  const sh = { top: 0, speed: 0, still: true, X, Z, M, TH, dx: -1, dy: 0, reach: -1, low: 1e6, R: 0 } as unknown as Sheet;
  sh.page = (x, w, h, k) => { ox = x; W = w; H = h; L = SAG * k; };
  const span = (a: number) => W * Math.cos(a) + H * Math.sin(a);
  const progress = (d: number, d0: number, S: number) => Math.min(1, Math.max(0, (d - d0) / Math.max(S - d0, 1)));
  // Where the paper m from the corner is (q: X, Z, TH), for an analytic model md at fold d, angle a (the turn began at d0).
  const place = (md: number, d: number, a: number, d0: number, m: number) => {
    const S = span(a);
    if (md === 0) {
      const R = d > 0 ? rollR(d) : 0, s = d - m;
      if (s <= 0 || R <= 0) { q[0] = m; q[1] = 0; q[2] = 0; }
      else if (s <= Math.PI * R) { q[0] = d - R * Math.sin(s / R); q[1] = R * (1 - Math.cos(s / R)); q[2] = s / R; }
      else { q[0] = d + s - Math.PI * R; q[1] = 2 * R; q[2] = Math.PI; }
      return;
    }
    const p = progress(d, d0, S), al = md === 1 ? Math.PI * p : Math.PI * p * p, ph = md === 1 ? 0 : 2 * Math.PI * p * (1 - p), s = S - m;
    if (ph < 1e-6) { q[0] = S - s * Math.cos(al); q[1] = s * Math.sin(al); q[2] = al; return; }
    const r = S / ph, ps = al + (ph * s) / S;
    q[0] = S - r * (Math.sin(ps) - Math.sin(al)); q[1] = r * (Math.cos(al) - Math.cos(ps)); q[2] = ps;
  };
  // The paper each point follows: the curl's dense on its roll (and the flap and the flat page one piece each), else even.
  const materials = (md: number, d: number) => {
    if (md !== 0) { for (let j = 0; j < N; j++) M[j] = (j / (N - 1)) * S; return; }
    const R = d > 0 ? rollR(d) : 0, lo = Math.min(Math.max(0, d - Math.PI * R), S), hi = Math.min(Math.max(d, 0), S);
    M[0] = 0; M[N - 1] = S;
    for (let j = 1; j < N - 1; j++) M[j] = lo + ((j - 1) / (N - 3)) * (hi - lo);
  };
  // The paper's sim at time t: from the curl where the turn began, then the hand along its path.
  const sim = (t: number, d: number, a: number, d0: number) => {
    const n = N - 1;
    if (!ch || t < simT - 1e-9 || d0 !== simD0) {
      ch = paperChain(n, S, 0); simT = t; simD0 = d0;
      for (let i = 0; i <= n; i++) { place(0, d0, a, d0, S - i * ch.l); ch.x[2 * i] = S - q[0]; ch.x[2 * i + 1] = q[1]; }
      ch.p.set(ch.x); from[0] = ch.x[2 * n]; from[1] = ch.x[2 * n + 1]; ch.hand = new Float64Array(from);
    }
    const dt = Math.min(t - simT, 0.1), p = progress(d, d0, S), hand = ch.hand!;
    hand[0] = (from[0] - S) / 2 + ((from[0] + S) / 2) * Math.cos(Math.PI * p);
    hand[1] = from[1] * (1 - p) + lift() * S * Math.sin(Math.PI * p);
    was.set(ch.x);
    if (dt > 0) stepChain(ch, dt, { g: gravity(), drag: PAPER.drag, bend: PAPER.bend, lift: 0, h: PAPER.h });
    simT = t;
    for (let j = 0; j < N; j++) { // point j is link n - j from the spine
      const i = n - j;
      X[j] = S - ch.x[2 * i]; Z[j] = ch.x[2 * i + 1]; M[j] = (j / n) * S;
      BX[j] = X[j] - (dt > 0 ? ((ch.x[2 * i] - was[2 * i]) / dt) * EPS : 0); BZ[j] = Z[j] + (dt > 0 ? ((ch.x[2 * i + 1] - was[2 * i + 1]) / dt) * EPS : 0);
    }
    for (let j = 0; j < N; j++) { // its angle, along the paper, never jumping by a turn
      const a0 = Math.max(j - 1, 0), a1 = Math.min(j + 1, N - 1);
      let th = Math.atan2(Z[a0] - Z[a1], X[a1] - X[a0]);
      if (j) th += 2 * Math.PI * Math.round((TH[j - 1] - th) / (2 * Math.PI));
      TH[j] = th;
    }
  };
  sh.prepare = (t) => {
    state(t, A); state(t + EPS, B);
    const md = model(), d = A[0], a = A[1], d0 = A[2];
    S = span(a); sagL = md === 0 ? L : 0; sh.dx = -Math.cos(a); sh.dy = -Math.sin(a); bdx = -Math.cos(B[1]); bdy = -Math.sin(B[1]);
    sh.R = d > 0 ? rollR(d) : 0;
    if (d <= 0) { // no turn: flat
      for (let j = 0; j < N; j++) { M[j] = X[j] = BX[j] = (j / (N - 1)) * S; Z[j] = BZ[j] = TH[j] = 0; }
      ch = null;
    } else if (md === 3) sim(t, d, a, d0);
    else {
      materials(md, d);
      for (let j = 0; j < N; j++) { place(md, B[0], B[1], B[2], M[j]); BX[j] = q[0]; BZ[j] = q[1]; place(md, d, a, d0, M[j]); X[j] = q[0]; Z[j] = q[1]; TH[j] = q[2]; }
    }
    let top = 0, sp = 0, reach = -1, low = 1e6;
    for (let j = 0; j < N; j++) {
      const v = Math.hypot(BX[j] - X[j], BZ[j] - Z[j]) / EPS;
      top = Math.max(top, Z[j]); sp = Math.max(sp, v);
      if (Z[j] > 0.01 || Math.abs(X[j] - M[j]) > 0.01) { reach = Math.max(reach, X[j]); low = Math.min(low, X[j]); }
    }
    sh.top = top + 1; sh.reach = reach; sh.low = low;
    sh.speed = sp + (Math.abs(B[1] - a) / EPS) * (W + H);
    sh.still = sh.speed < 1;
  };
  // A turned-over point's height, the curl's free edge (the row's paper from m0) sagging to the paper under it.
  const sag = (j: number, m0: number) => (sagL ? Z[j] * (1 - Math.min(1, Math.max(0, 1 - (M[j] - m0) / sagL)) * Math.max(0, -Math.cos(TH[j]))) : Z[j]);
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  // At world (out[0], out[1]): out = height, normal (3), and if vel, velocity (3): the highest paper there at most z up.
  sh.at = (out, vel, zq = Infinity) => {
    const x = out[0] - ox - W, y = out[1] - H, dx = sh.dx, dy = sh.dy, Xp = x * dx + y * dy, yN = y * dx - x * dy;
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0; out[5] = 0; out[6] = 0;
    if (sh.top <= 1 || Xp > sh.reach) return;
    // This row's paper: from m0 to m1 from the corner.
    const s = -dy, c = -dx, m0 = Math.max((yN * s) / c, (-yN * c) / s), m1 = Math.min((W + yN * s) / c, (H - yN * c) / s);
    if (m0 > m1) return;
    let best = -1, bk = -Infinity, bz = 0, bf = 0;
    for (let j = 0; j + 1 < N; j++) {
      const x0 = X[j], x1 = X[j + 1];
      if ((Xp < x0 && Xp < x1) || (Xp > x0 && Xp > x1)) continue;
      const f = x1 === x0 ? 0.5 : (Xp - x0) / (x1 - x0), m = lerp(M[j], M[j + 1], f);
      if (m < m0 || m > m1) continue;
      const z = lerp(sag(j, m0), sag(j + 1, m0), f), key = z - 1e-4 * m; // level: the paper nearer the corner lies on top
      if (z <= zq && key > bk) { bk = key; best = j; bz = z; bf = f; }
    }
    if (best < 0) return;
    let tu = X[best + 1] - X[best], tz = sag(best + 1, m0) - sag(best, m0);
    if (tu < 0) { tu = -tu; tz = -tz; }
    const l = Math.hypot(tu, tz) || 1, nu = -tz / l;
    out[0] = bz; out[1] = nu * dx; out[2] = nu * dy; out[3] = tu / l;
    if (!vel) return;
    // Its velocity: where this paper (m along its row, page-flat at v) is a moment later.
    const m = lerp(M[best], M[best + 1], bf), vx = m * dx - yN * dy, vy = m * dy + yN * dx, mb = vx * bdx + vy * bdy, yb = vy * bdx - vx * bdy;
    let j = best;
    while (j > 0 && M[j] > mb) j--;
    while (j < N - 2 && M[j + 1] < mb) j++;
    const fb = Math.min(1, Math.max(0, M[j + 1] === M[j] ? 0.5 : (mb - M[j]) / (M[j + 1] - M[j]))), Xb = lerp(BX[j], BX[j + 1], fb), Zb = lerp(BZ[j], BZ[j + 1], fb) * (bz / Math.max(lerp(Z[best], Z[best + 1], bf), 1e-9) || 1);
    out[4] = (Xb * bdx - yb * bdy - x) / EPS; out[5] = (Xb * bdy + yb * bdx - y) / EPS; out[6] = (Zb - bz) / EPS;
  };
  // Whether the turn is moving paper that could reach a circle there (r: its radius).
  sh.moving = (x, y, r) => !sh.still && (x - ox - W) * sh.dx + (y - H) * sh.dy - r < Math.max(sh.reach, 0) + 1 && x + r > ox && x - r < ox + W && y + r > 0 && y - r < H;
  return sh;
}
