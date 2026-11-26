import type { Desk } from './state.ts';
import type { Row } from './admin.ts';

// The admin panel's card text: every card's title, subtitle, handwriting and back, live (the cards are laid out and
// painted again a moment after an edit; the slime keeps running). On the dev server, "Write text to source" puts the
// edits back into desk.html (vite.config.ts). A line break is a new line in the box. A card's title also names its
// button (its aria-label), so a rename carries there too.
const PARTS = '.cap b, .cap span, .hand, .hit > b, .hit > small, .back p';
const read = (e: Element) => [...e.childNodes].map((n) => (n.nodeName === 'BR' ? '\n' : n.textContent)).join('');
const attr = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const html = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

export function textRows(desk: Desk): Row[] {
  let timer = 0;
  const redo = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      for (const s of desk.sources) if (s.backEl) s.backParas = [...s.backEl.querySelectorAll('p')].map((p) => p.textContent!);
      desk.layout();
      if (!desk.gpu || desk.dead) return;
      const old = desk.shared!.atlas;
      await desk.buildAtlas(desk.gpu);
      old?.destroy(); desk.redraw = true;
    }, 250);
  };
  const rows: Row[] = [], edits: { key: string; from: string; to: () => string }[] = [];
  for (const s of desk.sources) {
    if (!s.key || s.kind === 'deck' || s.lid) continue;
    const els = s.kind === 'note' ? [s.hit, ...s.el.querySelectorAll('.back p')] : [...s.el.querySelectorAll(PARTS)];
    els.forEach((e, i) => {
      const def = read(e), title = e.matches('.cap b, .hit > b'), label = e === s.hit ? 'Note' : e.closest('.back') ? 'Back' : title ? 'Title' : 'Under it';
      const get = () => read(e), aria = s.hit.ariaLabel ?? '', rest = aria.startsWith(def + ':') ? aria.slice(def.length) : null;
      rows.push({ key: `text.${s.key}.${i}`, label, def, text: true, group: i ? undefined : aria.split(': show')[0] || s.key, get,
        set: (v) => { e.innerHTML = html(String(v)); if (title && rest) s.hit.ariaLabel = v + rest; redo(); } });
      edits.push({ key: s.key, from: `>${html(def)}<`, to: () => `>${html(get())}<` });
      if (title && rest) edits.push({ key: s.key, from: `aria-label="${attr(def)}:`, to: () => `aria-label="${attr(get())}:` });
    });
  }
  if (import.meta.env.DEV) rows.unshift({ key: 'saveText', label: 'Write text to source', hint: 'Dev server only: puts the edits into desk.html.', acts: [{ text: 'Save', run: async (b) => {
    const res = await fetch('/__desk-text', { method: 'POST', body: JSON.stringify(edits.filter((x) => x.to() !== x.from).map((x) => ({ key: x.key, from: x.from, to: x.to() }))) });
    b.textContent = res.ok ? 'Saved' : 'Failed';
    if (!res.ok) console.warn('[text]', await res.text());
    setTimeout(() => (b.textContent = 'Save'), 2000);
  } }] });
  return rows;
}
