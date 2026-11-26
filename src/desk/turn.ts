import { currentDesk } from './state.ts';
import { clamp, smooth, MOTION, lerp, EASES } from './tunables.ts';
import type { Card } from './layout.ts';
import type { Sim } from './gpu.ts';

type Turn = { on: boolean; mode: string; t: number; dur: number; d0: number; d1: number; d: number; start: number; target: number; a: number; from: number; to: number;
  links?: { left: number; top: number; width: number; height: number } };
// The links (DOM, on the main page) turn with it: while a turn shows the main page they stay put on screen, clipped to
// where its paper shows. As it leaves: past the fold, but not under the flap (the sheet's corner, turned over the fold);
// as it comes back: behind the roll. A thrown box is above them: never where it is drawn.
type Pt = number[];
type Poly = Pt[];

export function mountTurn() {
const desk = currentDesk();
const { sources, doorEl, pageEl, T, reduced, linksEl, animateFlatDoor, addEventListener, placeDom } = desk;
// ---------- interaction ----------

const cursor = { x: -1e4, y: -1e4, amt: 0 };
desk.topZ = sources.length; desk.hovered = null;

// One page shows at a time: the camera is at x = 0 for the main page and at the viewport width for research. A page turn
// moves it in one jump (the turning page covers the change).
const cam = { x: 0 };
const PATHS = ['/', '/publications']; // the desk, and research
const regionOf = (path: string) => { const i = PATHS.indexOf(path.replace(/(.)\/+$/, '$1')); return i < 0 ? null : i; };
const regionFromUrl = () => regionOf(location.pathname) ?? 0;
const WARM_STEPS = 150; // with reduced motion, a page you have not seen yet is formed before it is drawn
desk.page = 0; desk.dest = 0; // the page you see, and the page you are on your way to
const NAMES = ['research', 'desk']; // written on each page's corner: where it leads
// Tab stays on the page you see: the other page's cards are inert (focusing one would scroll the desk sideways), and so
// are cards lying in a deck (face down, nothing to show; the deck itself is the way to them).
const inertFor = (s: Card, region: number) => !desk.view.phone && (s.region !== region || !!s.deck);
const syncInert = () => { for (const s of sources) { const v = inertFor(s, desk.page); if (s.el.inert !== v) s.el.inert = v; } };
const setInert = (region: number) => {
  for (const s of sources) s.el.inert = inertFor(s, region);
  doorEl.setAttribute('aria-label', region ? 'Back to the desk' : 'Go to research');
  doorEl.querySelector('text')!.textContent = NAMES[region];
};
function placePage() { pageEl.style.transform = desk.view.phone ? '' : `translate3d(${(-cam.x).toFixed(2)}px, 0, 0)`; }
function drawStill() {
  const enc = desk.gpu!.device.createCommandEncoder();
  for (; desk.sim!.warm > 0; desk.sim!.warm--) { desk.writeUniforms(desk.gpu!); desk.encodeStep(enc); }
  desk.writeUniforms(desk.gpu!);
  desk.encodeRender(enc, desk.gpu!.ctx.getCurrentTexture().createView());
  desk.gpu!.device.queue.submit([enc.finish()]);
}
// Clear a page's ink and hold its agents, each for the nearest card about to land (cards with rel < 0): one sim step.
function holdPage(sm: Sim) {
  desk.writeUniforms(desk.gpu!, sm, true);
  const enc = desk.gpu!.device.createCommandEncoder();
  desk.encodeStep(enc, 'ad', null, sm, sm.n);
  desk.gpu!.device.queue.submit([enc.finish()]);
  sm.t = Math.max(sm.t, 4.5); sm.warm = 0; // nothing to fade in or catch up: the ink shows from its first deposit
}

// ---------- the page corner and the page turn ----------
// Each page's bottom-right corner (where a notebook page turns) is folded back a little, like a notebook page: under it a sliver of the next page and the
// edges of the pages below, and on the fold, in pen, the other page's name. Hovering lifts it a little more, leaning
// toward the pointer. Click (or Enter) turns the page: this page's cards gather into its pile, then the whole page (its
// last frame, frozen) rolls away from the corner and off the screen, over the other page, live underneath, which then
// deals its cards to their homes. Dragging the corner turns it by hand: let go past halfway and it completes, else it
// falls back.
const DOOR = { R: 3.5, lean: 0.3, rMax: 60 }; // CSS px at k = 1: the roll's radius at rest; how far the fold leans toward the pointer; the roll's radius late in a turn (the fold's distance from the corner at rest and the hover lift are T.cornerSize and T.cornerLift)
const door = { amt: 0, d: 0, a: Math.PI / 4, hover: false, at: null as { x: number; y: number } | null, press: null as { x: number; y: number; d: number; moved: boolean } | null }; // a: the fold's direction from the corner (rad above the bottom edge); amt: 0 to 1 as a page's corner folds back
const turn: Turn = { on: false, mode: '', t: 0, dur: 1, d0: 0, d1: 0, d: 0, start: 0, target: 0, a: Math.PI / 4, from: 0, to: 0 };
const dirOf = (a: number) => [-Math.cos(a), -Math.sin(a)]; // from the bottom-right corner, up and left
const rollR = (d: number) => desk.view.k * clamp(DOOR.R + 0.06 * (d / desk.view.k - T.cornerSize), DOOR.R, DOOR.rMax); // the roll widens as the page turns further
const span = (a: number) => desk.view.w * Math.cos(a) + desk.view.h * Math.sin(a); // from the corner to the far corner, along the fold's direction
const farD = (a: number) => span(a) + (Math.PI / 2) * DOOR.rMax * desk.view.k + 8; // the fold's distance once the page is all off screen
const restD = (hover: boolean) => desk.view.k * (T.cornerSize + (hover ? T.cornerLift : 0));
// The fold leans a little toward the pointer, between 25 and 65 degrees.
const leanTo = (x: number, y: number) => clamp(Math.PI / 4 + DOOR.lean * (Math.atan2(desk.view.h - y, Math.max(desk.view.w - x, 1)) - Math.PI / 4), 0.44, 1.13);
function stepDoor(dt: number) {
  if (!turn.on) door.amt = Math.min(1, door.amt + dt / 0.5); // a page's corner folds back once it is shown
  doorEl.classList.toggle('folding', turn.on || door.amt < 1); // no focus ring around a fold that is not there (mid-turn, folding back)
  doorEl.classList.toggle('flat', (turn.on && turn.mode !== 'drag') || (!turn.on && door.amt < 0.5)); // no pointer, and clicks pass through, while no corner is drawn
  const e = 1 - Math.exp(-dt / 0.12);
  door.d += (restD(door.hover) * smooth(door.amt) - door.d) * e;
  door.a += ((door.hover && door.at ? leanTo(door.at.x, door.at.y) : Math.PI / 4) - door.a) * e;
}
const ARRIVE_AT = 0.1, DEAL_AT = 0.35; // the box comes in this far into the turn, under the page until the roll uncovers its spot (about 0.3 of the turn), then deals; a turn by hand deals this far into its finish
const busy = () => turn.on || desk.flights.on || !!door.press || sources.some((s) => s.dragging); // a card in hand holds a page change until it is let go
const turns = () => !!desk.gpu && !reduced && !desk.view.phone && desk.sims.length > 1; // phones, reduced motion, and no WebGPU just show the other page
// The page you see, frozen as it was last drawn, but without its corner: the turn draws that, from the same fold.
function freeze() {
  desk.capturing = true; desk.writeUniforms(desk.gpu!); desk.capturing = false;
  const enc = desk.gpu!.device.createCommandEncoder();
  desk.encodeRender(enc, desk.shared!.frozenTex[1 - desk.shared!.fz].createView());
  desk.gpu!.device.queue.submit([enc.finish()]);
  desk.shared!.fz = 1 - desk.shared!.fz; desk.redraw = true;
}
function show(region: number) {
  for (const s of sources) if (s.player && s.player.state !== 'rest') { s.player.state = 'rest'; s.player.mix = 0; s.player.reset(); } // no decoding off-page
  desk.videoSrc = null; desk.videoMix = 0;
  if (desk.sim) desk.sim.ready = false; // the page you leave stops; it is warmed again before it next shows
  desk.page = region; if (desk.gpu) desk.sim = desk.sims[desk.page];
  if (desk.sim) desk.sim.pre = false;
  cam.x = desk.view.phone ? 0 : region * desk.view.w; placePage(); setInert(region);
  if (!turn.on && desk.chipRegion() !== region) desk.chips.clear(); // the chips stay on the page you left (a turn throws them off it)
  desk.tweakSync?.();
}
// The turn starts from the corner as it is (hovered, leaning). The other page comes up under it from bare paper, its
// cards in its pile; they are dealt as the turn settles (a turn by hand: once it is let go past halfway).
function startTurn(to: number, mode: string) {
  desk.launch(desk.pageDeck(desk.page)); // the box is not part of the page: it flies off as the page turns
  freeze();
  Object.assign(turn, { on: true, mode, from: desk.page, to, t: 0, dur: T.turnS, d0: door.d, d: door.d, start: door.d, target: door.d, a: door.a, d1: farD(door.a) });
  show(to);
  const r = linksEl.getBoundingClientRect(); // where the links show on the main page
  turn.links = { left: r.left + (to ? desk.view.w : 0), top: r.top, width: r.width, height: r.height };
  Object.assign(door, { amt: 0, d: 0, a: Math.PI / 4 }); // the new page's corner lies flat until the turn is over
  desk.arriveDeck(to, mode === 'drag' ? 0 : ARRIVE_AT * T.turnS, MOTION.respond);
  if (mode !== 'drag') desk.drawFrom(to, { delay: ARRIVE_AT * T.turnS + MOTION.respond, hold: false }); // a turn by hand deals once let go past halfway
}
function stepTurn(dt: number) {
  if (!turn.on) return;
  if (turn.mode === 'drag') turn.d += (turn.target - turn.d) * (1 - Math.exp(-dt / 0.03));
  else {
    turn.t = Math.min(1, window.__j?.at != null ? window.__j.at / turn.dur : turn.t + dt / turn.dur); // test hook: hold the turn at one moment
    turn.d = lerp(turn.d0, turn.d1, turn.mode === 'auto' ? EASES.glide(turn.t) : 1 - (1 - turn.t) ** 3);
  }
  if (turn.mode === 'drag' || turn.t < 1) return;
  turn.on = false;
  if (turn.mode === 'back') { // fell back: the page you were on comes back to life as it was
    for (const s of sources) if (s.region === turn.to && s.rel < 0) s.rel = 1e3; // the other page's held agents let go
    show(turn.from);
    if (!desk.pageDeck(turn.from)?.launch) desk.arriveDeck(turn.from, 0); // its box comes back in (once it has flown off)
    Object.assign(door, { amt: 1, d: turn.d, a: turn.a });
  } else desk.pileUp(turn.from); // a page turned by hand leaves its cards on its pile
  next();
}
const clipPoly = (poly: Poly, f: (p: Pt) => number) => { // a convex polygon cut by a line, keeping f >= 0 (Sutherland-Hodgman, one plane)
  const out: Poly = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], a = f(p), b = f(q);
    if (a >= 0) out.push(p);
    if ((a >= 0) !== (b >= 0)) { const t = a / (a - b); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  });
  return out;
};
// A convex polygon's edges as lines, f >= 0 inside (either winding); convex A less convex U, as disjoint convex pieces.
const halves = (poly: Poly) => {
  const area = poly.reduce((s2, p, i) => { const q = poly[(i + 1) % poly.length]; return s2 + p[0] * q[1] - q[0] * p[1]; }, 0);
  return poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return (r: Pt) => Math.sign(area) * ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); });
};
const minus = (A: Poly, U: Poly) => halves(U).map((f, i, fs) => fs.slice(0, i).reduce(clipPoly, clipPoly(A, (r) => -f(r))));
// The convex hull of points (monotone chain).
const turnsLeft = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]) > 0;
function hull(pts: Poly) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const h: Poly = [];
  for (const run of [pts, pts.slice().reverse()]) {
    const k = h.length;
    for (const p of run) { while (h.length >= k + 2 && !turnsLeft(h[h.length - 2], h[h.length - 1], p)) h.pop(); h.push(p); }
    h.pop();
  }
  return h;
}
function clipLinks() {
  const st = linksEl.style, box = sources.find((s) => s.launch?.hull)?.launch!.hull;
  if (desk.view.phone || !turn.links || (turn.on ? turn.from && turn.to : !box || desk.page)) { st.clipPath = st.translate = ''; return; }
  const out = turn.on && turn.from === 0, { left: L, top: Tp, width: w, height: h } = turn.links; // on screen at L, Tp
  const rect = [[0, 0], [w, 0], [w, h], [0, h]], fmt = (poly: Poly) => poly.map(([u, v]) => `${u.toFixed(1)} ${v.toFixed(1)}`).join(' L ');
  let shown = rect;
  const holes: Poly[] = box ? [box.map(([x, y]) => [x - L, y - Tp])] : [];
  if (turn.on) {
    const [dx, dy] = dirOf(turn.a), R = rollR(turn.d), d = turn.d;
    const X = ([u, v]: Pt) => dx * (L + u - desk.view.w) + dy * (Tp + v - desk.view.h); // from the page's corner along the fold's direction
    if (!out) shown = clipPoly(rect, (p) => d - R - X(p));
    else {
      shown = clipPoly(rect, (p) => X(p) - d);
      const page = [[-L, -Tp], [desk.view.w - L, -Tp], [desk.view.w - L, desk.view.h - Tp], [-L, desk.view.h - Tp]];
      // the flap: the part of the page within d - pi R of the corner, mirrored across the fold (x to 2d - pi R - x)
      holes.unshift(clipPoly(page, (p) => d - Math.PI * R - X(p)).map((p) => { const m = 2 * d - Math.PI * R - 2 * X(p); return [p[0] + m * dx, p[1] + m * dy]; }));
    }
  }
  const polys = [shown]; // what shows, then what covers it there, in disjoint pieces (so even-odd cuts each out once)
  if (shown.length > 2) {
    for (const hole of holes) {
      let ps = [halves(shown).reduce(clipPoly, hole)];
      for (const prev of polys.slice(1)) ps = ps.flatMap((p) => minus(p, prev));
      polys.push(...ps.filter((p) => p.length > 2));
    }
  }
  st.translate = out ? `${desk.view.w}px 0` : '';
  st.clipPath = shown.length > 2 ? `path(evenodd, '${polys.map((poly) => `M ${fmt(poly)} Z`).join(' ')}')` : 'polygon(0 0, 0 0, 0 0)';
}
// The corner by hand. A drag keeps the paper under the pointer: the flap moves twice as fast as the fold.
const hitEl = doorEl.querySelector<SVGPathElement>('.hit')!;
hitEl.addEventListener('pointerenter', () => { door.hover = true; prewarm(1 - desk.page); animateFlatDoor(); });
hitEl.addEventListener('pointermove', animateFlatDoor);
hitEl.addEventListener('pointerleave', () => { door.hover = false; animateFlatDoor(); });
hitEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !turns() || busy() || sources.some((s) => s.dragging)) return;
  door.press = { x: e.clientX, y: e.clientY, d: door.d, moved: false };
  hitEl.setPointerCapture(e.pointerId);
});
hitEl.addEventListener('pointermove', (e) => {
  const pr = door.press;
  if (!pr) return;
  if (!pr.moved) {
    if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 4) return;
    pr.moved = true; startTurn(1 - desk.page, 'drag');
  }
  turn.a = leanTo(e.clientX, e.clientY);
  const [dx, dy] = dirOf(turn.a);
  turn.target = clamp(pr.d + ((e.clientX - pr.x) * dx + (e.clientY - pr.y) * dy) / 2, 0, farD(turn.a));
});
const letGo = () => {
  const pr = door.press;
  door.press = null;
  if (!pr?.moved) return;
  doorEl.dataset.dragged = '1'; // the click that follows is not a turn
  if (2 * turn.target - Math.PI * rollR(turn.target) > span(turn.a) / 2) { // the corner is past halfway: complete the turn
    const d1 = farD(turn.a), dur = clamp(T.turnS * (d1 - turn.d) / (d1 - turn.start), 0.3, T.turnS);
    Object.assign(turn, { mode: 'finish', t: 0, d0: turn.d, d1, dur });
    desk.drawFrom(turn.to, { delay: DEAL_AT * dur, hold: false });
    desk.dest = turn.to; record(turn.to);
  } else Object.assign(turn, { mode: 'back', t: 0, d0: turn.d, d1: restD(hitEl.matches(':hover')), dur: 0.4 });
};
hitEl.addEventListener('pointerup', letGo);
hitEl.addEventListener('pointercancel', letGo);
doorEl.addEventListener('click', (e) => {
  e.preventDefault();
  if (doorEl.dataset.dragged) { delete doorEl.dataset.dragged; return; }
  navigate(1 - desk.dest);
});
// The address follows the page: research is /publications, and going back to the desk pops it (the back button turns back).
function record(to: number) {
  if (to === 1) desk.router.push(PATHS[1] + location.search, { fromMain: true });
  else if (desk.router.state()?.fromMain) history.back();
  else desk.router.push(PATHS[0] + location.search);
}
function navigate(to: number) {
  const popped = to === 0 && desk.router.state()?.fromMain; // the popstate it fires turns the page
  record(to);
  if (!popped) go(to);
}
addEventListener('popstate', () => { const r = regionOf(location.pathname); if (r != null) go(r); }); // not when leaving the desk
// Every page change: gather this page's cards, turn the page, deal the other's. One change at a time; the last asked for
// waits its turn.
let pendingNav: number | null = null;
function go(region: number) {
  desk.dest = region;
  if (busy()) { pendingNav = region; return; }
  if (region === desk.page) return;
  if (!turns()) { jump(region); return; }
  prewarm(region, 3); // a turn is coming: hurry
  const out = sources.filter((s) => s.region === desk.page && desk.decked(s) && !s.deck && !s.dragging);
  if (!out.length) { startTurn(region, 'auto'); return; }
  desk.gather(out, desk.pageDeck(desk.page)!); desk.flights.then = () => startTurn(region, 'auto'); // the page turns once every card is in its box
}
function next() {
  if (busy() || pendingNav == null) return;
  const n = pendingNav;
  pendingNav = null;
  go(n);
}
// Warming the other page: so a turn uncovers a page whose slime has its network, the hidden page steps (after the frame's
// own work, outside the quality check's timing) with its cards counted at home: from the first frame (its network forms
// from scattered agents, about 3 s of sim time), one step a frame, two while you hover the corner, three once a turn is
// asked for; a page shown again catches up half a second. Otherwise only the page you see steps.
const WARM = { fresh: 180, again: 30 };
function prewarm(region: number, rate = 2) {
  const sm = desk.sims[region];
  if (turns() && !desk.phys) desk.idle(desk.throwWorld); // the page turn's physics, ready before the turn
  if (!turns() || !sm || sm === desk.sim || sm.ready) return;
  if (sm.pre) { sm.rate = Math.max(sm.rate!, rate); return; }
  Object.assign(sm, { pre: true, rate, warm: Math.max(sm.warm, sm.t < 3 ? WARM.fresh : WARM.again) });
}
function stepWarm() {
  const sm = desk.sims.find((x) => x !== desk.sim && x.pre);
  if (!sm) return;
  const n = Math.min(sm.warm, sm.rate!);
  if (n > 0) {
    desk.atHome(sm.page, () => desk.writeUniforms(desk.gpu!, sm));
    const enc = desk.gpu!.device.createCommandEncoder();
    for (let k = 0; k < n; k++) desk.encodeStep(enc, 'ead', null, sm);
    desk.gpu!.device.queue.submit([enc.finish()]);
    sm.warm -= n;
  }
  if (sm.warm <= 0) Object.assign(sm, { pre: false, ready: true, warm: 0 });
}
// Without the turn the other page is just there, and the cards of the page you leave go home.
function jump(region: number) {
  if (desk.view.phone) return;
  for (const s of sources) if (s.region === desk.page && s.slot && !s.deck) { [s.x, s.y, s.rot] = desk.homeOf(s); placeDom(s); }
  show(region);
  if (reduced && desk.gpu && desk.sim) drawStill(); // no frame loop with reduced motion: settle this page and draw it once
}
return { turn, clipLinks, cam, regionFromUrl, placePage, setInert, DOOR, door, dirOf, stepDoor, cursor, next,
  drawStill, holdPage, rollR, restD, farD, hull, NAMES, WARM_STEPS, syncInert, stepTurn, stepWarm, prewarm };
}
