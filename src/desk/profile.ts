// Other ways the turning page could carry what lies on it, to compare with the curl (curl.ts) in the admin panel
// (Physics → Page model). The physics only: the page is still drawn curling. Each is a profile: the page's
// cross-section along the turn, from the spine (the line across the turn through the page's far corner, which stays
// down) to the corner, as N straight pieces of paper; the page is that profile swept across the turn, cut to the page's
// rectangle. Every model is driven by the same turn as the curl, as progress p: how far the fold has come since the turn
// began, over the way left to the spine (0: flat, 1: turned over).
//   board: a stiff page, swung over about the spine (angle pi p).
//   bend: a page you lift by its corner, bending in one arc that rises off the spine as it swings over.
//   paper: a simulated sheet (stretch, stiffness, gravity, the desk under it), pinned at the spine, its corner carried
//     up over the spine on a half ellipse and laid down on the other side.
import { type Curl, type CurlOptions, createCurl } from './curl.ts';

export type Model = 'board' | 'bend' | 'paper';
const N = 96; // pieces of paper along the profile
const EPS = 1 / 2000; // s: the step an analytic model's velocity is measured over
const HZ = 960, ITERS = 24; // the paper's sim: steps per second; constraint passes per step
const LIFT = 0.5; // how high the hand carries the corner (of the way to the spine)
const STIFF = 0.25, DAMP = 1.5; // the paper's bending stiffness (0 to 1 per pass) and its velocity decay (per s)

export function createProfile({ state }: CurlOptions, model: Model, gravity: () => number): Curl {
  const st = new Float64Array(2), U = new Float64Array(N + 1), Z = new Float64Array(N + 1), VU = new Float64Array(N + 1), VZ = new Float64Array(N + 1);
  const pu = new Float64Array(N + 1), pz = new Float64Array(N + 1); // the paper's last step
  let ox = 0, W = 0, H = 0, dx = -1, dy = 0, S = 1, d0 = 0, simT = -1;
  const surf = { top: 0, speed: 0, still: true } as unknown as Curl;
  surf.page = (x, w, h) => { ox = x; W = w; H = h; };
  // Progress at time t (and the turn's direction and the spine's distance from the corner).
  const progress = (t: number) => {
    state(t, st);
    const a = st[1]; dx = -Math.cos(a); dy = -Math.sin(a); S = W * Math.cos(a) + H * Math.sin(a);
    return Math.min(1, Math.max(0, (st[0] - d0) / Math.max(S - d0, 1)));
  };
  // An analytic model's profile at progress p into (u, z): u from the spine toward the corner.
  const shape = (p: number, u: Float64Array, z: Float64Array) => {
    const al = model === 'board' ? Math.PI * p : Math.PI * p * p, ph = model === 'board' ? 0 : 2 * Math.PI * p * (1 - p);
    for (let j = 0; j <= N; j++) {
      const s = (j / N) * S;
      if (ph < 1e-6) { u[j] = s * Math.cos(al); z[j] = s * Math.sin(al); continue; }
      const r = S / ph, ps = al + (ph * s) / S;
      u[j] = r * (Math.sin(ps) - Math.sin(al)); z[j] = r * (Math.cos(al) - Math.cos(ps));
    }
  };
  const B = new Float64Array(N + 1), BZ = new Float64Array(N + 1);
  // The paper's sim, one step at progress p: verlet, then the pieces kept their length (both ways along), bent back
  // toward straight, the corner in the hand, the spine pinned, the desk under it.
  const ds = () => S / N;
  const stepPaper = (p: number, h: number) => {
    const g = gravity(), keep = Math.exp(-DAMP * h), l = ds();
    for (let j = 1; j <= N; j++) {
      const vu = (U[j] - pu[j]) * keep, vz = (Z[j] - pz[j]) * keep;
      pu[j] = U[j]; pz[j] = Z[j]; U[j] += vu; Z[j] += vz - g * h * h;
    }
    const hu = S * Math.cos(Math.PI * p), hz = LIFT * S * Math.sin(Math.PI * p);
    for (let it = 0; it < ITERS; it++) {
      for (let j = 0; j + 2 <= N; j++) { // bending: each pair two apart pushed toward 2 l apart
        const eu = U[j + 2] - U[j], ez = Z[j + 2] - Z[j], e = Math.hypot(eu, ez) || 1, f = (STIFF * (e - 2 * l)) / e / 2;
        if (j > 0) { U[j] += f * eu; Z[j] += f * ez; }
        U[j + 2] -= f * eu; Z[j + 2] -= f * ez;
      }
      for (let k = 0; k < 2; k++) for (let i = 0; i < N; i++) { // stretch, up then down the sheet
        const j = k ? N - 1 - i : i, eu = U[j + 1] - U[j], ez = Z[j + 1] - Z[j], e = Math.hypot(eu, ez) || 1, f = (e - l) / e;
        if (j === 0) { U[1] -= f * eu; Z[1] -= f * ez; }
        else { U[j] += (f * eu) / 2; Z[j] += (f * ez) / 2; U[j + 1] -= (f * eu) / 2; Z[j + 1] -= (f * ez) / 2; }
      }
      U[N] = hu; Z[N] = hz; U[0] = 0; Z[0] = 0;
      for (let j = 1; j < N; j++) if (Z[j] < 0) { Z[j] = 0; U[j] = pu[j]; } // on the desk it does not slide
    }
    for (let j = 0; j <= N; j++) { VU[j] = (U[j] - pu[j]) / h; VZ[j] = (Z[j] - pz[j]) / h; }
  };
  surf.prepare = (t) => {
    state(0, st); d0 = st[0];
    const p = progress(t);
    if (st[0] === 0 && st[1] === 0) { // no turn: flat
      for (let j = 0; j <= N; j++) { U[j] = (j / N) * S; Z[j] = 0; VU[j] = 0; VZ[j] = 0; }
      surf.top = 1; surf.speed = 0; surf.still = true; simT = -1; return;
    }
    if (model === 'paper') {
      if (t < simT - 1e-9 || simT < 0) { simT = 0; for (let j = 0; j <= N; j++) { U[j] = pu[j] = (j / N) * S; Z[j] = pz[j] = 0; } } // from the start again: flat
      while (simT + 1 / HZ <= t + 1e-9) { simT += 1 / HZ; stepPaper(progress(simT), 1 / HZ); }
      progress(t);
    } else {
      shape(progress(t + EPS), B, BZ); progress(t); shape(p, U, Z);
      for (let j = 0; j <= N; j++) { VU[j] = (B[j] - U[j]) / EPS; VZ[j] = (BZ[j] - Z[j]) / EPS; }
    }
    let top = 0, sp = 0;
    for (let j = 0; j <= N; j++) { top = Math.max(top, Z[j]); sp = Math.max(sp, Math.hypot(VU[j], VZ[j])); }
    surf.top = top + 1; surf.speed = sp; surf.still = sp < 1;
  };
  // At world (out[0], out[1]): out = height, normal (3), and if vel, velocity (3): the topmost paper over it.
  surf.at = (out, vel) => {
    const x = out[0] - ox - W, y = out[1] - H, X = x * dx + y * dy, yN = y * dx - x * dy, u = S - X; // yN: across, as curl.ts's
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0; out[5] = 0; out[6] = 0;
    if (surf.top <= 1) return;
    // This row's paper, by arc length from the spine (as curl.ts's span, from the corner).
    const s = -dy, c = -dx, m0 = Math.max((yN * s) / c, (-yN * c) / s), m1 = Math.min((W + yN * s) / c, (H - yN * c) / s);
    if (m0 > m1) return;
    const lo = Math.max(0, (S - m1) / ds()), hi = Math.min(N, (S - m0) / ds());
    let best = -1, bz = 0, bj = 0, bf = 0;
    for (let j = Math.floor(lo); j < Math.min(N, Math.ceil(hi)); j++) {
      const u0 = U[j], u1 = U[j + 1];
      if ((u < u0 && u < u1) || (u > u0 && u > u1)) continue;
      let f = u1 === u0 ? 0.5 : (u - u0) / (u1 - u0);
      if (j + f < lo || j + f > hi) continue;
      f = Math.min(1, Math.max(0, f));
      const z = Z[j] + f * (Z[j + 1] - Z[j]);
      if (best < 0 || z > bz) { best = j; bz = z; bj = j; bf = f; }
    }
    if (best < 0) return;
    let tu = U[bj + 1] - U[bj], tz = Z[bj + 1] - Z[bj];
    if (tu < 0) { tu = -tu; tz = -tz; }
    const l = Math.hypot(tu, tz) || 1, nu = -tz / l, nz = tu / l; // up, in (u, z); u runs against dir
    out[0] = bz; out[1] = -nu * dx; out[2] = -nu * dy; out[3] = nz;
    if (!vel) return;
    const vu = VU[bj] + bf * (VU[bj + 1] - VU[bj]);
    out[4] = -vu * dx; out[5] = -vu * dy; out[6] = VZ[bj] + bf * (VZ[bj + 1] - VZ[bj]);
  };
  surf.moving = (x, y, r) => !surf.still && x + r > ox && x - r < ox + W && y + r > 0 && y - r < H;
  return surf;
}

// The page as the physics sees it: the curl, or the model the admin panel picks (pick(): 0 the curl, then MODELS).
export const MODELS: Model[] = ['board', 'bend', 'paper'];
export function createPage(o: CurlOptions, pick: () => number, gravity: () => number): Curl {
  const all = [createCurl(o), ...MODELS.map((m) => createProfile(o, m, gravity))];
  let cur = all[0];
  const page = { top: 0, speed: 0 } as Curl;
  page.page = (x, w, h, k) => { for (const m of all) m.page(x, w, h, k); };
  page.prepare = (t) => { cur = all[pick()] ?? all[0]; cur.prepare(t); page.top = cur.top; page.speed = cur.speed; page.still = cur.still; };
  page.at = (io, vel) => cur.at(io, vel);
  page.moving = (x, y, r) => cur.moving(x, y, r);
  return page;
}
