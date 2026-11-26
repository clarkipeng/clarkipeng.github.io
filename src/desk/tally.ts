// The card box's pencil tally: graphite marks counting the cards inside, in fives (four down, the fifth across), in rows
// that wrap. Drawn into the box's texture, so the marks move, turn, and tumble with it.
// Pure painting: desk.ts decides when marks come and go; this turns marks and a time into pixels.
//
// How a real tally looks: each stroke is a quick pull down, leaning a little with the hand, bowed a touch, pressed hardest
// where the pencil touches down and thinning as it lifts off (sometimes with a small flick). Graphite only catches the
// paper's tooth, so a light stroke is broken grain and a pressed one fills in, with a faint metallic sheen where it is
// densest. An eraser takes the grain off unevenly and leaves a soft grey smear along the stroke that fades.

// The look of a tally, in the box's design px and seconds.
export const TALLY = {
  len: 19, // stroke length
  gap: 6.6, // stroke spacing
  groupGap: 19, // gap between fives
  rowGap: 7, // gap between rows
  slant: 7, // lean, deg
  bow: 0.9,
  flick: 0.35, // the lift-off flick
  jitter: 1, // how much the hand varies
  pressure: 0.95,
  taper: 0.6, // thinning as it lifts off
  grain: 0.5, // paper grain
  sheen: 0.3,
  drawS: 0.2, // a stroke is drawn in
  eraseS: 0.3, // a stroke is rubbed out in
  smudge: 0.3, // the eraser's smear
  smudgeW: 3, // smear width, times the line's
  fadeS: 1.8, // the smear fades over
};

// [key, default, min, max, step, label]: its rows in the admin panel.
export const TALLY_PARAMS = [
  ['tallyWidth', 1.3, 0.5, 4, 0.05, 'Tally line width'],
  ['tallyDark', 0.8, 0.2, 1, 0.01, 'Tally darkness'],
] as const;
export type TallyTunables = Record<(typeof TALLY_PARAMS)[number][0], number>;

// A rect in the box's design px.
export interface Area { x: number; y: number; w: number; h: number }
export interface TallySurface {
  rect: Area; // canvas px
  S: number;
  area: Area;
  base: Uint8ClampedArray;
  tooth: Float32Array;
  rub: Float32Array;
  glint: Float32Array;
  D: Float32Array;
  M: Float32Array;
  out: Uint8ClampedArray<ArrayBuffer>;
}
// One stroke: drawn from start over dur (s), and rubbed out once gone.
export interface Mark {
  slot: number;
  gen: number;
  start: number;
  dur: number;
  gone: null | { start: number; dur: number };
}
type Rows = { per: number; pitch: number; rowPitch: number };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (u: number) => { u = clamp(u); return u * u * (3 - 2 * u); };
const minJerk = (u: number) => { u = clamp(u); return u * u * u * (10 - 15 * u + 6 * u * u); }; // a hand's quick stroke: speeds up, then settles
const hash2 = (x: number, y: number, k = 0) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x: number, y: number, k: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy, k), b = hash2(ix + 1, iy, k), c = hash2(ix, iy + 1, k), d = hash2(ix + 1, iy + 1, k);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
// One mark's random hand, the same every time for the same slot and generation (a redrawn stroke is a new stroke).
const handOf = (seed: number) => { let i = 0; return () => hash2(seed, i++, 13); };

// The surface: the pixels under the tally's area (area: x, y, w, h in the box's design px; S: canvas px each), and the
// paper's tooth there. Rows of strokes run along x and follow on down; a group's first stroke sits at x = gap.
export function tallySurface(canvas: OffscreenCanvas, S: number, area: Area): TallySurface {
  const x = Math.max(0, Math.floor((area.x - 4) * S)), y = Math.max(0, Math.floor((area.y - 4) * S));
  const rect = { x, y, w: Math.min(canvas.width, Math.ceil((area.x + area.w + 4) * S)) - x, h: Math.min(canvas.height, Math.ceil((area.y + area.h + 4) * S)) - y };
  const { w, h } = rect, n = w * h;
  const base = canvas.getContext('2d')!.getImageData(x, y, w, h).data;
  const tooth = new Float32Array(n), rub = new Float32Array(n), glint = new Float32Array(n);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j, k = j * w + i;
    tooth[k] = 0.5 * hash2(px, py, 1) + 0.5 * vnoise(px / 2.2, py / 2.2, 2); // fine tooth over a coarser fiber
    rub[k] = 0.6 * hash2(px, py, 4) + 0.4 * vnoise(px / 3, py / 3, 5); // what an eraser lifts first
    glint[k] = vnoise(px / 4, py / 4, 6);
  }
  return { rect, S, area, base, tooth, rub, glint, D: new Float32Array(n), M: new Float32Array(n), out: new Uint8ClampedArray(n * 4) };
}

// The rows: how many fives fit in one (at least one), and how far apart groups and rows are.
const rowsOf = (area: Area): Rows => {
  const pitch = 3 * TALLY.gap + TALLY.groupGap, width = 5.6 * TALLY.gap; // a five with its slash's overshoot
  return { per: Math.max(1, Math.floor((area.w - width) / pitch) + 1), pitch, rowPitch: TALLY.len + TALLY.rowGap };
};
// A mark's centerline (a: along the row; b: down the strokes, rows following on), as points with their
// pressure and half width. slot: its place in the count (every fifth crosses the four before it).
function markPath(slot: number, gen: number, P: TallyTunables, R: Rows) {
  const r = handOf(slot * 977 + gen * 131 + 17), J = TALLY.jitter, j = slot % 5, g = (slot - j) / 5;
  const gap = TALLY.gap, len = TALLY.len, a0 = gap + (g % R.per) * R.pitch, b0 = Math.floor(g / R.per) * R.rowPitch + len / 2;
  const v = () => (r() - 0.5) * J;
  let p0: number[], p2: number[], base: number, taper: number;
  if (j < 4) { // a pull down, leaning with the hand (its top further along)
    const l = len * (1 + 0.14 * v()), a = a0 + j * gap + 0.15 * gap * v(), top = b0 - l / 2 + 1.6 * v();
    const lean = Math.tan(((TALLY.slant + 4 * v()) * Math.PI) / 180) * l;
    p0 = [a + lean / 2, top]; p2 = [a - lean / 2, top + l];
    base = 1 + 0.12 * v(); taper = TALLY.taper * (1 + 0.3 * v());
  } else { // the fifth: a long shallow stroke up across the four, past them on both sides
    const over = gap * (0.8 + 0.2 * v());
    p0 = [a0 - over, b0 + len * (0.3 + 0.04 * v())]; p2 = [a0 + 3 * gap + over * (0.9 + 0.2 * v()), b0 - len * (0.3 + 0.04 * v())]; // shallow, about 20 degrees
    base = 0.95 + 0.08 * v(); taper = TALLY.taper * 0.45; // pressed evenly all the way across, so it reads as one line
  }
  const dx = p2[0] - p0[0], dy = p2[1] - p0[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const bow = TALLY.bow * (0.5 + r()) * (r() < 0.75 ? 1 : -1) * Math.min(1, J + 0.2);
  const c = [(p0[0] + p2[0]) / 2 + nx * bow * 2, (p0[1] + p2[1]) / 2 + ny * bow * 2]; // a quadratic's middle sits half way to its control point
  const flick = TALLY.flick * (0.3 + r()), wob = r() * 6.28, hw = P.tallyWidth / 2;
  const N = 18, pts: { a: number; b: number; p: number; w: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), u = 1 - t, f = smooth((t - 0.82) / 0.18) ** 2 * flick; // the flick: the end turns along the label
    const pr = base * (1 + 0.18 * Math.exp(-(((t - 0.05) / 0.06) ** 2))) * (1 - taper * smooth((t - 0.55) / 0.45)) * (1 - 0.6 * smooth((t - 0.88) / 0.12)) * (1 + 0.07 * Math.sin(t * 9 + wob)); // touch-down, then lifting off to nothing
    pts.push({ a: u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0] + f, b: u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1] - f * 0.4, p: pr, w: hw * (0.55 + 0.45 * pr) });
  }
  return { pts, dir: [dx / L, dy / L] };
}

// The box's pixels under the tally at time t. marks: { slot, gen, start, dur, gone: null | { start, dur } } (s).
export function paintTally(surf: TallySurface, marks: Mark[], t: number, P: TallyTunables) {
  const { rect, S, area, base, tooth, rub, glint, D, M, out } = surf, W = rect.w, H = rect.h;
  D.fill(0); M.fill(0);
  const R = rowsOf(area);
  const toPx = (a: number, b: number) => [(area.x + a) * S - rect.x, (area.y + b) * S - rect.y];
  for (const m of marks) {
    const draw = minJerk((t - m.start) / m.dur);
    if (draw <= 0) continue;
    const erase = m.gone ? clamp((t - m.gone.start) / m.gone.dur) : 0;
    const fade = m.gone ? smooth((t - m.gone.start - m.gone.dur) / TALLY.fadeS) : 0;
    const { pts, dir } = markPath(m.slot, m.gen, P, R), q = pts.map((p) => [...toPx(p.a, p.b), p.p * TALLY.pressure, p.w * S]);
    const reach = draw * (q.length - 1); // how far along its points the pencil has come
    const smudge = m.gone ? TALLY.smudge * smooth(erase / 0.6) * (1 - fade) : 0, sw = TALLY.smudgeW * P.tallyWidth * 0.5 * S;
    const pad = Math.max(...q.map((p) => p[3])) + (smudge > 0 ? sw * 2 : 1) + 1;
    const x0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])) - pad)), x1 = Math.min(W - 1, Math.ceil(Math.max(...q.map((p) => p[0])) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])) - pad)), y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map((p) => p[1])) + pad));
    // the smear runs along the stroke (the eraser rubs back and forth along it): noise stretched that way
    const [sdx, sdy] = dir;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const X = px + 0.5, Y = py + 0.5;
      let best = Infinity, bt = 0, bk = 0;
      for (let i = 0; i < q.length - 1 && i < reach; i++) {
        const A = q[i], B = q[i + 1], e = Math.min(1, reach - i), bx = A[0] + (B[0] - A[0]) * e, by = A[1] + (B[1] - A[1]) * e;
        const vx = bx - A[0], vy = by - A[1], l2 = vx * vx + vy * vy || 1e-6, u = clamp(((X - A[0]) * vx + (Y - A[1]) * vy) / l2);
        const d2 = (X - A[0] - u * vx) ** 2 + (Y - A[1] - u * vy) ** 2;
        if (d2 < best) { best = d2; bt = u * e; bk = i; }
      }
      const A = q[bk], B = q[Math.min(bk + 1, q.length - 1)], pr = A[2] + (B[2] - A[2]) * bt, hw = A[3] + (B[3] - A[3]) * bt, d = Math.sqrt(best);
      const k = py * W + px;
      if (smudge > 0) {
        const along = (X * sdx + Y * sdy) / S, across = (X * -sdy + Y * sdx) / S;
        const streak = 0.55 + 0.45 * vnoise(along * 0.35, across * 2.2, 9);
        const m2 = clamp(smudge * (Math.exp(-((d / sw) ** 2)) * streak + 0.6 * clamp(1 - d / hw))); // a haze along the rubbing, and a faint ghost of the line
        M[k] = M[k] + m2 - M[k] * m2;
      }
      if (d >= hw + 0.5 || erase >= 1) continue;
      const cov = clamp(1 - (d / (hw + 0.5)) ** 4); // a round pencil tip: heaviest down its middle
      const keep = erase > 0 ? smooth((rub[k] - erase * 1.25 + 0.2) / 0.25) * (1 - 0.4 * erase) : 1; // the grain lifts unevenly as it is rubbed
      const dens = clamp(pr * cov * keep);
      D[k] = D[k] + dens - D[k] * dens; // graphite over graphite: darker where strokes cross
    }
  }
  // Graphite on tooth: light pressure catches only the high grain, heavy fills it in; the densest spots shine a little.
  const G = [50, 50, 53], SH = [138, 140, 146], SM = [116, 112, 106], grain = TALLY.grain, dark = P.tallyDark;
  for (let k = 0, o = 0; k < D.length; k++, o += 4) {
    let r = base[o], g = base[o + 1], b = base[o + 2];
    const ms = M[k] * 0.55;
    if (ms > 0) { r += (SM[0] - r) * ms; g += (SM[1] - g) * ms; b += (SM[2] - b) * ms; }
    const dn = D[k];
    if (dn > 0) {
      const tth = tooth[k], a = dark * ((1 - grain) * dn + grain * smooth((dn * 1.15 - tth + 0.16) / 0.32));
      const sh = TALLY.sheen * smooth((dn - 0.5) / 0.5) * glint[k];
      const cr = G[0] + (SH[0] - G[0]) * sh, cg = G[1] + (SH[1] - G[1]) * sh, cb = G[2] + (SH[2] - G[2]) * sh;
      r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = base[o + 3];
  }
  return out;
}
