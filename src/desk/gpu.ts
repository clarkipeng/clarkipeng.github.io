import { currentDesk, type Desk } from './state.ts';
import { REF_W, REF_H } from './tunables.ts';
import { GRAIN_WGSL, E_WGSL, DIFFUSE_WGSL, TILE_WGSL, TILE } from './wgsl.ts';
import { createChipRenderer } from './chip-render.ts';
import { createNote } from './note.ts';

// ---------- GPU ----------

export type Gpu = NonNullable<Awaited<ReturnType<Desk['initGpu']>>>;
export type Shared = ReturnType<Desk['createShared']> & { label?: { hw: number; hh: number }; labelUV?: number[][]; atlas?: GPUTexture }; // the atlas parts come from buildAtlas
export type Sim = ReturnType<Desk['createSim']> & { ready?: boolean; pre?: boolean; rate?: number; warmN?: number };

// ---------- auto quality ----------
// Clark's settings are the reference look at the reference desk (1440x900 CSS px): the agent count scales with the
// screen so the density per pixel stays the same. A device tier from cheap signals caps it, and a runtime check steps
// it down (30% at a time, then the sim resolution) if a frame's GPU work runs over budget. Fewer agents deposit more
// each, so the veins keep their weight. Never above the reference density.
type Quality = { tier: { name: string; cap: number }; level: number; shown: number; resScale: number; depMul: number; gpuMs: number; samples: number[];
  cool: number; calm: number; nextCheck: number; checkUntil: number; vsync?: number };

export function mountGpu() {
const desk = currentDesk();
const { reduced, T, qs, canvas, renderWGSL, AGENT_WGSL, sources, nameEl, cam, taglineEl, linksEl, regionLabel } = desk;
desk.gpu = null; desk.sim = null; desk.tweakSync = null;
desk.dealing = !reduced; // decks deal cards (no deals with reduced motion or without WebGPU)
const Q: Quality = { tier: { name: 'high', cap: 1 }, level: 1, shown: 1, resScale: 1, depMul: 1, gpuMs: 0, samples: [], cool: 0, calm: 0, nextCheck: 0, checkUntil: 2.5 };
function deviceTier(adapter: GPUAdapter) {
  const cores = navigator.hardwareConcurrency || 4, mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4; // Chromium only, not in TS's DOM lib
  const phone = matchMedia('(pointer: coarse)').matches || desk.view.phone;
  if (adapter.info?.isFallbackAdapter || (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter) return { name: 'low', cap: 0.25 };
  if (phone || mem <= 4 || cores <= 4) return { name: 'low', cap: 0.35 };
  if (cores >= 8 && mem >= 8) return { name: 'high', cap: 1 };
  return { name: 'mid', cap: 0.6 };
}
const autoOn = () => !!T.auto;
const simRes = () => T.res * (autoOn() ? Q.resScale : 1);
// Agents for a page at the reference density, and how many of them run now.
const refAgents = (cssW: number, cssH: number) => Math.max(6000, Math.round((T.agents * cssW * cssH * (simRes() / 0.5) ** 2) / (REF_W * REF_H)));

const SB = { STORAGE: 0x80, COPY_DST: 0x08, UNIFORM: 0x40 };

async function initGpu() {
  if (qs.has('nogpu') || !navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const hasTs = adapter.features.has('timestamp-query');
    const device = await adapter.requestDevice({ requiredFeatures: hasTs ? ['timestamp-query'] : [], requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
    Q.tier = deviceTier(adapter);
    const ts = hasTs ? { set: device.createQuerySet({ type: 'timestamp', count: 2 }), resolve: device.createBuffer({ size: 16, usage: 0x0200 | 0x0004 }),
      read: device.createBuffer({ size: 16, usage: 0x0001 | 0x0008 }), busy: false } : null;
    const ctx = canvas.getContext('webgpu')!; // null throws at configure, into the catch
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque' });
    const mod = (code: string) => device.createShaderModule({ code });
    const comp = (code: string) => device.createComputePipelineAsync({ layout: 'auto', compute: { module: mod(code), entryPoint: 'main' } });
    const rend = (video: boolean) => { const m = mod(renderWGSL(video)); return device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format }] } }); };
    const grainMod = mod(GRAIN_WGSL);
    const grainPipe = device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: grainMod, entryPoint: 'vs' }, fragment: { module: grainMod, entryPoint: 'fs', targets: [{ format: 'rg8unorm' }] } });
    const [ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainP, tilePipe, chipR] = await Promise.all([comp(E_WGSL), comp(AGENT_WGSL), comp(DIFFUSE_WGSL), rend(false), rend(true), grainPipe, comp(TILE_WGSL), createChipRenderer(device)]);
    const uniform = device.createBuffer({ size: desk.U.byteLength, usage: SB.UNIFORM | SB.COPY_DST });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    device.lost.then((i) => { console.warn('WebGPU device lost', i.message); });
    return { note: createNote(device), device, ctx, format, ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainPipe: grainP, tilePipe, uniform, sampler, ts, chipR };
  } catch (err) {
    console.warn('WebGPU unavailable', err);
    return null;
  }
}

// Canvas-sized resources every page shares: the canvas itself, the baked paper grain, and the frozen frame that the
// outgoing page leaves behind during a page change.
function createShared(g: Gpu) {
  const { device } = g;
  const cap = desk.view.phone ? 6.5e6 : 9e6;
  let dev = Math.min(devicePixelRatio || 1, 2);
  const cssH = desk.view.phone ? desk.view.docH : desk.view.h;
  if (desk.view.w * cssH * dev * dev > cap) dev = Math.sqrt(cap / (desk.view.w * cssH));
  dev = Math.min(dev, device.limits.maxTextureDimension2D / Math.max(desk.view.w, cssH)); // a long phone page stays within the GPU's largest texture
  const CW = Math.round(desk.view.w * dev), CH = Math.round(cssH * dev);
  dev = CW / desk.view.w;
  desk.view.dpr = dev;
  canvas.width = CW; canvas.height = CH;
  canvas.style.height = cssH + 'px';
  const tex = (format: GPUTextureFormat, usage: number) => device.createTexture({ size: [CW, CH], format, usage });
  // Two frozen textures alternate, so the pass that captures the outgoing page never samples the one it writes.
  const TX = Math.ceil(CW / TILE), nTiles = TX * Math.ceil(CH / TILE);
  const tiles = device.createBuffer({ size: nTiles * 16, usage: SB.STORAGE });
  const tileBG = device.createBindGroup({ layout: g.tilePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: g.uniform } }, { binding: 1, resource: { buffer: tiles } }] });
  return { CW, CH, dev, cssH, paper: tex('rg8unorm', 0x04 | 0x10), frozenTex: [tex(g.format, 0x04 | 0x10), tex(g.format, 0x04 | 0x10)], fz: 0, TX, nTiles, tiles, tileBG };
}

// One page (main desk or research) gets its own viewport-sized sim; only the active page steps and renders.
function createSim(g: Gpu, page: number) {
  const { device } = g;
  const { CW, CH, dev, cssH } = desk.shared!;
  // The slime runs on a coarser grid (T.res sim px per CSS px), sampled smoothly under crisp cards and text.
  const res = simRes();
  const W = Math.round(desk.view.w * res), H = Math.round(cssH * res), dpr = W / desk.view.w;
  const tex = (w: number, h: number, format: GPUTextureFormat, usage: number) => device.createTexture({ size: [w, h], format, usage });
  const TU = { COPY_DST: 0x02, TEXTURE: 0x04, STORAGE: 0x08, RENDER: 0x10 };
  const trail = [0, 1].map(() => tex(W, H, 'rgba16float', TU.TEXTURE | TU.STORAGE));
  const EW = Math.ceil(W / 2), EH = Math.ceil(H / 2);
  const etex = [0, 1].map(() => tex(EW, EH, 'r32float', TU.TEXTURE | TU.STORAGE));
  const dep = device.createBuffer({ size: W * H * 16, usage: SB.STORAGE }); // rgb (hue-weighted) and density
  const ref = refAgents(desk.view.w, cssH), n = Math.round(ref * (autoOn() ? Q.tier.cap : 1)); // allocated: the tier's cap
  // Scatter the agents; each carries the hue of the nearest card on this page.
  const origin = page * desk.view.w, mine = sources.filter((x) => desk.view.phone || x.region === page);
  const init = new Float32Array(n * 4);
  const cx = mine.map((c) => (c.x - origin) * dpr), cy = mine.map((c) => c.y * dpr);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const x = Math.random() * W, y = Math.random() * H;
    let best = 0, bd = Infinity;
    for (let j = 0; j < cx.length; j++) { const dx = x - cx[j], dy = y - cy[j], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = mine[j].id; } } // nearest by squared distance
    init[o] = x; init[o + 1] = y; init[o + 2] = Math.random() * 6.2832; init[o + 3] = best * 8;
  }
  const agents = device.createBuffer({ size: init.byteLength, usage: SB.STORAGE | SB.COPY_DST });
  device.queue.writeBuffer(agents, 0, init);

  // Text mask for this page at device resolution: r = crisp signature, g = the tagline, b = where ink thins behind text.
  // Each layer paints one color channel and 'lighter' adds them, so one canvas uploads all three.
  const mask = tex(CW, CH, 'rgba8unorm', TU.TEXTURE | TU.COPY_DST | TU.RENDER);
  const mc = new OffscreenCanvas(CW, CH), mx = mc.getContext('2d')!;
  mx.fillStyle = '#000'; mx.fillRect(0, 0, CW, CH);
  mx.globalCompositeOperation = 'lighter';
  if (page === 0) {
    // The DOM name's own weight and tracking, so the two never drift; both sizes are past Inter's 32px optical size,
    // so the canvas gets the same display cut.
    const ns = getComputedStyle(nameEl);
    mx.font = `${ns.fontWeight} ${desk.nameBox!.size * dev}px Inter`; // set by layout, before any sim
    mx.letterSpacing = `${parseFloat(ns.letterSpacing) * dev}px`;
    const drawName = (color: string, blur: number) => { mx.filter = blur ? `blur(${blur * dev}px)` : 'none'; mx.fillStyle = color; mx.fillText('Clark Peng', desk.nameBox!.x * dev, desk.nameBox!.baseline * dev); };
    drawName('#f00', 0);
    drawName('#00f', 10); drawName('#00f', 10);
    // Element rects are on screen; the mask is on this page.
    const sy = desk.view.phone ? scrollY : 0, sx = desk.view.phone ? 0 : cam.x - origin;
    // The tagline, drawn here (not by the DOM) so it turns with its page: the DOM's own line breaks and positions.
    const ts = getComputedStyle(taglineEl), node = taglineEl.firstChild as Text, range = document.createRange();
    // At its CSS size under a scale, so the canvas picks Inter's optical size for 16px, as the DOM does.
    mx.save(); mx.scale(dev, dev);
    mx.filter = 'none'; mx.letterSpacing = '0px'; mx.fillStyle = '#0f0';
    mx.font = `${ts.fontWeight} ${ts.fontSize} Inter`;
    const ascent = mx.measureText('Hg').fontBoundingBoxAscent;
    let line: { t: string; x: number; top: number } | null = null;
    const flush = () => line && mx.fillText(line.t.trimEnd(), line.x + sx, line.top + sy + ascent);
    for (let i = 0; i < node.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r) continue;
      if (!line || r.top > line.top + 2) { if (node.data[i] === ' ') continue; flush(); line = { t: '', x: r.left, top: r.top }; }
      line.t += node.data[i];
    }
    flush();
    mx.restore();
    mx.filter = `blur(${12 * dev}px)`; mx.fillStyle = '#00f';
    for (const el of [taglineEl, linksEl, regionLabel]) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      mx.beginPath(); mx.roundRect((r.left + sx - 10) * dev, (r.top + sy - 8) * dev, (r.width + 20) * dev, (r.height + 16) * dev, 10 * dev); mx.fill();
    }
  }
  device.queue.copyExternalImageToTexture({ source: mc }, { texture: mask }, [CW, CH]);

  const bg = (pipe: GPUComputePipeline, entries: GPUBindingResource[]) => device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: entries.map((r, i) => ({ binding: i, resource: r })) });
  const U0 = { buffer: g.uniform };
  const view_ = (t: GPUTexture) => t.createView();
  return {
    page, origin, W, H, EW, EH, n, ref, dpr, bloom: 0, trail, etex, dep, agents, mask, parity: 0, t: 0, warm: 0,
    eBG: [0, 1].map((p) => bg(g.ePipe, [U0, view_(etex[p]), view_(etex[1 - p])])),
    agentBG: [0, 1].map((p) => bg(g.agentPipe, [U0, { buffer: agents }, { buffer: dep }, view_(trail[p]), view_(etex[1 - p])])),
    diffuseBG: [0, 1].map((p) => bg(g.diffusePipe, [U0, { buffer: dep }, view_(trail[p]), view_(trail[1 - p])])),
  };
}
return { initGpu, createShared, createSim, autoOn, Q, simRes };
}
