import { memo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { deskFontsUrl } from '../data/seo';
import html from '../desk/desk.html?raw';
import '../desk/desk.css';

// The desk measures its text in its own fonts, so their stylesheet must be in before the desk starts. It stands in for
// the site's Inter sheet (the prerendered /desk already has it); two Inter sheets would fight over the same faces.
const fontSheet = () => {
  let link = document.querySelector<HTMLLinkElement>('link[href^="https://fonts.googleapis.com/css2?family=Inter"]');
  if (link?.getAttribute('href') === deskFontsUrl && link.sheet) return Promise.resolve();
  if (!link) {
    link = Object.assign(document.createElement('link'), { rel: 'stylesheet' });
    document.head.append(link);
  }
  if (link.getAttribute('href') !== deskFontsUrl) link.href = deskFontsUrl;
  const el = link;
  return new Promise<void>((done) => {
    el.addEventListener('load', () => done(), { once: true });
    el.addEventListener('error', () => done(), { once: true });
  });
};

// The markup is set once; the desk script owns it from then on.
const markup = { __html: html };

// The homepage: the desk mockup's markup and script, as is, at / (the desk) and /publications (research). The markup is
// prerendered (crawlers read it); the script draws the WebGPU desk over it, turns between its pages through the router,
// and leaving the desk tears it down.
const DeskPage = () => {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const router = useRef({ navigate, location });
  useEffect(() => {
    router.current = { navigate, location };
  });

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
      if (!gone)
        destroy = mountDesk(root, {
          push: (path, state) => router.current.navigate(path, { state }),
          state: () => router.current.location.state,
        });
    });
    return () => {
      gone = true;
      destroy?.();
    };
  }, []);

  return <div id="desk" className="desk" ref={ref} dangerouslySetInnerHTML={markup} />;
};

// Memoized: the shell re-renders on every location change. The desk's own page turns re-render it too (it reads the
// router), but the markup string is unchanged, so React leaves the DOM the desk script is drawing on alone.
export default memo(DeskPage);
