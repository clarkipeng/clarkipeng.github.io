import type { Desk } from './state.ts';
import { GROUPS, RESEED, PAGE_NAMES, STYLE_PARAMS, STYLE_DEFAULTS, OPTS, dbg, type ParamRow } from './tunables.ts';
import { HELP } from './help.ts';
import { colorRows } from './colors.ts';
import { textRows } from './text.ts';

// The admin panel (?debug): one floating card of collapsible sections, every row made from one schema: the debug views,
// every tunable, the page's style and the colors. Values save to localStorage (dbg, read back at load only under ?debug);
// so do the panel's place, its open sections and whether it is a pill. d shows or hides it; open, space pauses and .
// steps one frame. Loaded only under ?debug, so it costs nothing otherwise.
type Val = number | string | boolean;
type Act = { text: string; hint?: string; run: (b: HTMLButtonElement) => void; on?: () => boolean };
export type Row = {
  key: string; label: string; hint?: string;
  def?: Val; get?: () => Val; set?: (v: Val) => void; // a value: true/false is a switch, a hex string a swatch, a number a slider
  text?: boolean; // or a string to edit in a box
  range?: readonly [number, number, number]; // the slider's min, max, step
  opts?: readonly (readonly [string, number])[]; // or a segmented control over these
  acts?: Act[]; // buttons after it (or alone)
  reload?: boolean; // read at load, so it applies on the next one
  group?: string; // a subheading this row starts
};
const UI = 'desk.debug.ui';

export function mountAdmin(desk: Desk) {
  const { T, STYLE, time, sources, stats, Q } = desk;
  const ui: { r?: number; y?: number; shut?: boolean; hidden?: boolean; open?: string[] } = (() => {
    try { return JSON.parse(localStorage.getItem(UI) || '{}'); } catch { return {}; }
  })();
  ui.shut ??= desk.view.phone; ui.open ??= ['Debug'];
  const saveUi = () => localStorage.setItem(UI, JSON.stringify(ui));
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', props: object = {}): HTMLElementTagNameMap[K] =>
    Object.assign(document.createElement(tag), cls ? { className: cls } : {}, props);

  // Debug: the clock, the collider view (its chunk loads when switched on), and the old test hooks.
  let coll: Promise<() => void> | null = null;
  const hook = (key: string, label: string, hint: string, reload = true, def: Val = false): Row => ({ key, label, hint, def, reload, get: () => dbg[key] ?? def, set: () => {} });
  let reseedTimer = 0;
  const setT = (k: string, v: number) => {
    T[k] = v;
    if ((RESEED.includes(k) || k === 'cardScale') && desk.gpu) { clearTimeout(reseedTimer); reseedTimer = setTimeout(desk.reseed, 300); } // the card scale rebuilds the desk too
    if (k.startsWith('tally')) for (const d of sources) if (d.tally) d.tally.dirty = true;
  };
  const params = (rows: readonly ParamRow[]): Row[] => rows.map(([key, def, min, max, step, label]) =>
    ({ key, label, hint: HELP[key], def, range: [min, max, step], opts: OPTS[key], get: () => T[key], set: (v) => setT(key, +v) }));
  const pg = () => PAGE_NAMES[desk.page]; // the page style rows show the page you are on
  const style = STYLE_PARAMS.map(([k, , min, max, step, label], i): Row => ({
    get key() { return `${pg()}.${k}`; }, get def() { return STYLE_DEFAULTS[pg()][k]; }, label, hint: HELP[k], group: i ? undefined : 'This page',
    range: k === 'bg' || k === 'ink' ? undefined : [min, max, step], get: () => STYLE[pg()][k], set: (v) => (STYLE[pg()][k] = v as number | string) }));
  const sections: [string, Row[]][] = [
    ['Debug', [
      { key: 'rate', label: 'Time', hint: 'Slows the whole desk: the page turn, the physics, the chips, the flights and the slime.', def: 1,
        opts: [['1×', 1], ['¼×', 0.25], ['1⁄16×', 1 / 16]], get: () => time.rate, set: (v) => (time.rate = +v),
        acts: [{ text: '❙❙', hint: 'Pause (space)', run: () => (time.paused = !time.paused), on: () => time.paused },
          { text: '›', hint: 'Step one frame (.)', run: () => { time.paused = true; time.steps++; } }] },
      { key: 'colliders', label: 'Colliders', hint: 'What the physics sees: every body\'s collision points and outline, the turning paper, and contacts.', def: false,
        get: () => !!coll, set: (v) => {
          if (v && !coll) coll = import('./colliders.ts').then((m) => m.showColliders(desk.chips));
          else if (!v && coll) { void coll.then((stop) => stop()); coll = null; }
        } },
      hook('mlog', 'Log to console', 'Logs auto quality, landings and clip playback to the console.', false),
      hook('skipIntro', 'Skip intro', 'Start with the cards in place instead of dealing them.'),
      hook('still', 'Reduced motion', 'Act as if the system asked for reduced motion.'),
      hook('nogpu', 'No WebGPU', 'Start without WebGPU, the way browsers without it see the desk.'),
      { ...hook('load', 'GPU stress', 'Extra GPU work per agent, to test the auto quality.', true, 0), range: [0, 500, 10] },
      { key: 'intro', label: 'Intro', acts: [{ text: 'Replay', hint: 'Deal the page again from bare paper.', run: () => desk.drawFrom(desk.page, { delay: desk.INTRO_DELAY }) }] },
    ]],
    ...(['Physics', 'Cards', 'Chips', 'Slime'] as const).map((name): [string, Row[]] => [name, params(GROUPS[name])]),
    ['Colors', [...style, ...colorRows(desk)]],
    ['Text', textRows(desk)],
  ];
  const all = sections.flatMap(([, rows]) => rows);

  const el = h('div', 'adm'), head = h('div', 'adm-head'), fps = h('span', 'adm-fps'), fold = h('button', 'adm-x', { title: 'Collapse (d hides)' });
  const find = h('input', 'adm-find', { type: 'search', placeholder: 'Filter', spellcheck: false });
  const scroll = h('div', 'adm-body'), perf = h('div', 'adm-perf'), foot = h('div', 'adm-foot');
  head.append(h('b', '', { textContent: 'Admin' }), fps, fold);
  el.append(head, find, scroll, foot);
  el.append(h('style', '', { textContent: CSS }));
  const refresh: (() => void)[] = [];
  const sync = () => refresh.forEach((f) => f());
  desk.adminSync = sync;
  // A row's change: apply it, then save it (only while it differs from its default).
  const put = (r: Row, v: Val) => {
    r.set!(v);
    if (v === r.def) delete dbg[r.key]; else dbg[r.key] = v;
    localStorage.setItem('desk.debug', JSON.stringify(dbg));
    sync();
  };
  const dp = (step: number) => Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));
  const control = (r: Row, row: HTMLElement) => {
    const out = h('output'), v0 = r.def;
    if (typeof v0 === 'boolean') {
      const sw = h('input', 'adm-sw', { type: 'checkbox', role: 'switch' });
      sw.onchange = () => put(r, sw.checked);
      refresh.push(() => (sw.checked = !!r.get!()));
      return [sw];
    }
    if (r.text) {
      const ta = h('textarea', 'adm-text', { rows: 1, spellcheck: true });
      ta.oninput = () => put(r, ta.value);
      refresh.push(() => { if (document.activeElement !== ta) ta.value = String(r.get!()); });
      row.classList.add('adm-textrow');
      return [ta];
    }
    if (typeof v0 === 'string') {
      const sw = h('input', 'adm-swatch', { type: 'color' });
      sw.oninput = () => put(r, sw.value.slice(1));
      refresh.push(() => { sw.value = '#' + r.get!(); out.value = String(r.get!()); });
      return [sw, out];
    }
    if (r.opts) {
      const seg = h('div', 'adm-seg');
      for (const [text, v] of r.opts) {
        const b = h('button', '', { textContent: text, type: 'button' });
        b.onclick = () => put(r, v);
        refresh.push(() => b.setAttribute('aria-pressed', String(r.get!() === v)));
        seg.append(b);
      }
      return [seg];
    }
    if (r.range) {
      const [min, max, step] = r.range, sl = h('input', '', { type: 'range', min: String(min), max: String(max), step: String(step) });
      sl.oninput = () => put(r, +sl.value);
      refresh.push(() => { const v = +r.get!(); sl.value = String(v); out.value = v.toFixed(dp(step)); });
      row.classList.add('adm-slide');
      return [sl, out];
    }
    return [];
  };
  for (const [name, rows] of sections) {
    const sec = h('details', '', { open: ui.open.includes(name) });
    sec.append(h('summary', '', { textContent: name }));
    sec.ontoggle = () => { if (find.value) return; ui.open = ui.open!.filter((n) => n !== name).concat(sec.open ? [name] : []); saveUi(); };
    if (name === 'Debug') sec.append(perf);
    for (const r of rows) {
      if (r.group) sec.append(h('h4', '', { textContent: r.group }));
      const row = h(typeof r.def === 'boolean' ? 'label' : 'div', 'adm-row', { title: r.hint ?? '' });
      const lab = h('span', 'adm-l', { textContent: r.label });
      if (r.reload) lab.append(h('em', '', { textContent: 'reload' }));
      const ctl = h('div', 'adm-c');
      ctl.append(...control(r, row));
      for (const a of r.acts ?? []) {
        const b = h('button', 'adm-act', { type: 'button', textContent: a.text, title: a.hint ?? '' });
        b.onclick = () => { a.run(b); sync(); };
        if (a.on) refresh.push(() => b.setAttribute('aria-pressed', String(a.on!())));
        ctl.append(b);
      }
      row.append(lab, ctl);
      if (r.def !== undefined) {
        const dot = h('button', 'adm-dot', { type: 'button', title: 'Reset to default' });
        dot.onclick = (e) => { e.preventDefault(); put(r, r.def!); };
        refresh.push(() => row.classList.toggle('changed', r.get!() !== r.def));
        row.append(dot);
      }
      sec.append(row);
      (row as HTMLElement & { find?: string }).find = `${name} ${r.label} ${r.hint ?? ''} ${r.key}`.toLowerCase();
    }
    scroll.append(sec);
  }
  // Filter: rows whose label, hint or key has every word; sections open while they hold a match.
  find.oninput = () => {
    const q = find.value.toLowerCase().split(/\s+/).filter(Boolean);
    for (const sec of scroll.querySelectorAll('details')) {
      let any = false;
      for (const row of sec.querySelectorAll<HTMLElement & { find?: string }>('.adm-row')) { row.hidden = !q.every((w) => row.find!.includes(w)); any ||= !row.hidden; }
      for (const g of sec.querySelectorAll<HTMLElement>('h4, .adm-perf')) g.hidden = q.length > 0;
      sec.hidden = !any;
      sec.open = q.length ? any : ui.open!.includes(sec.firstChild!.textContent!);
    }
  };
  const copy = h('button', 'adm-btn', { type: 'button', textContent: 'Copy values', title: 'The values changed from the defaults, to paste into the source' });
  copy.onclick = async () => {
    const debug = new Set(sections[0][1].map((r) => r.key));
    const text = Object.entries(dbg).filter(([k]) => !debug.has(k)).map(([k, v]) => `${k}: ${JSON.stringify(v)},`).join('\n');
    try { await navigator.clipboard.writeText(text); copy.textContent = text ? 'Copied' : 'Nothing changed'; } catch { copy.textContent = 'Copy failed'; }
    setTimeout(() => (copy.textContent = 'Copy values'), 1400);
  };
  const reset = h('button', 'adm-btn', { type: 'button', textContent: 'Reset all' });
  reset.onclick = () => {
    for (const r of all) if (r.def !== undefined && r.get!() !== r.def) put(r, r.def);
    for (const p of PAGE_NAMES) Object.assign(STYLE[p], STYLE_DEFAULTS[p]); // the other page's style too
    for (const k of Object.keys(dbg)) delete dbg[k];
    localStorage.removeItem('desk.debug'); sync();
  };
  foot.append(copy, reset);

  // What was saved and is not already live (the colors, the clock, the collider view) applies now.
  for (const r of all) if (r.def !== undefined && !r.reload && r.key in dbg && dbg[r.key] !== r.get!()) r.set!(dbg[r.key]);

  // Place: dragged by its head, kept by its distance from the right edge and the top; a pill when folded.
  const place = () => {
    el.hidden = !!ui.hidden; el.classList.toggle('shut', !!ui.shut); fold.textContent = ui.shut ? '+' : '–';
    const w = el.offsetWidth, hh = el.offsetHeight;
    el.style.right = `${Math.max(0, Math.min(innerWidth - w, ui.r ?? 16))}px`;
    el.style.top = `${Math.max(0, Math.min(innerHeight - Math.min(hh, 40), ui.y ?? 16))}px`;
  };
  fold.onclick = (e) => { e.stopPropagation(); ui.shut = !ui.shut; saveUi(); place(); };
  let moved = false;
  head.onclick = () => { if (ui.shut && !moved) { ui.shut = false; saveUi(); place(); } }; // a click on the pill opens it
  head.onpointerdown = (e) => {
    moved = false;
    if (e.target === fold || matchMedia('(max-width: 700px)').matches) return; // a phone's sheet stays put
    const r0 = ui.r ?? 16, y0 = ui.y ?? 16, x = e.clientX, y = e.clientY;
    head.setPointerCapture(e.pointerId);
    head.onpointermove = (m) => {
      moved ||= Math.hypot(m.clientX - x, m.clientY - y) > 3;
      if (moved) { ui.r = r0 - (m.clientX - x); ui.y = y0 + (m.clientY - y); place(); }
    };
    head.onpointerup = () => { head.onpointermove = head.onpointerup = null; saveUi(); };
  };
  desk.addEventListener('resize', place);
  desk.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(String(document.activeElement?.tagName))) return;
    if (e.key === 'd') { ui.hidden = !ui.hidden; saveUi(); place(); return; }
    if (ui.hidden || ui.shut) return;
    if (e.key === ' ') { e.preventDefault(); time.paused = !time.paused; sync(); }
    else if (e.key === '.') { time.paused = true; time.steps++; sync(); }
  });
  // The frame rate in the head, and the details under Debug, twice a second while shown.
  const tick = setInterval(() => {
    if (el.hidden) return;
    const iv = [...stats.intervals].slice(-60).sort((a, b) => a - b), med = iv[iv.length >> 1] || 0;
    fps.textContent = med ? `${(1000 / med).toFixed(0)} fps` : '';
    perf.textContent = `frame ${med.toFixed(1)} ms${Q.gpuMs ? ` · GPU ${Q.gpuMs.toFixed(1)} ms` : ''}` +
      (desk.sim ? `\n${Q.tier.name} tier · ${(desk.activeAgents(desk.sim) / 1000).toFixed(0)}k agents · sim ${desk.sim.W}×${desk.sim.H}` : '\nno WebGPU');
  }, 500);
  desk.signal.addEventListener('abort', () => { clearInterval(tick); el.remove(); void coll?.then((stop) => stop()); desk.adminSync = null; });
  document.body.append(el);
  sync(); place();
}

const CSS = `
.adm{position:fixed;z-index:30;width:316px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-sizing:border-box;
  font:12px/1.35 Inter,system-ui,sans-serif;color:#1d1d1b;background:rgba(255,253,248,.84);-webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);
  border:1px solid rgba(29,29,27,.08);border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 30px rgba(0,0,0,.12);overflow:hidden;user-select:none;-webkit-user-select:none}
.adm[hidden],.adm [hidden]{display:none!important}
.adm button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.adm-head{display:flex;align-items:center;gap:8px;padding:9px 10px 7px 13px;cursor:grab;touch-action:none}
.adm-head b{font-weight:600;letter-spacing:-.01em}
.adm-fps{margin-left:auto;color:#6f6d66;font-variant-numeric:tabular-nums;font-size:11px}
.adm-x{width:20px;height:20px;border-radius:6px;color:#6f6d66;font-size:14px;line-height:20px}
.adm .adm-x:hover,.adm .adm-act:hover{background:rgba(29,29,27,.1)}
.adm-find{margin:0 10px 4px;padding:5px 9px;border:1px solid rgba(29,29,27,.1);border-radius:7px;background:rgba(255,255,255,.65);font:inherit;color:inherit;outline:none}
.adm-find:focus{border-color:#a5a970;background:#fff}
.adm-body{overflow:auto;padding:0 10px 6px 13px;overscroll-behavior:contain;scrollbar-width:thin}
.adm details{border-top:1px solid rgba(29,29,27,.07)}
.adm details:first-child{border-top:0}
.adm summary{list-style:none;display:flex;align-items:center;padding:8px 0 6px;font-weight:600;cursor:pointer}
.adm summary::-webkit-details-marker{display:none}
.adm summary::after{content:'';margin:0 6px 0 auto;width:5px;height:5px;border:solid #8a877d;border-width:0 1.5px 1.5px 0;transform:rotate(-45deg);transition:transform .15s}
.adm details[open]>summary::after{transform:rotate(45deg)}
.adm details[open]{padding-bottom:6px}
.adm h4{margin:8px 0 2px;font:600 10px Inter,system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;color:#8a877d}
.adm-perf{margin:-2px 0 4px;color:#6f6d66;font-size:11px;white-space:pre-line;font-variant-numeric:tabular-nums}
.adm-row{display:grid;grid-template-columns:1fr auto 10px;align-items:center;gap:8px;min-height:25px}
.adm-l{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#3d3c38}
.adm-l em{font-style:normal;font-size:10px;color:#a09c90;margin-left:6px}
.adm-c{display:flex;align-items:center;justify-content:flex-end;gap:4px}
.adm-slide .adm-c{width:136px}
.adm output{width:42px;text-align:right;color:#6f6d66;font-size:11px;font-variant-numeric:tabular-nums}
.adm .adm-dot{width:6px;height:6px;border-radius:50%;background:#a5a970;visibility:hidden}
.adm-row.changed .adm-dot{visibility:visible}
.adm input[type=range]{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:16px;margin:0;background:transparent}
.adm input[type=range]::-webkit-slider-runnable-track{height:2px;border-radius:1px;background:rgba(29,29,27,.16)}
.adm input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-5px;border-radius:50%;background:#fff;border:1px solid rgba(29,29,27,.25);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.adm input[type=range]::-moz-range-track{height:2px;background:rgba(29,29,27,.16)}
.adm input[type=range]::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:#fff;border:1px solid rgba(29,29,27,.25)}
.adm-sw{-webkit-appearance:none;appearance:none;position:relative;width:26px;height:15px;margin:0;border-radius:8px;background:rgba(29,29,27,.18);cursor:pointer;transition:background .15s}
.adm-sw::before{content:'';position:absolute;left:2px;top:2px;width:11px;height:11px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s}
.adm-sw:checked{background:#5c5f4a}
.adm-sw:checked::before{transform:translateX(11px)}
.adm-swatch{-webkit-appearance:none;appearance:none;width:16px;height:16px;padding:0;border:1px solid rgba(29,29,27,.15);border-radius:50%;background:none;cursor:pointer}
.adm-swatch::-webkit-color-swatch-wrapper{padding:0}
.adm-swatch::-webkit-color-swatch{border:0;border-radius:50%}
.adm-swatch::-moz-color-swatch{border:0;border-radius:50%}
.adm-seg{display:flex;gap:2px;padding:2px;border-radius:7px;background:rgba(29,29,27,.06)}
.adm-seg button{min-width:34px;padding:2px 6px;border-radius:5px;color:#6f6d66}
.adm-seg button[aria-pressed=true]{background:#fff;color:#1d1d1b;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.adm .adm-act{min-width:22px;height:21px;padding:0 7px;border-radius:6px;color:#3d3c38;background:rgba(29,29,27,.05)}
.adm .adm-act[aria-pressed=true]{background:#5c5f4a;color:#fff}
.adm-textrow{grid-template-columns:1fr 10px;padding:2px 0}
.adm-textrow .adm-l{grid-column:1/-1}
.adm-textrow .adm-c{display:block}
.adm-text{display:block;width:100%;box-sizing:border-box;field-sizing:content;min-height:25px;resize:none;padding:4px 7px;border:1px solid rgba(29,29,27,.1);border-radius:6px;background:rgba(255,255,255,.65);font:inherit;color:inherit;outline:none;user-select:text;-webkit-user-select:text}
.adm-text:focus{border-color:#a5a970;background:#fff}
.adm-foot{display:flex;gap:6px;padding:8px 10px 9px 13px;border-top:1px solid rgba(29,29,27,.07)}
.adm-btn{padding:4px 10px!important;border:1px solid rgba(29,29,27,.12)!important;border-radius:7px;background:rgba(255,255,255,.6)!important}
.adm-btn:hover{background:#fff!important}
.adm.shut{width:auto;border-radius:999px}
.adm.shut>:not(.adm-head){display:none}
.adm.shut .adm-head{padding:6px 8px 6px 13px;cursor:pointer}
@media (max-width:700px){
  .adm:not(.shut){left:0;right:0!important;top:auto!important;bottom:0;width:auto;max-height:55vh;border-radius:14px 14px 0 0;border-width:1px 0 0}
  .adm.shut{top:auto!important;bottom:12px;right:12px!important}
  .adm-head{cursor:default}
}`;
