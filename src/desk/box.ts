import { currentDesk } from './state.ts';
import { MOTION, EASES, STEP, lerp, clamp, smooth, MAX } from './tunables.ts';
import type { Seg, Launch, V3, Card, Slide, Ease, ThrowPose } from './layout.ts';
import { type Curl, createCurl } from './curl.ts';
import { type World, createWorld, boxShape } from './physics.ts';
import { TALLY, tallySurface, type Mark, paintTally } from './tally.ts';

type TurnPath = { seg: Seg | null; keys: number[]; kj?: number }; // the paper under a thrown box (turnAt)
export interface Phys { world: World; curl: Curl; hz: number; L: (TurnPath & Partial<Launch>) | null; rem?: number } // rem: sim time not yet stepped (stepChips)
// The six faces in the box's frame: middle, axes (mu x mv points out), half sizes, and the normal its texture is lit for
// (the shaded wall facing down the page is painted in its shade; the rest as if lit from straight above).
type Face = [V3, V3, V3, number, number, V3 | null]; // middle, axes, half sizes, the normal its texture is lit for
// One face of the flying box: the box's own uniform (its hue and the like), as a plane with its own homography and
// texture, lit by the turn (bound.w), its alpha its shape, no shadow (the box's base casts it).
interface FacePlane { H: number[]; hw: number; hh: number } // a plane's homography and half sizes (sim px)

export function mountBox() {
const desk = currentDesk();
const { sources, easeOutQuart, pageDeck, T, rollR, restD, farD, door, turn, BOX_T, hull, placeDom, pilePose, pileZ,
  overDeck, cam, flights, DRAW, boxGather, drawMore, measure, font, reduced } = desk;
// Each page's card box stands at its right edge, above the page corner, holding its page's cards that are not on the
// desk (d.pile, bottom to top: the one source of truth for what is in it and in what order).
const DECK_SHOW = 0.5; // how much of the upright box shows on the page, of its width
const lidOf = (d: Card) => sources.find((s) => s.lid && s.region === d.region);
function placeDecks() {
  for (const s of sources) if (s.more && !desk.view.phone) {
    Object.assign(s, { spot: (s.region + 1) * desk.view.w - DECK_SHOW * s.w + s.w / 2, y: 0.36 * desk.view.h, rot: -2, home: -2 });
    s.slide ??= { want: 'out', t: 1, dur: 1, ease: easeOutQuart } as Slide; // its at, from, to and wait are set below
    if (s.slide.want === 'off') s.slide.want = 'out';
    const at = deckOut(s, s.slide.want);
    Object.assign(s.slide, { at, from: at, to: at, t: 1, wait: 0 }); // a new layout: where it was headed
    s.pile ??= []; s.lidT ??= 0; s.dirty = true;
    s.bx = { at: 0, from: 0, to: 0, t: 1, dur: 1, ease: easeOutQuart }; // an empty box tucks again from here
    if (s.launch) endThrow(s, false); // a new layout ends a box's flight
    s.px = s.x = s.spot + s.slide.at;
  }
  for (const s of sources) { s.carrier = null; if (s.kind === 'deck') { s.el.hidden = !desk.dealing; s.gone = true; } } // nothing to hold without the deal
}
// The box slides in from off screen right as a page's first beat (on load and when the page is turned to), on settle,
// with its cards in it; they slide out of its open end, fan toward the page, and are dealt. Empty, it tucks off the
// edge, its lid closing, and peeks out a little further while you drag a card; it comes out for a card dragged near it.
// Holding cards it stays out, its lid shut until the pointer comes near.
// A card dropped on it, or every card on the page (double-click or Enter), goes in through its open end, on top.
const BOX = { put: 0.3, enter: -10, keep: 28, near: 160, far: 220, peek: 20, hover: 48, unhover: 120 }; // s: a put-back's slide in; CSS px: over the box (in, out), near it (in, out), the peek while dragging, the pointer near it (in, out)
const deckOut = (d: Card, want: string) => (want === 'out' ? 0 : d.w + 40 * desk.view.k); // x offset from its spot: in place, or off screen
function slideDeck(d: Card, want: string, dur = MOTION.respond, ease: Ease = want === 'out' ? easeOutQuart : EASES.cubic) {
  const v = d.slide;
  if (v.want === want) return;
  Object.assign(v, { want, from: v.at, to: deckOut(d, want), t: 0, dur, ease });
}
// Tucked, only the box's open end and its label peek in at the edge (the lid closed over them).
const tuckAt = (d: Card) => DECK_SHOW * d.w - (lidOf(d)!.w + 34 * (desk.view.cs || 1));
function slideBox(d: Card, to: number, dur: number, ease: Ease) { Object.assign(d.bx, { from: d.bx.at, to, t: 0, dur, ease }); }
// The box out and open (a page you turn to, or one put away out of sight).
function resetBox(d: Card) {
  Object.assign(d, { lidT: 0, outFor: 0, gatherAsk: false, drawAsk: null });
  Object.assign(d.bx, { at: 0, from: 0, to: 0, t: 1 });
}
// A page's box comes in from off screen, `delay` s from now.
function arriveDeck(region: number, delay: number, dur = MOTION.settle) {
  const d = pageDeck(region);
  if (!d || desk.view.phone || !desk.dealing) return;
  resetBox(d);
  Object.assign(d.slide, { want: 'off', at: deckOut(d, 'off'), to: deckOut(d, 'off'), t: 1, wait: delay, arrive: dur });
  moveDeck(d);
}
// ---------- the box is thrown off ----------
// A page that turns throws its card box off. The box is not printed on the page but rests on it: a rigid body
// (physics.ts) on the turning paper (curl.ts, the same curl the page is drawn with). The flap's sagging edge slides under
// the box, lifts and tips it, and flicks it up and along the turn (toss), so it arcs and tumbles off the frame; its lid
// and the cards in it ride along. A corner turned by hand moves the paper under it the same way: let go before halfway
// and the box drops back onto the page, settles, and eases home into its painting. Once off the frame it slides in again
// when its page next shows.
// fadeZ: CSS px up by which its shadow has faded; out: s a box left at rest on screen after a turn takes to slide off; limit:
// s at most in the air; hz: physics steps per s; rest: asleep once it stays within px for 0.4 s; sag: px the turning page's
// edge sags under it; persp: s it takes to ease into its 3D view; home: s a fallen box takes to ease back to its spot;
// toss: the flick, of the flap's speed then, along the turn and up
const THROW = { fadeZ: 180, out: 0.6, limit: 6, hz: 480, rest: 0.5, sag: 40, persp: 0.25, home: 0.5, toss: [0.2, 1] };
const LID_WAIT = 0.3; // the flap waits this long before it shuts (s)
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const POS = new Float64Array(3), ROT = new Float64Array(9), SURF = new Float64Array(7), F0 = new Float64Array(2), F1 = new Float64Array(2);
desk.phys = null; // the world and the turning page every thrown box shares
// Made, and its code warmed by a throw nobody sees, before the first turn needs it (else the first frames stall).
function throwWorld() {
  if (desk.phys && (desk.phys.hz === THROW.hz || desk.phys.L || desk.phys.world.bodies.length)) return desk.phys;
  const world = createWorld({ hz: THROW.hz }), curl = createCurl({ state: (t, out) => (desk.phys!.L ? turnAt(desk.phys!.L, t, out) : out.fill(0)), rollR }); // no turn: flat
  world.surface = curl; world.stepped = toss;
  desk.phys = { world, curl, hz: THROW.hz, L: { seg: { t0: 0, d0: restD(false), d1: farD(Math.PI / 4), dur: T.turnS, a: Math.PI / 4, ease: EASES.glide }, keys: [] } };
  const k = desk.view.k, sh = boxShape(160 * k, 210 * k, 65 * k, 24 * k);
  curl.page(0, desk.view.w, desk.view.h); world.g = T.gravity * k; world.rest = THROW.rest;
  const b = world.add({ points: sh.points, bound: sh.bound, sdf: sh.sdf, mass: 1, inertia: sh.inertia(1), x: [desk.view.w, 0.36 * desk.view.h, 32.5 * k] });
  for (let t = 0; t < T.turnS; t += STEP) world.advance(t);
  world.remove(b); desk.phys.L = null;
  return desk.phys;
}
// The flap flicks the box: the step the paper first moves it, it is tossed up and along the turn, as fast as the flap
// (twice the fold) moves then.
function toss() {
  const L = desk.phys!.L, b = L?.body;
  if (!b || L.tossed || b.sleep || b.v[0] ** 2 + b.v[1] ** 2 + b.v[2] ** 2 < 2500) return; // still at rest
  const t = desk.phys!.world.time;
  turnAt(L, t, F0); turnAt(L, t + 0.01, F1);
  const v = (2 * Math.abs(F1[0] - F0[0])) / 0.01;
  b.v[0] -= THROW.toss[0] * v * Math.cos(F0[1]); b.v[1] -= THROW.toss[0] * v * Math.sin(F0[1]); b.v[2] += THROW.toss[1] * v;
  L.tossed = true;
}
// Where the turn is t s after it began (the physics' clock): out = the fold's distance, its direction. A turn by hand is
// its frames (t, d, a), straight between them and on past the last; once let go (or a click's turn), its own curve.
function turnAt(L: TurnPath, t: number, out: Float64Array) {
  const g = L.seg, k = L.keys, n = k.length;
  if (g && (t >= g.t0 || n < 3)) { out[0] = lerp(g.d0, g.d1, g.ease(clamp((t - g.t0) / g.dur))); out[1] = g.a; return; }
  if (n < 6) { out[0] = k[1]; out[1] = k[2]; return; }
  let j = L.kj!; // a turn by hand: a launch's
  while (j > 0 && k[j] > t) j -= 3;
  while (j + 6 < n && k[j + 3] <= t) j += 3;
  L.kj = j;
  const u = (t - k[j]) / Math.max(k[j + 3] - k[j], 1e-6);
  out[0] = lerp(k[j + 1], k[j + 4], u); out[1] = lerp(k[j + 2], k[j + 5], u);
}
// The turn starts: the box becomes a body resting where it lies (asleep, so exactly as painted until the paper reaches
// it), and its lid and cards ride with it. A box still settling from a turn that fell back is thrown from where it is.
function launch(d: Card | undefined) {
  if (!d || desk.view.phone || !desk.dealing) return;
  const P = throwWorld(), { world, curl } = P;
  if (P.L && P.L.d !== d) endThrow(P.L.d!, true); // one turn at a time: a box from the last one is long off the frame
  let L = d.launch;
  if (!L) {
    const { W, H, D } = boxDims(d), a = (d.rot * Math.PI) / 180, sh = boxShape(W, H, D, 24 * desk.view.k);
    const body = world.add({ points: sh.points, bound: sh.bound, sdf: sh.sdf, mass: 1, inertia: sh.inertia(1), friction: T.friction, bounce: T.bounce,
      x: [d.x, d.y, D / 2], q: [Math.cos(a / 2), 0, 0, Math.sin(a / 2)] });
    body.sleep = true;
    L = d.launch = { d, body, x: d.x, y: d.y, wt: 0 } as Launch; // the rest is set just below
  }
  Object.assign(L, { t: 0, seg: null, keys: [0, door.d, door.a], kj: 0, mode: '', end: null, home: null, out: null, tossed: false });
  P.L = L; world.time = 0; world.g = T.gravity * desk.view.k; world.rest = THROW.rest;
  curl.page(d.region * desk.view.w, desk.view.w, desk.view.h); curl.sag = THROW.sag * desk.view.k; curl.prepare(0);
  L.sv = world.save();
  const lid = lidOf(d);
  for (const s of sources) if (s === d || s === lid || s.deck === d) s.carrier = d;
  poseThrow(d);
}
function stepThrows(dt: number) { for (const d of sources) if (d.launch) stepThrow(d, dt); }
function stepThrow(d: Card, dt: number) {
  const L = d.launch!, { world } = desk.phys!, at = window.__j?.at, drawn = L.hull; // test hook (as the turn's): hold the throw at one moment
  L.t = at ?? L.t + dt; L.wt = at ?? L.wt + dt;
  if (turn.on && turn.from === d.region) { // the paper under it, as the turn moves it
    if (turn.mode === 'drag') L.keys.push(L.t, turn.d, turn.a);
    else if (L.seg?.mode !== turn.mode) L.seg = { mode: turn.mode, t0: L.t - turn.t * turn.dur, d0: turn.d0, d1: turn.d1, dur: turn.dur, a: turn.a, ease: turn.mode === 'auto' ? EASES.glide : easeOutCubic };
    L.mode = turn.mode;
  } else L.end ??= L.mode === 'back' ? 'back' : 'done';
  if (at != null && at < world.time - 1e-9) { world.load(L.sv); L.tossed = false; } // held earlier: the same throw again from its start
  if (L.home) L.home.t += dt;
  else if (L.out) L.out.t += dt;
  else {
    const t0 = performance.now();
    world.advance(L.t);
    desk.stats.throwMs = performance.now() - t0;
    // At rest after the turn: home if the page fell back; off to the right if a finished turn left it on screen.
    if (L.end && (L.body.sleep || L.t > THROW.limit)) { if (L.end === 'back') L.home = { t: 0, q: [...L.body.q] }; else L.out = { t: 0 }; }
  }
  poseThrow(d);
  if (L.home ? L.home.t >= THROW.home : offFrame(d, drawn)) endThrow(d, !L.home);
}
const quatMat = ([w, x, y, z]: number[]) => [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
const nlerp = (p: number[], q: number[], u: number) => { const s = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0 ? -1 : 1, r = p.map((v, i) => lerp(v, s * q[i], u)), l = Math.hypot(...r); return r.map((v) => v / l); };
// The thrown box this frame: its axes at rest on the desk (X, Y); where its middle is (C, CSS px, z above the desk) and
// how it is turned from rest (M, row major); how far its perspective has eased in (w); how high its lowest point is
// over the paper under it (low); its shadow's footprint from above (foot: angle, half sizes), and how far it has faded.
function poseThrow(d: Card) {
  const L = d.launch!, { W, H, D } = boxDims(d), a = (d.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  desk.phys!.world.pose(L.body, POS, ROT); L.hull = null; // where it shows, once drawn
  let C = [...POS], R = [...ROT], w = easeOutCubic(clamp(L.wt / THROW.persp));
  if (L.home) { const u = smooth(L.home.t / THROW.home), q0 = [Math.cos(a / 2), 0, 0, Math.sin(a / 2)]; C = C.map((v, i) => lerp(v, [L.x, L.y, D / 2][i], u)); R = quatMat(nlerp(L.home.q, q0, u)); w *= 1 - u; }
  else if (L.out) C[0] += 1.2 * desk.view.w * clamp(L.out.t / THROW.out) ** 3;
  const M = [0, 3, 6].flatMap((r) => [R[r] * c - R[r + 1] * s, R[r] * s + R[r + 1] * c, R[r + 2]]); // R times rest's transpose
  // Its shadow: the box seen from straight above, as the smallest rectangle along one of its edges that holds it.
  const reach = (x: number, y: number) => (W * Math.abs(x * R[0] + y * R[3]) + H * Math.abs(x * R[1] + y * R[4]) + D * Math.abs(x * R[2] + y * R[5])) / 2;
  let foot: number[] | null = null;
  for (let i = 0; i < 3; i++) {
    const l = Math.hypot(R[i], R[3 + i]), x = R[i] / l, y = R[3 + i] / l, f = l > 1e-3 && [Math.atan2(y, x), reach(x, y), reach(-y, x)];
    if (f && (!foot || f[1] * f[2] < foot[1] * foot[2])) foot = f;
  }
  SURF[0] = C[0]; SURF[1] = C[1]; desk.phys!.curl.at(SURF); // how high its lowest point is over the paper under it (the flap or the desk)
  const low = C[2] - (W * Math.abs(R[6]) + H * Math.abs(R[7]) + D * Math.abs(R[8])) / 2 - SURF[0];
  C[2] = Math.min(C[2], 1200); // never up at the eye
  L.P = { X: [c, s, 0], Y: [-s, c, 0], w, C, M, low, foot, fade: smooth(low / (THROW.fadeZ * desk.view.k)) };
}
const launchPose = (d: Card) => d.launch!.P;
// Off the frame: everything it could draw (it, its lid, as its eye sees them) is past an edge of its page; or what it
// drew last frame (drawn: its outline) and its shadow are. Once out it is gone, so a box that falls back never shows again.
function offFrame(d: Card, drawn: number[][] | null) {
  const P = d.launch!.P, lid = lidOf(d), { W, H, D } = boxDims(d), r0 = Math.hypot(W, H, D) / 2 + (lid ? lid.w : 0), F = 1800 - P.C[2];
  const r = (r0 * (1 + BOX3D.a) * F) / Math.max(F - r0, 1), x = P.C[0] - d.region * desk.view.w, y = P.C[1];
  const out = (x0: number, y0: number, x1: number, y1: number) => x0 > desk.view.w || x1 < 0 || y1 < 0 || y0 > desk.view.h;
  if (out(x - r, y - r, x + r, y + r)) return true;
  if (!drawn) return false;
  const xs = drawn.map((p) => p[0] - d.region * desk.view.w), ys = drawn.map((p) => p[1]), s = Math.hypot(P.foot![1], P.foot![2]) + THROW.fadeZ * desk.view.k;
  return out(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)) && (P.fade >= 1 || out(x - s, y - s, x + s, y + s));
}
function endThrow(d: Card, arrive: boolean) {
  const L = d.launch!;
  desk.phys!.world.remove(L.body);
  if (desk.phys!.L === L) desk.phys!.L = null;
  d.launch = null; d.dirty = true;
  for (const s of sources) if (s.carrier === d) s.carrier = null;
  if (arrive) arriveDeck(d.region, 0); // back in from off the right edge when its page next shows (or now, if a turn by hand fell back)
}
// In the air the box is a real box: six paper-board faces, its open end showing the cards inside, its lid on its hinge.
// At rest it is a painting of that same box: its front panel BOX_T up and right of its base is what an eye A F to the
// lower left and F above it sees of a box BOX_T / A deep (A = BOX3D.a; F = 1800 px, as high as the eye above every
// card). That eye draws it in the air, its perspective easing in as the turn starts (from far away at first), so the
// first frame is the painting.
// The box's frame: X along it from its open end, Y down the page, Z up from its base; W, H, D its sizes along them (CSS px).
const BOX3D = { a: 0.4 };
const boxDims = (d: Card) => { const t = BOX_T * (d.k || 1); return { t, W: d.w - t, H: d.h - t, D: t / BOX3D.a }; };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const boxTurn = ({ M }: { M: number[] }) => (v: number[]) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
// Something riding in the flying box (its lid, the cards in it), from where it lies at rest: where it is relative to the
// box's middle (dc) and its axes, turned with the box. At rest each is drawn from straight above, not by the box's eye,
// so it starts where that eye sees it there and settles into the box as its perspective eases in (a card in it slides all the way in).
function carried(d: Card, { sx, sy, z, mu, mv }: { sx: number; sy: number; z: number; mu: V3; mv: V3 }, P: ThrowPose) {
  const L = d.launch!, A = BOX3D.a, u = 1 - P.w, { D } = boxDims(d), s0 = A * (D / 2 - u * z), turn = boxTurn(P);
  const lean = (m: V3) => [m[0] - u * A * m[2], m[1] + u * A * m[2], m[2]];
  return { dc: turn([sx - L.x + s0, sy - L.y - s0, z - D / 2]), mu: turn(lean(mu)), mv: turn(lean(mv)) };
}
// The box's eye: the homography (sim px) from a plane through the box's middle plus dc (CSS px), with axes mu and mv,
// to the page (page-local sim px).
function boxH(P: ThrowPose, dc: V3, mu: V3, mv: V3, dpr: number, originX: number) {
  const A = BOX3D.a, p = P.w, F = (1800 - P.C[2]) * dpr, c = dc.map((v) => v * dpr);
  const row = (R: number, i: number, sg: number) => [F * mu[i] + sg * F * A * mu[2] - R * p * mu[2], F * mv[i] + sg * F * A * mv[2] - R * p * mv[2], R * (F - p * c[2]) + F * c[i] + sg * F * A * c[2]];
  return [...row((P.C[0] - originX) * dpr, 0, 1), ...row(P.C[1] * dpr, 1, -1), -p * mu[2], -p * mv[2], F - p * c[2]];
}
// Whether the box's eye sees a plane through dc with normal n from the side n points to.
const seesFront = (P: ThrowPose, dc: V3, n: V3) => { const A = BOX3D.a, F = 1800 - P.C[2], p = P.w; return dot(n, [-A * F - p * dc[0], A * F - p * dc[1], F - p * dc[2]]) > 0; };
// How squarely a plane faces the eye, signed (+: its front, mu x mv): the homography's area scale at its middle. Near 0
// it is edge-on (and the homography singular), so it is not drawn.
const facing = ([a, b, c, d, e, f, g, h, i]: number[]) => ((a * i - c * g) * (e * i - f * h) - (b * i - c * h) * (d * i - f * g)) / i ** 4;
const EDGE_ON = 0.004;
const FAR = [0, 0, 1e6, 0, 0, 1e6, 0, 0, 1]; // an inverse homography that puts every pixel far off the plane
const projR = (H: number[], hw: number, hh: number) => Math.max(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
  const q = H[6] * u * hw + H[7] * v * hh + H[8];
  return Math.hypot((H[0] * u * hw + H[1] * v * hh + H[2]) / q - H[2] / H[8], (H[3] * u * hw + H[4] * v * hh + H[5]) / q - H[5] / H[8]);
}));
const boxFaces = ({ W, H, D }: { W: number; H: number; D: number }) => ({
  front: [[0, 0, D / 2], [1, 0, 0], [0, 1, 0], W / 2, H / 2, [0, 0, 1]],
  back: [[0, 0, -D / 2], [1, 0, 0], [0, -1, 0], W / 2, H / 2, [0, 0, 1]],
  bottom: [[0, H / 2, 0], [1, 0, 0], [0, 0, -1], W / 2, D / 2, [0, 1, 0]],
  top: [[0, -H / 2, 0], [1, 0, 0], [0, 0, 1], W / 2, D / 2, [0, 0, 1]],
  end: [[W / 2, 0, 0], [0, 1, 0], [0, 0, 1], H / 2, D / 2, [0, 0, 1]],
  open: [[-W / 2, 0, 0], [0, 1, 0], [0, 0, -1], H / 2, D / 2, null],
}) satisfies Record<string, Face>;
// Paper board in the desk's light (from the upper left, as on the page corner).
const LIGHT = (() => { const l = [-0.3, -0.75, 1], n = Math.hypot(...l); return l.map((v) => v / n); })();
const shade = (n: V3) => 0.78 + 0.26 * Math.max(0, dot(n, LIGHT));
const FACE_SLOTS = 6; // uniform slots per flying box: at most two outside faces and three inside walls with its open end in view
// The flying box, bottom to top (its faces' uniforms written into slots from `slot`): its shadow on the desk, its lid if
// the box is between it and the eye, the inside walls seen through the open end, the cards in it, the open end's shade,
// the outside faces toward the eye, then its lid if it is in front.
function flyingOrder(d: Card, dpr: number, originX: number, slot: number) {
  const P = launchPose(d), turn = boxTurn(P), uv = d.faceUV, lid = lidOf(d), o0 = (desk.CARD0 + d.id * desk.CARD_VEC4) * 4;
  const world = (v: V3) => turn([v[0] * P.X[0] + v[1] * P.Y[0], v[0] * P.X[1] + v[1] * P.Y[1], v[2]]);
  const faces = Object.entries(boxFaces(boxDims(d))).map(([name, [c, mu, mv, hw, hh, ref]]) => {
    const H = boxH(P, world(c), world(mu), world(mv), dpr, originX);
    return { name, H, f: facing(H), hw: hw * dpr, hh: hh * dpr, light: ref ? shade(world(cross(mu, mv))) / shade(ref) : 1 };
  });
  const open = faces.find((x) => x.name === 'open')!, inside = open.f > EDGE_ON, lidOn = lid && !lid.gone && lid.flyH;
  d.launch!.hull = hull([...faces, ...(lidOn ? [{ H: lid.flyH!, hw: (lid.w * dpr) / 2, hh: (lid.h * dpr) / 2 }] : [])].flatMap(({ H, hw, hh }) => // where it shows (CSS px)
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const q = (H[6] * u * hw + H[7] * v * hh + H[8]) * dpr; return [(H[0] * u * hw + H[1] * v * hh + H[2]) / q, (H[3] * u * hw + H[4] * v * hh + H[5]) / q]; })));
  const ids = [d.id], put = (x: FacePlane, tex: number[], light: number, alpha: number) => {
    if (slot >= MAX) return;
    faceUniform((desk.CARD0 + slot * desk.CARD_VEC4) * 4, o0, x, tex, light, alpha, dpr);
    ids.push(slot++);
  };
  const behind = lid && lid.plane ? (dot(lid.plane.n, lid.plane.dc) < 0) === seesFront(P, lid.plane.dc, lid.plane.n) : true; // the box and the eye on the same side of the lid
  if (lid && !lid.gone && behind) ids.push(lid.id);
  if (inside) for (const x of faces) if (x.f < -EDGE_ON) put(x, uv.inner, 1, P.w);
  ids.push(...d.pile.filter((s) => s.carrier === d && !s.gone).sort((a, b) => a.z - b.z).map((s) => s.id));
  if (inside) put(open, uv.open, 1, 1 - 0.35 * P.w);
  for (const x of faces) if (x !== open && x.f > EDGE_ON) put(x, uv[x.name], x.light, 1);
  if (lid && !lid.gone && !behind) { ids.push(lid.id); desk.U[(desk.CARD0 + lid.id * desk.CARD_VEC4) * 4 + 51] = 1; } // in front: no shadow on the box
  return ids;
}
function faceUniform(o: number, o0: number, { H, hw, hh }: FacePlane, tex: number[], light: number, alpha: number, dpr: number) {
  const v = desk.U.slice(o0, o0 + desk.CARD_VEC4 * 4), inv = desk.invert3(H), pad = (0.6 * dpr) / desk.shared!.dev; // faces overlap a hair, so no seam shows between them
  v.set([inv[0], inv[1], inv[2], 0, inv[3], inv[4], inv[5], 1e3, inv[6], inv[7], inv[8], 0, hw + pad, hh + pad, 0.4 * dpr, 1,
    H[2] / H[8], H[5] / H[8], 1, 0, 1, 0, 0, 0, ...tex, 0, 0, 0, 0, projR(H, hw + pad, hh + pad) + 2, 1, 0, light, ...tex], 0);
  v[43] = 1;
  v.set([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, hw, hh, 1, alpha, 0, 16 + 1], 44);
  desk.U.set(v, o);
}
// The box to its slide's offset and its tuck, the cards in it to their places (only when something moved), and the lid
// on its hinge (the box's open end): open, it lies flat beside the box, inside up; closing, it turns over about the hinge
// (its free edge rising) onto the box's front.
const LID_OPEN = 0.22 * Math.PI; // open, the lid stands up off the desk at about 40 degrees, the way a paper hinge springs back
function moveDeck(d: Card) {
  const x = d.spot + d.slide.at + d.bx.at; // the arrival's slide, then the empty box's tuck
  if (x !== d.x || d.squash || d.squashV) { d.x = d.px = x; placeDom(d); d.dirty = true; }
  d.gone = false;
  if (d.dirty) {
    d.dirty = false;
    d.pile.forEach((s, i) => { if (!s.fly) { [s.x, s.y, s.rot] = pilePose(d, i, s); Object.assign(s, { face: 1, z: pileZ(d, i) }); placeDom(s); } });
    const n = d.pile.length;
    if (d.said !== n) { d.said = n; d.hit.setAttribute('aria-label', n ? `Card box, ${n} card${n === 1 ? '' : 's'}. Enter deals the top card; Shift+Enter gathers or deals them all` : 'Card box, empty. Enter puts every card back'); }
  }
  const lid = lidOf(d);
  if (!lid) return;
  const a = (d.rot * Math.PI) / 180, th = LID_OPEN + (Math.PI - LID_OPEN) * EASES.cubic(d.lidT || 0), hx = d.x - (d.w / 2) * Math.cos(a), hy = d.y - (d.w / 2) * Math.sin(a);
  Object.assign(lid, { x: hx - (lid.w / 2) * Math.cos(th) * Math.cos(a), y: hy - (lid.w / 2) * Math.cos(th) * Math.sin(a), rot: d.rot, flipA: th, gone: d.gone,
    flyLift: Math.max(((lid.w / 2) * Math.sin(th)) / T.lift, d.lift), z: th > Math.PI / 2 ? d.z + 0.5 : -1 }); // open: under every card; closed: on the box
}
function stepDecks(dt: number) {
  for (const d of sources) {
    if (!d.more || desk.view.phone || !d.slide || !desk.dealing) continue;
    stepTally(d, dt);
    if (d.launch) continue; // thrown (stepThrows)
    const v = d.slide;
    if (v.wait > 0) v.wait -= dt;
    else if (v.want === 'off') slideDeck(d, 'out', v.arrive || MOTION.settle, easeOutQuart); // the arrival
    if (v.t < 1) v.t = Math.min(1, v.t + dt / v.dur);
    if (v.wait <= 0) v.at = v.from + (v.to - v.from) * v.ease(v.t);
    stepBox(d, dt);
    moveDeck(d);
  }
}
// Open while cards are on their way in or only just out, while it is wanted (the pointer or a dragged card near or over
// it, a gather or a draw asked for, keyboard focus), and a moment after; otherwise its lid shut, and tucked if empty.
function stepBox(d: Card, dt: number) {
  const b = d.bx;
  if (b.t < 1) { b.t = Math.min(1, b.t + dt / b.dur); b.at = b.from + (b.to - b.from) * b.ease(b.t); }
  d.hover = Number(!!desk.mouse && overDeck(d, desk.mouse.x + cam.x, desk.mouse.y, (d.hover ? BOX.unhover : BOX.hover) * desk.view.k)); // 1 or 0: a box's hover is the pointer near it
  let busy = false, drag = false;
  for (const s of sources) {
    if (s.fly?.deck === d && (s.fly.in || flights.t < s.fly.at + 0.3 * DRAW.dur)) busy = true;
    if (s.dragging && s.region === d.region) drag = true;
  }
  if (busy || d.near || d.welcome || d.gatherAsk || d.drawAsk || d.focused || d.hover) d.outFor = LID_WAIT; else d.outFor -= dt;
  const open = d.outFor > 0 || arriving(d), out = open || d.pile.length > 0, to = out ? 0 : tuckAt(d) - (drag ? BOX.peek * desk.view.k : 0);
  if (b.to !== to) slideBox(d, to, MOTION.respond, out || drag ? easeOutQuart : EASES.cubic);
  d.lidT = clamp(d.lidT + (open ? -dt : dt) / T.lidS);
  if (d.gatherAsk && b.t >= 1 && d.lidT === 0) { d.gatherAsk = false; boxGather(d); } // out and open: in they come
  if (d.drawAsk && d.lidT === 0) { const all = d.drawAsk.all; d.drawAsk = null; drawMore(d, all); } // open: out it comes
}
const arriving = (d: Card) => d.slide.want !== 'out' || d.slide.t < 1 || d.slide.wait > 0; // the box is still sliding in
// ---------- the tally ----------
// Each box carries a pencil tally of the cards in it (tally.ts paints it into the box's texture). One hand per box: a card
// going in gets a stroke drawn as it slides in, and a card dealt out has the last stroke rubbed out as it lifts off.
// Strokes follow one another; one that falls behind (a gather) is drawn quicker to keep up. Out of sight (the other page, a
// box still arriving), on the first frame, or with reduced motion, marks come and go at once.
const inBox = (s: Card, d: Card) => (s.deck === d ? !(s.fly?.in && !s.fly.inside) : !!(s.fly?.out && s.fly.deck === d && !s.fly.up));
// Where it goes, in the box's design px (as paintBox draws it): the front panel's top corner, where a hand jots a count,
// in upright rows just past the shut lid's flap, above the label and short of the page's edge (DECK_SHOW).
function tallySetup(d: Card) {
  const { w, h } = desk.design(d), x = BOX_T + Math.round((h - 12 - BOX_T) * 0.13) + 8, m = measure(); // the flap's width (boxSize)
  m.font = font(500, 26, 'Caveat');
  const half = m.measureText(desk.BOX_NAMES[d.region]).width / 2; // half the label's length
  d.tally ??= { t: 0, free: 0, gen: 0, marks: [], shown: false };
  Object.assign(d.tally, { surf: tallySurface(d.raster, desk.shared!.dev * d.k, { x, y: 19, w: w * DECK_SHOW - 12 - x, h: (h - BOX_T) / 2 - half - 27 }), dirty: true });
}
function stepTally(d: Card, dt: number) {
  const tl = d.tally;
  if (!tl?.surf) return;
  tl.t += dt;
  const n = sources.reduce((c, s) => c + Number(inBox(s, d)), 0), live = tl.marks.filter((m) => !m.gone);
  const anim = tl.shown && !reduced && d.region === desk.page && !arriving(d);
  const hand = (dur: number) => {
    if (!anim) return { start: -1e3, dur: 1e-3 };
    const start = Math.max(tl.t, tl.free), late = start - tl.t;
    tl.free = start + Math.max(0.4 * dur, dur - late);
    return { start, dur: tl.free - start };
  };
  while (live.length < n) { const m = { slot: live.length, gen: tl.gen++, gone: null, ...hand(TALLY.drawS) }; tl.marks.push(m); live.push(m); }
  while (live.length > n) live.pop()!.gone = hand(TALLY.eraseS);
  const end = (m: Mark) => (m.gone ? m.gone.start + m.gone.dur + TALLY.fadeS : m.start + m.dur);
  const kept = tl.marks.filter((m) => !m.gone || end(m) > tl.t);
  if (kept.length !== tl.marks.length) { tl.marks = kept; tl.dirty = true; }
  tl.shown = true;
  if (!tl.dirty && !kept.some((m) => end(m) > tl.t - dt)) return;
  tl.dirty = false;
  const { rect } = tl.surf;
  desk.gpu!.device.queue.writeTexture({ texture: desk.shared!.atlas!, origin: [d.atlasAt.x + rect.x, d.atlasAt.y + rect.y] }, paintTally(tl.surf, kept, tl.t, T), { bytesPerRow: rect.w * 4 }, [rect.w, rect.h]);
  desk.redraw = true;
}
return { placeDecks, launch, arriveDeck, throwWorld, BOX, resetBox, moveDeck, BOX3D, tallySetup, LIGHT, launchPose,
  carried, boxH, cross, facing, FAR, projR, flyingOrder, FACE_SLOTS, stepDecks, stepThrows };
}
