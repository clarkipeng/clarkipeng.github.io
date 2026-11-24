// The card box's pencil tally: graphite marks counting the cards inside, in fives (four down, the fifth across), in rows
// that wrap. Drawn into the texture of the surface they are on (the box or its lid), so the marks move, turn, and tumble
// with it.
// Pure painting: desk.js decides when marks come and go; this turns marks and a time into pixels.
//
// How a real tally looks: each stroke is a quick pull down, leaning a little with the hand, bowed a touch, pressed hardest
// where the pencil touches down and thinning as it lifts off (sometimes with a small flick). Graphite only catches the
// paper's tooth, so a light stroke is broken grain and a pressed one fills in, with a faint metallic sheen where it is
// densest. An eraser takes the grain off unevenly and leaves a soft grey smear along the stroke that fades.

// [key, default, min, max, step, label]: sizes in the box's design px, times in s.
// Where the tally sits (desk.js lays each out on the box): the front panel's top corner, the open lid's flap, the wall
// facing down the page, or along the label.
export const TALLY_SPOTS = ['corner', 'lid', 'wall', 'label'];
export const TALLY_PARAMS = [
  ['tally', 1, 0, 1, 1, 'pencil tally on the box'],
  ['tallyAt', 'corner', 0, 0, 0, 'where'],
  ['tallyX', 0, -20, 20, 0.5, 'nudge along the row px'],
  ['tallyY', 0, -20, 20, 0.5, 'nudge across px'],
  ['tallyLen', 15.5, 8, 30, 0.5, 'stroke length px'],
  ['tallyGap', 5.4, 2, 10, 0.1, 'stroke spacing px'],
  ['tallyGroupGap', 13, 2, 24, 0.5, 'gap between fives px'],
  ['tallyRowGap', 7, 2, 20, 0.5, 'gap between rows px'],
  ['tallySlant', 7, -20, 20, 0.5, 'lean deg'],
  ['tallyBow', 0.9, 0, 3, 0.05, 'bow px'],
  ['tallyFlick', 0.35, 0, 3, 0.05, 'lift-off flick px'],
  ['tallyJitter', 1, 0, 3, 0.05, 'hand variation'],
  ['tallyWidth', 1.7, 0.5, 4, 0.05, 'line width px'],
  ['tallyPressure', 0.95, 0.2, 1.5, 0.01, 'pressure'],
  ['tallyTaper', 0.6, 0, 1, 0.01, 'taper as it lifts off'],
  ['tallyDark', 0.74, 0.2, 1, 0.01, 'graphite darkness'],
  ['tallyGrain', 0.65, 0, 1, 0.01, 'paper grain'],
  ['tallySheen', 0.3, 0, 1, 0.01, 'sheen'],
  ['tallyDrawS', 0.2, 0.05, 0.6, 0.01, 'stroke drawn in s'],
  ['tallyEraseS', 0.3, 0.05, 1, 0.01, 'stroke rubbed out s'],
  ['tallySmudge', 0.3, 0, 1, 0.01, 'eraser smudge'],
  ['tallySmudgeW', 3, 1, 6, 0.1, 'smudge width (x line)'],
  ['tallyFadeS', 1.8, 0.2, 6, 0.1, 'smudge fades over s'],
];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const minJerk = (u) => { u = clamp(u); return u * u * u * (10 - 15 * u + 6 * u * u); }; // a hand's quick stroke: speeds up, then settles
const hash2 = (x, y, k = 0) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x, y, k) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy, k), b = hash2(ix + 1, iy, k), c = hash2(ix, iy + 1, k), d = hash2(ix + 1, iy + 1, k);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
// One mark's random hand, the same every time for the same slot and generation (a redrawn stroke is a new stroke).
const handOf = (seed) => { let i = 0; return () => hash2(seed, i++, 13); };

// The surface: the pixels under the tally's area (canvas px rect), and the paper's tooth there. frame, in the surface's
// design px: where the first row starts (o), the row's direction (eu) and the strokes' (ev, rows follow on that way), and
// the room along a row (uRoom) and for rows (vRoom). Rows are laid out in u, v; a group's first stroke sits at u = gap.
export function tallySurface(canvas, S, frame) {
  const c = [[-4, -4], [frame.uRoom + 4, -4], [-4, frame.vRoom + 4], [frame.uRoom + 4, frame.vRoom + 4]].map(([u, v]) => [(frame.o[0] + u * frame.eu[0] + v * frame.ev[0]) * S, (frame.o[1] + u * frame.eu[1] + v * frame.ev[1]) * S]);
  const x = Math.max(0, Math.floor(Math.min(...c.map((p) => p[0])))), y = Math.max(0, Math.floor(Math.min(...c.map((p) => p[1]))));
  const rect = { x, y, w: Math.min(canvas.width, Math.ceil(Math.max(...c.map((p) => p[0])))) - x, h: Math.min(canvas.height, Math.ceil(Math.max(...c.map((p) => p[1])))) - y };
  const { w, h } = rect, n = w * h;
  const base = canvas.getContext('2d').getImageData(x, y, w, h).data;
  const tooth = new Float32Array(n), rub = new Float32Array(n), glint = new Float32Array(n);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j, k = j * w + i;
    tooth[k] = 0.5 * hash2(px, py, 1) + 0.5 * vnoise(px / 2.2, py / 2.2, 2); // fine tooth over a coarser fiber
    rub[k] = 0.6 * hash2(px, py, 4) + 0.4 * vnoise(px / 3, py / 3, 5); // what an eraser lifts first
    glint[k] = vnoise(px / 4, py / 4, 6);
  }
  return { rect, S, frame, base, tooth, rub, glint, D: new Float32Array(n), M: new Float32Array(n), out: new Uint8ClampedArray(n * 4) };
}

// The rows: how many fives fit in one (at least one), and how far apart groups and rows are.
const rowsOf = (frame, P) => {
  const pitch = 3 * P.tallyGap + P.tallyGroupGap, width = 5 * P.tallyGap; // a five with its slash's overshoot
  return { per: Math.max(1, Math.floor((frame.uRoom - width) / pitch) + 1), pitch, rowPitch: P.tallyLen + P.tallyRowGap };
};
// A mark's centerline in the row frame (a: along the row; b: down the strokes, rows following on), as points with their
// pressure and half width. slot: its place in the count (every fifth crosses the four before it).
function markPath(slot, gen, P, R) {
  const r = handOf(slot * 977 + gen * 131 + 17), J = P.tallyJitter, j = slot % 5, g = (slot - j) / 5;
  const gap = P.tallyGap, len = P.tallyLen, a0 = gap + (g % R.per) * R.pitch + P.tallyX, b0 = Math.floor(g / R.per) * R.rowPitch + len / 2 + P.tallyY;
  const v = () => (r() - 0.5) * J;
  let p0, p2, base, taper;
  if (j < 4) { // a pull down, leaning with the hand (its top further along)
    const l = len * (1 + 0.14 * v()), a = a0 + j * gap + 0.4 * gap * v(), top = b0 - l / 2 + 1.6 * v();
    const lean = Math.tan(((P.tallySlant + 8 * v()) * Math.PI) / 180) * l;
    p0 = [a + lean / 2, top]; p2 = [a - lean / 2, top + l];
    base = 1 + 0.12 * v(); taper = P.tallyTaper * (1 + 0.3 * v());
  } else { // the fifth: a quick flick up across the four, lighter, past them on both sides
    const over = gap * (0.45 + 0.2 * v());
    p0 = [a0 - over, b0 + len * (0.4 + 0.06 * v())]; p2 = [a0 + 3 * gap + over * (0.9 + 0.2 * v()), b0 - len * (0.36 + 0.06 * v())];
    base = 0.88 + 0.1 * v(); taper = clamp(P.tallyTaper * 1.2);
  }
  const dx = p2[0] - p0[0], dy = p2[1] - p0[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const bow = P.tallyBow * (0.5 + r()) * (r() < 0.75 ? 1 : -1) * Math.min(1, J + 0.2);
  const c = [(p0[0] + p2[0]) / 2 + nx * bow * 2, (p0[1] + p2[1]) / 2 + ny * bow * 2]; // a quadratic's middle sits half way to its control point
  const flick = P.tallyFlick * (0.3 + r()), wob = r() * 6.28, hw = P.tallyWidth / 2;
  const N = 18, pts = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), u = 1 - t, f = smooth((t - 0.82) / 0.18) ** 2 * flick; // the flick: the end turns along the label
    const pr = base * (1 + 0.18 * Math.exp(-(((t - 0.05) / 0.06) ** 2))) * (1 - taper * smooth((t - 0.55) / 0.45)) * (1 - 0.6 * smooth((t - 0.88) / 0.12)) * (1 + 0.07 * Math.sin(t * 9 + wob)); // touch-down, then lifting off to nothing
    pts.push({ a: u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0] + f, b: u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1] - f * 0.4, p: pr, w: hw * (0.55 + 0.45 * pr) });
  }
  return { pts, dir: [dx / L, dy / L] };
}

// The box's pixels under the tally at time t. marks: { slot, gen, start, dur, gone: null | { start, dur } } (s).
export function paintTally(surf, marks, t, P) {
  const { rect, S, frame, base, tooth, rub, glint, D, M, out } = surf, W = rect.w, H = rect.h;
  D.fill(0); M.fill(0);
  const R = rowsOf(frame, P), { o, eu, ev } = frame;
  const toPx = (a, b) => [(o[0] + a * eu[0] + b * ev[0]) * S - rect.x, (o[1] + a * eu[1] + b * ev[1]) * S - rect.y];
  for (const m of marks) {
    const draw = minJerk((t - m.start) / m.dur);
    if (draw <= 0) continue;
    const erase = m.gone ? clamp((t - m.gone.start) / m.gone.dur) : 0;
    const fade = m.gone ? smooth((t - m.gone.start - m.gone.dur) / P.tallyFadeS) : 0;
    const { pts, dir } = markPath(m.slot, m.gen, P, R), q = pts.map((p) => [...toPx(p.a, p.b), p.p * P.tallyPressure, p.w * S]);
    const reach = draw * (q.length - 1); // how far along its points the pencil has come
    const smudge = m.gone ? P.tallySmudge * smooth(erase / 0.6) * (1 - fade) : 0, sw = P.tallySmudgeW * P.tallyWidth * 0.5 * S;
    const pad = Math.max(...q.map((p) => p[3])) + (smudge > 0 ? sw * 2 : 1) + 1;
    const x0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])) - pad)), x1 = Math.min(W - 1, Math.ceil(Math.max(...q.map((p) => p[0])) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])) - pad)), y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map((p) => p[1])) + pad));
    // the smear runs along the stroke (the eraser rubs back and forth along it): noise stretched that way
    const sx = dir[0] * eu[0] + dir[1] * ev[0], sy = dir[0] * eu[1] + dir[1] * ev[1], sl = Math.hypot(sx, sy) || 1, sdx = sx / sl, sdy = sy / sl; // the stroke's direction in canvas px
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
      if (d >= hw + 0.75 || erase >= 1) continue;
      const cov = clamp(1 - (d / (hw + 0.75)) ** 2); // a round pencil tip: heaviest down its middle
      const keep = erase > 0 ? smooth((rub[k] - erase * 1.25 + 0.2) / 0.25) * (1 - 0.4 * erase) : 1; // the grain lifts unevenly as it is rubbed
      const dens = clamp(pr * cov * keep);
      D[k] = D[k] + dens - D[k] * dens; // graphite over graphite: darker where strokes cross
    }
  }
  // Graphite on tooth: light pressure catches only the high grain, heavy fills it in; the densest spots shine a little.
  const G = [50, 50, 53], SH = [138, 140, 146], SM = [116, 112, 106], grain = P.tallyGrain, dark = P.tallyDark;
  for (let k = 0, o = 0; k < D.length; k++, o += 4) {
    let r = base[o], g = base[o + 1], b = base[o + 2];
    const ms = M[k] * 0.55;
    if (ms > 0) { r += (SM[0] - r) * ms; g += (SM[1] - g) * ms; b += (SM[2] - b) * ms; }
    const dn = D[k];
    if (dn > 0) {
      const tth = tooth[k], a = dark * ((1 - grain) * dn + grain * smooth((dn * 1.15 - tth + 0.16) / 0.32));
      const sh = P.tallySheen * smooth((dn - 0.5) / 0.5) * glint[k];
      const cr = G[0] + (SH[0] - G[0]) * sh, cg = G[1] + (SH[1] - G[1]) * sh, cb = G[2] + (SH[2] - G[2]) * sh;
      r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = base[o + 3];
  }
  return out;
}
