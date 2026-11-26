import type { Desk } from './state.ts';
import type { Row } from './admin.ts';
import { TOK, PAGE_NAMES } from './tunables.ts';
import { HELP } from './help.ts';

// The admin panel's colors: the card text and stock tokens and every card's ink, all live. On the dev server, "save
// colors" writes them (and each page's paper and ink) back into the source (vite.config.ts).
const TOKENS: Record<string, string> = { stock: 'Card stock', stockWarm: 'Polaroid back', film: 'Film', note: 'Sticky note',
  noteStrip: 'Note strip', text: 'Titles', text2: 'Handwriting', body: 'Body text', muted: 'Captions', ink: 'Box veins',
  inkDeep: 'Links', inkLine: 'Drawn lines' }; // the paper is each page's bg
const cssVar = (k: string) => '--' + k.replace(/[A-Z0-9]/g, (m) => '-' + m.toLowerCase()); // text2 -> --text-2

export function colorRows(desk: Desk): Row[] {
  // Card faces and backs are painted once into the atlas: repaint it (not the sim) a moment after a pick.
  let timer = 0;
  const repaint = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!desk.gpu || desk.dead) return;
      const old = desk.shared!.atlas;
      await desk.buildAtlas(desk.gpu);
      old?.destroy(); desk.redraw = true;
    }, 150);
  };
  const tok = TOK as unknown as Record<string, string>;
  const cards = desk.sources.filter((s) => s.key && s.kind !== 'deck' && !s.lid && s.inkHex !== undefined);
  const rows: Row[] = [
    ...Object.entries(TOKENS).map(([k, label], i): Row => ({ key: 'tok.' + k, label, hint: HELP['tok.' + k], def: tok[k].slice(1),
      group: i ? undefined : 'Card text and stock', get: () => tok[k].slice(1),
      set: (v) => { tok[k] = '#' + v; document.documentElement.style.setProperty(cssVar(k), '#' + v); repaint(); } })),
    ...cards.map((s, i): Row => ({ key: `card.${s.key}`, label: s.hit.ariaLabel?.split(':')[0] ?? s.key, hint: HELP['card.ink'],
      def: s.inkHex!, group: i ? undefined : 'Card inks', get: () => s.inkHex!, set: (v) => (s.inkHex = String(v)) })),
  ];
  if (import.meta.env.DEV) rows.push({ key: 'saveColors', label: 'Write colors to source', hint: 'Dev server only.', acts: [{ text: 'Save', run: async (b) => {
    const pages = Object.fromEntries(PAGE_NAMES.map((pg) => [pg, { bg: desk.STYLE[pg].bg, ink: desk.STYLE[pg].ink }]));
    const res = await fetch('/__desk-colors', { method: 'POST', body: JSON.stringify({ tok: Object.fromEntries(Object.keys(TOKENS).map((k) => [k, tok[k]])),
      cards: Object.fromEntries(cards.map((s) => [s.key, { ink: s.inkHex }])), pages }) });
    b.textContent = res.ok ? 'Saved' : 'Failed';
    setTimeout(() => (b.textContent = 'Save'), 2000);
  } }] });
  return rows;
}
