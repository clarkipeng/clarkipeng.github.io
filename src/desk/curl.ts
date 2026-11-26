// The turning page as a surface for the physics (world.surface in physics.ts): the same curl the page is drawn with.
// From the page's bottom-right corner C, along dir (up and left, at angle a), the page is lifted up to the fold, d from
// the corner: within pi R of the fold it rolls up a cylinder of radius R, and the rest (the flap) lies turned over on top
// of the page ahead of the fold, 2R up. Things on it rest on the topmost paper. The flap's free edge sags to the page, so
// it slides under what lies ahead of it instead of meeting it as a wall. Every point of paper moves with the turn.
//
//   const curl = createCurl({ state(t, out) { out[0] = d; out[1] = a; }, rollR: (d) => R, sag });
//   curl.page(ox, w, h);  // where the page is (world CSS px: its left edge, its size)
//   world.surface = curl; // prepare / at / moving / top, as physics.ts asks
import type { Surface } from './physics.ts';

const EPS = 1 / 2000; // s: the time step a point of paper's velocity is measured over

export interface CurlOptions {
  state: (t: number, out: Float64Array) => void; // out: the fold d and its angle a at time t
  rollR: (d: number) => number;
  sag?: number;
}
export interface Curl extends Surface {
  sag: number;
  still: boolean;
  page(x: number, w: number, h: number): void;
  at(out: Float64Array, vel?: boolean): void;
}

export function createCurl({ state, rollR, sag = 40 }: CurlOptions): Curl {
  const s0 = new Float64Array(2), s1 = new Float64Array(2), A = new Float64Array(10), B = new Float64Array(10), p = new Float64Array(3);
  let ox = 0, W = 0, H = 0;
  const curl = { top: 0, speed: 0, sag, page(x: number, w: number, h: number) { ox = x; W = w; H = h; } } as Curl; // the rest is set below
  // One moment of the turn: fold d, its direction, the roll's radius.
  const frame = (st: Float64Array, F: Float64Array) => { const d = st[0], a = st[1], c = Math.cos(a), s = Math.sin(a); F[0] = d; F[1] = -c; F[2] = -s; F[3] = s; F[4] = -c; F[5] = d > 0 ? rollR(d) : 0; F[6] = s; F[7] = c; };
  // The paper there is along a row (yN across the fold): material from x' = m0 to m1 from the corner (none: m0 > m1).
  const span = (F: Float64Array, yN: number, out: Float64Array) => {
    const s = F[6], c = F[7];
    out[0] = Math.max((yN * s) / c, (-yN * c) / s); out[1] = Math.min((W + yN * s) / c, (H - yN * c) / s);
  };
  const m = new Float64Array(2);
  // How far the flap's free edge (arc length s_hi from the fold) sags at arc length s.
  const droop = (R: number, s: number, sHi: number) => { const L = curl.sag; return 2 * R * Math.min(1, Math.max(0, 1 - (sHi - s) / L)) * Math.min(1, Math.max(0, (s - Math.PI * R) / L)); };
  // Where the paper at x' (in row yN) is at moment F: along dir (p[0]), across (p[1]), height (p[2]).
  const place = (F: Float64Array, xp: number, yN: number) => {
    const d = F[0], R = F[5], s = d - xp;
    if (s <= 0 || R <= 0) { p[0] = xp; p[2] = 0; }
    else if (s <= Math.PI * R) { p[0] = d - R * Math.sin(s / R); p[2] = R * (1 - Math.cos(s / R)); }
    else { span(F, yN, m); p[0] = d + s - Math.PI * R; p[2] = 2 * R - droop(R, s, d - m[0]); }
    p[1] = yN;
  };
  curl.prepare = (t) => {
    state(t, s0); state(t + EPS, s1);
    frame(s0, A); frame(s1, B);
    curl.top = 2 * A[5] + 1;
    curl.speed = (2 * Math.abs(B[0] - A[0]) + 4 * Math.abs(B[5] - A[5]) + Math.abs(s1[1] - s0[1]) * (W + H + 2 * A[0])) / EPS;
    curl.still = s0[0] === s1[0] && s0[1] === s1[1];
  };
  // At world (out[0], out[1]): out = height, normal (3), and if vel, velocity (3).
  curl.at = (out, vel) => {
    const x = out[0], y = out[1];
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0; out[5] = 0; out[6] = 0;
    const d = A[0], R = A[5];
    if (d <= 0 || R <= 0) return;
    const ux = x - ox - W, uy = y - H, X = ux * A[1] + uy * A[2], yN = ux * A[3] + uy * A[4];
    if (X < d - R) return;
    span(A, yN, m);
    if (m[0] > m[1]) return;
    const sLo = Math.max(0, d - m[1]), sHi = d - m[0];
    let z = 0, s = -1, nx = 0, nz = 1;
    if (X <= d) { // the roll: its upper half, or the lower if this row's paper does not reach that far up
      const th = Math.asin(Math.min(1, (d - X) / R)), up = R * (Math.PI - th), lo = R * th;
      if (up >= sLo && up <= sHi) { z = R * (1 + Math.cos(th)); s = up; nx = -Math.sin(th); nz = Math.cos(th); }
      else if (lo >= sLo && lo <= sHi) { z = R * (1 - Math.cos(th)); s = lo; nx = Math.sin(th); nz = Math.cos(th); }
    } else { // the flap
      const f = X - d + Math.PI * R;
      if (f >= Math.max(sLo, Math.PI * R) && f <= sHi) {
        z = 2 * R - droop(R, f, sHi); s = f;
        const g = (droop(R, f + 0.5, sHi) - droop(R, f - 0.5, sHi)), l = Math.sqrt(g * g + 1); // its slope, along dir
        nx = g / l; nz = 1 / l;
      }
    }
    if (s < 0) return;
    out[0] = z; out[1] = nx * A[1]; out[2] = nx * A[2]; out[3] = nz;
    if (!vel) return;
    // Its velocity: where this point of paper (x' = d - s) is a moment later.
    const xp = d - s, wx = W + xp * A[1] + yN * A[3], wy = H + xp * A[2] + yN * A[4]; // page-local, flat
    const vx = wx - W, vy = wy - H;
    place(B, vx * B[1] + vy * B[2], vx * B[3] + vy * B[4]);
    const qx = W + p[0] * B[1] + p[1] * B[3], qy = H + p[0] * B[2] + p[1] * B[4];
    out[4] = (qx - (x - ox)) / EPS; out[5] = (qy - y) / EPS; out[6] = (p[2] - z) / EPS;
  };
  // Whether the turn is moving paper that could reach a circle there (r: its radius).
  curl.moving = (x, y, r) => {
    if (curl.still || A[0] <= 0) return false;
    const ux = x - ox - W, uy = y - H;
    return ux * A[1] + uy * A[2] - r < 2 * A[0] && x + r > ox && x - r < ox + W && y + r > 0 && y - r < H;
  };
  return curl;
}
