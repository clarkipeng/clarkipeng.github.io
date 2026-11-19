import { useEffect, useRef } from 'react';
import { deskFontsUrl } from '../data/seo';
import html from '../desk/desk.html?raw';
import '../desk/desk.css';

// The desk measures its note text in Caveat, so the font's stylesheet must be in before the desk starts.
const fontSheet = () => {
  let link = document.querySelector<HTMLLinkElement>(`link[href="${deskFontsUrl}"]`);
  if (link?.sheet) return Promise.resolve();
  if (!link) {
    link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: deskFontsUrl });
    document.head.append(link);
  }
  const el = link;
  return new Promise<void>((done) => {
    el.addEventListener('load', () => done(), { once: true });
    el.addEventListener('error', () => done(), { once: true });
  });
};

// /desk: the desk mockup's markup and script, as is. The markup is prerendered (crawlers read it); the script draws the
// WebGPU desk over it, and leaving the page tears it down.
const DeskPage = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // A second mount on the same element (StrictMode) starts from the untouched markup.
    if (root.dataset.mounted) {
      root.className = 'desk';
      root.innerHTML = html;
    }
    root.dataset.mounted = '1';
    let destroy: (() => void) | undefined;
    let gone = false;
    Promise.all([import('../desk/desk.js'), fontSheet()]).then(([{ mountDesk }]) => {
      if (!gone) destroy = mountDesk(root);
    });
    return () => {
      gone = true;
      destroy?.();
    };
  }, []);

  return <div id="desk" className="desk" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default DeskPage;
