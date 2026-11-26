import { mediaUrl } from 'virtual:desk-media';
import { currentDesk } from './state.ts';
import { STEP, PAGE_NAMES, MOTION } from './tunables.ts';
import type { Sim, Gpu } from './gpu.ts';
import { createChips, NCH } from './chips.ts';


export function mountFrame() {
const desk = currentDesk();
const { T, throwWorld, outside, U, CHIP_OFF, CHIP_VEC4, turn, sources, shown, clock, reduced, drawStill, addEventListener,
  flights, deskX, deskY, cornerBox, deckRect, Q, renderEntries, noteMesh, NOTE_U, qs, simRes, writeUniforms,
  createSim, WARM_STEPS, trans, stepDecks, stepFlights, syncInert, syncHover, stepCards, stepTurn, stepThrows,
  stepDoor, stepMedia, cursor, clipLinks, stepWarm, placeDom, body, hud, layout, createShared, buildAtlas,
  regionFromUrl, clipLists, regionLabel, initGpu, door, restD, arriveDeck, INTRO_DELAY, drawFrom, pileUp,
  playlistFor, idle, preloadClips, DRAW, prewarm } = desk;
// ---------- chips ----------
// Potato chips (chips.ts, drawn by chip-render.ts): click the bare desk to drop one. They live on the page you see, in the
// same sim as the card box (physics.ts): a page turn throws them with it. A chip is gone once it is wholly off the screen
// or eaten, never sooner.
const chips = createChips(T, () => throwWorld().world);
const TASTE = 1.5, FOOD = 1, FOOD_R = 2; // the slime under a chip counts x toward eating it; its pull on the slime, reaching x its radius
const LIVE = 8, HURRY = 6; // the most chips at once; over that, the oldest is eaten x faster
const chipRegion = () => chips.bodies[0]?.chip.region ?? desk.page;
const chipX0 = () => (desk.view.phone ? 0 : chipRegion() * desk.view.w);
let chipFeedAt = 0;
const chipWait: [number, number, number][] = []; // chipWait: drops waiting for a slot
// Each chip's food, for the agents and the excitation field (sim px), and where its drawn layer sits on the canvas.
function chipUniforms(s: Sim) {
  U.fill(0, CHIP_OFF, CHIP_OFF + CHIP_VEC4 * 4);
  if (s !== desk.sim || desk.capturing || !chips.bodies.length) return; // never in the frozen frame a turn starts from
  const own = chipRegion() === desk.page, bs = own ? chips.bodies.slice(0, NCH) : [];
  const tiles = desk.gpu!.chipR.place(chips, { x0: chipX0(), dev: desk.shared!.dev, T });
  U.set([bs.length, 1, tiles.length, own ? 0 : 1], CHIP_OFF);
  tiles.forEach((t, i) => U.set(t, CHIP_OFF + (1 + NCH * 2 + i) * 4));
  bs.forEach((b, i) => {
    U.set([(b.x[0] - s.origin) * s.dpr, b.x[1] * s.dpr, b.foot * FOOD_R * s.dpr, b.landed ? FOOD : 0], CHIP_OFF + 4 + i * 4);
    if (b.land) U.set([(b.land[0] - s.origin) * s.dpr, b.land[1] * s.dpr, b.land[2] * s.dpr, b.land[3]], CHIP_OFF + 4 + (NCH + i) * 4);
  });
}
// The sim advances in stepThrows, on the same clock as everything a turn threw. Chips wholly off the screen are gone; any
// a finished turn left on it carry on on the new page, where they are on the screen.
function stepChips(dt: number) {
  while (chipWait.length && chips.bodies.length < NCH) { const [x, y, p] = chipWait.shift()!; if (p === desk.page) dropChip(x, y); }
  if (!chips.bodies.length) return;
  if (chipRegion() !== desk.page && !turn.on) {
    const dx = desk.view.phone ? 0 : (desk.page - chipRegion()) * desk.view.w;
    for (const b of chips.bodies) { b.p.x[0] += dx; b.p.px[0] += dx; b.chip.region = desk.page; }
  }
  const x0 = chipX0(), own = chipRegion() === desk.page;
  if (own) chips.push(sources.filter((c) => (desk.view.phone || c.region === desk.page) && !c.gone && !c.deck && !c.carrier && !c.launch && c.w).map((c) => {
    const [x, y, r] = shown(c), th = (r * Math.PI) / 180;
    return { x, y, hw: c.w / 2, hh: c.h / 2, c: Math.cos(th), s: Math.sin(th), vx: c.vx, vy: c.vy };
  }));
  for (const b of chips.bodies.filter((b) => outside(b.x[0] - x0 - b.p.bound, b.x[1] - b.p.bound, b.x[0] - x0 + b.p.bound, b.x[1] + b.p.bound))) chips.remove(b);
  chips.step(dt, own);
  if (chips.bodies.some((b) => !b.sleep || b.dirty)) desk.redraw = true;
  if (own && clock.t > chipFeedAt) { chipFeedAt = clock.t + 0.3; desk.gpu!.chipR.feed(chips, desk.sim!.trail[desk.sim!.parity], { x0: desk.sim!.origin, dpr: desk.sim!.dpr, gain: TASTE }); }
}
// Over the cap the oldest chip is eaten faster; with every slot taken the oldest crumbles away, and the new one drops as
// soon as its slot is free (with reduced motion, at once).
function dropChip(x: number, y: number) {
  const live = [...new Set(chips.bodies.map((b) => b.chip))].sort((a, b) => a.born - b.born), calm = live.filter((c) => c.hurry === 1);
  if (calm.length >= LIVE) calm[0].hurry = HURRY;
  if (chips.bodies.length >= NCH) {
    const c = live.find((c) => !c.crumbles), its = chips.bodies.filter((b) => b.chip === c);
    if (reduced) its.forEach((b) => chips.remove(b)); // no motion: it is just gone
    else { if (c) c.crumbles = true; for (const b of its) b.crumb.fill(1); chipWait.push([x, y, desk.page]); return null; }
  }
  const b = chips.drop(x, y, T.chipSize * desk.view.k, (Math.random() * 2 ** 31) >>> 0, { region: desk.page, born: clock.t, still: reduced });
  desk.redraw = true;
  if (reduced) drawStill(); // no frame loop: it is drawn where it came to rest
  return b;
}
addEventListener('click', (e) => {
  if (!desk.gpu || !desk.sim || turn.on || flights.on || e.button !== 0) return;
  if ((e.target as Partial<Element>).closest?.('.src, .door, a, button, input, select, label, textarea, .tweak, .links')) return;
  const x = deskX(e), y = deskY(e), x0 = chipX0();
  for (const r of [!desk.view.phone && cornerBox(x0), deckRect(desk.page)]) if (r && x >= r.l && x <= r.r && y >= r.t && y <= r.b) return;
  dropChip(x, y);
});
const activeAgents = (sm: Sim) => Math.max(2000, Math.round(sm.n * Q.shown)); // eased toward Q.level

// ---------- frame ----------

// A step is the E pass, the agents, then the diffuse.
function encodeStep(enc: GPUCommandEncoder, only = 'ead', ts: Gpu['ts'] = null, sm: Sim = desk.sim!, count = activeAgents(sm)) {
  const s = sm, p = s.parity;
  const pass = enc.beginComputePass(ts ? { timestampWrites: { querySet: desk.gpu!.ts!.set, beginningOfPassWriteIndex: 0 } } : undefined);
  if (only.includes('e')) { pass.setPipeline(desk.gpu!.ePipe); pass.setBindGroup(0, s.eBG[p]); pass.dispatchWorkgroups(Math.ceil(s.EW / 8), Math.ceil(s.EH / 8)); }
  if (only.includes('a')) { pass.setPipeline(desk.gpu!.agentPipe); pass.setBindGroup(0, s.agentBG[p]); pass.dispatchWorkgroups(Math.ceil(count / 64)); }
  if (only.includes('d')) { pass.setPipeline(desk.gpu!.diffusePipe); pass.setBindGroup(0, s.diffuseBG[p]); pass.dispatchWorkgroups(Math.ceil(s.W / 16), Math.ceil(s.H / 16)); }
  pass.end();
  if (only.includes('d')) { s.parity = 1 - p; s.t += STEP; }
}
function encodeRender(enc: GPUCommandEncoder, target: GPUTextureView, ts: Gpu['ts'] = null, s: Sim = desk.sim!) {
  if (s === desk.sim && chips.bodies.length) desk.gpu!.chipR.encode(enc);
  let pipe = desk.gpu!.renderPipe, bg = desk.gpu!.device.createBindGroup({ layout: desk.gpu!.renderPipe.getBindGroupLayout(0), entries: renderEntries(desk.gpu!, s) });
  if (desk.videoSrc && desk.videoMix > 0) {
    try {
      const pl = desk.videoSrc.player!;
      const ext = desk.gpu!.device.importExternalTexture({ source: pl.a });
      // The incoming clip only once it has a frame; until then both slots show the current one.
      const extB = pl.fading && pl.b.readyState >= 2 ? desk.gpu!.device.importExternalTexture({ source: pl.b }) : ext;
      pipe = desk.gpu!.videoPipe;
      bg = desk.gpu!.device.createBindGroup({ layout: desk.gpu!.videoPipe.getBindGroupLayout(0), entries: renderEntries(desk.gpu!, s, [{ binding: 7, resource: ext }, { binding: 8, resource: extB }]) });
    } catch { /* frame not ready yet: draw the poster */ }
  }
  if (sources.some(noteMesh)) desk.gpu!.note.encode(enc, NOTE_U);
  const tp = enc.beginComputePass();
  tp.setPipeline(desk.gpu!.tilePipe); tp.setBindGroup(0, desk.shared!.tileBG); tp.dispatchWorkgroups(Math.ceil(desk.shared!.nTiles / 64)); tp.end();
  const pass = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    ...(ts ? { timestampWrites: { querySet: desk.gpu!.ts!.set, endOfPassWriteIndex: 1 } } : {}) });
  pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
  if (ts) { enc.resolveQuerySet(desk.gpu!.ts!.set, 0, 2, desk.gpu!.ts!.resolve, 0); enc.copyBufferToBuffer(desk.gpu!.ts!.resolve, 0, desk.gpu!.ts!.read, 0, 16); }
}

// Runtime check: measure each frame's GPU work (timestamps, else the frame interval) in the first seconds and for a
// second now and then. Over budget: drop 30% of the agents (then sim resolution) and cool down; well under budget for
// a while: step back up toward the tier cap. The gap between the two thresholds keeps it from oscillating.
const BUDGET_MS = 12, CALM_MS = 5;
function qualityCheck(dt: number) {
  // A quality step eases the running agent count over about a second, and each agent's ink rises with it, so the
  // veins keep their weight through the change instead of dimming and recovering.
  Q.shown += (Q.level - Q.shown) * Math.min(1, dt * 3);
  Q.depMul = Math.max(1, desk.sim!.ref / activeAgents(desk.sim!));
  if (turn.on) return; // a page turn holds the frozen frame a resolution change would need
  const t = clock.t;
  Q.vsync = Math.max(4, Math.min(...stats.intervals.filter((x) => x > 4), 16.7)); // the display's frame period
  if (t > Q.nextCheck && t > Q.checkUntil) { Q.checkUntil = t + 1.5; Q.nextCheck = t + 15; }
  if (t > Q.checkUntil || Q.samples.length < 20) return;
  const sorted = [...Q.samples].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
  Q.samples.length = 0;
  Q.gpuMs = med;
  if (t < Q.cool) return;
  const over = desk.gpu!.ts ? med > BUDGET_MS : med > 1.3 * Q.vsync;
  const calm = desk.gpu!.ts ? med < CALM_MS : med < 1.05 * Q.vsync;
  if (over) {
    Q.calm = 0; Q.cool = t + 2; Q.checkUntil = t + 2; // keep watching after a change
    if (Q.level > 0.36) Q.level = Math.max(0.35, Q.level * 0.7);
    else if (Q.resScale > 0.61) { Q.resScale *= 0.8; resizeSims(); }
    if (qs.has('mlog')) console.log('[quality] down: level', Q.level.toFixed(2), 'res', simRes().toFixed(2), 'median', med.toFixed(1));
  } else if (calm && Q.level < 1 && ++Q.calm >= 3) {
    Q.calm = 0; Q.cool = t + 4; Q.level = Math.min(1, Q.level / 0.7);
    if (qs.has('mlog')) console.log('[quality] up: level', Q.level.toFixed(2));
  }
}
// A lower sim resolution needs new sims: freeze the current frame and crossfade from it while the new sim warms up.
function resizeSims() {
  writeUniforms(desk.gpu!);
  const enc = desk.gpu!.device.createCommandEncoder();
  encodeRender(enc, desk.shared!.frozenTex[1 - desk.shared!.fz].createView());
  desk.gpu!.device.queue.submit([enc.finish()]);
  desk.shared!.fz = 1 - desk.shared!.fz; desk.redraw = true;
  desk.sims.forEach(destroySim);
  desk.sims = (desk.view.phone ? [0] : [0, 1]).map((pg) => Object.assign(createSim(desk.gpu!, pg), { t: 4.5, warm: WARM_STEPS, warmN: pg === desk.page ? 25 : 1 }));
  desk.sim = desk.sims[desk.page];
  trans.fade = 1;
}

let last = 0, acc = 0; desk.running = true;
const stats: { intervals: number[]; throwMs?: number } = { intervals: [] };
// The uniforms the last drawn frame showed; redraw: a texture it reads has changed since.
const drawnU = new Float32Array(U.length);
desk.redraw = true;
// The cursor's stir (G.e.xyz) only moves the sim, which redraws when it steps.
const sameU = () => { const a = drawnU; for (let i = 0; i < U.length; i++) if (U[i] !== a[i] && (i < 16 || i > 18)) return false; return true; };
function frame(now: number) {
  if (!desk.running || desk.dead) return;
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
  if (last) { stats.intervals.push(now - last); if (stats.intervals.length > 240) stats.intervals.shift(); }
  last = now;
  stepDecks(dt); // first: cards waiting on a deck follow it this frame
  stepFlights(dt);
  syncInert();
  syncHover();
  stepCards(dt);
  stepTurn(dt);
  stepThrows(dt); // after the turn: the paper under a thrown box is where the turn just put it
  stepDoor(dt);
  stepMedia(dt);
  stepChips(dt);
  cursor.amt *= Math.exp(-dt * 2);
  acc += dt;
  let steps = 0;
  if (window.__j?.freeze) acc = 0; // test hook: hold the sim still while the render keeps drawing
  const measure = clock.t <= Q.checkUntil;
  const ts = measure && desk.gpu!.ts && !desk.gpu!.ts.busy ? desk.gpu!.ts : null;
  if (measure && !desk.gpu!.ts && last) Q.samples.push(dt * 1000); // no GPU timestamps: judge by the frame interval
  while (acc >= STEP && steps < 2) {
    acc -= STEP; steps++;
    clock.t += STEP; clock.frame++;
    writeUniforms(desk.gpu!);
    const enc = desk.gpu!.device.createCommandEncoder();
    encodeStep(enc, 'ead', steps === 1 ? ts : null);
    desk.gpu!.device.queue.submit([enc.finish()]);
    for (const s of sources) {
      if (s.landK && qs.has('mlog')) console.log('[land]', s.key, 'strength', s.landS.toFixed(2));
      s.landK = false; // a landing bursts the agents on exactly one step
    }
    for (const b of chips.bodies) { if (b.land && qs.has('mlog')) console.log('[land]', 'chip' + b.id, 'strength', b.land[3].toFixed(2)); b.land = null; }
  }
  if (steps === 2) acc = Math.min(acc, STEP);
  if (desk.sim!.warm > 0) { // new sims after a resolution change: catch up a burst of steps, spread over the crossfade's frames
    const n = Math.min(desk.sim!.warm, desk.sim!.warmN || 1); // a resolution change catches up fast under its crossfade; a page warming before it showed keeps going one step a frame
    desk.sim!.warm -= n;
    writeUniforms(desk.gpu!);
    const enc = desk.gpu!.device.createCommandEncoder();
    for (let k = 0; k < n; k++) encodeStep(enc);
    desk.gpu!.device.queue.submit([enc.finish()]);
  }
  if (trans.fade > 0) trans.fade = Math.max(0, trans.fade - dt / 0.8); // crossfade from the frame before a resolution change
  if (!steps) writeUniforms(desk.gpu!);
  clipLinks(); // where the turn and a thrown box were just drawn
  // Draw only when the picture can change: the sim stepped (60 times a second, which also shows every video frame), something
  // drawn moved (the uniforms differ), or a texture it reads changed. On a display faster than the sim (120 Hz) the frames
  // between steps are otherwise the same picture, and drawing them doubled the GPU's work.
  const timed = ts && steps ? ts : null;
  if (steps || desk.redraw || trans.fade > 0 || !sameU()) {
    const enc = desk.gpu!.device.createCommandEncoder();
    encodeRender(enc, desk.gpu!.ctx.getCurrentTexture().createView(), timed);
    desk.gpu!.device.queue.submit([enc.finish()]);
    drawnU.set(U); desk.redraw = false;
  }
  if (timed) {
    timed.busy = true;
    timed.read.mapAsync(1).then(() => {
      const [t0, t1] = new BigInt64Array(timed.read.getMappedRange());
      if (t1 > t0) Q.samples.push(Number(t1 - t0) / 1e6);
      timed.read.unmap(); timed.busy = false;
    }).catch(() => { timed.busy = false; });
  }
  if (steps) stepWarm(); // at the sim's pace, whatever the display's
  qualityCheck(dt);
  for (const s of sources) if (s.dragging || s.shove || s.kb || s.lift > 0.001 || s.squash || s.snap || s.flip % 1 || Math.abs(s.vx) + Math.abs(s.vy) > 0.5 || Math.abs(s.sway) > 1e-4) placeDom(s);
  if (clock.t > 4) body.classList.add('settled');
  if (hud && clock.frame % 15 === 0) {
    const iv = [...stats.intervals].sort((a, b) => a - b);
    hud.textContent = `${desk.sim!.W}x${desk.sim!.H}  ${(desk.sim!.n / 1e6).toFixed(2)}M agents\nframe ${iv[iv.length >> 1]?.toFixed(1)} ms (p95 ${iv[Math.floor(iv.length * 0.95)]?.toFixed(1)})`;
  }
}

// GPU time per frame: n frames (one sim step + full render each) submitted back to back, then averaged.
async function bench(n = 120) {
  const target = desk.gpu!.device.createTexture({ size: [desk.shared!.CW, desk.shared!.CH], format: desk.gpu!.format, usage: 0x10 });
  const run = async (kind: string) => {
    await desk.gpu!.device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      writeUniforms(desk.gpu!);
      const enc = desk.gpu!.device.createCommandEncoder();
      if (kind !== 'render') encodeStep(enc, kind.length <= 3 && kind !== 'both' ? kind : 'ead');
      if (kind === 'render' || kind === 'both') encodeRender(enc, target.createView());
      desk.gpu!.device.queue.submit([enc.finish()]);
    }
    await desk.gpu!.device.queue.onSubmittedWorkDone();
    return +((performance.now() - t0) / n).toFixed(2);
  };
  desk.running = false;
  const out = { page: PAGE_NAMES[desk.sim!.page], canvas: `${desk.shared!.CW}x${desk.shared!.CH}`, sim: `${desk.sim!.W}x${desk.sim!.H}`, agents: desk.sim!.n, eMs: await run('e'), agentsMs: await run('a'), diffuseMs: await run('d'), stepMs: await run('step'), renderMs: await run('render'), frameMs: await run('both') };
  desk.running = true; last = 0; requestAnimationFrame(frame);
  target.destroy();
  return out;
}

desk.shared = null; desk.sims = [];
const destroySim = (sm: Sim) => { for (const t of [...sm.trail, ...sm.etex, sm.mask]) t.destroy(); sm.dep.destroy(); sm.agents.destroy(); };
async function rebuild(first: boolean) {
  layout();
  if (!desk.gpu) return;
  chips.clear();
  desk.sims.forEach(destroySim);
  if (desk.shared) for (const t of [desk.shared.paper, ...desk.shared.frozenTex, desk.shared.atlas, desk.shared.tiles]) t?.destroy();
  desk.shared = createShared(desk.gpu);
  await buildAtlas(desk.gpu);
  desk.redraw = true;
  // Phones scroll one long page; desktops get a main page and a research page, each with its own sim.
  desk.sims = (desk.view.phone ? [0] : [0, 1]).map((pg) => createSim(desk.gpu!, pg));
  desk.page = desk.view.phone ? 0 : regionFromUrl();
  desk.sim = desk.sims[desk.page];
  // Bake the paper grain once (it never changes), so the per-frame pass reads it instead of computing noise.
  writeUniforms(desk.gpu!);
  const ge = desk.gpu.device.createCommandEncoder(), gp = ge.beginRenderPass({ colorAttachments: [{ view: desk.shared.paper.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  gp.setPipeline(desk.gpu.grainPipe);
  gp.setBindGroup(0, desk.gpu.device.createBindGroup({ layout: desk.gpu.grainPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: desk.gpu.uniform } }] }));
  gp.draw(3); gp.end(); desk.gpu.device.queue.submit([ge.finish()]);
  // The page you land on forms in front of you (or grows out of its cards, with the fly-in); a page you go to later
  // grows out of its cards as they fly in.
  if (!first || reduced) { clock.t = 4.5; desk.sim.t = 4.5; }
  for (const sm of desk.sims) if (sm !== desk.sim) sm.warm = WARM_STEPS;
}
const introOn = () => qs.get('intro') !== '0' && !reduced; // ?intro=0 skips the deal

// Rebuild the sim (new agent count or viewport) without reloading the page.
async function reseed() {
  if (desk.dead) return;
  desk.running = false;
  await desk.gpu!.device.queue.onSubmittedWorkDone();
  await rebuild(false);
  desk.running = true; last = 0; requestAnimationFrame(frame);
}

async function warm(steps: number) {
  for (let i = 0; i < steps; i++) {
    clock.t += STEP; clock.frame++;
    writeUniforms(desk.gpu!);
    const enc = desk.gpu!.device.createCommandEncoder();
    encodeStep(enc);
    desk.gpu!.device.queue.submit([enc.finish()]);
    if (i % 20 === 19) await desk.gpu!.device.queue.onSubmittedWorkDone();
  }
}

async function main() {
  const t0 = performance.now(), mark = (k: string) => (bootLog[k] = Math.round(performance.now() - t0));
  // A card rests on its cover when it has one (an image not from its clips, kept like an explicit still: hover fades from
  // it into the clip and back), else on its poster (the frame its first clip starts from); an explicit still wins.
  for (const s of sources) {
    const e = clipLists[s.key];
    if (e?.cover && !s.still) { s.img!.src = mediaUrl('/desk-media/' + e.cover); s.still = 'cover'; }
    else if (!s.still && e?.poster) s.img!.src = mediaUrl('/desk-media/' + e.poster);
  }
  layout(); // the startup still uses the final layout right away
  const fontsReady = Promise.all([document.fonts.load('800 60px Inter'), document.fonts.load('500 23px Caveat'), document.fonts.load('600 13px Inter'), document.fonts.load('400 13px Inter')]);
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3000))]);
  mark('fonts');
  layout(); // card sizes measured with the real fonts
  if (desk.view.phone && regionFromUrl()) scrollTo(0, regionLabel.getBoundingClientRect().top + scrollY - 24); // phones scroll to research
  await Promise.all(sources.map((s) => s.img?.decode().catch(() => {})));
  mark('images');
  // The desk fades in once, from bare paper: straight to the live field when WebGPU is quick, else the DOM still first.
  body.classList.toggle('intro', introOn()); // with the fly-in, the startup still is bare paper: the cards arrive with it
  const showStill = setTimeout(() => body.classList.add('ready'), 250);
  desk.gpu = await initGpu();
  if (desk.dead) { desk.gpu?.device.destroy(); return; }
  mark('pipelines');
  if (!desk.gpu) { clearTimeout(showStill); body.classList.remove('intro'); body.classList.add('nogpu', 'ready'); desk.dealing = false; Object.assign(door, { amt: 1, d: restD(false) }); layout(); return; }
  await rebuild(true);
  if (introOn()) { arriveDeck(desk.page, INTRO_DELAY - MOTION.settle); drawFrom(desk.page, { delay: INTRO_DELAY }); } // the first visit (or a deep link): the deck comes in, then deals
  pileUp(0); pileUp(1); // each deck holds its page's cards that are not on the desk
  desk.dest = desk.page;
  door.amt = introOn() ? -1 : 0; // the corner folds back just after the deal starts
  if (reduced) Object.assign(door, { amt: 1, d: restD(false) }); // no frame loop: drawn folded
  // Draw the field's first frame under the DOM still, then hand over, so startup never flashes.
  writeUniforms(desk.gpu!);
  const enc0 = desk.gpu.device.createCommandEncoder();
  encodeRender(enc0, desk.gpu.ctx.getCurrentTexture().createView());
  desk.gpu.device.queue.submit([enc0.finish()]);
  await desk.gpu.device.queue.onSubmittedWorkDone();
  await new Promise(requestAnimationFrame);
  if (desk.dead) return;
  clearTimeout(showStill);
  body.classList.add('gpu', 'ready');
  mark('sim');
  if (reduced) {
    // One settled still: start from a scattered desk, let the mesh form offscreen, then draw once and stop.
    await warm(Math.round(4 / STEP));
    const enc = desk.gpu.device.createCommandEncoder();
    writeUniforms(desk.gpu!);
    encodeRender(enc, desk.gpu.ctx.getCurrentTexture().createView());
    desk.gpu.device.queue.submit([enc.finish()]);
    body.classList.add('settled');
    return;
  }
  for (const s of sources) s.playlist = playlistFor(s); // players are made when idle (preloadClips) or on first hover
  setTimeout(() => idle(preloadClips), (introOn() ? INTRO_DELAY + DRAW.fan + DRAW.dur + 8 * T.drawStagger : 0.3) * 1000); // after the intro
  prewarm(1 - desk.page, 1); // the other page grows in the background from the start
  requestAnimationFrame(frame);
  if (qs.has('tune')) desk.tweakPanel();
  if (qs.has('colliders')) void import('./colliders.ts').then((m) => m.showColliders(chips)); // what the physics sees
  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (document.documentElement.clientWidth === desk.view.w && innerHeight === desk.view.h) return;
      await reseed();
    }, 200);
  });
}

const bootLog: Record<string, number> = {};
return { encodeStep, encodeRender, chipRegion, chips, stats, activeAgents, chipUniforms, reseed, bootLog, bench,
  dropChip, main };
}
