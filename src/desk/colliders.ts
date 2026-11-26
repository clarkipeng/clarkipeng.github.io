// ?colliders: what the physics sees, over the desk. Each body's contact points (dots) and their outline, as the eye that
// draws it sees them; the turning page's lifted paper (from above, darker the higher); and the last step's contacts, each
// with its normal. Loaded only with ?colliders, so it costs nothing otherwise.
import { currentDesk } from './state.ts';
import type { Body } from './physics.ts';
import type { Chips } from './chips.ts';

// The eyes that draw them (CSS px): above every card (uniforms.ts), its lean for the box (box.ts BOX3D.a), above the
// chips (chip-render.ts LOOK.cam); the paper's sample spacing.
const EYE = 1800, A = 0.4, CHIP_EYE = 1200, GRID = 16;
type Eye = { x0: number; a: number; w: number }; // its page's left edge on the desk; its lean; its perspective eased in (-1: a chip's)

export function showColliders(chips: Chips) {
  const desk = currentDesk(), cv = document.createElement('canvas'), g = cv.getContext('2d')!;
  cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
  document.body.append(cv);
  const io = new Float64Array(7), C = new Float64Array(3), R = new Float64Array(9);
  const eyes = new Map<Body, Eye>();
  // A world point to the screen, as the eye that draws the body about C sees it.
  const view = ({ x0, a, w }: Eye, x: number, y: number, z: number): [number, number] => {
    const rx = x - C[0], ry = y - C[1], rz = z - C[2];
    if (w < 0) { const q = CHIP_EYE / Math.max(CHIP_EYE - z, CHIP_EYE / 4); return [C[0] - x0 + q * rx, C[1] + q * ry]; }
    const F = EYE - C[2], q = F / (F - w * rz);
    return [C[0] - x0 + q * (rx + a * rz), C[1] + q * (ry - a * rz)];
  };
  const frame = () => {
    requestAnimationFrame(frame);
    const dpr = devicePixelRatio, P = desk.phys;
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    if (!P) return;
    const { world, curl, L } = P;
    if (L) { // the paper, from above
      const x0 = L.region * desk.view.w;
      for (let y = GRID / 2; y < desk.view.h; y += GRID) for (let x = GRID / 2; x < desk.view.w; x += GRID) {
        io[0] = x0 + x; io[1] = y; curl.at(io);
        if (io[0] < 0.5) continue;
        g.fillStyle = `rgba(0,90,255,${Math.min(0.7, 0.15 + io[0] / 150)})`; g.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    const W = desk.view.phone ? 0 : desk.view.w, rest = { x0: desk.cam.x, a: 0, w: 1 };
    eyes.clear();
    for (const s of desk.sources) if (s.launch) eyes.set(s.launch.body, s.more ? { x0: s.region * W, a: A, w: s.launch.P.w } : { x0: s.region * W, a: 0, w: 1 });
    for (const c of chips.bodies) eyes.set(c.p, { x0: c.chip.region * W, a: 0, w: -1 });
    for (const b of world.bodies) {
      world.pose(b, C, R);
      const e = eyes.get(b) ?? rest, pts: [number, number][] = [];
      for (let i = 0; i < b.n; i++) {
        const lx = b.points[i * 3], ly = b.points[i * 3 + 1], lz = b.points[i * 3 + 2];
        pts.push(view(e, C[0] + R[0] * lx + R[1] * ly + R[2] * lz, C[1] + R[3] * lx + R[4] * ly + R[5] * lz, C[2] + R[6] * lx + R[7] * ly + R[8] * lz));
      }
      const h = desk.hull(pts.slice());
      g.strokeStyle = b.sleep ? 'rgba(120,120,120,0.8)' : 'rgba(0,160,60,0.9)'; g.lineWidth = 1.5;
      g.beginPath(); h.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      g.fillStyle = g.strokeStyle;
      for (const [x, y] of pts) g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.strokeStyle = g.fillStyle = 'rgba(230,0,40,0.95)'; g.lineWidth = 2;
    world.eachContact((b, p, n) => {
      C.set(b.px);
      const e = eyes.get(b) ?? rest, [x, y] = view(e, p[0], p[1], p[2]), [nx, ny] = view(e, p[0] + 14 * n[0], p[1] + 14 * n[1], p[2] + 14 * n[2]);
      g.fillRect(x - 2.5, y - 2.5, 5, 5); g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
    });
  };
  requestAnimationFrame(frame);
}
