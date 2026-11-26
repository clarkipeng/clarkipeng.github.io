import { currentDesk } from './state.ts';
import { lerp, clamp, MOTION, smooth, IMPRINT_S } from './tunables.ts';
import type { Card } from './layout.ts';
import { paperChain, stepChain } from './note.ts';

export type Patch = [number, number, number, number]; // center, half size: fractions of the card's half size

export function mountCards() {
const desk = currentDesk();
const { cam, addEventListener, cursor, door, signal, sources, T, reduced, turn, next, hinged, paperL, placeDom,
  drawStill } = desk;
// Pointer position on the desk (CSS px), accounting for the camera on desktop and the scroll on phones.
const deskX = (e: MouseEvent) => (desk.view.phone ? e.pageX : e.clientX + cam.x);
const deskY = (e: MouseEvent) => (desk.view.phone ? e.pageY : e.clientY);

// The mouse pointer on screen (null when it is not over the page). Hover is derived from it every frame, so a missed
// pointerenter/leave (or one that fires before the media is ready) can never leave a card stuck.
desk.mouse = null;
addEventListener('pointermove', (e) => {
  cursor.x = deskX(e); cursor.y = deskY(e);
  if (e.pointerType === 'mouse') desk.mouse = { x: e.clientX, y: e.clientY };
  door.at = { x: e.clientX, y: e.clientY };
  if (!(e.target as Partial<Element>).closest?.('.src')) cursor.amt = 1;
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => (desk.mouse = null), { signal });
function syncHover() {
  if (desk.view.phone || desk.probeKey || sources.some((o) => o.dragging)) return;
  const el = desk.mouse && document.elementFromPoint(desk.mouse.x, desk.mouse.y)?.closest('.src');
  const over = el && sources.find((o) => o.el === el);
  for (const s of sources) setHover(s, s === over);
}

function setHover(s: Card, on: boolean) {
  if (desk.view.phone || s.hoverOn === on || (on && (s.flipTo || s.flying || s.kind === 'deck'))) return; // a deck does not lift: its pile or its box and lid stay together
  s.hoverOn = on;
  if (on && s.playlist && !s.player) desk.makePlayer(s);
  if (on) { desk.hovered = s; s.hoverSince = performance.now(); } else if (desk.hovered === s) desk.hovered = null;
}

for (const s of sources) {
  const hit = s.hit;
  hit.addEventListener('click', (e) => {
    e.preventDefault();
    if (s.suppressClick) { s.suppressClick = false; return; }
    if (s.flying) return;
    if (s.more) desk.deckClick(s, e); else flip(s);
  });
  if (s.more) { hit.addEventListener('focus', () => (s.focused = hit.matches(':focus-visible'))); hit.addEventListener('blur', () => (s.focused = false)); } // a tucked box comes out for the keyboard
  hit.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !s.flying) { e.preventDefault(); if (s.more) desk.deckClick(s, e); else if (s.over) desk.putBack(s, desk.pageDeck(s.region)!); else flip(s); } // over its box, it goes in
    else if (ARROWS[e.key] && desk.gpu && !desk.view.phone && !s.flying && !s.dragging && s.kind !== 'deck') { e.preventDefault(); nudge(s, ARROWS[e.key], e.shiftKey); }
  });
  hit.addEventListener('pointerdown', (e) => {
    if (desk.view.phone || !desk.gpu || reduced || e.button !== 0 || s.flying || s.kind === 'deck') return; // decks stay at their edge // reduced motion: cards stay put (a click still flips)
    const press = { x: deskX(e), y: deskY(e), ox: s.x - deskX(e), oy: s.y - deskY(e), moved: false };
    hit.setPointerCapture(e.pointerId);
    let lt = performance.now();
    const move = (m: PointerEvent) => {
      if (!press.moved && Math.hypot(deskX(m) - press.x, deskY(m) - press.y) < 4) return;
      if (!press.moved) { press.moved = true; s.dragging = true; s.released = false; s.shove = s.kb = null; s.edgePen = false; s.imp = { x: s.x, y: s.y, t: 0 }; s.z = ++desk.topZ; s.el.classList.add('dragging'); }
      const now = performance.now(), dt = Math.max(1, now - lt) / 1000;
      const nx = deskX(m) + press.ox, ny = deskY(m) + press.oy;
      const k = 1 - Math.exp(-dt / 0.05);
      s.vx = lerp(s.vx, (nx - s.x) / dt, k); s.vy = lerp(s.vy, (ny - s.y) / dt, k);
      s.x = nx; s.y = ny; lt = now;
      // Over its page's box, it eases into the box's open end, face down and upright (let go, and it slides in), and back
      // into the hand once dragged away; it counts as over once well inside, and as away only once clearly out, so it
      // never flickers at the edge.
      const deck = desk.dealing && desk.pageDeck(s.region);
      if (deck) {
        s.over = desk.decked(s) && !turn.on && desk.overDeck(deck, deskX(m), deskY(m), (s.over ? desk.BOX.keep : desk.BOX.enter) * desk.view.k);
        // near the right edge or the box's spot it calls a tucked box out
        const r = desk.obb(s), ex = desk.reach(r, [1, 0]), ey = desk.reach(r, [0, 1]), q = desk.obb(deck, deck.spot), qx = desk.reach(q, [1, 0]), qy = desk.reach(q, [0, 1]);
        const gap = Math.min((s.region + 1) * desk.view.w - s.x - ex, Math.hypot(Math.max(0, Math.abs(s.x - deck.spot) - ex - qx), Math.max(0, Math.abs(s.y - deck.y) - ey - qy)));
        deck.near = desk.decked(s) && gap < (deck.near ? desk.BOX.far : desk.BOX.near) * desk.view.k;
        deck.welcome = s.over;
      }
    };
    const up = () => {
      hit.removeEventListener('pointermove', move);
      const deck = press.moved && desk.dealing && desk.pageDeck(s.region), over = s.over;
      for (const o of sources) if (o.more) o.welcome = o.near = false;
      if (deck && over) { // let go over its box: waiting at its open end already, it slides in
        Object.assign(s, { dragging: false, suppressClick: true }); s.el.classList.remove('dragging');
        desk.putBack(s, deck); return;
      }
      s.over = false;
      if (press.moved) {
        s.suppressClick = true; s.dragging = false; s.released = true; s.el.classList.remove('dragging');
        const keep = performance.now() - lt > 80 ? 0 : 0.35; // a little momentum, none if held still before letting go
        // The hand lets go of it at the speed it keeps; it lands once it settles (see contact). It keeps its own angle.
        s.vx *= keep; s.vy *= keep; s.relV = Math.hypot(s.vx, s.vy); s.pk = { t: s.relV, n: 0, a: 0 };
        if (!hit.matches(':hover')) setHover(s, false);
        next(); // a page change asked for during the drag goes now
      }
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerup', up, { once: true });
    hit.addEventListener('pointercancel', up, { once: true });
  });
}

// Click turns a card over to its details (and back): it lifts, turns, and lays back down, a little differently turned
// each time (its slot's angle plus a fresh jitter, so nothing drifts), and lands. While it is off the desk it leaves the
// slime alone (no outline food).
function flip(s: Card) {
  if (!s.backEl) return;
  s.flipTo = s.flipTo ? 0 : 1;
  s.hit.setAttribute('aria-expanded', String(!!s.flipTo));
  if (s.flipTo) { setHover(s, false); s.z = ++desk.topZ; }
  // Gaussian around the card's home angle (Box-Muller): most flips land near it, a few tilt further; capped at maxAngle.
  const gauss = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  s.rotFrom = s.rot; s.rotTo = hinged(s) ? s.rot : desk.view.phone ? s.home : clamp(s.home + gauss * T.flipJitter, -T.maxAngle, T.maxAngle); // a phone's card nearly fills the screen's width: it lands as it lay
  if (!desk.gpu || reduced) { // the still fallback and reduced motion just swap faces
    if (!desk.gpu && s.flipTo) desk.paintDomBack(s);
    if (hinged(s)) s.ch = s.flipTo ? paperChain(T.paperN, paperL(s), 1) : null;
    s.flip = s.emit = s.face = s.flipTo; s.el.classList.toggle('flipped', !!s.flipTo); placeDom(s);
    if (desk.gpu) drawStill();
  } else if (hinged(s)) { // the note: a finger lifts its free edge over (or back)
    s.ch ||= paperChain(T.paperN, paperL(s), 0);
    Object.assign(s.ch, { dir: s.flipTo ? 1 : -1, push: true, slap: true, rest: false });
  }
}

// Hover's clock: a card responds to hover, and lets go a little faster.
const hoverTau = (rising: boolean) => Math.max(0.01, T.focusS / 3) * (rising ? 1 : MOTION.exit);
// Springs: lift rises while dragging, tilt leans toward velocity (max ~8 deg), released cards glide and settle.
function stepCards(dt: number) {
  const maxTilt = (T.tilt * Math.PI) / 180;
  for (const s of sources) {
    if (s.shove) desk.stepShove(s, dt);
    else if (s.kb) stepKey(s, dt); // s.kb: where the keys are taking it
    else if (!s.dragging && !s.flying && s.kind !== 'deck') { // decks stay at their edge
      const f = Math.exp(-dt * 7);
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= f; s.vy *= f;
      const mx = s.w * 0.25, my = s.h * 0.25;
      const x0 = desk.view.phone ? 0 : s.region * desk.view.w; // cards stay on their own page
      if (s.released && !desk.view.phone) edgeSpring(s, x0, dt);
      else {
        if (s.x < x0 + mx || s.x > x0 + desk.view.w - mx) { s.x = clamp(s.x, x0 + mx, x0 + desk.view.w - mx); s.vx *= -0.4; }
        if (s.y < my || s.y > desk.view.docH - my) { s.y = clamp(s.y, my, desk.view.docH - my); s.vy *= -0.4; }
      }
    }
    const liftT = s.dragging ? 1 : s.welcome ? 0.35 : s.keyHeld ? 0.3 : s.hoverOn ? 0.1 : 0;
    if (s.over || s.snap) s.snap = clamp((s.snap || 0) + (s.over ? dt : -dt) / MOTION.respond); // over its box: to its open end
    s.liftV += (170 * (liftT - s.lift) - 17 * s.liftV) * dt; s.lift = Math.max(0, s.lift + s.liftV * dt);
    let tx = 0, ty = 0;
    if (s.dragging) { tx = s.vx * 0.00045; ty = s.vy * 0.00045; const m = Math.hypot(tx, ty); if (m > maxTilt) { tx *= maxTilt / m; ty *= maxTilt / m; } }
    for (const [i, t] of [tx, ty].entries()) { s.tiltV[i] += (150 * (t - s.tilt[i]) - 9 * s.tiltV[i]) * dt; s.tilt[i] += s.tiltV[i] * dt; }
    const swayT = s.dragging ? clamp(s.vx * 0.00005, -0.05, 0.05) : 0;
    s.swayV += (120 * (swayT - s.sway) - 10 * s.swayV) * dt; s.sway += s.swayV * dt;
    s.hover = lerp(s.hover, s.hoverOn ? 1 : 0, 1 - Math.exp(-dt / hoverTau(s.hoverOn)));
    if (hinged(s)) stepPaper(s, dt);
    else if (s.flip !== s.flipTo) {
      s.flip = s.flipTo ? Math.min(1, s.flip + dt / T.flipS) : Math.max(0, s.flip - dt / (T.flipS * MOTION.exit)); // closing is quicker
      s.el.classList.toggle('flipped', s.flipTo === 1 && s.flip >= 1);
      s.el.classList.toggle('turning', s.flip !== s.flipTo); // no flat focus ring around a card turning in 3D // the real links (their hover wash and focus ring) only once the back lies at rest: mid-flip they would float off the turning card
      // It eases into its new angle as it lays down (the last 22% of the turn), so it lands at the final angle.
      s.rot = lerp(s.rotFrom, s.rotTo, smooth(s.flipTo ? (s.flip - 0.78) / 0.22 : (0.22 - s.flip) / 0.22));
      if (s.flip === s.flipTo) placeDom(s); // laid down
    }
    if (!s.fly && !s.deck && s.kind !== 'deck') s.face = Math.max(hinged(s) ? clamp(s.flip) : desk.easeFlip(clamp((s.flip - 0.22) / 0.56)), smooth(s.snap || 0)); // a flip turns it over in the middle of its lift (the note all the way: it peels up first); over its box it turns face down
    const rest = !s.fly && s.flip === s.flipTo && !s.kb && !s.over && !s.edgePen && Math.abs(s.lift - liftT) < 0.04 && Math.hypot(s.vx, s.vy) < 60;
    if (rest && s.released) { s.released = false; if (desk.offCorner(s)) s.pk = null; else desk.shove(s); } // let go: it shoves the cards under it (or slides off the corner first, and does not land)
    contact(s, dt, Math.max(T.lift * Math.max(s.lift, s.flyLift), desk.flipPath(s)[0]), rest);
    // An open card emits its ink: it ramps up while open and fades back to the shared ink slowly after closing.
    s.emit = s.flipTo ? Math.min(1, s.emit + dt / T.emitIn) : Math.max(0, s.emit - dt / T.emitOut);
    if (s.rel >= 0 && s.rel < 1e3 && (s.rel += dt) > T.landRelease + 0.5) s.rel = 1e3; // its held agents have all left
    if (s.squash || s.squashV) { // the box's nudge: a small damped squash
      s.squashV += (-260 * s.squash - 16 * s.squashV) * dt; s.squash += s.squashV * dt;
      if (Math.abs(s.squash) + Math.abs(s.squashV) < 1e-3) s.squash = s.squashV = 0;
    }
    s.burst *= Math.exp(-dt * 7);
    if (s.imp && (s.imp.t += dt) >= IMPRINT_S) s.imp = null; // the veins have reclaimed it
  }
}


// Edges push back: a released card that runs past the screen's margin meets a stiff, well-damped spring (zeta 0.7) that
// turns it around; on the way back it is no faster than an ease-out onto the margin (83 ms), so it is not flung back
// across the desk. No hard stop anywhere: a card dragged off the edge glides back in the same way.
function edgeSpring(s: Card, x0: number, dt: number) {
  const r = desk.obb(s), ex = desk.reach(r, [1, 0]), ey = desk.reach(r, [0, 1]), m = 12 * desk.view.k, k = 1600, c = 56, back = 12;
  const lo = x0 + ex + m, hi = x0 + desk.view.w - ex - m, top = ey + m, bot = desk.view.h - ey - m;
  const px = s.x < lo ? lo - s.x : s.x > hi ? hi - s.x : 0, py = s.y < top ? top - s.y : s.y > bot ? bot - s.y : 0;
  const push = (v: number, p: number) => { v += (k * p - c * v) * dt; return Math.sign(v) === Math.sign(p) ? Math.sign(p) * Math.min(Math.abs(v), Math.abs(p) * back) : v; };
  if (px) s.vx = push(s.vx, px);
  if (py) s.vy = push(s.vy, py);
  if ((px || py) && s.pk) s.pk.t = 0; // the wall takes its motion along the page
  s.edgePen = Math.abs(px) + Math.abs(py) > 0.5; // it touches down only once it is back inside
}


// Keyboard moving: arrow keys nudge the focused card (Shift for bigger steps). It lifts a little and follows the keys
// closely; once they stop it comes down with the same settle and shove as a drop. With reduced motion it just moves.
const ARROWS: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
function nudge(s: Card, [dx, dy]: number[], big: boolean) {
  const step = (big ? 40 : 8) * desk.view.k, x0 = s.region * desk.view.w, r = desk.obb(s), ex = desk.reach(r, [1, 0]), ey = desk.reach(r, [0, 1]), m = 12 * desk.view.k;
  const k = s.kb || { tx: s.shove ? s.shove.tx : s.x, ty: s.shove ? s.shove.ty : s.y };
  k.tx = clamp(k.tx + dx * step, Math.min(x0 + ex + m, s.x), Math.max(x0 + desk.view.w - ex - m, s.x)); // stays on screen
  k.ty = clamp(k.ty + dy * step, Math.min(ey + m, s.y), Math.max(desk.view.h - ey - m, s.y));
  Object.assign(s, { kb: k, keyHeld: true, shove: null, vx: 0, vy: 0, relV: 0 });
  const deck = desk.dealing && desk.pageDeck(s.region); // over its box it waits at the open end; Enter puts it in
  if (deck) deck.welcome = s.over = desk.decked(s) && !turn.on && desk.overDeck(deck, k.tx + ex, k.ty, (s.over ? desk.BOX.keep : desk.BOX.enter) * desk.view.k); // its leading edge (it stays on screen, so its middle never reaches the box)
  if (s.z !== desk.topZ) s.z = ++desk.topZ;
  clearTimeout(s.keyTimer);
  s.keyTimer = setTimeout(() => { s.keyHeld = false; if (reduced) { s.kb = null; desk.shove(s); drawStill(); } }, 300);
  if (reduced) { Object.assign(s, { x: k.tx, y: k.ty }); placeDom(s); drawStill(); } else s.released = true;
}
function stepKey(s: Card, dt: number) {
  const k = s.kb!, e = 1 - Math.exp(-dt / 0.06);
  s.x += (k.tx - s.x) * e; s.y += (k.ty - s.y) * e;
  if (!s.keyHeld && Math.hypot(k.tx - s.x, k.ty - s.y) < 0.5) Object.assign(s, { x: k.tx, y: k.ty, kb: null });
}

// The note turns as paper (note.ts): the finger lets go past upright and the sim does the rest. Its free edge slapping
// down is its landing; it rests once it lies still, on whichever side it fell.
function stepPaper(s: Card, dt: number) {
  const c = s.ch;
  if (!c || c.rest) return;
  const v = stepChain(c, dt, { g: T.gravity, drag: T.paperDrag, bend: T.paperBend, lift: T.paperLift });
  if (v) land(s, Math.max(0.1, clamp(v / 600))); // the floor the old land() gave it
  s.flip = clamp(Math.atan2(c.x[2 * c.n + 1], c.x[2 * c.n]) / Math.PI);
  if (c.rest) {
    s.flip = s.flipTo = c.x[2 * c.n] < 0 ? 1 : 0; s.hit.setAttribute('aria-expanded', String(!!s.flipTo));
    if (!s.flipTo) s.ch = null;
    placeDom(s);
  }
  s.el.classList.toggle('flipped', c.rest && !!s.flipTo);
  s.el.classList.toggle('turning', !c.rest);
}

// ---------- contact ----------
// One rule for everything that comes down on the page. Above the contact band (lifted, dealt, turning over) an item keeps
// the most speed it has had along the page, coming down, and turning (at its radius of gyration). A hand, the keys, or a
// box holding it, or a wall that stops it, takes that motion. Back at rest on the page it lands with the momentum it shed
// there: (landWn x coming down + along + turning) / landP, at most 1. Sliding on the page, it never left: no landing.
// Any item calls it every frame with its height over the page (px), whether it has come to rest, and the patch of it
// that just came into contact (center, half size, as fractions of its half size); a patch that keeps growing (a sheet
// rolling down) lands piece by piece, each with the motion shed since the last.
const FULL: Patch = [0, 0, 1, 1];
function contact(s: Card, dt: number, h: number, rest: boolean, patch = FULL) {
  const p = s.pv;
  if (s.dragging || s.kb || s.deck || s.kind === 'deck') { s.pk = s.pv = null; return; } // held (the box does not land)
  s.pv = [s.x, s.y, h, s.rot, s.face];
  if (!s.pk && h > T.landBand) s.pk = { t: 0, n: 0, a: 0 };
  const m = s.pk;
  if (!m) return;
  if (p && dt > 0) {
    m.t = Math.max(m.t, Math.hypot(s.x - p[0], s.y - p[1]) / dt);
    m.n = Math.max(m.n, (p[2] - h) / dt);
    m.a = Math.max(m.a, (Math.hypot(s.w, s.h) / Math.sqrt(12)) * Math.hypot(((s.rot - p[3]) * Math.PI) / 180, (s.face - p[4]) * Math.PI) / dt);
  }
  if (rest) { s.pk = null; land(s, Math.min(1, (T.landWn * m.n + m.t + m.a) / T.landP), patch); }
}
// Landing: the next sim step sends the agents under and just around the patch out through its edge with a burst of
// speed (scaled by strength), the ink there gets a pulse of excitation, and agents held for it (a page whose cards fly
// in) leave from its edge.
function land(s: Card, k: number, patch?: Patch) {
  Object.assign(s, { landK: true, landS: k, burst: Math.max(s.burst, k), patch });
  if (s.rel < 0) s.rel = 0;
  if (s.shoveOnLand) { s.shoveOnLand = false; s.relV = 0; desk.shove(s); } // a drawn card that had to land on something
}
return { FULL, deskX, deskY, syncHover, stepCards, setHover };
}
