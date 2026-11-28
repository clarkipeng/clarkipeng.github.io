import { currentDesk } from './state.ts';
import { MAX, lin, clamp, hexRGB, smooth, IMPRINT_S, NAME_INK, PAGE_NAMES, CORNER, LAND } from './tunables.ts';

const SHADOW_SOFT = 1.1; // how blurred card shadows are
import type { Card } from './layout.ts';
import type { Gpu, Sim } from './gpu.ts';
import { NCH } from './chips.ts';
import { NS } from './note.ts';
import { createSheet, NODES, BINS, type Sheet } from './sheet.ts';


export function mountUniforms() {
const desk = currentDesk();
const { absorbance, hinged, T, STRIP, LIGHT, noteProfile, shown, noteMesh, launchPose, eaten, BOX_STEP, carried, boxH,
  cross, facing, FAR, capped, projR, FULL, BOX_T, STYLE, cam, sources, flyingOrder, FACE_SLOTS, coverRect, Q, cursor,
  turn, rollR, door, DOOR } = desk;
// ---------- uniforms ----------

// Uniform layout: 22 vec4 of globals, MAX / 4 of draw order, 1 of video uv, then the cards (CARD_VEC4 vec4 each).
const G_HEAD = 22, VU_OFF = (G_HEAD + MAX / 4) * 4, CARD0 = G_HEAD + MAX / 4 + 1, CARD_VEC4 = 16;
const CHIP_OFF = (CARD0 + MAX * CARD_VEC4) * 4, CHIP_VEC4 = 1 + NCH * 3; // then the chips: one vec4, and three per chip
const SHEET_OFF = CHIP_OFF + CHIP_VEC4 * 4, SHEET_F = (3 + NODES + BINS / 2) * 4; // then the two sheets (wgsl.ts Sheet)
const U = new Float32Array(SHEET_OFF + 2 * SHEET_F);
// The sheets drawn: the turning page (the physics' paper while it throws from this page, else its own, on the render's
// clock) and the page's corner (curled at rest).
const turnSheet = createSheet({ state: (_, out) => { out[0] = turn.d; out[1] = turn.a; out[2] = turn.start; }, rollR, model: () => T.pageModel, gravity: () => T.gravity * desk.view.k, lift: () => T.pageLift });
const doorSheet = createSheet({ state: (_, out) => { out[0] = door.d; out[1] = door.a; out[2] = door.d; }, rollR, model: () => 0 });
function writeSheet(k: number, sh: Sheet | null, dev: number) {
  const o = SHEET_OFF + k * SHEET_F;
  if (!sh || sh.reach < 0) { U[o + 2] = 0; return; }
  U.set([sh.dx, sh.dy, NODES, sh.reach * dev + 1, (1 + 0.6 * sh.R) * dev, sh.low < 1e5 ? sh.low * dev : 1e6, sh.R * dev, 0], o);
  for (let j = 0; j < NODES; j++) U.set([sh.X[j] * dev, sh.Z[j] * dev, sh.M[j] * dev, sh.TH[j]], o + 8 + 4 * j);
  // Which segments reach each of BINS strips across the profile (along dir), so a pixel tests only those (a few of
  // NODES - 1): a bitmask per strip, 24 segments to a float (exact), two floats to a strip.
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < NODES; j++) { lo = Math.min(lo, sh.X[j]); hi = Math.max(hi, sh.X[j]); }
  lo = lo * dev - 0.5; hi = hi * dev + 0.5;
  const bw = Math.max((hi - lo) / BINS, 1e-3), b = o + 8 + 4 * NODES, m = b + 4;
  U.set([lo, bw, 0, 0], b); U.fill(0, m, m + 2 * BINS);
  for (let j = 0; j + 1 < NODES; j++) {
    const x0 = Math.min(sh.X[j], sh.X[j + 1]) * dev - 0.5, x1 = Math.max(sh.X[j], sh.X[j + 1]) * dev + 0.5;
    const i0 = Math.max(0, Math.floor((x0 - lo) / bw - 1e-3)), i1 = Math.min(BINS - 1, Math.floor((x1 - lo) / bw + 1e-3)), w = m + (j < 24 ? 0 : 1);
    for (let i = i0; i <= i1; i++) U[w + 2 * i] += 2 ** (j % 24);
  }
}
function writeSheets(dev: number) {
  const P = desk.phys, k = desk.view.k, w = desk.view.w, h = desk.view.h;
  let a: Sheet | null = null;
  if (turn.on && !desk.capturing) {
    if (P?.L && P.L.region === turn.from) a = P.sheet;
    else { turnSheet.page(0, w, h, k); turnSheet.prepare(performance.now() / 1000); a = turnSheet; }
  }
  writeSheet(0, a, dev);
  if (desk.capturing || desk.view.phone) writeSheet(1, null, dev);
  else { doorSheet.page(0, w, h, k); doorSheet.prepare(0); writeSheet(1, doorSheet, dev); }
}
function invert3(m: number[]) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}
const rodrigues = (v: number[], a: number[], phi: number) => {
  const c = Math.cos(phi), s = Math.sin(phi), dot = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const cr = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + a[i] * dot * (1 - c));
};
const easeFlip = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
// Card plane -> screen homography (sim px): lift height, in-plane rotation, the flip about the card's own vertical axis,
// and a 3D tilt toward velocity.
// OKLab <-> 8-bit sRGB, for the mild project inks.
const oklab = (rgb: number[]) => {
  const [r, g, b] = rgb.map(lin);
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const fromOklab = ([L, A, B]: number[]) => {
  const [l, m, s] = [L + 0.3963377774 * A + 0.2158037573 * B, L - 0.1055613458 * A - 0.0638541728 * B, L - 0.0894841775 * A - 1.291485548 * B].map((x) => x ** 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => 255 * clamp(c) ** (1 / 2.2));
};
// A closed card's mild ink: its own hue at the shared ink's lightness and chroma, so it sits on the page as calmly as the
// olive and only the hue changes.
function mildInk(hex: string, baseHex: string, mix = 1) {
  const [L, a0, b0] = oklab(hexRGB(baseHex)), c = oklab(hexRGB(hex)), C = Math.hypot(a0, b0);
  // Blend straight from the shared ink toward the card's own hue (at the shared lightness and chroma), so a small mix is
  // the olive with a faint cast of the card's color; rotating the hue instead would pass through unrelated hues (green).
  const h = Math.atan2(c[2], c[1]);
  return absorbance(fromOklab([L, a0 + mix * (C * Math.cos(h) - a0), b0 + mix * (C * Math.sin(h) - b0)]));
}
// A click's flip, off the desk: how high its middle is (CSS px) and how far it is from where the card lies, along the
// card's vertical axis. A card lifts in the first ~22%, turns over in the middle, and lays back down in the last ~22% (the
// same path in reverse). The note stays on its strip (stepPaper).
function flipPath(s: Card) {
  if (!(s.flip > 0 && s.flip < 1) || hinged(s)) return [0, 0];
  return [(desk.view.phone ? 0.3 : 0.9) * T.lift * smooth(s.flip / 0.22) * (1 - smooth((s.flip - 0.78) / 0.22)), 0]; // on a phone a flip lifts less, so the card stays inside the screen
}
// The note as paper (note.ts): its pose (x, y on its page, turn th, height z; CSS px), light, profile, and the tile its
// sheet and shadows fit in, from the box they can reach in its frame (the sheet up to 15% nearer the camera), turned.
const NOTE_U = new Float32Array(24 + (NS + 1) * 4);
function noteUniform(s: Card, x: number, y: number, th: number, z: number) {
  const dev = desk.shared!.dev, hw = s.w / 2, hh = s.h / 2, c = Math.cos(th), n = Math.sin(th), M = 40 * SHADOW_SOFT, L = s.h - STRIP * (s.k || 1);
  const X = hw * 1.15 + M + 20, y0 = -hh - L * 1.15 - M, y1 = hh + M + 60, cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
  const ex = X * Math.abs(c) + hy * Math.abs(n), ey = X * Math.abs(n) + hy * Math.abs(c), t0 = [Math.floor((x - n * cy - ex) * dev), Math.floor((y + c * cy - ey) * dev)];
  desk.gpu!.note.size(Math.ceil(2 * ex * dev) + 2, Math.ceil(2 * ey * dev) + 2);
  NOTE_U.set([hw, hh, 3, STRIP * (s.k || 1) - hh, x, y, c, n, ...t0, desk.gpu!.note.w, desk.gpu!.note.h, dev, 1800, z, M,
    c * LIGHT[0] + n * LIGHT[1], c * LIGHT[1] - n * LIGHT[0], LIGHT[2], Math.max(T.lift, 1), SHADOW_SOFT, L, 0, 0]);
  NOTE_U.set(noteProfile(s), 24);
  return [...t0, Math.hypot(ex, ey) + Math.abs(cy) + s.h];
}
function cardUniform(s: Card, dpr: number, o: number, originX = 0, tint = 0, base: string | null = null, hueMix = 1) {
  const fa = s.flipA ?? Math.PI * s.face, fc = Math.cos(fa); // the card's face; the box's lid by its angle
  let [fz, fv] = flipPath(s);
  const lift = Math.max(s.lift, fz / T.lift, s.flyLift);
  let [sx, sy, sr] = shown(s);
  let th = (sr * Math.PI) / 180 + s.sway;
  const sc = 1 - 0.014 * (s.squash || 0); // a card is one size everywhere (only the box's nudge squashes it)
  // The note as paper: past half way, the slime and its landing see it where it lies, over its strip.
  const mesh = noteMesh(s), yh = STRIP * (s.k || 1) - s.h / 2, lo = mesh ? Math.min(yh + s.ch!.x[2 * s.ch!.n] * (s.k || 1), -s.h / 2) : 0, tile = mesh && noteUniform(s, sx - originX, sy, th, lift * T.lift);
  if (mesh && s.flip > 0.5) fv = (lo + yh) / 2;
  sx -= Math.sin(th) * fv; sy += Math.cos(th) * fv;
  let mu = [Math.cos(th) * sc, Math.sin(th) * sc, 0], mv = [-Math.sin(th) * sc, Math.cos(th) * sc, 0];
  // Never exactly edge-on, where the homography would be singular. The note's lower edge rises as it turns.
  const fe = Math.sign(fc || 1) * Math.max(Math.abs(fc), 0.02), fs = Math.sqrt(1 - fe * fe) * (Math.sin(fa) < 0 ? -1 : 1), hz = hinged(s);
  if ((s.face > 0 || s.flipA) && !mesh) { if (hz) mv = rodrigues(mv, mu.map((v) => v / sc), Math.atan2(fs, fe)); else mu = rodrigues(mu, mv.map((v) => v / sc), Math.atan2(fs, fe)); }
  const phi = Math.hypot(s.tilt[0], s.tilt[1]);
  if (phi > 1e-5) { const ax = [-s.tilt[1] / phi, s.tilt[0] / phi, 0]; mu = rodrigues(mu, ax, phi); mv = rodrigues(mv, ax, phi); }
  let z = lift * T.lift, fade = 0, H = null, flags = hz ? 1 : 0;
  const eat = eaten(s), swarm = Math.min(1, 4 * eat); // being eaten: the slime swarms it and carries its full ink off
  const looks = (m: number[]) => Math.hypot(m[0], m[1]) / Math.hypot(...m); // how long an axis looks from above: its shadow and light squash with it
  let lv = looks(mv), shd = boxShadow(s, dpr, (s.w * dpr) / 2, (s.h * dpr) / 2).slice(0, 7);
  if (s.carrier === s) { // the flying box itself: only its shadow on what is under it (its faces are drawn on their own)
    const P = launchPose(s), [ang, fx, fy] = P.foot!, u = (1 - P.w) * shd[1]; // from its base's place in the painting
    sx += P.C[0] - s.launch!.x; sy += P.C[1] - s.launch!.y; z += Math.max(0, P.low); fade = P.fade;
    th = ang; lv = 1; flags = 8; shd = [-u, u, fx * dpr, fy * dpr, ...shd.slice(4)];
  } else if (s.carrier) { // riding in it: seen by the box's eye
    const d = s.carrier, P = launchPose(d), i = d.pile.indexOf(s), a = (d.rot * Math.PI) / 180;
    if (i >= 0) { const inn = P.w * (2 + i * BOX_STEP + 3) * desk.view.k; sx += Math.cos(a) * inn; sy += Math.sin(a) * inn; } // in all the way
    const r = carried(d, s, { sx, sy, z, mu, mv }, P);
    ({ mu, mv } = r); z = P.C[2] + r.dc[2]; lv = looks(mv);
    H = s.flyH = boxH(P, r.dc, mu, mv, dpr, originX);
    fade = i >= 0 ? Math.max(P.fade, P.w) : P.fade;
    s.plane = { dc: r.dc, n: cross(mu, mv) };
  } else if (s.launch) { // thrown: as its body lies, seen from straight above as any lifted card is
    const P = launchPose(s), M = P.M, turn = (m: number[]) => [0, 3, 6].map((r) => M[r] * m[0] + M[r + 1] * m[1] + M[r + 2] * m[2]);
    mu = turn(mu); mv = turn(mv); sx = P.C[0]; sy = P.C[1]; z += P.C[2]; fade = P.fade;
    th = Math.atan2(mu[1], mu[0]); lv = looks(mv);
  }
  const zh = z * dpr, f = 1800 * dpr - zh; // the camera is as far above the lifted card as above the desk, so lifting never scales it (the shadow shows the height)
  let cx = (sx - originX) * dpr, cy = sy * dpr; // page-local
  H ||= [f * mu[0] - cx * mu[2], f * mv[0] - cx * mv[2], cx * f, f * mu[1] - cy * mu[2], f * mv[1] - cy * mv[2], cy * f, -mu[2], -mv[2], f];
  const eyed = s.carrier ? s.carrier !== s : !!s.launch; // riding in the box or thrown: drawn as it turns in 3D
  const hw = (s.w * dpr) / 2, hh = ((mesh && s.flip > 0.5 ? yh - lo : s.h) * dpr) / 2, fh = eyed ? facing(H) : mesh ? 1 : fc, edgeOn = Math.abs(fh) < 1e-4;
  const inv = edgeOn ? FAR : invert3(H);
  if (eyed) { cx = H[2] / H[8]; cy = H[5] / H[8]; }
  if (s.launch && !s.carrier) s.launch.hull = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const q = (H[6] * u * hw + H[7] * v * hh + H[8]) * dpr; return [(H[0] * u * hw + H[1] * v * hh + H[2]) / q, (H[3] * u * hw + H[4] * v * hh + H[5]) / q]; }); // where it shows (CSS px)
  const v = [inv[0], inv[1], inv[2], s.playlist ? 1 : 0, inv[3], inv[4], inv[5], s.rel, inv[6], inv[7], inv[8], s.landS,
    hw, hh, capped(s) ? 0.032 * Math.max(hw, hh) : 3 * dpr, clamp(z / T.lift), cx, cy, Math.cos(th), Math.sin(th), sc, Math.max(s.hover, swarm), s.burst, zh,
    ...s.uv, ...s.mediaUV, eyed ? projR(H, hw, hh) + 2 : Math.hypot(hw, hh) * sc * 1.04 + 2, fh < 0 ? -1 : 1, s.landK ? 1 : 0, looks(mu),
    ...((s.fly?.out || (s.deck && !s.fly?.open) || (!s.deck && !s.fly && !s.flip && s.face > 0)) && s.puv ? s.puv : s.buv || s.uv), eat, 0, 0, s.flip !== s.flipTo || s.landK || s.flying ? 1 : 0, // in or out of its box, or turning to go in, its plain back; an open card keeps its own until it is in
    // Every inked card emits a mild share of its ink (tint) and the full ink while open.
    ...(s.inkHex ? inkOn(Math.max(s.emit, swarm), s.inkHex, tint, base, hueMix) : [0, 0, 0, 0]),
    ...(s.imp ? [(s.imp.x - originX) * dpr, s.imp.y * dpr, (1 - s.imp.t / IMPRINT_S) ** 2] : [0, 0, 0]), Math.max(fade, eat),
    ...shd, 4 * flags + lv, ...(s.patch || FULL)];
  if (v.length !== CARD_VEC4 * 4) throw new Error(`card uniform has ${v.length} floats, not ${CARD_VEC4 * 4}`); // a field lost or added shifts every one after it
  if (tile) { v[52] = tile[0]; v[53] = tile[1]; v[32] = tile[2] * dpr; } // shd.xy: its tile's corner; bound.x: all of it
  U.set(v, o);
}

// The card box stands on its base (its shadow falls from there, not from the front panel raised above it), and its
// texture's alpha is part of its shape; its lid lies on the desk's level the same way. Every other card: its whole face.
function boxShadow(s: Card, dpr: number, hw: number, hh: number) {
  if (s.kind !== 'deck') return [0, 0, hw, hh, 0, 0, 0, 0];
  const t = (BOX_T * (s.k || 1) * dpr) / 2;
  return s.lid ? [0, t, hw, hh - t, 1, 0.04, 0, 0] : [-t, t, hw - t, hh - t, 1, 0.12, 9, 0]; // obj.z: how much higher than a card its far shadow falls from (CSS px)
}
// Paper: an open card emits its full ink; a closed one a tint share of its mild ink. Blends between them as it opens.
function inkOn(emit: number, hex: string, tint: number, base: string | null, hueMix = 1) {
  const full = absorbance(hexRGB(hex));
  if (!tint || !base) return [...full, emit];
  const mild = mildInk(hex, base, hueMix), w = Math.max(emit, tint), u = emit / w;
  return [...mild.map((m, i) => m + (full[i] - m) * u), w];
}

const clock = { t: 0, frame: 0 };
const NAME_ABS = absorbance(NAME_INK);
// capturing: drawing the frozen frame a page turn starts from (the page without its corner). trans.fade: the crossfade
// from the frame before a sim resolution change.
desk.capturing = false;
const trans = { fade: 0 };
function writeUniforms(g: Gpu, sm: Sim = desk.sim!, hold = false) {
  const s = sm, d = s.dpr, dev = desk.shared!.dev, st = STYLE[PAGE_NAMES[s.page]];
  // This page's cards whose shadows can reach the screen, bottom to top; the passes only visit these.
  const sx = desk.view.phone ? 0 : s === desk.sim ? cam.x : s.origin, sy = desk.view.phone ? scrollY : 0; // a page warming in the background sees its own view
  for (const src of sources) cardUniform(src, d, (CARD0 + src.id * CARD_VEC4) * 4, desk.view.phone ? s.origin : src.region * desk.view.w, st.tint, st.ink, st.hueMix); // each card from its own page's origin (the box flying off the page you left)
  // A flying box is drawn as a box (its faces in the slots after the cards'), with what rides in it in its own order.
  let slot = sources.length;
  const fly = (ids: number[]) => ids.flatMap((id) => {
    const x = sources[id];
    if (x.carrier && x.carrier !== x) return [];
    if (x.carrier !== x) return [id];
    const r = flyingOrder(x, d, desk.view.phone ? s.origin : x.region * desk.view.w, slot);
    slot += FACE_SLOTS;
    return r;
  });
  const order = fly(sources.filter((x) => {
    if ((!desk.view.phone && x.region !== s.page) || x.gone || (desk.capturing && (x.carrier || x.launch))) return false;
    if (x.launch) return true;
    const r = Math.hypot(x.w, x.h) / 2 + 100 * SHADOW_SOFT;
    return x.x + r > sx && x.x - r < sx + desk.view.w && x.y + r > sy && x.y - r < sy + desk.view.h;
  }).sort((a, b) => a.z - b.z).map((x) => x.id));
  // What the page you left threw flies off over the turn, above both pages (never part of the turning page's frame), lowest first.
  const over = !desk.capturing && !desk.view.phone ? fly(sources.filter((x) => x.launch && x.region !== s.page).sort((a, b) => a.launch!.P.C[2] - b.launch!.P.C[2]).map((x) => x.id)).slice(0, MAX - order.length) : [];
  const vs = desk.videoSrc;
  let vu = [0, 0, 1, 1];
  if (vs) {
    const el = vs.player!.a; // the video source is a card with a player and media
    vu = coverRect((el.videoWidth || 16) / (el.videoHeight || 9), vs.media!.w / vs.media!.h, vs.frame);
  }
  U.set([s.W, s.H, hold ? s.n : desk.activeAgents(s), d,
    T.speed / 60 * d, T.deposit * Q.depMul, T.decay, T.diffuse,
    T.sd * d, T.sa, T.turn, 0,
    T.respawn, T.edge, sources.length, clock.frame,
    (cursor.x - s.origin) * d, cursor.y * d, cursor.amt, 0.94, 0.6, 0.4, st.gain, st.gamma,
    ...absorbance(hexRGB(st.ink)), s.W / desk.shared!.CW, ...NAME_ABS, 0,
    vs ? vs.id : -1, desk.videoMix, vs?.player!.fading ? clamp(vs.player!.fade) : 0, dev * desk.view.k,
    0, T.ridge * d, T.ridgeW * d, LAND.r * d,
    T.landBurst, LAND.decay, T.hoverE, T.cursorE,
    st.soft, st.grain, over.length, order.length,
    0, 0, 0, st.opacity,
    SHADOW_SOFT, T.shadow, LAND.release, desk.shared!.TX,
    0, 0, 0, s.t,
    ...hexRGB(st.bg).map(lin), 0,
    desk.shared!.CW, desk.shared!.CH, trans.fade, turn.on && !desk.capturing ? 1 : 0,
    0, 0, hold ? 1 : 0, sources.find(noteMesh)?.id ?? -1,
    0, 0, 0, 0,
    // the label sits on the flap at rest, its foot a few px from the fold
    (desk.view.k * (CORNER.size - Math.PI * DOOR.R - 4) - desk.shared!.label!.hh) * dev, desk.shared!.label!.hw * dev, desk.shared!.label!.hh * dev, turn.on ? 1 - smooth((turn.d - turn.start) / (250 * desk.view.k)) : 1,
    ...desk.shared!.labelUV![desk.page], ...desk.shared!.labelUV![turn.from],
    ...order, ...over, ...Array(MAX - order.length - over.length).fill(0), ...vu], 0);
  desk.chipUniforms(s);
  writeSheets(dev);
  g.device.queue.writeBuffer(g.uniform, 0, U);
}
return { writeUniforms, easeFlip, CARD0, CARD_VEC4, U, invert3, flipPath, CHIP_OFF, CHIP_VEC4,
  clock, NOTE_U, trans, VU_OFF };
}
