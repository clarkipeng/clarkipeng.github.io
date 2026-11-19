// The tune panel (press t; only loaded with ?tune): a slider per tunable, the current page's style, a copy-link and a
// reset button. Everything applies live; the agent count and sim resolution re-seed the sim.
import { CHOICES, GROUPS, J_KEYS, PRINTS, RESEED, STYLE_PARAMS, type Param } from './params';

type TuneContext = {
  host: HTMLElement; signal: AbortSignal; T: Record<string, number>; TS: Record<string, string>;
  style: () => Record<string, number | string>; pageName: () => string;
  applyLook: (name: string) => void; reseed: () => void; perf: () => string;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}) => Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
type Input = (HTMLInputElement | HTMLSelectElement) & { out?: HTMLOutputElement; row?: HTMLLabelElement };

// One control: a select for choices, a color picker for colors, a checkbox for 0/1 switches, else a slider.
function control([k, d, min, max, step, label]: Param, onInput: (v: number | string) => void): Input {
  let input: Input, out: HTMLOutputElement | undefined;
  if (CHOICES[k]) {
    input = el('select');
    for (const m of CHOICES[k]) input.append(new Option(m, m));
    input.oninput = () => onInput(input.value);
  } else if (k === 'ink' || k === 'bg') {
    input = el('input', { type: 'color' });
    input.oninput = () => onInput(input.value.slice(1));
  } else if (step === 1 && max === 1 && typeof d === 'number') {
    const box = el('input', { type: 'checkbox' });
    input = box;
    input.oninput = () => onInput(box.checked ? 1 : 0);
  } else {
    input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    out = el('output');
    input.oninput = () => { onInput(+input.value); out!.value = input.value; };
  }
  const row = el('label');
  row.append(el('span', { textContent: label }), input);
  if (out) row.append(out);
  return Object.assign(input, { out, row });
}
const show = (input: Input, v: number | string) => {
  if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = !!v;
  else input.value = input instanceof HTMLInputElement && input.type === 'color' ? '#' + v : String(v);
  if (input.out) input.out.value = String(v);
};

export function tunePanel(c: TuneContext) {
  const { T, TS } = c;
  const panel = el('div', { className: 'tweak', hidden: true });
  const inputs: Record<string, Input> = {};
  let timer = 0;
  const reseedSoon = () => { clearTimeout(timer); timer = window.setTimeout(c.reseed, 300); };
  const set = (k: string, v: number | string) => {
    const before = RESEED.map((r) => T[r]).join();
    if (typeof v === 'string') TS[k] = v; else T[k] = v;
    if (k === 'print') Object.assign(T, PRINTS[v]); // a preset sets the print knobs
    if (k === 'look') c.applyLook(String(v));
    if (k === 'print' || k === 'look') sync();
    if (before !== RESEED.map((r) => T[r]).join()) reseedSoon();
  };
  for (const [name, params] of Object.entries(GROUPS)) {
    const group = el('details', { open: name === 'Agents' || name === 'Card outlines' });
    group.append(el('summary', { textContent: name }));
    if (name === 'Performance') group.append(el('div', { className: 'tweak-perf' }));
    for (const p of params) { inputs[p[0]] = control(p, (v) => set(p[0], v)); group.append(inputs[p[0]].row!); }
    panel.append(group);
  }
  // Style: the current page's own surface and ink.
  const styleGroup = el('details', { open: true });
  const styleTitle = el('summary');
  styleGroup.append(styleTitle);
  const styleInputs: Record<string, Input> = {};
  for (const p of STYLE_PARAMS) {
    styleInputs[p[0]] = control(p, (v) => { c.style()[p[0]] = v; if (p[0] === 'mode') sync(); });
    styleGroup.append(styleInputs[p[0]].row!);
  }
  panel.insertBefore(styleGroup, panel.children[1]);
  // Each mode shows only the controls that do something in it.
  const SHOWN: Record<string, (k: string) => boolean> = {
    paper: (k) => !J_KEYS.includes(k),
    spectrum: (k) => !J_KEYS.includes(k) && !['ink', 'grain', 'tint', 'hueMix'].includes(k),
    j: (k) => !['tint', 'hueMix', 'gamma', 'soft', 'grain', 'glow', 'halo'].includes(k),
  };
  const sync = () => {
    for (const [k, input] of Object.entries(inputs)) show(input, k in TS ? TS[k] : T[k]);
    styleTitle.textContent = `Style (${c.pageName()} page)`;
    const st = c.style();
    for (const [k, input] of Object.entries(styleInputs)) { input.row!.hidden = !SHOWN[String(st.mode)](k); show(input, st[k]); }
  };
  const bar = el('div', { className: 'tweak-bar' });
  const copy = el('button', { textContent: 'copy link' });
  copy.onclick = async () => {
    const q = new URLSearchParams([['tune', ''], ...Object.entries(TS), ...Object.entries(T).map(([k, v]) => [k, String(v)]),
      ...Object.entries(c.style()).map(([k, v]) => [`${c.pageName()}.${k}`, String(v)])]);
    const url = `${location.origin}${location.pathname}?${q}`;
    history.replaceState(history.state, '', url);
    try { await navigator.clipboard.writeText(url); copy.textContent = 'copied'; } catch { copy.textContent = 'in the address bar'; }
    setTimeout(() => (copy.textContent = 'copy link'), 1400);
  };
  const reset = el('button', { textContent: 'reset' });
  reset.onclick = () => { location.href = `${location.pathname}?tune`; };
  bar.append(copy, reset);
  panel.append(bar);
  const perf = panel.querySelector('.tweak-perf')!;
  const tick = setInterval(() => { if (!panel.hidden) perf.textContent = c.perf(); }, 500);
  addEventListener('keydown', (e) => {
    if (e.key === 't' && !e.metaKey && !e.ctrlKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) panel.hidden = !panel.hidden;
  }, { signal: c.signal });
  c.signal.addEventListener('abort', () => { clearInterval(tick); panel.remove(); });
  sync();
  c.host.append(panel);
  return sync;
}
