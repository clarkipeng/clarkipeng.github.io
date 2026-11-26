import { currentDesk } from './state.ts';
import { MOTION, clamp, CORNER, LAND } from './tunables.ts';
import type { Card } from './layout.ts';

interface Obb { x: number; y: number; hw: number; hh: number; u: number[]; v: number[] } // a card's oriented box
interface Edges { l: number; t: number; r: number; b: number }

export function mountShove() {
const desk = currentDesk();
const { nameEl, taglineEl, linksEl, T, DOOR, sources, reduced, placeDom } = desk;

// ---------- shove ----------
// A dropped card shoves the cards it comes down on out of its way. Each is pushed straight away from its pusher's center
// just far enough to clear it (further after a throw), and a pushed card can push the next. Targets are solved once, at
// touch-down, kept on screen and clear of the name, tagline, and links; then each card slides there and lands softly.
const dot2 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
function obb(s: Card, x = s.x, y = s.y): Obb {
  const a = (s.rot * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a);
  return { x, y, hw: s.w / 2, hh: s.h / 2, u: [c, n], v: [-n, c] };
}
const reach = (r: Obb, n: number[]) => r.hw * Math.abs(dot2(r.u, n)) + r.hh * Math.abs(dot2(r.v, n)); // half extent along axis n
// How far rectangle b must move along unit d to clear rectangle a by pad (separating axes); 0 if they do not overlap.
function clearance(a: Obb, b: Obb, d: number[], pad: number) {
  let t = Infinity;
  for (const n of [a.u, a.v, b.u, b.v]) {
    const ca = a.x * n[0] + a.y * n[1], ra = reach(a, n) + pad, cb = b.x * n[0] + b.y * n[1], rb = reach(b, n);
    if (cb - rb >= ca + ra || cb + rb <= ca - ra) return 0;
    const dn = dot2(d, n);
    if (dn > 1e-3) t = Math.min(t, (ca + ra - cb + rb) / dn);
    else if (dn < -1e-3) t = Math.min(t, (cb + rb - ca + ra) / -dn);
  }
  return t;
}
// Boxes no shoved card may end on (desk px): the name, the tagline, the links, the corner and the card box.
function keepOut(x0: number) {
  const p = 10 * desk.view.k, out = [nameEl, taglineEl].map((el) => ({ l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight }));
  const lb = linksEl.getBoundingClientRect();
  out.push({ l: x0 + lb.left, t: lb.top, r: x0 + lb.right, b: lb.bottom });
  out.push(cornerBox(x0, 0));
  const box = desk.deckRect(Math.round(x0 / desk.view.w));
  if (box) out.push(box);
  return out.map((b) => ({ l: b.l - p, t: b.t - p, r: b.r + p, b: b.b + p }));
}
// The page corner's square, out to its hovered fold's tip, padded by p.
function cornerBox(x0: number, p = 10 * desk.view.k): Edges {
  const c = (2 * (CORNER.size + CORNER.lift) - Math.PI * DOOR.R) * desk.view.k / Math.SQRT2 + p;
  return { l: x0 + desk.view.w - c, t: desk.view.h - c, r: x0 + desk.view.w, b: desk.view.h };
}
// A card that comes to rest over the page corner or its box slides off it (the corner would fold over it and take its
// pointer; the box would be hidden).
function offCorner(s: Card) {
  if (desk.view.phone || s.kind === 'deck') return false;
  const x0 = s.region * desk.view.w, [tx, ty] = placeable(s, s.x, s.y, x0, [cornerBox(x0), desk.deckRect(s.region)].filter(Boolean) as Edges[]), dist = Math.hypot(tx - s.x, ty - s.y);
  if (dist < 0.5) return false;
  s.shove = { fx: s.x, fy: s.y, tx, ty, dist, t: 0, dur: MOTION.settle };
  return true;
}
// A shoved card's spot, moved fully on screen (unless it already hung off) and then out of the text the shortest way.
function placeable(s: Card, x: number, y: number, x0: number, boxes: Edges[]) {
  const r = obb(s), ex = reach(r, [1, 0]), ey = reach(r, [0, 1]), m = 12 * desk.view.k;
  const onScreen = (px: number, py: number) => px - ex >= x0 + m - 0.5 && px + ex <= x0 + desk.view.w - m + 0.5 && py - ey >= m - 0.5 && py + ey <= desk.view.h - m + 0.5;
  x = clamp(x, Math.min(x0 + ex + m, s.x), Math.max(x0 + desk.view.w - ex - m, s.x));
  y = clamp(y, Math.min(ey + m, s.y), Math.max(desk.view.h - ey - m, s.y));
  for (const b of boxes) {
    if (Math.min(x + ex, b.r) <= Math.max(x - ex, b.l) || Math.min(y + ey, b.b) <= Math.max(y - ey, b.t)) continue;
    const opts = [[b.r + ex, y], [b.l - ex, y], [x, b.b + ey], [x, b.t - ey]].filter(([px, py]) => onScreen(px, py));
    if (opts.length) [x, y] = opts.reduce((p, q) => (Math.hypot(q[0] - x, q[1] - y) < Math.hypot(p[0] - x, p[1] - y) ? q : p));
  }
  return [x, y];
}
function shove(p: Card) {
  if (!T.shove || desk.view.phone) return;
  const x0 = p.region * desk.view.w, pad = 6 * desk.view.k, boxes = keepOut(x0);
  const m = T.shove * (1 + 0.8 * clamp(p.relV / LAND.p)); // further after a throw
  const at = (s: Card) => (s.shove ? [s.shove.tx, s.shove.ty] : [s.x, s.y]);
  const others = sources.filter((s) => s !== p && s.region === p.region && !s.dragging && !s.flying && s.kind !== 'deck' && !s.deck);
  const pos = new Map([[p, [p.x + p.vx / 7, p.y + p.vy / 7]]]), depth = new Map([[p, 0]]); // p's resting spot
  let front = [p];
  for (let it = 0; it < 5 && front.length; it++) { // chains: whoever moved this pass pushes on the next
    const next = new Set<Card>();
    for (const a of front) {
      const [ax, ay] = pos.get(a)!, A = obb(a, ax, ay);
      for (const b of others) {
        if (b === a) continue;
        let [bx, by] = pos.get(b) || at(b);
        const l = Math.hypot(bx - ax, by - ay), d = l > 1e-3 ? [(bx - ax) / l, (by - ay) / l] : [0, 1];
        const t = clearance(A, obb(b, bx, by), d, pad);
        if (!t || !Number.isFinite(t)) continue;
        [bx, by] = placeable(b, bx + d[0] * t * m, by + d[1] * t * m, x0, boxes);
        pos.set(b, [bx, by]);
        if (!depth.has(b)) depth.set(b, depth.get(a)! + 1);
        next.add(b);
      }
    }
    front = [...next];
  }
  for (const [b, [tx, ty]] of pos) {
    const dist = Math.hypot(tx - b.x, ty - b.y);
    if (b === p || dist < 0.5) continue;
    if (reduced) { Object.assign(b, { x: tx, y: ty }); placeDom(b); continue; } // no motion: it is just out of the way
    b.shove = { fx: b.x, fy: b.y, tx, ty, dist, t: -0.07 * (depth.get(b)! - 1), dur: MOTION.settle * (0.8 + 0.4 * clamp(dist / (250 * desk.view.k))) };
    b.vx = b.vy = 0;
  }
}
// A shoved card slides out with an ease-out (chained cards a beat later) and just stops: only the card you drop bursts.
function stepShove(s: Card, dt: number) {
  const v = s.shove!;
  v.t += dt;
  const e = desk.easeOutQuart(clamp(v.t / v.dur));
  s.x = v.fx + (v.tx - v.fx) * e; s.y = v.fy + (v.ty - v.fy) * e;
  if (v.t >= v.dur) { s.shove = null; if (s.rel < 0) s.rel = 0; placeDom(s); }
}
return { obb, reach, stepShove, offCorner, shove, keepOut, cornerBox };
}
