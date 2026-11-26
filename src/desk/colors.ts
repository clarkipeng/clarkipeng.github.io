import type { Desk } from './state.ts';
import { TOK, PAGE_NAMES } from './tunables.ts';
import { HELP } from './help.ts';

// The tweak panel's colors: a picker for every card's own colors and for the card text and stock, all live. On the dev
// server, "save colors" writes them (and each page's background and ink) back into the source (vite.config.ts).
const CARD_COLORS = [['hueHex', 'hue', 'own color'], ['inkHex', 'ink', 'ink when open'], ['jinkHex', 'jink', 'ink on the J desk']] as const;
const TOKENS = Object.keys(TOK).filter((k) => String(TOK[k as keyof typeof TOK]).startsWith('#') && k !== 'paper'); // the paper is each page's bg
const cssVar = (k: string) => '--' + k.replace(/[A-Z0-9]/g, (m) => '-' + m.toLowerCase()); // text2 -> --text-2

export function colorsGroup(desk: Desk, resetBtn: (row: HTMLElement, isDefault: () => boolean, reset: () => void) => void) {
  const group = document.createElement('details');
  group.append(Object.assign(document.createElement('summary'), { textContent: 'Colors' }));
  // Card faces and backs are painted once into the atlas: repaint it (not the sim) a moment after a pick.
  let timer = 0;
  const undo: (() => void)[] = []; // every pick's reset, for the panel's overall reset
  const repaint = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!desk.gpu || desk.dead) return;
      const old = desk.shared!.atlas;
      await desk.buildAtlas(desk.gpu);
      old?.destroy(); desk.redraw = true;
    }, 150);
  };
  const row = (label: string, hex: string, help: string, set: (hex: string) => void) => {
    const r = Object.assign(document.createElement('label'), { title: HELP[help] ?? '' }), input = Object.assign(document.createElement('input'), { type: 'color', value: '#' + hex });
    input.oninput = () => set(input.value.slice(1));
    r.append(Object.assign(document.createElement('span'), { textContent: label }), input);
    const reset = () => { if (input.value !== '#' + hex) { input.value = '#' + hex; set(hex); } };
    resetBtn(r, () => input.value === '#' + hex, reset);
    undo.push(reset);
    group.append(r);
    return r;
  };
  const heading = (text: string) => group.append(Object.assign(document.createElement('h4'), { textContent: text }));
  const tok = TOK as unknown as Record<string, string>;
  heading('card text and stock');
  for (const k of TOKENS) row(k, tok[k].slice(1), 'tok.' + k, (v) => { tok[k] = '#' + v; document.documentElement.style.setProperty(cssVar(k), '#' + v); repaint(); });
  const jinks: HTMLElement[] = []; // shown only while a page uses the j style, the only place jink shows
  for (const s of desk.sources) {
    if (!s.key || s.kind === 'deck' || s.lid) continue;
    heading(s.key);
    for (const [field, attr, label] of CARD_COLORS) {
      if (s[field] === undefined) continue;
      const r = row(label, s[field]!, 'card.' + attr, (v) => { s[field] = v; if (field === 'hueHex') repaint(); }); // the hue also tints the card's stamp
      if (field === 'jinkHex') jinks.push(r);
    }
  }
  const save = import.meta.env.DEV ? Object.assign(document.createElement('button'), { textContent: 'save colors' }) : null;
  if (save) {
    save.onclick = async () => {
      const cards = Object.fromEntries(desk.sources.filter((s) => s.key && s.kind !== 'deck' && !s.lid)
        .map((s) => [s.key, Object.fromEntries(CARD_COLORS.filter(([f]) => s[f] !== undefined).map(([f, attr]) => [attr, s[f]]))]));
      const pages = Object.fromEntries(PAGE_NAMES.map((pg) => [pg, { bg: desk.STYLE[pg].bg, ink: desk.STYLE[pg].ink }]));
      const res = await fetch('/__desk-colors', { method: 'POST', body: JSON.stringify({ tok: Object.fromEntries(TOKENS.map((k) => [k, tok[k]])), cards, pages }) });
      save.textContent = res.ok ? 'saved' : `save failed: ${await res.text()}`;
      setTimeout(() => (save.textContent = 'save colors'), 2000);
    };
  }
  const refresh = () => { const j = PAGE_NAMES.some((pg) => desk.STYLE[pg].mode === 'j'); for (const r of jinks) r.hidden = !j; };
  return { group, save, refresh, reset: () => undo.forEach((f) => f()) };
}
