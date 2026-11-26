import { currentDesk } from './state.ts';
import { GROUPS, STYLE_PARAMS } from './tunables.ts';


export function mountProbe() {
const desk = currentDesk();
const { sources, placeDom, setHover, chain, writeUniforms, CARD0, CARD_VEC4, U, VU_OFF, cam, encodeRender, play,
  design, backLayout, Q, activeAgents, drawBack, drawCard, turn, door, STYLE, bootLog, bench, drawFrom, flights,
  stats, clock, T, dropChip, chips } = desk;
// Debug probe for crossfades (used by the verification script): during a live crossfade on card key, renders the frame
// offscreen, reads back the media area, and checks every pixel against both source frames drawn in the same task.
// A pixel passes if each channel lies within the two frames' range over its 2x2 neighborhood, give or take paper grain.
async function probeFade(key: string, maxFrames = 20) {
  const s = sources.find((x) => x.key === key)!; // the verification script names a card that exists
  desk.probeKey = key;
  s.rot = 0; s.sway = 0; placeDom(s);
  setHover(s, true);
  const bgra = desk.gpu!.format.startsWith('bgra');
  const raf = () => new Promise(requestAnimationFrame);
  const t0 = performance.now();
  while (!(desk.videoSrc === s && desk.videoMix > 0.99 && s.player!.fading && s.player!.fade > 0.02)) { await raf(); if (performance.now() - t0 > 20000) return { error: 'no crossfade' }; }
  const target = desk.gpu!.device.createTexture({ size: [desk.shared!.CW, desk.shared!.CH], format: desk.gpu!.format, usage: 0x10 | 0x01 });
  const frames: { fade: number; badFrac: number; worst: number; dump?: Record<string, unknown> }[] = [];
  // Freeze both clips mid-crossfade and step the fade by hand, so the rendered frame and the reference frames match.
  const pl = s.player!, A = pl.a, B = pl.b;
  desk.probing = true;
  await Promise.all([chain(A, () => A.pause()), chain(B, () => B.pause())]);
  await new Promise((r) => setTimeout(r, 200));
  for (let f = 0; f <= maxFrames; f++) {
    await raf();
    pl.fading = true; pl.fade = f / maxFrames;
    writeUniforms(desk.gpu!);
    const o = (CARD0 + s.id * CARD_VEC4) * 4, inv = [U[o], U[o + 1], U[o + 2], U[o + 4], U[o + 5], U[o + 6], U[o + 8], U[o + 9], U[o + 10]];
    const half = [U[o + 12], U[o + 13]], media = U.slice(o + 28, o + 32), vu = U.slice(VU_OFF, VU_OFF + 4), fade = U[34], q = U[27];
    // Media rect on screen (device px), shrunk so card edges and bilinear borders stay out of it.
    const dev = desk.shared!.dev, mx0 = Math.ceil((s.x - cam.x - s.w / 2 + s.media!.x + 6) * dev), my0 = Math.ceil((s.y - s.h / 2 + s.media!.y + 6) * dev);
    const mw = Math.floor((s.media!.w - 12) * dev), mh = Math.floor((s.media!.h - 12) * dev), bpr = Math.ceil((mw * 4) / 256) * 256;
    const buf = desk.gpu!.device.createBuffer({ size: bpr * mh, usage: 0x01 | 0x08 });
    const enc = desk.gpu!.device.createCommandEncoder();
    encodeRender(enc, target.createView());
    enc.copyTextureToBuffer({ texture: target, origin: [mx0, my0] }, { buffer: buf, bytesPerRow: bpr }, [mw, mh]);
    desk.gpu!.device.queue.submit([enc.finish()]);
    const grab = (v: HTMLVideoElement) => { const c = new OffscreenCanvas(v.videoWidth, v.videoHeight), x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(v, 0, 0); return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; };
    const ga = grab(A), gb = B.readyState >= 2 && fade > 0 ? grab(B) : ga;
    await buf.mapAsync(1);
    const out = new Uint8Array(buf.getMappedRange());
    let bad = 0, worst = 0, n = 0;
    const exp = new Uint8ClampedArray(mw * mh * 4), badMap = new Uint8ClampedArray(mw * mh * 4);
    for (let y = 0; y < mh; y += 2) for (let x = 0; x < mw; x += 2) {
      const px = (mx0 + x + 0.5 + (cam.x - desk.sim!.origin) * dev) * q, py = (my0 + y + 0.5) * q;
      const hz = inv[6] * px + inv[7] * py + inv[8], lx = (inv[0] * px + inv[1] * py + inv[2]) / hz, ly = (inv[3] * px + inv[4] * py + inv[5]) / hz;
      const ux = lx / (2 * half[0]) + 0.5, uy = ly / (2 * half[1]) + 0.5;
      const vx = vu[0] + ((ux - media[0]) / (media[2] - media[0])) * vu[2], vy = vu[1] + ((uy - media[1]) / (media[3] - media[1])) * vu[3];
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const g of fade > 0 ? [ga, gb] : [ga]) {
          const sx = Math.min(g.w - 2, Math.max(0, Math.floor(vx * g.w - 0.5))), sy = Math.min(g.h - 2, Math.max(0, Math.floor(vy * g.h - 0.5)));
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = g.d[((sy + dy) * g.w + sx + dx) * 4 + ch]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
        const v = out[y * bpr + x * 4 + (bgra ? 2 - ch : ch)];
        const err = Math.max(lo * 0.97 - 3 - v, v - (hi * 1.03 + 3), 0);
        exp[(y * mw + x) * 4 + ch] = (lo + hi) / 2; exp[(y * mw + x) * 4 + 3] = 255;
        badMap[(y * mw + x) * 4 + ch] = Math.min(255, err * 4); badMap[(y * mw + x) * 4 + 3] = 255;
        if (err > 0) bad++;
        worst = Math.max(worst, err); n++;
      }
    }
    let dump: Record<string, unknown> | undefined;
    if (bad / n > 0.03 && !frames.some((fr) => fr.dump)) { // keep one failing frame for inspection
      const toUrl = async (arr: Uint8ClampedArray<ArrayBuffer>) => { const c2 = new OffscreenCanvas(mw, mh); c2.getContext('2d')!.putImageData(new ImageData(arr, mw, mh), 0, 0); const b = await c2.convertToBlob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); };
      const expUrl = await toUrl(exp), badUrl = await toUrl(badMap);
      const oc = new OffscreenCanvas(mw, mh), ox = oc.getContext('2d')!, id = ox.createImageData(mw, mh);
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) for (let ch = 0; ch < 4; ch++) id.data[(y * mw + x) * 4 + ch] = ch === 3 ? 255 : out[y * bpr + x * 4 + (bgra ? 2 - ch : ch)];
      ox.putImageData(id, 0, 0);
      const url = async (c: OffscreenCanvas) => { const b = await c.convertToBlob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); };
      const vc = (v: HTMLVideoElement) => { const c = new OffscreenCanvas(v.videoWidth, v.videoHeight); c.getContext('2d')!.drawImage(v, 0, 0); return c; };
      dump = { exp: expUrl, bad: badUrl, out: await url(oc), a: await url(vc(A)), b: await url(vc(B)), aSrc: A.currentSrc, bSrc: B.currentSrc, aT: A.currentTime, bT: B.currentTime, vu: [...vu] };
    }
    buf.unmap(); buf.destroy();
    frames.push({ fade: +fade.toFixed(3), badFrac: +(bad / n).toFixed(4), worst: Math.round(worst), dump });
  }
  desk.probing = false; play(A); play(B);
  target.destroy();
  desk.probeKey = null;
  setHover(s, false);
  return frames;
}
window.__j = { backsFit: () => sources.filter((x) => x.backEl).map((x) => { const d = design(x), n = backLayout(d).need; return [x.key, Math.round(d.h), Math.ceil(n), n <= d.h + 0.5]; }), Q, activeAgents: () => desk.sim && activeAgents(desk.sim), GROUPS, STYLE_PARAMS, probeFade, drawBack, drawCard, backLayout, view: () => desk.view, sim: () => desk.sim && { page: desk.sim.page, W: desk.sim.W, H: desk.sim.H, n: desk.sim.n, t: desk.sim.t, CW: desk.shared!.CW, dev: desk.shared!.dev, dpr: desk.sim.dpr }, turn: () => ({ ...turn }), door: () => door, sims: () => desk.sims.map((x) => ({ page: x.page, t: +x.t.toFixed(2), parity: x.parity, warm: x.warm })), STYLE, cam: () => cam, U: () => U, media: () => ({ src: desk.videoSrc?.key, mix: desk.videoMix, playing: desk.videoSrc?.player!.playing(), fade: desk.videoSrc?.player!.fade, i: desk.videoSrc?.player!.i, state: desk.videoSrc?.player!.state, t: desk.videoSrc && +desk.videoSrc.player!.a.currentTime.toFixed(2), clip: desk.videoSrc?.player!.a.currentSrc.split('/').pop() }), bootLog, bench: (n: number) => bench(n), drawFrom, flights, throws: () => sources.filter((s) => s.launch).map(({ key, region, launch: B, body }) => ({ key, region, t: desk.phys!.L?.t, C: B!.P.C.map(Math.round), end: desk.phys!.L?.end, out: !!B!.out, asleep: body!.sleep })), stats: () => ({ ...stats, t: clock.t, dpr: desk.view.dpr, n: desk.sim?.n, W: desk.sim?.W, H: desk.sim?.H }), sources, T,
  chips: { drop: dropChip, world: chips, stats: () => ({ n: chips.bodies.length, awake: chips.bodies.filter((b) => !b.sleep && !b.frozen).length, bodies: chips.bodies.map((b) => ({ id: b.id, x: +b.x[0].toFixed(1), y: +b.x[1].toFixed(1), z: +b.x[2].toFixed(2), sleep: b.sleep, m: +(b.m / b.mass0).toFixed(3), feed: b.feed ? +(b.feed.v.reduce((a, v) => a + v, 0) / b.feed.v.length).toFixed(3) : null })) }) } };
return {};
}
