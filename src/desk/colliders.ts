// The admin panel's Colliders: what the physics sees, over the desk, read like a physics debugger. Each body: the outline
// of its collision points (their convex hull) and the points themselves, as the eye that draws the body sees them, dimmed
// while it sleeps. The turning page: its paper's height as a few contour lines. Contacts: a dot and a short tick along
// the normal, fading over a few frames so slow motion shows them. Bottom left, the same in 3D: the paper the physics
// stands things on (the page's top surface, as a mesh) and every body, from a camera that orbits the page as you drag in
// it. Loaded only when switched on; returns its stop.
import { currentDesk } from './state.ts';
import type { Body } from './physics.ts';
import type { Chips } from './chips.ts';

// The eyes that draw them (CSS px): above every card (uniforms.ts), its lean for the box (box.ts BOX3D.a), above the
// chips (chip-render.ts LOOK.cam).
const EYE = 1800, A = 0.4, CHIP_EYE = 1200;
const GRID = 20, LEVELS = [0.5, 15, 40, 80]; // the paper: sample spacing; contour heights (CSS px)
const FADE = 8; // frames a contact stays
const MESH = 30; // the 3D view's mesh spacing (CSS px)
const AWAKE = '22,150,95', ASLEEP = '120,120,120', HIT = '255,90,30', PAPER = '60,110,210';
type Eye = { x0: number; a: number; w: number }; // its page's left edge on the desk; its lean; its perspective eased in (-1: a chip's)

export function showColliders(chips: Chips) {
  const desk = currentDesk(), cv = document.createElement('canvas'), gm = cv.getContext('2d')!, g = gm;
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:25';
  const iv = document.createElement('canvas'), gi = iv.getContext('2d')!; // the 3D view
  iv.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:25;background:rgba(255,255,255,0.96);border:1px solid rgba(0,0,0,0.2);cursor:grab;touch-action:none';
  let yaw = -0.45, pitch = 1.05; // the camera, from straight down: turned about the page's middle, tipped back
  iv.onpointermove = (e) => { if (e.buttons) { yaw += e.movementX * 0.01; pitch = Math.min(1.5, Math.max(0, pitch - e.movementY * 0.01)); } };
  document.body.append(cv, iv);
  const io = new Float64Array(7), C = new Float64Array(3), R = new Float64Array(9);
  const eyes = new Map<Body, Eye>(), hits: number[] = []; // hits: x, y, tick x, tick y, frame seen
  let frameN = 0, seen = -1, zs = new Float64Array(0);
  // A world point to the screen, as the eye that draws the body about C sees it.
  const view = ({ x0, a, w }: Eye, x: number, y: number, z: number): [number, number] => {
    const rx = x - C[0], ry = y - C[1], rz = z - C[2];
    if (w < 0) { const q = CHIP_EYE / Math.max(CHIP_EYE - z, CHIP_EYE / 4); return [C[0] - x0 + q * rx, C[1] + q * ry]; }
    const F = EYE - C[2], q = F / (F - w * rz);
    return [C[0] - x0 + q * (rx + a * rz), C[1] + q * (ry - a * rz)];
  };
  // The paper's height on a coarse grid, then each level's contour (marching squares, one segment per crossed cell).
  const paper = (x0: number, sheet: { at(o: Float64Array): void }) => {
    const nx = Math.ceil(desk.view.w / GRID) + 1, ny = Math.ceil(desk.view.h / GRID) + 1;
    if (zs.length !== nx * ny) zs = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { io[0] = x0 + i * GRID; io[1] = j * GRID; sheet.at(io); zs[j * nx + i] = io[0]; }
    LEVELS.forEach((lv, li) => {
      g.strokeStyle = `rgba(${PAPER},${0.35 + (0.5 * li) / (LEVELS.length - 1)})`;
      g.beginPath();
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const c = [zs[j * nx + i], zs[j * nx + i + 1], zs[(j + 1) * nx + i + 1], zs[(j + 1) * nx + i]];
        const corner = [[0, 0], [1, 0], [1, 1], [0, 1]], cut: number[] = [];
        for (let e = 0; e < 4; e++) {
          const a = c[e], b = c[(e + 1) & 3];
          if ((a < lv) === (b < lv)) continue;
          const t = (lv - a) / (b - a), [ax, ay] = corner[e], [bx, by] = corner[(e + 1) & 3];
          cut.push((i + ax + t * (bx - ax)) * GRID, (j + ay + t * (by - ay)) * GRID);
        }
        for (let k = 0; k + 3 < cut.length; k += 4) { g.moveTo(cut[k], cut[k + 1]); g.lineTo(cut[k + 2], cut[k + 3]); }
      }
      g.stroke();
    });
  };
  const outline = (pts: [number, number][], awake: boolean, g = gm) => {
    const h = desk.hull(pts.slice());
    g.strokeStyle = g.fillStyle = awake ? `rgba(${AWAKE},0.95)` : `rgba(${ASLEEP},0.8)`;
    g.beginPath(); h.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    for (const [x, y] of pts) g.fillRect(x - 1, y - 1, 2, 2);
  };
  // A world point in the 3D view: about the page's middle O, turned by yaw, tipped by pitch, in perspective.
  const O = new Float64Array(3), cam = (x: number, y: number, z: number): [number, number] => {
    const rx = x - O[0], ry = y - O[1], ax = Math.cos(yaw) * rx - Math.sin(yaw) * ry, ay = Math.sin(yaw) * rx + Math.cos(yaw) * ry;
    const by = Math.cos(pitch) * ay - Math.sin(pitch) * z, bz = Math.sin(pitch) * ay + Math.cos(pitch) * z, F = 3 * desk.view.w, s = (0.8 * iv.width) / desk.view.w / devicePixelRatio;
    const q = F / (F - bz);
    return [iv.width / devicePixelRatio / 2 + s * q * ax, iv.height / devicePixelRatio / 2 + s * q * by];
  };
  // The page's top surface (flat at rest), rows then columns.
  const mesh = (x0: number, sheet: { at(o: Float64Array): void } | null) => {
    const { w, h } = desk.view, nx = Math.ceil(w / MESH), ny = Math.ceil(h / MESH);
    gi.strokeStyle = `rgba(${PAPER},0.6)`; gi.beginPath();
    for (const rows of [true, false]) for (let a = 0; a <= (rows ? ny : nx); a++) for (let b = 0; b <= (rows ? nx : ny); b++) {
      const x = x0 + Math.min(w, (rows ? b : a) * MESH), y = Math.min(h, (rows ? a : b) * MESH);
      io[0] = x; io[1] = y; if (sheet) sheet.at(io); else io[0] = 0;
      const [px, py] = cam(x, y, io[0]);
      if (b) gi.lineTo(px, py); else gi.moveTo(px, py);
    }
    gi.stroke();
  };
  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    frameN++;
    const dpr = devicePixelRatio, P = desk.phys;
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    g.lineWidth = 1;
    const iw = Math.round(Math.min(520, innerWidth * 0.4)), ih = Math.round(iw * 0.7);
    if (iv.width !== iw * dpr) { iv.width = iw * dpr; iv.height = ih * dpr; iv.style.width = iw + 'px'; iv.style.height = ih + 'px'; }
    gi.setTransform(dpr, 0, 0, dpr, 0, 0); gi.clearRect(0, 0, iw, ih); gi.lineWidth = 1;
    if (!P) return;
    const { world, sheet, L } = P;
    if (L) paper(L.region * desk.view.w, sheet);
    const W = desk.view.phone ? 0 : desk.view.w, x0 = (L ? L.region : desk.page) * W, rest = { x0, a: 0, w: 1 }; // the bodies' frame (box.ts syncBodies)
    O[0] = x0 + desk.view.w / 2; O[1] = desk.view.h / 2;
    mesh(x0, L ? sheet : null);
    eyes.clear();
    for (const s of desk.sources) if (s.body && s.more) eyes.set(s.body, { x0, a: A, w: s.launch ? s.launch.P.w : 0 }); // at rest the box is its painting
    for (const c of chips.bodies) eyes.set(c.p, { x0: c.chip.region * W, a: 0, w: -1 });
    for (const b of world.bodies) {
      world.pose(b, C, R);
      const e = eyes.get(b) ?? rest, pts: [number, number][] = [], p3: [number, number][] = [];
      for (let i = 0; i < b.n; i++) {
        const lx = b.points[i * 3], ly = b.points[i * 3 + 1], lz = b.points[i * 3 + 2];
        const x = C[0] + R[0] * lx + R[1] * ly + R[2] * lz, y = C[1] + R[3] * lx + R[4] * ly + R[5] * lz, z = C[2] + R[6] * lx + R[7] * ly + R[8] * lz;
        pts.push(view(e, x, y, z)); p3.push(cam(x, y, z));
      }
      outline(pts, !b.sleep); outline(p3, !b.sleep, gi);
    }
    // The note has no body: its sheet is a chain across its width (note.ts), seen by the eye that draws it (note.ts tile).
    for (const s of desk.sources) {
      if (!desk.hinged(s) || s.fly || s.deck) continue;
      const [sx, sy, r] = desk.shown(s), th = (r * Math.PI) / 180 + s.sway, cs = Math.cos(th), sn = Math.sin(th), k = s.k || 1;
      const c = s.ch, yh = desk.STRIP * k - s.h / 2, ox = sx - s.region * W, pts: [number, number][] = [];
      const along = [[-s.h / 2, 0], [yh, 0]];
      if (c) for (let i = 1; i <= c.n; i++) along.push([yh + c.x[2 * i] * k, c.x[2 * i + 1] * k]); else along.push([s.h / 2, 0]);
      for (const [y, z] of along) for (const x of [-s.w / 2, s.w / 2]) {
        const q = EYE / (EYE - z);
        pts.push([ox + q * (cs * x - sn * y), sy + q * (sn * x + cs * y)]);
      }
      outline(pts, !!c && !c.rest);
    }
    // The last step's contacts, kept for FADE frames: new ones only when the sim has stepped since.
    if (world.time !== seen) {
      seen = world.time;
      world.eachContact((b, p, n) => {
        C.set(b.px);
        const e = eyes.get(b) ?? rest, [x, y] = view(e, p[0], p[1], p[2]), [tx, ty] = view(e, p[0] + 10 * n[0], p[1] + 10 * n[1], p[2] + 10 * n[2]);
        hits.push(x, y, tx, ty, frameN);
      });
    }
    let k = 0;
    while (k < hits.length && frameN - hits[k + 4] >= FADE) k += 5;
    if (k) hits.splice(0, k);
    for (let i = 0; i < hits.length; i += 5) {
      g.strokeStyle = g.fillStyle = `rgba(${HIT},${1 - (frameN - hits[i + 4]) / FADE})`;
      g.beginPath(); g.arc(hits[i], hits[i + 1], 2, 0, 2 * Math.PI); g.fill();
      g.beginPath(); g.moveTo(hits[i], hits[i + 1]); g.lineTo(hits[i + 2], hits[i + 3]); g.stroke();
    }
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); cv.remove(); iv.remove(); };
}
