// The desk: a sparse slime lives under paper cards on one continuous desk with two regions (main and research), all
// drawn by one WebGPU pass chain. Each region has its own sim that only runs while you look at it. Cards lift, tilt, and
// get dragged; a click flips one to its back (details and links) and puffs the agents under it; hovering a media card
// plays its clips. The DOM (rendered by React) keeps the text, the links, and invisible hit targets; without WebGPU or
// with reduced motion it is the desk, drawn as a still.
import type { DeskCard, DeskRegion } from '../data/desk';
import { Player, type MediaSettings } from './media';
import { CHOICES, DARK_STYLES, EASES, EDGE_MODES, GROUPS, LIGHT_STYLES, LOOKS, PAGE_NAMES, PRINTS, type Style } from './params';
import { AGENT_WGSL, DIFFUSE_WGSL, E_WGSL, GRAIN_WGSL, MAX, PAPER, renderWGSL } from './shaders';

export type DeskOptions = { cards: DeskCard[]; region: DeskRegion; dark: boolean; navigate: (region: DeskRegion) => void };
export type Desk = { setRegion: (region: DeskRegion) => void; setDark: (dark: boolean) => void; destroy: () => void };

type Box = { x: number; y: number; w: number; h: number };
type Src = {
  id: number; card: DeskCard; el: HTMLElement; hit: HTMLElement; img: HTMLImageElement | null; backEl: HTMLElement | null;
  backLinks: HTMLAnchorElement[]; region: number; frame: number[]; aspect: number;
  w: number; h: number; media: Box | null; lines?: string[]; titleLines?: string[]; oneLine?: boolean;
  x: number; y: number; px?: number; py?: number; rot: number; vx: number; vy: number; z: number;
  lift: number; liftV: number; tilt: number[]; tiltV: number[]; sway: number; swayV: number; squash: number; squashV: number;
  hover: number; hoverOn: boolean; hoverSince: number; burst: number; dragging: boolean; released: boolean; suppressClick: boolean;
  flip: number; flipTo: number; emit: number; puffArm: boolean; puffPending: boolean; landT: number;
  player?: Player; uv: number[]; mediaUV: number[]; buv?: number[];
};
type Gpu = {
  device: GPUDevice; ctx: GPUCanvasContext; format: GPUTextureFormat; ts: { set: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer; busy: boolean } | null;
  ePipe: GPUComputePipeline; agentPipe: GPUComputePipeline; diffusePipe: GPUComputePipeline;
  renderPipe: GPURenderPipeline; videoPipe: GPURenderPipeline; grainPipe: GPURenderPipeline; uniform: GPUBuffer; sampler: GPUSampler;
};
type Shared = { CW: number; CH: number; dev: number; cssH: number; paper: GPUTexture; frozenTex: GPUTexture[]; fz: number; atlas?: GPUTexture };
type Sim = {
  page: number; origin: number; W: number; H: number; EW: number; EH: number; n: number; ref: number; dpr: number; bloom: number;
  trail: GPUTexture[]; etex: GPUTexture[]; dep: GPUBuffer; agents: GPUBuffer; mask: GPUTexture; parity: number; t: number; warm: number;
  eBG: GPUBindGroup[]; agentBG: GPUBindGroup[]; diffuseBG: GPUBindGroup[];
};

const REF_W = 1440, REF_H = 900, PHONE = 700;
const STEP = 1 / 60;
const NAME_INK = [30, 34, 40];
const WARM_STEPS = 150; // a page you have not seen yet arrives already formed
const BUDGET_MS = 12, CALM_MS = 5;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (u: number) => { u = clamp(u); return u * u * (3 - 2 * u); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lin = (c: number) => Math.pow(c / 255, 2.2);
const hexRGB = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
const absorbance = (ink: number[]) => ink.map((c, i) => -Math.log(Math.max(lin(c), 1e-4) / lin(PAPER[i])));
const NAME_ABS = absorbance(NAME_INK);

let measureCtx: OffscreenCanvasRenderingContext2D | null = null;
const measure = () => (measureCtx ||= new OffscreenCanvas(8, 8).getContext('2d')!);
function wrapLines(text: string, maxW: number, font: string) {
  const m = measure(); m.font = font;
  const out: string[] = []; let line = '';
  for (const word of text.split(' ')) {
    if (word === '\n') { out.push(line.trim()); line = ''; continue; }
    const test = line ? line + ' ' + word : word;
    if (m.measureText(test).width > maxW && line) { out.push(line.trim()); line = word; } else line = test;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
// The part of an image (fractions) that covers a media area of aspect ma, zoomed and placed by the card's framing.
function coverRect(ia: number, ma: number, [z, px, py]: number[]) {
  const w = Math.min(1, ma / ia) / z, h = Math.min(1, ia / ma) / z;
  return [px * (1 - w), py * (1 - h), w, h];
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
const easeFlip = EASES.cubic;
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
// A closed card's mild ink: the shared ink with a faint cast of the card's own hue, at the shared lightness and chroma.
function mildInk(hex: string, baseHex: string, mix = 1) {
  const [L, a0, b0] = oklab(hexRGB(baseHex)), c = oklab(hexRGB(hex)), C = Math.hypot(a0, b0);
  const h = Math.atan2(c[2], c[1]);
  return absorbance(fromOklab([L, a0 + mix * (C * Math.cos(h) - a0), b0 + mix * (C * Math.sin(h) - b0)]));
}

export function createDesk(root: HTMLElement, opts: DeskOptions): Desk {
  const qs = new URLSearchParams(location.search);
  const tune = qs.has('tune');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || qs.has('still');
  const ac = new AbortController();
  const on = { signal: ac.signal };

  // Settings: numbers in T, choices in TS. The URL can override any of them only with ?tune.
  const T: Record<string, number> = {}, TS: Record<string, string> = {};
  for (const [k, d] of Object.values(GROUPS).flat()) {
    const v = tune ? qs.get(k) : null;
    if (typeof d === 'string') TS[k] = v != null && CHOICES[k]?.includes(v) ? v : d;
    else T[k] = v != null && !Number.isNaN(parseFloat(v)) ? parseFloat(v) : d;
  }
  const fromUrl = (k: string) => tune && qs.has(k);
  const themes = { light: structuredClone(LIGHT_STYLES), dark: structuredClone(DARK_STYLES) };
  let STYLE = opts.dark ? themes.dark : themes.light;
  const applyLook = (name: string, url = false) => {
    for (const [k, v] of Object.entries(LOOKS[name].T)) if (!url || !fromUrl(k)) T[k] = v;
    for (const [k, v] of Object.entries(LOOKS[name].main)) if (!url || !fromUrl(`main.${k}`)) themes.light.main[k] = v;
  };
  applyLook(TS.look, true);
  for (const [k, v] of Object.entries(PRINTS[TS.print])) if (!fromUrl(k)) T[k] = v;
  if (tune) for (const pg of PAGE_NAMES) for (const k of Object.keys(STYLE[pg])) {
    const v = qs.get(`${pg}.${k}`);
    if (v != null) STYLE[pg][k] = typeof STYLE[pg][k] === 'string' ? v : parseFloat(v);
  }
  const styleOf = (page: number) => STYLE[PAGE_NAMES[page]] as Style & Record<string, number> & { mode: string; ink: string; bg: string };

  const canvas = root.querySelector<HTMLCanvasElement>('.field')!;
  const pageEl = root.querySelector<HTMLElement>('.page')!;
  const taglineEl = root.querySelector<HTMLElement>('.tagline')!;
  const linksEl = root.querySelector<HTMLElement>('.links')!;
  const regionLabel = root.querySelector<HTMLElement>('.region-label')!;
  const name = root.querySelector<HTMLElement>('.name')!.textContent || '';

  const sources: Src[] = [...root.querySelectorAll<HTMLElement>('.src')].map((el, id) => {
    const card = opts.cards[id];
    const backEl = el.querySelector<HTMLElement>('.back');
    return {
      id, card, el, hit: el.querySelector<HTMLElement>('.hit')!, img: el.querySelector('img'), backEl,
      backLinks: backEl ? [...backEl.querySelectorAll('a')] : [], region: card.region, frame: card.frame || [1, 0.5, 0.5], aspect: card.aspect || 1,
      w: 0, h: 0, media: null, x: 0, y: 0, rot: card.slot[3], vx: 0, vy: 0, z: id,
      lift: 0, liftV: 0, tilt: [0, 0], tiltV: [0, 0], sway: 0, swayV: 0, squash: 0, squashV: 0,
      hover: 0, hoverOn: false, hoverSince: 0, burst: 0, dragging: false, released: false, suppressClick: false,
      flip: 0, flipTo: 0, emit: 0, puffArm: false, puffPending: false, landT: 0, uv: [0, 0, 0, 0], mediaUV: [0, 0, 0, 0],
    };
  });

  let view = { w: innerWidth, h: innerHeight, phone: innerWidth < PHONE, k: 1, docH: innerHeight, dpr: 1, labelY: 0, cardsH: 0, labelTop: 0 };
  let nameBox = { x: 0, baseline: 0, size: 0 };
  let want: DeskRegion = opts.region; // the region the router asks for
  let page = 0;
  const cam = { x: 0, from: 0, to: 0, t: 1 };
  const trans = { on: false, frozenX: 0, fade: 0, fadeS: 0.8 };
  const cursor = { x: -1e4, y: -1e4, amt: 0 };
  let topZ = sources.length;
  let mouse: { x: number; y: number } | null = null;
  let gpu: Gpu | null = null, shared: Shared | null = null, sims: Sim[] = [], sim: Sim | null = null;
  let videoSrc: Src | null = null, videoMix = 0;
  let alive = true, running = true, raf = 0, last = 0, acc = 0;
  const clock = { t: 0, frame: 0 };
  const stats = { intervals: [] as number[] };
  const bootLog: Record<string, number> = {};
  let tuneSync: (() => void) | null = null;

  // ---------- layout ----------

  // Card geometry in CSS px; media is where the image (or video) sits.
  function cardBox(s: Src, w: number): Partial<Src> {
    const c = s.card;
    if (c.kind === 'note') {
      const lines = wrapLines(c.label.replace(/\n/g, ' \n '), w - 32, '500 23px Caveat');
      return { w, h: 28 + lines.length * 26.5, media: null, lines };
    }
    if (c.kind === 'polaroid') {
      const mw = w - 16;
      return { w, h: 8 + mw / s.aspect + 36, media: { x: 8, y: 8, w: mw, h: mw / s.aspect } };
    }
    const mw = w - 12, mh = mw / s.aspect;
    const m = measure();
    m.font = '600 13px Inter'; const tw = m.measureText(c.label).width;
    m.font = '400 13px Inter'; const sw = m.measureText(c.sub || '').width;
    const oneLine = tw + sw + 14 < mw - 4;
    const titleLines = oneLine ? [c.label] : wrapLines(c.label, mw - 4, '600 13px Inter'); // long titles wrap
    return { w, h: 6 + mh + (oneLine ? 32 : 31 + titleLines.length * 18), media: { x: 6, y: 6, w: mw, h: mh }, titleLines, oneLine };
  }

  function layout() {
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    const phone = vw < PHONE;
    root.classList.toggle('phone', phone);
    root.classList.toggle('wide', !phone);
    root.classList.add('laid');
    view = { ...view, w: vw, h: vh, phone };
    if (!phone) {
      const k = clamp(Math.min(vw / REF_W, vh / REF_H), 0.62, 1.35);
      view.k = k; view.docH = vh;
      nameBox = { x: 54 * k, baseline: 46 * k + 60 * k * 0.8, size: 60 * k };
      for (const s of sources) {
        Object.assign(s, cardBox(s, Math.round(s.card.slot[2] * k)));
        s.x = (s.region + s.card.slot[0] / REF_W) * vw; s.y = (s.card.slot[1] / REF_H) * vh; s.rot = s.card.slot[3];
      }
    } else {
      const pad = 22;
      view.labelY = 0;
      nameBox = { x: pad, baseline: 30 + 44 * 0.8, size: 44 };
      let y = 0;
      for (const s of sources) if (s.card.nav != null) Object.assign(s, cardBox(s, 150)); // phones scroll to research; nav notes stay hidden
      const order = sources.filter((s) => s.card.nav == null).sort((a, b) => a.card.order - b.card.order);
      for (const [i, s] of order.entries()) {
        if (s.region && !view.labelY) { view.labelY = y + 10; y += 56; } // research becomes a section further down
        const full = Math.min(vw - 56, 380);
        const w = Math.round(s.card.kind === 'polaroid' ? full * 0.56 : s.card.kind === 'note' ? Math.min(full * 0.82, 280) : full);
        Object.assign(s, cardBox(s, w));
        s.rot = s.card.slot[3] * 0.7;
        s.px = vw / 2 + (i % 2 ? 1 : -1) * Math.min(14, (vw - w) / 4);
        s.py = y + s.h / 2; y += s.h + 30;
      }
      view.cardsH = y;
    }
    const nameEl = root.querySelector<HTMLElement>('.name')!;
    Object.assign(nameEl.style, { left: nameBox.x + 'px', top: nameBox.baseline - nameBox.size * 0.8 + 'px', fontSize: nameBox.size + 'px' });
    const tagTop = nameBox.baseline + nameBox.size * 0.3;
    Object.assign(taglineEl.style, { left: nameBox.x + 6 + 'px', top: tagTop + 'px', maxWidth: (phone ? view.w - 2 * nameBox.x - 6 : 390 * view.k) + 'px' });
    if (phone) {
      const tb = taglineEl.getBoundingClientRect();
      const linksTop = tagTop + tb.height + 14;
      Object.assign(linksEl.style, { left: nameBox.x + 6 + 'px', top: linksTop + 'px', maxWidth: view.w - 2 * nameBox.x + 'px' });
      const top = linksTop + linksEl.getBoundingClientRect().height + 36;
      for (const s of sources) { s.x = s.px ?? -1e4; s.y = (s.py ?? 0) + top; }
      view.labelTop = top + view.labelY;
      Object.assign(regionLabel.style, { left: nameBox.x + 6 + 'px', top: view.labelTop + 'px' });
      view.docH = Math.ceil(top + view.cardsH + 40);
      pageEl.style.height = view.docH + 'px';
    } else {
      Object.assign(linksEl.style, { left: '', top: '', maxWidth: '' });
      pageEl.style.height = '';
    }
    cam.x = cam.to = view.phone ? 0 : want * view.w; cam.t = 1; placePage(); setInert(want);
    for (const s of sources) {
      s.el.style.width = s.w + 'px'; s.el.style.height = s.h + 'px';
      if (s.media && s.img) {
        const [z, px, py] = s.frame, v = 1 / z;
        Object.assign(s.img.style, { height: s.media.h + 'px', objectPosition: `${px * 100}% ${py * 100}%`,
          objectViewBox: z > 1 ? `inset(${py * (1 - v) * 100}% ${(1 - px) * (1 - v) * 100}% ${(1 - py) * (1 - v) * 100}% ${px * (1 - v) * 100}%)` : '' });
      }
      placeDom(s);
    }
  }

  function placeDom(s: Src) {
    const r = s.rot + (s.sway * 180) / Math.PI, sc = 1 + 0.035 * s.lift;
    s.el.style.transform = `translate(${(s.x - s.w / 2).toFixed(2)}px, ${(s.y - s.h / 2).toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${sc.toFixed(4)})`;
    s.el.style.zIndex = String(s.z);
  }

  // ---------- camera and pages ----------

  // The camera pans across one continuous desk: x = 0 shows the main region, x = viewport width shows research.
  // Tab stays on the page you see: the other page's cards are inert (focusing one would scroll the desk sideways).
  const setInert = (region: number) => { for (const s of sources) s.el.inert = !view.phone && s.region !== region; };
  function placePage() { pageEl.style.transform = view.phone ? '' : `translate3d(${(-cam.x).toFixed(2)}px, 0, 0)`; }
  function panTo(region: DeskRegion, instant = false) {
    want = region;
    if (view.phone) { // one long page: research is a section further down
      scrollTo({ top: region ? Math.max(0, view.labelTop - 16) : 0, behavior: instant || reduced ? 'instant' : 'smooth' });
      return;
    }
    const to = region * view.w;
    if (gpu && sims.length > 1 && region !== page) switchPage(region, instant || reduced);
    setInert(region);
    if (instant || reduced) {
      Object.assign(cam, { x: to, from: to, to, t: 1 }); trans.on = false; placePage();
      if (reduced && gpu && sim) drawStill(); // no frame loop with reduced motion: settle this page and draw it once
      return;
    }
    Object.assign(cam, { from: cam.x, to, t: 0 });
  }
  // Freeze the current frame into the spare frozen texture (the outgoing page slides out, or a style change fades from it).
  function freeze() {
    writeUniforms();
    const enc = gpu!.device.createCommandEncoder();
    encodeRender(enc, shared!.frozenTex[1 - shared!.fz].createView());
    gpu!.device.queue.submit([enc.finish()]);
    shared!.fz = 1 - shared!.fz;
  }
  function switchPage(region: number, instant: boolean) {
    if (!instant) { freeze(); trans.on = true; trans.frozenX = page * view.w; }
    for (const s of sources) if (s.player && s.player.state !== 'rest') { s.player.state = 'rest'; s.player.reset(); } // no decoding off-page
    videoSrc = null; videoMix = 0;
    page = region; sim = sims[page];
    tuneSync?.();
  }
  function stepCam(dt: number) {
    if (cam.t >= 1) return;
    cam.t = Math.min(1, cam.t + dt / T.panS);
    cam.x = lerp(cam.from, cam.to, EASES[TS.panEase](cam.t));
    if (cam.t >= 1) trans.on = false;
    placePage();
  }
  // Pointer position on the desk (CSS px), accounting for the camera on desktop and the scroll on phones.
  const deskX = (e: PointerEvent) => (view.phone ? e.pageX : e.clientX + cam.x);
  const deskY = (e: PointerEvent) => (view.phone ? e.pageY : e.clientY);

  // ---------- interaction ----------

  // Hover is derived from the pointer every frame, so a missed pointerenter/leave can never leave a card stuck.
  addEventListener('pointermove', (e) => {
    cursor.x = deskX(e); cursor.y = deskY(e);
    if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY };
    if (!(e.target as Element).closest?.('.src')) cursor.amt = 1;
  }, { passive: true, signal: ac.signal });
  document.documentElement.addEventListener('pointerleave', () => (mouse = null), on);
  function syncHover() {
    if (view.phone || sources.some((o) => o.dragging)) return;
    const el = mouse && document.elementFromPoint(mouse.x, mouse.y)?.closest('.src');
    const over = el && sources.find((o) => o.el === el && o.card.nav == null);
    for (const s of sources) setHover(s, s === over);
  }
  function setHover(s: Src, on: boolean) {
    if (view.phone || s.hoverOn === on || (on && s.flipTo)) return;
    s.hoverOn = on;
    if (on) s.hoverSince = performance.now();
  }
  const activate = (s: Src) => (s.card.nav != null ? opts.navigate(s.card.nav) : flip(s));

  for (const s of sources) {
    const hit = s.hit;
    hit.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // a nav note is a real link: let it open in a new tab
      e.preventDefault();
      if (s.suppressClick) { s.suppressClick = false; return; }
      activate(s);
    }, on);
    hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(s); } }, on);
    hit.addEventListener('pointerdown', (e) => {
      if (view.phone || !gpu || reduced || e.button !== 0) return; // reduced motion: cards stay put (a click still flips)
      const press = { x: deskX(e), y: deskY(e), ox: s.x - deskX(e), oy: s.y - deskY(e), moved: false };
      hit.setPointerCapture(e.pointerId);
      let lt = performance.now();
      const move = (m: PointerEvent) => {
        if (!press.moved && Math.hypot(deskX(m) - press.x, deskY(m) - press.y) < 4) return;
        if (!press.moved) { press.moved = true; s.dragging = true; s.released = false; s.z = ++topZ; s.el.classList.add('dragging'); }
        const now = performance.now(), dt = Math.max(1, now - lt) / 1000;
        const nx = deskX(m) + press.ox, ny = deskY(m) + press.oy;
        const k = 1 - Math.exp(-dt / 0.05);
        s.vx = lerp(s.vx, (nx - s.x) / dt, k); s.vy = lerp(s.vy, (ny - s.y) / dt, k);
        s.x = nx; s.y = ny; lt = now;
      };
      const up = () => {
        hit.removeEventListener('pointermove', move);
        if (press.moved) {
          s.suppressClick = true; s.dragging = false; s.released = true; s.el.classList.remove('dragging');
          const keep = performance.now() - lt > 80 ? 0 : 0.35; // a little momentum, none if held still before letting go
          s.vx *= keep; s.vy *= keep;
          if (!hit.matches(':hover')) setHover(s, false);
        }
      };
      hit.addEventListener('pointermove', move, on);
      hit.addEventListener('pointerup', up, { once: true, signal: ac.signal });
      hit.addEventListener('pointercancel', up, { once: true, signal: ac.signal });
    }, on);
  }

  // Click turns a card over to its details (and back): it lifts, turns, and lays back down. While it is off the desk it
  // leaves the slime alone, and the agents under it get a puff when it lands.
  function flip(s: Src) {
    if (!s.backEl) return;
    s.flipTo = s.flipTo ? 0 : 1;
    s.hit.setAttribute('aria-expanded', String(!!s.flipTo));
    if (s.flipTo) { setHover(s, false); s.z = ++topZ; placeDom(s); }
    if (!gpu || reduced) { // the still fallback and reduced motion just swap faces
      s.flip = s.emit = s.flipTo; s.el.classList.toggle('flipped', !!s.flipTo);
      if (gpu) drawStill();
    }
  }

  // Springs: lift rises while dragging, tilt leans toward velocity, released cards glide and settle.
  function stepCards(dt: number) {
    const maxTilt = (T.tilt * Math.PI) / 180;
    for (const s of sources) {
      if (view.phone && s.card.nav != null) continue; // hidden on phones, parked off the desk
      if (!s.dragging) {
        const f = Math.exp(-dt * 7);
        s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= f; s.vy *= f;
        const mx = s.w * 0.25, my = s.h * 0.25;
        const x0 = view.phone ? 0 : s.region * view.w; // cards stay on their own page
        if (s.x < x0 + mx || s.x > x0 + view.w - mx) { s.x = clamp(s.x, x0 + mx, x0 + view.w - mx); s.vx *= -0.4; }
        if (s.y < my || s.y > view.docH - my) { s.y = clamp(s.y, my, view.docH - my); s.vy *= -0.4; }
      }
      const liftT = s.dragging ? 1 : s.hoverOn ? 0.1 : 0;
      s.liftV += (170 * (liftT - s.lift) - 17 * s.liftV) * dt; s.lift = Math.max(0, s.lift + s.liftV * dt);
      let tx = 0, ty = 0;
      if (s.dragging) { tx = s.vx * 0.00045; ty = s.vy * 0.00045; const m = Math.hypot(tx, ty); if (m > maxTilt) { tx *= maxTilt / m; ty *= maxTilt / m; } }
      for (const [i, t] of [tx, ty].entries()) { s.tiltV[i] += (150 * (t - s.tilt[i]) - 9 * s.tiltV[i]) * dt; s.tilt[i] += s.tiltV[i] * dt; }
      const swayT = s.dragging ? clamp(s.vx * 0.00005, -0.05, 0.05) : 0;
      s.swayV += (120 * (swayT - s.sway) - 10 * s.swayV) * dt; s.sway += s.swayV * dt;
      s.hover = lerp(s.hover, s.hoverOn ? 1 : 0, 1 - Math.exp(-dt / 0.25));
      if (s.flip !== s.flipTo) {
        s.flip = s.flipTo ? Math.min(1, s.flip + dt / T.flipS) : Math.max(0, s.flip - dt / T.flipS);
        s.el.classList.toggle('flipped', s.flipTo === 1 && s.flip > 0.6); // the real links become clickable as the back faces up
        if (s.flip === s.flipTo) { s.landT = 0; s.puffPending = true; s.squash = 1; s.squashV = 0; } // laid down
      }
      // An open card emits its ink: it ramps up while open and fades back to the shared ink slowly after closing.
      s.emit = s.flipTo ? Math.min(1, s.emit + dt / T.emitIn) : Math.max(0, s.emit - dt / T.emitOut);
      if (s.puffPending && (s.landT += dt) >= T.puffAt) { s.puffPending = false; s.puffArm = true; } // puff, then outline food returns
      if (s.squash) { // landing settle: a small damped squash
        s.squashV += (-260 * s.squash - 16 * s.squashV) * dt; s.squash += s.squashV * dt;
        if (Math.abs(s.squash) + Math.abs(s.squashV) < 1e-3) s.squash = s.squashV = 0;
      }
      s.burst *= Math.exp(-dt * 7);
      if (s.released && s.lift < 0.04 && Math.hypot(s.vx, s.vy) < 60) { s.released = false; s.burst = 1; }
    }
  }

  // ---------- media ----------

  // Only one card shows video at a time: a newly hovered card waits until the previous one has faded back to rest. A
  // card's videos are created on its first hover, so the page downloads no video until then.
  function stepMedia(dt: number) {
    const now = performance.now();
    const hov = sources.find((s) => s.card.clips && s.media && s.hoverOn && now - s.hoverSince >= T.hoverDelay) || null;
    if (hov && !hov.player) hov.player = new Player(hov.card.clips!, root, T as unknown as MediaSettings);
    if (hov && videoSrc && hov !== videoSrc) videoSrc.player!.forceOut();
    if (hov && (!videoSrc || videoSrc.player!.state === 'rest')) videoSrc = hov;
    for (const s of sources) s.player?.step(dt, s === hov && s === videoSrc);
    videoMix = videoSrc ? videoSrc.player!.mix : 0;
    if (videoSrc && videoSrc.player!.state === 'rest' && videoSrc !== hov) videoSrc = null;
  }

  // ---------- card textures ----------

  function drawCard(s: Src, S: number) {
    const cw = Math.ceil(s.w * S), ch = Math.ceil(s.h * S);
    const c = new OffscreenCanvas(cw, ch), x = c.getContext('2d')!;
    const note = s.card.kind === 'note';
    x.fillStyle = note ? '#fff4a8' : '#fffdf8';
    x.fillRect(0, 0, cw, ch);
    if (note) { x.fillStyle = '#f7ea98'; x.fillRect(0, 0, cw, 22 * S); } // the sticky strip is a touch darker
    let mediaPx: Box | null = null;
    if (s.media && s.img) {
      const m = s.media, src = s.img;
      mediaPx = { x: Math.round(m.x * S), y: Math.round(m.y * S), w: Math.round(m.w * S), h: Math.round(m.h * S) };
      const iw = src.naturalWidth, ih = src.naturalHeight;
      if (iw && ih) {
        const [fx, fy, fw, fh] = coverRect(iw / ih, mediaPx.w / mediaPx.h, s.frame);
        x.imageSmoothingQuality = 'high';
        x.drawImage(src, fx * iw, fy * ih, fw * iw, fh * ih, mediaPx.x, mediaPx.y, mediaPx.w, mediaPx.h);
      }
    }
    x.scale(S, S);
    x.textBaseline = 'alphabetic';
    if (s.card.kind === 'photo') {
      const y0 = s.media!.y + s.media!.h, sub = s.card.sub || '';
      x.font = '600 13px Inter'; x.fillStyle = '#1d1d1b';
      if (s.oneLine) {
        x.fillText(s.card.label, 8, y0 + 21);
        x.font = '400 13px Inter'; x.fillStyle = '#85837b'; x.textAlign = 'right'; x.fillText(sub, s.w - 8, y0 + 21);
      } else {
        s.titleLines!.forEach((l, i) => x.fillText(l, 8, y0 + 20 + i * 18));
        x.font = '400 13px Inter'; x.fillStyle = '#85837b'; x.fillText(sub, 8, y0 + 20 + s.titleLines!.length * 18);
      }
    } else if (s.card.kind === 'polaroid') {
      x.font = '500 13px Inter'; x.fillStyle = '#4a4945'; x.textAlign = 'center';
      x.fillText(s.card.label, s.w / 2, s.media!.y + s.media!.h + 23);
    } else {
      x.font = '500 23px Caveat'; x.fillStyle = '#2a2a26';
      s.lines!.forEach((l, i) => x.fillText(l, 16, 14 + 19 + i * 26.5));
    }
    return { canvas: c, mediaPx };
  }

  // Back of a card: its title, the details, and link buttons along the bottom. The DOM links sit on the drawn buttons.
  function drawBack(s: Src, S: number) {
    const c = new OffscreenCanvas(Math.ceil(s.w * S), Math.ceil(s.h * S)), x = c.getContext('2d')!;
    const back = s.card.back!, note = s.card.kind === 'note';
    x.fillStyle = note ? '#fff4a8' : '#fffdf8'; x.fillRect(0, 0, c.width, c.height);
    x.scale(S, S);
    const pad = 14, bh = 26;
    const title = back.title ?? (note ? '' : s.card.label);
    const textless = !title && !back.paras.length;
    // Buttons, left to right: along the bottom, wrapping upward; on a back with no text, from the top down.
    x.font = '600 12px Inter';
    const buttons: (Box & { a: HTMLAnchorElement })[] = [];
    let bx = pad, by = textless ? pad : s.h - pad - bh;
    for (const a of s.backLinks) {
      const bw = Math.ceil(x.measureText(a.textContent + ' ↗').width) + 22;
      if (bx + bw > s.w - pad && bx > pad) { bx = pad; by += textless ? bh + 6 : -(bh + 6); }
      buttons.push({ a, x: bx, y: by, w: bw, h: bh }); bx += bw + 6;
    }
    if (!buttons.length) by = s.h - pad;
    // Title and details, shrinking a step if they would run into the buttons.
    let size = 13, lines: [string, number][] = [];
    for (; size >= 10.5; size -= 0.5) {
      x.font = `600 ${size}px Inter`;
      const tl = wrapLines(title, s.w - 2 * pad, x.font);
      const body = back.paras.flatMap((t, i) => [...(i ? [''] : []), ...wrapLines(t, s.w - 2 * pad, `400 ${size}px Inter`)]);
      lines = [...tl.map((t): [string, number] => [t, 600]), ...(tl.length ? [['', 0] as [string, number]] : []), ...body.map((t): [string, number] => [t, 400])];
      if (pad + lines.length * size * 1.4 <= by - 8) break;
    }
    lines.forEach(([t, wgt], i) => { if (!t) return; x.font = `${wgt} ${size}px Inter`; x.fillStyle = wgt === 600 ? '#1d1d1b' : '#3d3c38'; x.fillText(t, pad, pad + size + i * size * 1.4 - 2); });
    for (const b of buttons) {
      x.beginPath(); x.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, b.h / 2);
      x.strokeStyle = '#1d1d1b40'; x.lineWidth = 1; x.stroke();
      x.font = '600 12px Inter'; x.fillStyle = '#1d1d1b'; x.textAlign = 'center';
      x.fillText(b.a.textContent + ' ↗', b.x + b.w / 2, b.y + 17); x.textAlign = 'left';
    }
    for (const b of buttons) Object.assign(b.a.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    return c;
  }

  // ---------- GPU ----------

  // Auto quality: the agent count scales with the screen so the density per pixel matches the reference desk. A device
  // tier from cheap signals caps it, and a runtime check steps it down (30% at a time, then the sim resolution) if a
  // frame's GPU work runs over budget. Fewer agents deposit more each, so the veins keep their weight.
  const Q = { tier: { name: 'high', cap: 1 }, level: 1, shown: 1, resScale: 1, depMul: 1, gpuMs: 0, samples: [] as number[], cool: 0, calm: 0, nextCheck: 0, checkUntil: 2.5, vsync: 16.7 };
  function deviceTier(adapter: GPUAdapter) {
    const cores = navigator.hardwareConcurrency || 4, mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
    const phone = matchMedia('(pointer: coarse)').matches || view.phone;
    if ((adapter.info as GPUAdapterInfo & { isFallbackAdapter?: boolean })?.isFallbackAdapter) return { name: 'low', cap: 0.25 };
    if (phone || mem <= 4 || cores <= 4) return { name: 'low', cap: 0.35 };
    if (cores >= 8 && mem >= 8) return { name: 'high', cap: 1 };
    return { name: 'mid', cap: 0.6 };
  }
  const autoOn = () => !!T.auto;
  const simRes = () => T.res * (autoOn() ? Q.resScale : 1);
  const refAgents = (cssW: number, cssH: number) => Math.max(6000, Math.round((T.agents * cssW * cssH * (simRes() / 0.5) ** 2) / (REF_W * REF_H)));
  const activeAgents = (sm: Sim) => Math.max(2000, Math.round(sm.n * (autoOn() ? Q.shown : 1)));

  async function initGpu(): Promise<Gpu | null> {
    if (qs.has('nogpu') || !navigator.gpu) return null;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      const hasTs = adapter.features.has('timestamp-query');
      const device = await adapter.requestDevice({ requiredFeatures: hasTs ? ['timestamp-query'] : [] });
      Q.tier = deviceTier(adapter);
      const ts = hasTs ? { set: device.createQuerySet({ type: 'timestamp', count: 2 }), resolve: device.createBuffer({ size: 16, usage: 0x0200 | 0x0004 }),
        read: device.createBuffer({ size: 16, usage: 0x0001 | 0x0008 }), busy: false } : null;
      const ctx = canvas.getContext('webgpu')!;
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: 'opaque' });
      const mod = (code: string) => device.createShaderModule({ code });
      const comp = (code: string) => device.createComputePipelineAsync({ layout: 'auto', compute: { module: mod(code), entryPoint: 'main' } });
      const rend = (code: string, fmt: GPUTextureFormat) => { const m = mod(code); return device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format: fmt }] } }); };
      const [ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainPipe] = await Promise.all([
        comp(E_WGSL), comp(AGENT_WGSL), comp(DIFFUSE_WGSL), rend(renderWGSL(false), format), rend(renderWGSL(true), format), rend(GRAIN_WGSL, 'rg8unorm')]);
      const uniform = device.createBuffer({ size: U.byteLength, usage: 0x40 | 0x08 });
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      return { device, ctx, format, ePipe, agentPipe, diffusePipe, renderPipe, videoPipe, grainPipe, uniform, sampler, ts };
    } catch (err) {
      console.warn('WebGPU unavailable', err);
      return null;
    }
  }

  // Canvas-sized resources every page shares: the canvas, the baked paper grain, and two frozen frames.
  function createShared(g: Gpu): Shared {
    const cap = view.phone ? 6.5e6 : 9e6;
    let dev = Math.min(devicePixelRatio || 1, 2);
    const cssH = view.phone ? view.docH : view.h;
    if (view.w * cssH * dev * dev > cap) dev = Math.sqrt(cap / (view.w * cssH));
    const CW = Math.round(view.w * dev), CH = Math.round(cssH * dev);
    dev = CW / view.w;
    view.dpr = dev;
    canvas.width = CW; canvas.height = CH;
    canvas.style.height = cssH + 'px';
    const tex = (format: GPUTextureFormat) => g.device.createTexture({ size: [CW, CH], format, usage: 0x04 | 0x10 });
    return { CW, CH, dev, cssH, paper: tex('rg8unorm'), frozenTex: [tex(g.format), tex(g.format)], fz: 0 };
  }

  // One page (main desk or research) gets its own viewport-sized sim; only the active page steps and renders.
  function createSim(g: Gpu, pg: number): Sim {
    const { device } = g;
    const { CW, CH, dev, cssH } = shared!;
    const res = simRes();
    const W = Math.round(view.w * res), H = Math.round(cssH * res), dpr = W / view.w;
    const tex = (w: number, h: number, format: GPUTextureFormat, usage: number) => device.createTexture({ size: [w, h], format, usage });
    const trail = [0, 1].map(() => tex(W, H, 'rgba16float', 0x04 | 0x08));
    const EW = Math.ceil(W / 2), EH = Math.ceil(H / 2);
    const etex = [0, 1].map(() => tex(EW, EH, 'r32float', 0x04 | 0x08));
    const dep = device.createBuffer({ size: W * H * 16, usage: 0x80 }); // rgb (hue-weighted) and density
    // The device tier caps the agents, but never below 40k: that many cost almost nothing, and fewer leave the veins speckled.
    const ref = refAgents(view.w, cssH), n = Math.round(autoOn() ? Math.min(ref, Math.max(ref * Q.tier.cap, 40000)) : ref);
    // Scatter the agents; each carries the hue of the nearest card on this page.
    const origin = pg * view.w, mine = sources.filter((x) => view.phone || x.region === pg);
    const init = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      let best = 0, bd = Infinity;
      for (const c of mine) { const d = Math.hypot(x - (c.x - origin) * dpr, y - c.y * dpr); if (d < bd) { bd = d; best = c.id; } }
      init.set([x, y, Math.random() * 6.2832, best * 2], i * 4);
    }
    const agents = device.createBuffer({ size: init.byteLength, usage: 0x80 | 0x08 });
    device.queue.writeBuffer(agents, 0, init);

    // Text mask at device resolution: r = crisp signature, b = where ink thins behind text.
    const mask = tex(CW, CH, 'rgba8unorm', 0x04 | 0x02 | 0x10);
    const mc = new OffscreenCanvas(CW, CH), mx = mc.getContext('2d')!;
    mx.fillStyle = '#000'; mx.fillRect(0, 0, CW, CH);
    mx.globalCompositeOperation = 'lighter';
    if (pg === 0) {
      mx.font = `700 ${nameBox.size * dev}px Inter`;
      mx.letterSpacing = `${-0.035 * nameBox.size * dev}px`; // matches the DOM name (Inter, -0.035em)
      const drawName = (color: string, blur: number) => { mx.filter = blur ? `blur(${blur * dev}px)` : 'none'; mx.fillStyle = color; mx.fillText(name, nameBox.x * dev, nameBox.baseline * dev); };
      drawName('#f00', 0);
      drawName('#00f', 10); drawName('#00f', 10);
      const sy = view.phone ? scrollY : 0, sx = view.phone ? 0 : cam.x - origin; // element rects are on screen; the mask is on this page
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
    const v = (t: GPUTexture) => t.createView();
    return {
      page: pg, origin, W, H, EW, EH, n, ref, dpr, bloom: 0, trail, etex, dep, agents, mask, parity: 0, t: 0, warm: 0,
      eBG: [0, 1].map((p) => bg(g.ePipe, [U0, v(etex[p]), v(etex[1 - p])])),
      agentBG: [0, 1].map((p) => bg(g.agentPipe, [U0, { buffer: agents }, { buffer: dep }, v(trail[p]), v(etex[1 - p])])),
      diffuseBG: [0, 1].map((p) => bg(g.diffusePipe, [U0, { buffer: dep }, v(trail[p]), v(trail[1 - p])])),
    };
  }
  const destroySim = (sm: Sim) => { for (const t of [...sm.trail, ...sm.etex, sm.mask]) t.destroy(); sm.dep.destroy(); sm.agents.destroy(); };

  function renderEntries(sm: Sim, extra: GPUBindGroupEntry[] = []): GPUBindGroupEntry[] {
    const g = gpu!, sh = shared!;
    return [
      { binding: 0, resource: { buffer: g.uniform } }, { binding: 1, resource: sm.trail[sm.parity].createView() },
      { binding: 2, resource: sm.mask.createView() }, { binding: 3, resource: sh.atlas!.createView() }, { binding: 4, resource: g.sampler },
      { binding: 5, resource: sh.paper.createView() }, { binding: 6, resource: sh.frozenTex[sh.fz].createView() }, ...extra];
  }
  // Every card's front and back, rasterized at device resolution and shelf-packed into one atlas.
  function buildAtlas(g: Gpu) {
    const S = shared!.dev;
    const drawn = sources.map((src) => drawCard(src, S));
    const backs = sources.filter((src) => src.backEl && src.card.back).map((src) => ({ src, canvas: drawBack(src, S) }));
    const AW = Math.min(4096, g.device.limits.maxTextureDimension2D);
    let x = 0, y = 0, rowH = 0;
    const places = [...drawn, ...backs].map(({ canvas: c }) => {
      if (x + c.width > AW) { x = 0; y += rowH + 2; rowH = 0; }
      const p = { x, y }; x += c.width + 2; rowH = Math.max(rowH, c.height); return p;
    });
    const AH = y + rowH;
    const atlas = g.device.createTexture({ size: [AW, AH], format: 'rgba8unorm', usage: 0x04 | 0x02 | 0x10 });
    const rect = (p: { x: number; y: number }, s: Src) => [p.x / AW, p.y / AH, (p.x + s.w * S) / AW, (p.y + s.h * S) / AH];
    drawn.forEach(({ canvas: c, mediaPx }, i) => {
      const p = places[i], src = sources[i];
      g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
      src.uv = rect(p, src);
      src.mediaUV = mediaPx ? [mediaPx.x / (src.w * S), mediaPx.y / (src.h * S), (mediaPx.x + mediaPx.w) / (src.w * S), (mediaPx.y + mediaPx.h) / (src.h * S)] : [0, 0, 0, 0];
    });
    backs.forEach(({ src, canvas: c }, i) => {
      const p = places[drawn.length + i];
      g.device.queue.copyExternalImageToTexture({ source: c }, { texture: atlas, origin: p }, [c.width, c.height]);
      src.buv = rect(p, src);
    });
    shared!.atlas = atlas;
  }

  // ---------- uniforms ----------

  // Layout: 20 vec4 of globals, MAX / 4 of draw order, 1 of video uv, then the cards (12 vec4 each).
  const G_HEAD = 20, CARD0 = G_HEAD + MAX / 4 + 1, CARD_VEC4 = 12;
  const U = new Float32Array((CARD0 + MAX * CARD_VEC4) * 4);

  // Paper: an open card emits its full ink; a closed one a tint share of its mild ink. Blends between them as it opens.
  function inkOn(s: Src, tint: number, base: string, hueMix: number) {
    const full = absorbance(hexRGB(s.card.ink!));
    if (!tint) return [...full, s.emit];
    const mild = mildInk(s.card.ink!, base, hueMix), w = Math.max(s.emit, tint), u = s.emit / w;
    return [...mild.map((m, i) => m + (full[i] - m) * u), w];
  }
  // Card plane -> screen homography (sim px): lift, in-plane rotation, the flip about the card's own vertical axis, and a
  // 3D tilt toward velocity.
  function cardUniform(s: Src, dpr: number, o: number, originX: number, jbloom: number, tint: number, base: string, hueMix: number) {
    // Flip: lift in the first ~22%, turn over in the middle, lay back down in the last ~22%.
    const fa = Math.PI * easeFlip(clamp((s.flip - 0.22) / 0.56)), fc = Math.cos(fa);
    const up = s.flip > 0 && s.flip < 1 ? smooth(s.flip / 0.22) * (1 - smooth((s.flip - 0.78) / 0.22)) : 0;
    const lift = Math.max(s.lift, 0.9 * up);
    const th = (s.rot * Math.PI) / 180 + s.sway, sc = (1 + 0.035 * lift) * (1 - 0.014 * s.squash);
    let mu = [Math.cos(th) * sc, Math.sin(th) * sc, 0], mv = [-Math.sin(th) * sc, Math.cos(th) * sc, 0];
    // Never exactly edge-on, where the homography would be singular.
    const fe = Math.sign(fc || 1) * Math.max(Math.abs(fc), 0.02), fs = Math.sqrt(1 - fe * fe) * (Math.sin(fa) < 0 ? -1 : 1);
    if (s.flip > 0) mu = rodrigues(mu, mv.map((v) => v / sc), Math.atan2(fs, fe));
    const phi = Math.hypot(s.tilt[0], s.tilt[1]);
    if (phi > 1e-5) { const ax = [-s.tilt[1] / phi, s.tilt[0] / phi, 0]; mu = rodrigues(mu, ax, phi); mv = rodrigues(mv, ax, phi); }
    const f = 1800 * dpr, zh = lift * T.lift * dpr, cx = (s.x - originX) * dpr, cy = s.y * dpr; // page-local
    const inv = invert3([f * mu[0] - cx * mu[2], f * mv[0] - cx * mv[2], cx * (f - zh), f * mu[1] - cy * mu[2], f * mv[1] - cy * mv[2], cy * (f - zh), -mu[2], -mv[2], f - zh]);
    const hw = (s.w * dpr) / 2, hh = (s.h * dpr) / 2;
    const c = s.card;
    U.set([inv[0], inv[1], inv[2], c.clips ? 1 : 0, inv[3], inv[4], inv[5], 0, inv[6], inv[7], inv[8], 0,
      hw, hh, 3 * dpr, Math.min(1, lift), cx, cy, Math.cos(th), Math.sin(th), sc, s.hover, s.burst, zh,
      ...s.uv, ...s.mediaUV, Math.hypot(hw, hh) * sc * 1.04 + 2, fc < 0 ? -1 : 1, s.puffArm ? 1 : 0, Math.abs(fe),
      ...(s.buv || s.uv), ...hexRGB(c.hue || '888888').map(lin), s.flip !== s.flipTo || s.puffPending ? 1 : 0,
      // On a j page every card emits its J ink (blooming in from the shared ink on arrival); on paper every inked card
      // emits a mild share of its ink (tint) and the full ink while open.
      ...(jbloom >= 0 && c.jink ? [...absorbance(hexRGB(c.jink)), jbloom] : c.ink ? inkOn(s, tint, base, hueMix) : [0, 0, 0, 0])], o);
  }

  const isJ = (sm: Sim) => !view.phone && styleOf(sm.page).mode === 'j';
  function writeUniforms(sm: Sim = sim!) {
    const s = sm, d = s.dpr, sh = shared!, dev = sh.dev, st = styleOf(s.page), jm = isJ(s);
    // This page's cards whose shadows can reach the screen, bottom to top; the passes only visit these.
    const sx = view.phone ? 0 : s === sim ? cam.x : s.origin, sy = view.phone ? scrollY : 0;
    const order = sources.filter((x) => {
      if (!view.phone && x.region !== s.page) return false;
      const r = Math.hypot(x.w, x.h) / 2 + 100 * Math.max(T.shadowSoft, 1);
      return x.x + r > sx && x.x - r < sx + view.w && x.y + r > sy && x.y - r < sy + view.h;
    }).sort((a, b) => a.z - b.z).map((x) => x.id);
    const vs = videoSrc;
    let vu = [0, 0, 1, 1];
    if (vs) {
      const el = vs.player!.a;
      vu = coverRect((el.videoWidth || 16) / (el.videoHeight || 9), vs.media!.w / vs.media!.h, vs.frame);
    }
    U.set([s.W, s.H, activeAgents(s), d,
      T.speed / 60 * d, T.deposit * Q.depMul, T.decay, T.diffuse,
      T.sd * d, T.sa, T.turn, 0,
      T.respawn, T.edge, sources.length, clock.frame,
      (cursor.x - s.origin) * d, cursor.y * d, cursor.amt, 0.94, 0.6, 0.4, st.gain, st.gamma,
      ...absorbance(hexRGB(st.ink)), s.W / sh.CW, ...NAME_ABS, Math.max(1, Math.round(1 / T.share)),
      vs ? vs.id : -1, videoMix, vs?.player!.fading ? clamp(vs.player!.fade) : 0, cam.x * dev,
      EDGE_MODES.indexOf(TS.edgeMode), T.ridge * d, T.ridgeW * d, T.puffR * d,
      T.puff, T.puffDecay, T.hoverE, T.cursorE,
      st.soft, st.grain, 0, order.length,
      TS.edgeMode === 'ring2' ? 1 : T.ring2, T.ring2At, T.corner, st.opacity,
      T.shadowSoft, T.shadow, 0, 0,
      CHOICES.mode.indexOf(st.mode), st.glow, st.halo, s.t,
      ...hexRGB(st.bg).map(lin), 0,
      s.origin * dev, trans.on ? 1 : trans.fade > 0 ? 2 + trans.fade : 0, trans.frozenX * dev, sh.CW,
      st.stain, st.bleed * d, 0, 0,
      T.pDesat, T.pWarm, T.pBlack, T.pDuo,
      T.pGrain, T.pMatte, 0, 0,
      ...order, ...Array(MAX - order.length).fill(0), ...vu], 0);
    for (const src of sources) cardUniform(src, d, (CARD0 + src.id * CARD_VEC4) * 4, s.origin, jm ? s.bloom : -1, st.mode === 'paper' ? st.tint : 0, st.ink, st.hueMix ?? 1);
    gpu!.device.queue.writeBuffer(gpu!.uniform, 0, U);
  }

  // ---------- frame ----------

  function encodeStep(enc: GPUCommandEncoder, only = 'ead', ts: Gpu['ts'] = null, sm: Sim = sim!) {
    const s = sm, p = s.parity, g = gpu!;
    const pass = enc.beginComputePass(ts ? { timestampWrites: { querySet: ts.set, beginningOfPassWriteIndex: 0 } } : undefined);
    if (only.includes('e')) { pass.setPipeline(g.ePipe); pass.setBindGroup(0, s.eBG[p]); pass.dispatchWorkgroups(Math.ceil(s.EW / 8), Math.ceil(s.EH / 8)); }
    if (only.includes('a')) { pass.setPipeline(g.agentPipe); pass.setBindGroup(0, s.agentBG[p]); pass.dispatchWorkgroups(Math.ceil(activeAgents(s) / 64)); }
    if (only.includes('d')) { pass.setPipeline(g.diffusePipe); pass.setBindGroup(0, s.diffuseBG[p]); pass.dispatchWorkgroups(Math.ceil(s.W / 16), Math.ceil(s.H / 16)); }
    pass.end();
    s.parity = 1 - p;
    s.t += STEP;
  }
  function encodeRender(enc: GPUCommandEncoder, target: GPUTextureView, ts: Gpu['ts'] = null) {
    const g = gpu!, s = sim!;
    let pipe = g.renderPipe, bg = g.device.createBindGroup({ layout: g.renderPipe.getBindGroupLayout(0), entries: renderEntries(s) });
    if (videoSrc && videoMix > 0) {
      try {
        const pl = videoSrc.player!;
        const ext = g.device.importExternalTexture({ source: pl.a });
        // The incoming clip only once it has a frame; until then both slots show the current one.
        const extB = pl.fading && pl.b.readyState >= 2 ? g.device.importExternalTexture({ source: pl.b }) : ext;
        pipe = g.videoPipe;
        bg = g.device.createBindGroup({ layout: g.videoPipe.getBindGroupLayout(0), entries: renderEntries(s, [{ binding: 7, resource: ext }, { binding: 8, resource: extB }]) });
      } catch { /* frame not ready yet: draw the poster */ }
    }
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      ...(ts ? { timestampWrites: { querySet: ts.set, endOfPassWriteIndex: 1 } } : {}) });
    pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
    if (ts) { enc.resolveQuerySet(ts.set, 0, 2, ts.resolve, 0); enc.copyBufferToBuffer(ts.resolve, 0, ts.read, 0, 16); }
  }
  function drawStill() {
    const enc = gpu!.device.createCommandEncoder();
    for (; sim!.warm > 0; sim!.warm--) { writeUniforms(); encodeStep(enc); }
    writeUniforms();
    encodeRender(enc, gpu!.ctx.getCurrentTexture().createView());
    gpu!.device.queue.submit([enc.finish()]);
  }

  // Runtime check: measure each frame's GPU work (timestamps, else the frame interval) in the first seconds and for a
  // second now and then. Over budget: drop 30% of the agents (then sim resolution); well under budget for a while: step
  // back up. The gap between the two thresholds keeps it from oscillating.
  function qualityCheck(dt: number) {
    Q.shown += (Q.level - Q.shown) * Math.min(1, dt * 3);
    Q.depMul = Math.max(1, sim!.ref / activeAgents(sim!));
    if (!autoOn()) return;
    const t = clock.t;
    Q.vsync = Math.max(4, Math.min(...stats.intervals.filter((x) => x > 4), 16.7)); // the display's frame period
    if (t > Q.nextCheck && t > Q.checkUntil) { Q.checkUntil = t + 1.5; Q.nextCheck = t + 15; }
    if (t > Q.checkUntil || Q.samples.length < 20) return;
    const sorted = [...Q.samples].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
    Q.samples.length = 0;
    Q.gpuMs = med;
    if (t < Q.cool) return;
    const over = gpu!.ts ? med > BUDGET_MS : med > 1.3 * Q.vsync;
    const calm = gpu!.ts ? med < CALM_MS : med < 1.05 * Q.vsync;
    if (over) {
      Q.calm = 0; Q.cool = t + 2; Q.checkUntil = t + 2;
      if (Q.level > 0.36) Q.level = Math.max(0.35, Q.level * 0.7);
      else if (Q.resScale > 0.61) { Q.resScale *= 0.8; resizeSims(); }
    } else if (calm && Q.level < 1 && ++Q.calm >= 3) {
      Q.calm = 0; Q.cool = t + 4; Q.level = Math.min(1, Q.level / 0.7);
    }
  }
  // A lower sim resolution needs new sims: crossfade from the current frame while the new sim warms up.
  function resizeSims() {
    freeze();
    sims.forEach(destroySim);
    sims = (view.phone ? [0] : [0, 1]).map((pg) => Object.assign(createSim(gpu!, pg), { t: 4.5, warm: WARM_STEPS }));
    sim = sims[page];
    Object.assign(trans, { fade: 1, fadeS: 0.8, frozenX: cam.x });
  }

  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const g = gpu!, sm = sim!;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
    if (last) { stats.intervals.push(now - last); if (stats.intervals.length > 240) stats.intervals.shift(); }
    last = now;
    syncHover();
    stepCards(dt);
    stepCam(dt);
    stepMedia(dt);
    cursor.amt *= Math.exp(-dt * 2);
    acc += dt;
    let steps = 0;
    const measuring = autoOn() && clock.t <= Q.checkUntil;
    const ts = measuring && g.ts && !g.ts.busy ? g.ts : null;
    if (measuring && !g.ts) Q.samples.push(dt * 1000); // no GPU timestamps: judge by the frame interval
    while (acc >= STEP && steps < 2) {
      acc -= STEP; steps++;
      clock.t += STEP; clock.frame++;
      writeUniforms();
      const enc = g.device.createCommandEncoder();
      encodeStep(enc, 'ead', steps === 1 ? ts : null);
      g.device.queue.submit([enc.finish()]);
      for (const s of sources) s.puffArm = false; // a landing puffs the agents on exactly one step
    }
    if (steps === 2) acc = Math.min(acc, STEP);
    // Once the landing page has settled, warm the other page in the background (one time only), so it arrives formed.
    const other = sims.length > 1 ? sims[1 - page] : null;
    if (other && other.warm > 0 && !trans.on && clock.t > 5) {
      const n = Math.min(other.warm, 2);
      other.warm -= n;
      const enc = g.device.createCommandEncoder();
      for (let k = 0; k < n; k++) { writeUniforms(other); encodeStep(enc, 'ead', null, other); }
      g.device.queue.submit([enc.finish()]);
    }
    if (sm.warm > 0) { // a page seen for the first time: catch up a burst of steps
      const n = Math.min(sm.warm, 25);
      sm.warm -= n;
      const enc = g.device.createCommandEncoder();
      for (let k = 0; k < n; k++) { writeUniforms(); encodeStep(enc); }
      g.device.queue.submit([enc.finish()]);
    }
    if (trans.fade > 0) trans.fade = Math.max(0, trans.fade - dt / trans.fadeS); // crossfade from a frozen frame
    writeUniforms();
    const enc = g.device.createCommandEncoder();
    const timed = ts && steps ? ts : null;
    encodeRender(enc, g.ctx.getCurrentTexture().createView(), timed);
    g.device.queue.submit([enc.finish()]);
    if (timed) {
      timed.busy = true;
      timed.read.mapAsync(1).then(() => {
        const [t0, t1] = new BigInt64Array(timed.read.getMappedRange());
        if (t1 > t0) Q.samples.push(Number(t1 - t0) / 1e6);
        timed.read.unmap(); timed.busy = false;
      }).catch(() => { timed.busy = false; });
    }
    qualityCheck(dt);
    if (isJ(sm)) sm.bloom = Math.min(1, sm.bloom + dt / styleOf(sm.page).bloom); // olive -> the J desk's inks
    for (const s of sources) if (s.dragging || s.lift > 0.001 || s.flip % 1 || Math.abs(s.vx) + Math.abs(s.vy) > 0.5 || Math.abs(s.sway) > 1e-4) placeDom(s);
  }

  async function warm(steps: number) {
    for (let i = 0; i < steps && alive; i++) {
      clock.t += STEP; clock.frame++;
      writeUniforms();
      const enc = gpu!.device.createCommandEncoder();
      encodeStep(enc);
      gpu!.device.queue.submit([enc.finish()]);
      if (i % 20 === 19) await gpu!.device.queue.onSubmittedWorkDone();
    }
  }

  function rebuild(first: boolean) {
    layout();
    if (!gpu) return;
    const g = gpu;
    sims.forEach(destroySim);
    if (shared) for (const t of [shared.paper, ...shared.frozenTex, shared.atlas]) t?.destroy();
    shared = createShared(g);
    buildAtlas(g);
    // Phones scroll one long page; desktops get a main page and a research page, each with its own sim.
    sims = (view.phone ? [0] : [0, 1]).map((pg) => createSim(g, pg));
    page = view.phone ? 0 : want;
    sim = sims[page];
    // Bake the paper grain once, so the per-frame pass reads it instead of computing noise.
    writeUniforms();
    const ge = g.device.createCommandEncoder(), gp = ge.beginRenderPass({ colorAttachments: [{ view: shared.paper.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    gp.setPipeline(g.grainPipe);
    gp.setBindGroup(0, g.device.createBindGroup({ layout: g.grainPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: g.uniform } }] }));
    gp.draw(3); gp.end(); g.device.queue.submit([ge.finish()]);
    // The page you land on forms in front of you; a page you have not visited yet is warmed up when you go there.
    if (!first || reduced) { clock.t = 4.5; sim.t = 4.5; }
    for (const sm of sims) if (sm !== sim) sm.warm = WARM_STEPS;
  }
  async function reseed() {
    if (!gpu) { layout(); return; }
    running = false; cancelAnimationFrame(raf);
    await gpu.device.queue.onSubmittedWorkDone();
    if (!alive) return;
    rebuild(false);
    if (reduced) { drawStill(); return; }
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }

  // GPU time per frame: n frames (one sim step + full render each) submitted back to back, then averaged.
  async function bench(n = 120) {
    const g = gpu!, sh = shared!;
    const target = g.device.createTexture({ size: [sh.CW, sh.CH], format: g.format, usage: 0x10 });
    const run = async (kind: string) => {
      await g.device.queue.onSubmittedWorkDone();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        writeUniforms();
        const enc = g.device.createCommandEncoder();
        if (kind !== 'render') encodeStep(enc);
        if (kind !== 'step') encodeRender(enc, target.createView());
        g.device.queue.submit([enc.finish()]);
      }
      await g.device.queue.onSubmittedWorkDone();
      return +((performance.now() - t0) / n).toFixed(2);
    };
    running = false; cancelAnimationFrame(raf);
    const out = { page: PAGE_NAMES[sim!.page], canvas: `${sh.CW}x${sh.CH}`, sim: `${sim!.W}x${sim!.H}`, agents: activeAgents(sim!), tier: Q.tier.name,
      stepMs: await run('step'), renderMs: await run('render'), frameMs: await run('both') };
    running = true; last = 0; raf = requestAnimationFrame(frame);
    target.destroy();
    return out;
  }

  async function main() {
    const t0 = performance.now(), mark = (k: string) => (bootLog[k] = Math.round(performance.now() - t0));
    layout(); // the startup still uses the final layout right away
    if (want && view.phone) panTo(want, true);
    const fontsReady = Promise.all(['700 60px Inter', '500 23px Caveat', '600 13px Inter', '400 13px Inter'].map((f) => document.fonts.load(f)));
    await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3000))]);
    if (!alive) return;
    mark('fonts');
    layout(); // card sizes measured with the real fonts
    if (want && view.phone) panTo(want, true);
    await Promise.all(sources.map((s) => s.img?.decode().catch(() => {})));
    if (!alive) return;
    mark('images');
    // The desk fades in once, from bare paper: straight to the live field when WebGPU is quick, else the DOM still first.
    const showStill = setTimeout(() => root.classList.add('ready'), 250);
    gpu = await initGpu();
    if (!alive) { clearTimeout(showStill); gpu?.device.destroy(); return; }
    mark('pipelines');
    if (!gpu) { clearTimeout(showStill); root.classList.add('nogpu', 'ready'); layout(); return; }
    gpu.device.lost.then((info) => { if (alive && info.reason !== 'destroyed') { console.warn('WebGPU device lost', info.message); fallBack(); } });
    rebuild(true);
    // Draw the field's first frame under the DOM still, then hand over, so startup never flashes.
    writeUniforms();
    const enc0 = gpu.device.createCommandEncoder();
    encodeRender(enc0, gpu.ctx.getCurrentTexture().createView());
    gpu.device.queue.submit([enc0.finish()]);
    await gpu.device.queue.onSubmittedWorkDone();
    await new Promise(requestAnimationFrame);
    if (!alive) return;
    clearTimeout(showStill);
    root.classList.add('gpu', 'ready');
    mark('sim');
    if (tune) {
      (window as unknown as Record<string, unknown>).__desk = { Q, T, TS, STYLE: () => STYLE, bench, bootLog, stats, view: () => view,
        sim: () => sim && { page: sim.page, W: sim.W, H: sim.H, n: activeAgents(sim), CW: shared!.CW } };
      import('./tune').then(({ tunePanel }) => {
        if (!alive) return;
        tuneSync = tunePanel({ host: root, signal: ac.signal, T, TS, style: () => styleOf(page), pageName: () => PAGE_NAMES[page], applyLook, reseed,
          perf: () => {
            const iv = [...stats.intervals].slice(-60).sort((a, b) => a - b), med = iv[iv.length >> 1] || 0;
            return `${med ? (1000 / med).toFixed(0) : '-'} fps · frame ${med.toFixed(1)} ms${Q.gpuMs ? ` · GPU ${Q.gpuMs.toFixed(1)} ms` : ''}\n` +
              (sim ? `${autoOn() ? `auto: ${Q.tier.name} tier, ` : ''}${(activeAgents(sim) / 1000).toFixed(0)}k agents, sim ${sim.W}x${sim.H}` : '');
          } });
      });
    }
    if (reduced) { // one settled still: let the mesh form offscreen, then draw once and stop
      await warm(Math.round(4 / STEP));
      if (alive) drawStill();
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  // A lost GPU (driver reset, too many contexts) leaves the DOM still in place of the field.
  function fallBack() {
    running = false; cancelAnimationFrame(raf);
    gpu = null; sim = null; sims = []; shared = null;
    root.classList.remove('gpu'); root.classList.add('nogpu');
    for (const s of sources) { s.player?.destroy(); s.player = undefined; s.el.classList.toggle('flipped', !!s.flipTo); }
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (document.documentElement.clientWidth === view.w && innerHeight === view.h) return;
      reseed();
    }, 200);
  }, on);

  main();

  return {
    setRegion(region) {
      if (region === want) return;
      panTo(region, !root.classList.contains('ready'));
    },
    // The theme swaps both pages' styles; the field crossfades from its last frame.
    setDark(dark) {
      const next = dark ? themes.dark : themes.light;
      if (next === STYLE) return;
      if (gpu && sim && !reduced) { freeze(); Object.assign(trans, { fade: 1, fadeS: 1.2, frozenX: cam.x }); }
      STYLE = next;
      for (const sm of sims) sm.bloom = 0;
      tuneSync?.();
      if (gpu && sim && reduced) drawStill();
    },
    destroy() {
      alive = false; running = false;
      cancelAnimationFrame(raf); clearTimeout(resizeTimer);
      ac.abort();
      for (const s of sources) { s.player?.destroy(); s.player = undefined; }
      gpu?.device.destroy();
      gpu = null;
      root.classList.remove('gpu', 'nogpu', 'ready', 'laid', 'phone', 'wide');
    },
  };
}
