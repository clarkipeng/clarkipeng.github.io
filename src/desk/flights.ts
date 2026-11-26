import { currentDesk } from './state.ts';
import { REF_W, REF_H, MOTION, clamp, smooth, ANGLE } from './tunables.ts';
import type { Card, Stack, OutFlight, InFlight } from './layout.ts';


export function mountFlights() {
const desk = currentDesk();
const { reduced, holdPage, T, sources, placeDom, next, turn, shown, obb, reach, keepOut } = desk;

// ---------- tidy ----------
// A card's home: its slot on this layout, at its slot's angle.
const homeOf = (s: Card): [number, number, number] => [(s.region + s.slot!.x / REF_W) * desk.view.w, (s.slot!.y / REF_H) * desk.view.h, s.slot!.r]; // a card with a home has a slot


// ---------- drawing ----------
// The one way cards enter a page (Clark's deck-lab pick, "fan then deal"): a page's cards wait face down in its card
// box, upright (every postcard turned a quarter turn, portrait), their edges just out of its open end; they slide out of
// it and fan toward the page from the top card down, and are dealt top first: each lifts off and travels home on an
// ease-out, turning face up on the way (from 10% to 51% of the travel) while it turns the quarter turn to land at its
// desk angle (6% to 60%), and lands with the burst at contact. Going back in is the same path backward on one clock: it
// lifts, turns face down and upright, reaches the box's open end, and slides in on top. The first visit, a deep link,
// and every page turn deal this way.
const DRAW = { dur: 0.73, flipA: 0.1, flipB: 0.51, rotA: 0.06, rotB: 0.6, fan: 0.26 }; // s, then fractions of the travel, s to fan open
const upright = (s: Card) => (s.w > s.h ? 90 : 0); // deg: a card in a box stands upright; a landscape one turns a quarter turn
const GATHER = { dur: 0.36, stagger: 0.05 }; // a gather is the deal backward at twice the pace, the cards close together
const INTRO_DELAY = 0.15 + MOTION.settle; // s before the first visit's box fans: it slides in first
// One clock for every card in the air: a batch that starts while others fly is timed from now on it. then: what
// follows once every card is down: the page turn after a gather.
const flights = { on: false, t: 0, then: null as (() => void) | null };
const now = () => (flights.on ? flights.t : (flights.t = 0));
const easeOutQuart = (u: number) => 1 - (1 - u) ** 4;
function cubicBezier(x1: number, y1: number, x2: number, y2: number) { // CSS cubic-bezier timing, solved for x by Newton steps with a bisection fallback
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t, sy = (t: number) => ((ay * t + by) * t + cy) * t, dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const err = sx(t) - x, d = dx(t); if (Math.abs(err) < 1e-6 || Math.abs(d) < 1e-6) break; t -= err / d; }
    if (!(t >= 0 && t <= 1) || Math.abs(sx(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 40; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return sy(t);
  };
}
const drawEase = cubicBezier(0.25, 1, 0.5, 1);
// Deal a page's featured cards (the ones with a home slot) from its box to their homes, top first, the box fanning them
// out at `delay` (s).
// hold: the page starts from bare paper and its slime grows out of the cards as they land (the first visit); a page turned
// to keeps the network it was warmed with, and the cards land on it.
function drawFrom(region: number, { delay = 0, hold = true }: { delay?: number; hold?: boolean } = {}) {
  endFlights(region);
  const deck = pageDeck(region);
  if (desk.view.phone || !desk.gpu || reduced || !deck) return;
  pileUp(region, true); // the page's own cards go in first (the first visit)
  const cards = deck.pile.filter((s) => s.featured).reverse(); // the box is a stack: the top card, the last put in, first
  if (!cards.length) return;
  if (hold) { for (const s of cards) s.rel = -1; atHome(region, () => holdPage(desk.sim!)); } // each agent waits for the card that will land nearest it
  const t0 = now() + delay;
  cards.forEach((s, k) => deal(s, deck, t0 + DRAW.fan + k * T.drawStagger, { k, n: cards.length, at: t0 }, homeOf(s)));
  deck.z = ++desk.topZ; // they slide out from under its front
  flights.on = true;
  stepFlights(0);
}
// Runs fn with a page's featured cards lying at home (its slime sees them there while they are in its box).
function atHome(region: number, fn: () => void) {
  const cards = sources.filter((s) => s.region === region && s.featured);
  const was = cards.map(({ x, y, rot, flying }) => ({ x, y, rot, flying }));
  for (const s of cards) { [s.x, s.y, s.rot] = homeOf(s); s.flying = false; }
  fn();
  cards.forEach((s, i) => Object.assign(s, was[i]));
}
// One card out of its box toward `to` (its home, or a free spot): it leaves the pile now (card k of the n dealt together,
// the first on top; they fan from stack.at) and is dealt at `at`.
function deal(s: Card, deck: Card, at: number, stack: Stack, [x, y, r]: number[]) {
  const i = deck.pile.indexOf(s);
  deck.pile.splice(i, 1); deck.dirty = true;
  s.fly = { out: true, at, x, y, r, deck, stack, i, ur: upright(s), pw: Math.min(s.w, s.h) };
  Object.assign(s, { deck: null, flying: true, face: 1, flip: 0, flipTo: 0, ch: null, vx: 0, vy: 0, released: false, shove: null, kb: null });
  s.el.classList.add('flying'); // clicks go through to the box
  s.el.classList.remove('flipped'); s.hit.setAttribute('aria-expanded', 'false');
}
// Where a card in a box lies: the box's axis (its rotation), and positions along it from the box's open end.
const BOX_STEP = 1.4; // px each card in a box sits further out of its open end than the one below, so the pile shows its thickness
const along = (d: { x: number; y: number; rot: number }, off: number, up = 0) => { const a = (d.rot * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a); return [d.x - off * c + up * n, d.y - off * n - up * c]; };
// Card i in the box: squared with it, its edge out of the open end by a few px (a little more, and a little higher, for
// each card above), under the box's front.
function pilePose(d: Card, i: number, s: Card, ur = upright(s)) {
  const pw = Math.min(s.w, s.h), out = (2 + i * BOX_STEP) * desk.view.k;
  return [...along(d, d.w / 2 - pw / 2 + out, i * 0.5 * desk.view.k), d.rot + ur];
}
// The box's open end, for card i: square with the box and just touching it, so sliding in is all that is left.
function mouthPose(d: Card, i: number, s: Card) {
  const [x, y, r] = pilePose(d, i, s), pw = Math.min(s.w, s.h), off = pw - (2 + i * BOX_STEP) * desk.view.k;
  return [...along({ ...d, x, y }, off), r];
}
const pileZ = (d: Card, i: number) => d.z - 1 + (i + 1) * 1e-3; // under the box's front, the top card highest
// How far a card being dealt is through its fan (0 to 1), and how far out of the box's open end (it slides out first).
const fanOf = (k: OutFlight, t = flights.t) => { const f = k.stack, a = 1 - (1 - clamp((t - f.at - f.k * 0.03) / DRAW.fan)) ** 3; return [clamp((a - 0.4) / 0.6), clamp(a / 0.6)]; };
// A dealt card waiting to go: out of the box's open end (clear of it), then fanned toward the page around its outer edge.
function waitPose(s: Card, k: OutFlight, t = flights.t) {
  const d = k.deck, f = k.stack, [px, py, pr] = pilePose(d, k.i, s, k.ur), [a, o] = fanOf(k, t);
  const [cx, cy] = along({ ...d, x: px, y: py }, smooth(o) * (k.pw - (2 + k.i * BOX_STEP) * desk.view.k + 6 * desk.view.k)); // clear of the box
  const { k: j, n } = f, deg = a * (j - (n - 1) / 2) * Math.min(9, 40 / n), th = (deg * Math.PI) / 180, pw = d.room.pw * desk.view.cs!, ph = d.room.ph * desk.view.cs!;
  const ox = -0.62 * pw, oy = -0.18 * ph; // from the pivot (outer edge, a little low) to the pile's center
  return [cx + 0.62 * pw + ox * Math.cos(th) - oy * Math.sin(th) - (a * 30 * (n - j)) / n, cy + 0.18 * ph + ox * Math.sin(th) + oy * Math.cos(th), pr + deg];
}
// A page's cards that are not on the desk go in its box (each page's cards wait there until it is shown); own: the page's
// own cards too (before a first visit's deal). Each goes in on top, the last in order first, so the first in order is
// on top. Only cards not in it yet.
function pileUp(region: number, own = false) {
  const deck = pageDeck(region);
  if (desk.view.phone || !desk.gpu || reduced || !deck) return;
  if (region !== desk.page) desk.resetBox(deck); // out of sight, a box puts itself away at once
  const cards = sources.filter((s) => s.region === region && decked(s) && !s.deck && !s.fly && !s.dragging && (own || region !== desk.page || !s.slot)).sort((a, b) => b.order - a.order);
  for (const s of cards) {
    deck.pile.push(s);
    Object.assign(s, { deck, flying: true, face: 1, flip: 0, flipTo: 0, ch: null, emit: 0, vx: 0, vy: 0, released: false, shove: null, kb: null });
    s.el.classList.add('flying'); s.el.classList.remove('flipped'); s.hit.setAttribute('aria-expanded', 'false');
  }
  if (cards.length) { deck.z = ++desk.topZ; deck.dirty = true; if (!deck.launch) desk.moveDeck(deck); } // a flying box takes them once it is back
}
// Hermite curve from p0 to p1 with end tangents t0, t1 (one coordinate).
const hermite = (p0: number, p1: number, t0: number, t1: number, u: number) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * t0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * t1; };
function stepFlights(dt: number) {
  if (!flights.on) return;
  flights.t += dt;
  let busy = false;
  for (const s of sources) {
    const k = s.fly;
    if (!k) continue;
    if (k.in) busy = stepIn(s, k) || busy;
    else busy = stepOut(s, k) || busy;
    placeDom(s);
  }
  flights.on = busy;
  const then = flights.then;
  if (then && !busy) { flights.then = null; then(); }
  else if (!busy) next();
}
// A card dealt: it waits in the fan, then lifts off (8% of the draw) and travels home, so it rises up and over the cards
// below; it turns face up and to its desk angle on the way, and lands.
function stepOut(s: Card, k: OutFlight) {
  const d = k.deck, [wx, wy, wr] = waitPose(s, k), u = clamp((flights.t - k.at) / DRAW.dur), e = drawEase(clamp((u - 0.08) / 0.92));
  if (u > 0 && !k.up) { k.up = true; s.z = ++desk.topZ; } // off the top
  else if (!k.up && !k.clear && fanOf(k)[1] >= 1) { k.clear = true; s.z = d.z + 0.6 + (k.stack.n - k.stack.k) * 1e-3; } // out of the box, over it
  else if (!k.up && !k.clear) s.z = pileZ(d, k.i);
  Object.assign(s, { x: wx + (k.x - wx) * e, y: wy + (k.y - wy) * e, rot: wr + (k.r - wr) * smooth((u - DRAW.rotA) / (DRAW.rotB - DRAW.rotA)),
    face: 1 - desk.easeFlip(smooth((u - DRAW.flipA) / (DRAW.flipB - DRAW.flipA))), flyLift: 0.45 * smooth(u / 0.14) * (1 - smooth((u - 0.78) / 0.22)) });
  if (u < 1) return true;
  Object.assign(s, { x: k.x, y: k.y, rot: k.r, flying: false, fly: null, face: 0, flyLift: 0 }); s.el.classList.remove('flying'); // it lands as it settles (contact)
  return false;
}
// A card going into its box, on one clock: from where it was (lifting, turning face down and upright) to the box's open
// end, then straight in under its front to its place on top; a card already waiting at the open end only slides in.
function stepIn(s: Card, k: InFlight) {
  const d = k.deck, i = d.pile.indexOf(s), [px, py, pr] = pilePose(d, i, s), [mx, my] = mouthPose(d, i, s);
  const u = clamp((flights.t - k.at) / k.dur);
  if (u <= 0) return true; // its turn in the gather has not come yet
  if (!k.up) { k.up = true; s.z = ++desk.topZ; }
  const l1 = Math.hypot(mx - k.x0, my - k.y0), l2 = Math.hypot(px - mx, py - my), f1 = l1 < 1 ? 0 : l1 / (l1 + l2), e = (f1 ? drawEase : easeOutQuart)(u);
  if (e < f1) { // to the open end, arriving at the speed it slides in with
    const v = e / f1, g = f1 / (1 - f1);
    Object.assign(s, { x: hermite(k.x0, mx, mx - k.x0, (px - mx) * g, v), y: hermite(k.y0, my, my - k.y0, (py - my) * g, v), rot: k.r0 + (pr - k.r0) * smooth(v / 0.8),
      face: k.face0 + (1 - k.face0) * desk.easeFlip(smooth((v - 0.1) / 0.7)), flyLift: Math.max(0.45 * smooth(v / 0.3), k.lift0 * (1 - smooth(v / 0.3))) * (1 - smooth((v - 0.6) / 0.4)) });
  } else { // in it goes
    const v = f1 < 1 ? (e - f1) / (1 - f1) : 1;
    if (!k.inside) { k.inside = true; s.z = pileZ(d, i); }
    Object.assign(s, { x: mx + (px - mx) * v, y: my + (py - my) * v, rot: pr, face: 1, flyLift: 0 });
  }
  if (u < 1) return true;
  s.fly = null; d.dirty = true; d.squashV = (d.squashV || 0) + 8; // in: the box gives a little
  if (k.say) say(`${k.say} put back, ${d.pile.length} card${d.pile.length === 1 ? '' : 's'} in the box`);
  return false;
}
// Finishes every card in the air (on one page, if given): one going into a box is in it, one being dealt is home.
function endFlights(region: number | null = null) {
  for (const s of sources) {
    if (region != null && s.region !== region) continue;
    if (s.shove) { Object.assign(s, { x: s.shove.tx, y: s.shove.ty, shove: null }); placeDom(s); }
    const k = s.fly;
    if (!k) continue;
    if (k.in) { s.fly = null; k.deck.dirty = true; continue; }
    s.el.classList.remove('flying');
    Object.assign(s, { x: k.x, y: k.y, rot: k.r, flying: false, fly: null, rel: 1e3, face: 0, flyLift: 0, pk: null }); // put there: no landing
    placeDom(s);
  }
  flights.on = sources.some((s) => s.fly);
}
// The page's box: click deals the top card (to its slot, or the best free spot); double-click gathers every card on the
// page into it, or deals them all when none are on the desk; a card dropped on it goes in on top. Enter deals,
// Shift+Enter gathers or deals; on an empty box, double-click or Enter gathers.
const pageDeck = (r: number) => sources.find((s) => s.more && s.region === r);
const decked = (s: Card) => s.kind !== 'deck'; // every card on a page goes in its box: the projects, the polaroid and the note
const onDesk = (r: number) => sources.filter((o) => o.region === r && decked(o) && !o.deck && !o.dragging); // (cards being dealt too)
let deckTimer = 0;
function deckClick(deck: Card, e: MouseEvent | KeyboardEvent) {
  if (!deck.pile.length) { // empty: double-click or Enter puts every card back; a click is a tiny nudge
    if (e.type === 'keydown' || (e as MouseEvent).detail >= 2) boxGather(deck); else deck.squashV = (deck.squashV || 0) + 8;
    return;
  }
  if (e.type === 'keydown') { if (e.shiftKey) deckDouble(deck); else drawMore(deck); return; }
  clearTimeout(deckTimer);
  if ((e as MouseEvent).detail >= 2) deckDouble(deck); else deckTimer = setTimeout(() => drawMore(deck), 230); // wait to see if it is a double-click
}
function drawMore(deck: Card, all = false) {
  if (desk.view.phone || turn.on) return;
  const take = all ? deck.pile.slice().reverse() : deck.pile.slice(-1); // top first
  if (!take.length) { deck.squashV = (deck.squashV || 0) + 8; return; } // empty: a tiny nudge
  if (deck.lidT > 0) { deck.drawAsk = { all }; return; } // shut: it opens first
  take.forEach((s, i) => {
    const [x, y, r] = s.slot ? homeOf(s) : freeSlot(s);
    if (!s.slot) s.slot = { x: ((x - s.region * desk.view.w) / desk.view.w) * REF_W, y: (y / desk.view.h) * REF_H, w: s.baseW, r };
    s.shoveOnLand = !all;
    deal(s, deck, now() + i * T.drawStagger, { k: i, n: take.length, at: now() }, [x, y, r]);
  });
  deck.z = ++desk.topZ;
  flights.on = true;
  stepFlights(0);
}
// Every card on the box's page goes in.
function boxGather(deck: Card) {
  if (turn.on) return;
  if (deck.bx.at !== 0 || deck.lidT > 0) { deck.gatherAsk = true; return; } // tucked: it slides out and opens first
  const out = onDesk(deck.region);
  if (out.length) gather(out, deck);
}
function deckDouble(deck: Card) {
  const out = onDesk(deck.region);
  if (out.length) gather(out, deck); else drawMore(deck, true);
}
// Gather: the deal played backward: last in order first, so the first in order goes in last, on top, and is dealt
// first again.
function gather(cards: Card[], deck: Card) {
  cards.sort((a, b) => b.order - a.order).forEach((s, i) => collect(s, deck, now() + i * GATHER.stagger));
  flights.on = true;
  stepFlights(0);
}
// One card into a box, on top: from where it shows (mid-flip, mid-deal, or waiting at the open end), face as it is.
function collect(s: Card, deck: Card, at: number, dur = GATHER.dur, say = '') {
  const [sx, sy, r0] = shown(s), [fz, fv] = desk.flipPath(s), a = (r0 * Math.PI) / 180, x0 = sx - Math.sin(a) * fv, y0 = sy + Math.cos(a) * fv; // mid-flip: from where its turn has it
  deck.pile.push(s); deck.z = ++desk.topZ; deck.dirty = true;
  s.fly = { in: true, deck, at, dur, x0, y0, r0, face0: s.face, lift0: fz / T.lift, open: s.flip > 0, say };
  Object.assign(s, { deck, x: x0, y: y0, rot: r0, snap: 0, over: false, flying: true, flip: 0, flipTo: 0, ch: null, vx: 0, vy: 0, released: false, shove: null, kb: null });
  s.el.classList.add('flying'); s.el.classList.remove('flipped', 'turning', 'dragging'); s.hit.setAttribute('aria-expanded', 'false');
}
// Putting one card back by hand (a drop over its box, or Enter while it waits there): it slides in, keyboard focus goes to
// the box, and a screen reader hears where it went.
function putBack(s: Card, deck: Card) {
  const focused = s.el.contains(document.activeElement);
  collect(s, deck, now(), s.snap! > 0.99 ? desk.BOX.put : GATHER.dur, s.hit.getAttribute('aria-label')!.replace(/: [^:]*$/, ''));
  flights.on = true; stepFlights(0);
  if (focused) deck.hit.focus({ preventScroll: true });
}
const live = desk.root.appendChild(Object.assign(document.createElement('p'), { className: 'live' }));
live.setAttribute('aria-live', 'polite');
const say = (text: string) => { live.textContent = text; };
// Is a desk point over a page's box (grown by pad px)?
function overDeck(deck: Card, x: number, y: number, pad = 0) {
  const r = obb(deck), ex = reach(r, [1, 0]) + pad, ey = reach(r, [0, 1]) + pad;
  return Math.abs(x - deck.x) < ex && Math.abs(y - deck.y) < ey;
}
// The box's part of the page as a rectangle (desk px), for keeping cards off it.
function deckRect(region: number) {
  const d = desk.dealing && !desk.view.phone && pageDeck(region);
  if (!d) return null;
  const r = obb(d), ex = reach(r, [1, 0]), ey = reach(r, [0, 1]);
  return { l: d.x - ex, r: d.x + ex, t: d.y - ey, b: d.y + ey };
}
// The best free spot for a card on its page: a grid search for the least overlap with the other cards (24 px apart),
// the name, tagline, links, corner and box, inside a 32 px margin, then nearest the middle; its angle is a flip's Gaussian.
function freeSlot(s: Card) {
  const x0 = s.region * desk.view.w, gauss = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const r = clamp(gauss * ANGLE.jitter, -ANGLE.max, ANGLE.max), b = obb({ ...s, rot: r }), ex = reach(b, [1, 0]), ey = reach(b, [0, 1]);
  const pad = 24 * desk.view.k, m = 32 * desk.view.k, step = 16;
  const near = sources.filter((o) => o !== s && o.region === s.region && !o.deck && o.kind !== 'deck');
  const boxes = keepOut(x0).concat(near.map((o) => {
    const q = obb(o), qx = reach(q, [1, 0]), qy = reach(q, [0, 1]);
    return { l: o.x - qx, r: o.x + qx, t: o.y - qy, b: o.y + qy };
  }));
  const over = (x: number, y: number, p: number) => boxes.reduce((sum, q) => sum + Math.max(0, Math.min(x + ex, q.r + p) - Math.max(x - ex, q.l - p)) * Math.max(0, Math.min(y + ey, q.b + p) - Math.max(y - ey, q.t - p)), 0);
  let best = [Infinity, x0 + desk.view.w / 2, desk.view.h / 2];
  for (let y = m + ey; y <= desk.view.h - m - ey; y += step) for (let x = x0 + m + ex; x <= x0 + desk.view.w - m - ex; x += step) {
    // touching anything is far worse than coming within 24 px of it, which is worse than being off center
    const score = over(x, y, 0) * 1e4 + over(x, y, pad) * 10 + Math.hypot(x - x0 - desk.view.w / 2, y - desk.view.h / 2);
    if (score < best[0]) best = [score, x, y];
  }
  return [best[1], best[2], r];
}
return { pageDeck, decked, endFlights, homeOf, pileUp, freeSlot, mouthPose, flights, drawFrom, gather, atHome,
  deckClick, putBack, overDeck, deckRect, easeOutQuart, pilePose, pileZ, DRAW, boxGather, drawMore, BOX_STEP,
  stepFlights, INTRO_DELAY };
}
