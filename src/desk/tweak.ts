import { currentDesk } from './state.ts';
import { colorsGroup } from './colors.ts';
import { HELP } from './help.ts';
import { PRINTS, CARD_PRESETS, RESEED, GROUPS, type ParamRow, CHOICES, PAGE_NAMES, STYLE_PARAMS, DEFAULTS, STYLE_DEFAULTS, BASE, STYLE_BASE } from './tunables.ts';


export function mountTweak() {
const desk = currentDesk();
const { T, reseed, applyLook, placeDoor, sources, STYLE, drawFrom, INTRO_DELAY, stats, Q, autoOn, activeAgents,
  addEventListener, body } = desk;
// ---------- tweak panel (press t) ----------

// A quiet corner panel with a slider per tunable, the edge mode, the ink color, every card's colors, a copy-link and a reset button.
function tweakPanel() {
  const panel = Object.assign(document.createElement('div'), { className: 'tweak' });
  type TweakInput = (HTMLInputElement | HTMLSelectElement) & { out?: HTMLOutputElement };
  const inputs: Record<string, TweakInput> = {};
  let reseedTimer = 0;
  // Every row ends in a small reset to its own default, shown only while the value differs from it.
  const resets: (() => void)[] = [];
  // Card outline settings show only in the edge modes that use them.
  const em = () => String(T.edgeMode), ringy = () => ['max', 'plus', 'ring2'].includes(em());
  const RELEVANT: Record<string, () => boolean> = {
    edge: () => em() !== 'none', share: () => em() !== 'none', ridge: () => ringy() || em() === 'corners', ridgeW: () => ringy() || em() === 'corners',
    ring2: () => em() === 'max' || em() === 'plus', ring2At: () => em() === 'ring2' || (ringy() && !!T.ring2), corner: ringy,
  };
  const refresh = () => {
    resets.forEach((f) => f());
    for (const [k, ok] of Object.entries(RELEVANT)) inputs[k].parentElement!.hidden = !ok();
  };
  const resetBtn = (row: HTMLElement, isDefault: () => boolean, reset: () => void) => {
    const b = Object.assign(document.createElement('button'), { className: 'tweak-reset', type: 'button', textContent: '↺', title: 'reset to default' });
    b.onclick = (e) => { e.preventDefault(); reset(); refresh(); };
    resets.push(() => (b.style.visibility = isDefault() ? 'hidden' : ''));
    row.append(b);
  };
  panel.addEventListener('input', refresh);
  const colors = colorsGroup(desk, resetBtn); // appended last, under the other groups
  const set = (k: string, v: number | string) => {
    T[k] = v;
    if (k === 'print') { Object.assign(T, PRINTS[v]); sync(); } // a preset sets the print knobs
    if (k === 'cards') { Object.assign(T, CARD_PRESETS[v]); sync(); if (desk.gpu) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); } }
    if (k === 'look') {
      const before = RESEED.map((r) => T[r]).join();
      applyLook(v as string); sync(); // the look select's value
      if (desk.gpu && before !== RESEED.map((r) => T[r]).join()) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); }
    }
    // card sizes rebuild the desk too (and a corner label size, the card atlas)
    if ((RESEED.includes(k) || ['cardScale', 'cardMax', 'backTitle', 'backTight', 'framing', 'cornerLabel', 'frameSide', 'frameTop', 'frameBottom'].includes(k)) && desk.gpu) { clearTimeout(reseedTimer); reseedTimer = setTimeout(reseed, 300); } // the label is in the atlas
    if (k === 'cornerSize' || k === 'cornerLift' || k === 'cornerLabel') placeDoor();
    if (k.startsWith('tally')) for (const d of sources) if (d.tally) d.tally.dirty = true;
  };
  for (const [name, params] of Object.entries(GROUPS)) {
    const group = Object.assign(document.createElement('details'), { open: name === 'Agents' || name === 'Card outlines' });
    group.append(Object.assign(document.createElement('summary'), { textContent: name }));
    if (name === 'Performance') group.append(Object.assign(document.createElement('div'), { className: 'tweak-perf' }));
    for (const [k, , min, max, step, label] of params as readonly ParamRow[]) {
      let input: TweakInput, out: HTMLOutputElement | undefined;
      if (CHOICES[k]) {
        input = document.createElement('select');
        for (const m of CHOICES[k]) input.append(new Option(m, m));
        input.oninput = () => set(k, input.value);
      } else if (k === 'ink') {
        input = Object.assign(document.createElement('input'), { type: 'color' });
        input.oninput = () => set(k, input.value.slice(1));
      } else if (step === 1 && max === 1) {
        input = Object.assign(document.createElement('input'), { type: 'checkbox' });
        input.oninput = () => set(k, (input as HTMLInputElement).checked ? 1 : 0);
      } else {
        input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
        out = document.createElement('output');
        input.oninput = () => { set(k, +input.value); out!.value = input.value; };
      }
      inputs[k] = Object.assign(input, { out });
      const r = Object.assign(document.createElement('label'), { title: HELP[k] ?? '' });
      r.append(Object.assign(document.createElement('span'), { textContent: label }), input);
      if (out) r.append(out);
      resetBtn(r, () => String(T[k]) === String(BASE[k]), () => { set(k, BASE[k]); sync(); });
      group.append(r);
    }
    panel.append(group);
  }
  // Style: the current page's own surface and ink.
  const styleGroup = Object.assign(document.createElement('details'), { open: true });
  const styleTitle = document.createElement('summary');
  styleGroup.append(styleTitle);
  const styleInputs: Record<string, TweakInput> = {};
  const curStyle = () => STYLE[PAGE_NAMES[desk.page]];
  for (const [k, , min, max, step, label] of STYLE_PARAMS) {
    let input: TweakInput, out: HTMLOutputElement | undefined;
    if (k === 'ink' || k === 'bg') {
      input = Object.assign(document.createElement('input'), { type: 'color' });
      input.oninput = () => (curStyle()[k] = input.value.slice(1));
    } else {
      input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
      out = document.createElement('output');
      input.oninput = () => { curStyle()[k] = +input.value; out!.value = input.value; };
    }
    const r = Object.assign(document.createElement('label'), { title: HELP[k] ?? '' });
    styleInputs[k] = Object.assign(input, { out });
    r.append(Object.assign(document.createElement('span'), { textContent: label }), input);
    if (out) r.append(out);
    const def = () => STYLE_BASE[PAGE_NAMES[desk.page]][k];
    resetBtn(r, () => String(curStyle()[k]) === String(def()), () => { curStyle()[k] = def(); sync(); });
    styleGroup.append(r);
  }
  panel.insertBefore(styleGroup, panel.children[1]);
  const sync = () => {
    for (const [k, el] of Object.entries(inputs)) {
      if (el.type === 'checkbox') (el as HTMLInputElement).checked = !!T[k];
      else el.value = k === 'ink' ? '#' + T[k] : String(T[k]);
      if (el.out) el.out.value = String(T[k]);
    }
    styleTitle.textContent = `Style (${PAGE_NAMES[desk.page]} page)`;
    for (const [k, el] of Object.entries(styleInputs)) {
      const v = curStyle()[k];
      el.value = k === 'ink' || k === 'bg' ? '#' + v : String(v);
      if (el.out) el.out.value = String(v);
    }
    refresh();
  };
  desk.tweakSync = sync;
  const bar = Object.assign(document.createElement('div'), { className: 'tweak-bar' });
  const copy = Object.assign(document.createElement('button'), { textContent: 'copy link' });
  copy.onclick = async () => {
    const q = new URLSearchParams([...Object.keys(DEFAULTS).map((k) => [k, String(T[k])]),
      ...PAGE_NAMES.flatMap((pg) => Object.keys(STYLE_DEFAULTS[pg]).map((k) => [`${pg}.${k}`, String(STYLE[pg][k])]))]);
    const url = `${location.origin}${location.pathname}?${q}${location.hash}`;
    history.replaceState(history.state, '', url);
    try { await navigator.clipboard.writeText(url); copy.textContent = 'copied'; } catch { copy.textContent = 'in the address bar'; }
    setTimeout(() => (copy.textContent = 'copy link'), 1400);
  };
  const reset = Object.assign(document.createElement('button'), { textContent: 'reset' });
  reset.onclick = () => {
    const before = RESEED.map((k) => T[k]).join();
    Object.assign(T, BASE);
    for (const pg of PAGE_NAMES) Object.assign(STYLE[pg], STYLE_BASE[pg]);
    colors.reset();
    sync();
    if (desk.gpu && before !== RESEED.map((k) => T[k]).join()) reseed();
  };
  const replay = Object.assign(document.createElement('button'), { textContent: 'replay intro' });
  replay.onclick = () => drawFrom(desk.page, { delay: INTRO_DELAY }); // starts over from bare paper
  bar.append(copy, reset, replay, ...(colors.save ? [colors.save] : []));
  panel.append(colors.group, bar);
  // Live readout of the frame interval from requestAnimationFrame, twice a second.
  const perf = panel.querySelector<HTMLElement>('.tweak-perf')!;
  setInterval(() => {
    if (panel.hidden) return;
    const iv = [...stats.intervals].slice(-60).sort((a, b) => a - b), med = iv[iv.length >> 1] || 0;
    perf.textContent = `${med ? (1000 / med).toFixed(0) : '-'} fps · frame ${med.toFixed(1)} ms${Q.gpuMs ? ` · GPU ${Q.gpuMs.toFixed(1)} ms` : ''}\n` +
      (desk.sim ? `${autoOn() ? `auto: ${Q.tier.name} tier, ` : ''}${(activeAgents(desk.sim) / 1000).toFixed(0)}k agents, sim ${desk.sim.W}x${desk.sim.H}` : '');
  }, 500);
  addEventListener('keydown', (e) => {
    if (e.key === 't' && !e.metaKey && !e.ctrlKey && !/INPUT|SELECT|TEXTAREA/.test(String(document.activeElement?.tagName))) panel.hidden = !panel.hidden;
  });
  sync();
  body.append(panel);
}
return { tweakPanel };
}
