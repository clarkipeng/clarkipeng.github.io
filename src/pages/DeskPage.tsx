import { memo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { deskCards, deskLinks, deskPath, type DeskCard, type DeskRegion } from '../data/desk';
import { siteConfig } from '../data/siteData';
import type { Desk } from '../desk/engine';
import '../desk/desk.css';

const external = (href: string) => (href.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' });

const CardFront = ({ card }: { card: DeskCard }) => {
  if (card.kind === 'note') return <>{card.label}</>;
  return (
    <>
      <img src={card.image} alt={card.alt} draggable={false} />
      {card.kind === 'polaroid' ? (
        <div className="hand">{card.label}</div>
      ) : (
        <div className="cap"><b>{card.label}</b><span>{card.sub}</span></div>
      )}
    </>
  );
};

// The desk's content as plain DOM: the engine positions it, draws it with WebGPU, and keeps it as the accessible text.
// Memoized so React never touches the nodes the engine styles.
const DeskContent = memo(({ smoke }: { smoke: boolean }) => (
  <>
    <canvas className="field" aria-hidden="true" />
    <main className="page">
      <h1 className="name">{siteConfig.name}</h1>
      <p className="tagline">{siteConfig.tagline}</p>
      <nav className="links" aria-label="Elsewhere">
        {deskLinks.map((link) => <a key={link.href} href={link.href} {...external(link.href)}>{link.label}</a>)}
        {smoke && <Link to="/smoke">Smoke</Link>}
      </nav>
      <ul className="sources">
        {deskCards.map((card) => (
          <li key={card.key} className={`src ${card.kind}${card.nav != null ? ' nav' : ''}`}>
            {card.nav != null ? (
              <a className="hit" href={deskPath(card.nav)}>{card.label}</a>
            ) : (
              <div className="hit" role="button" tabIndex={0} aria-expanded="false"
                aria-label={`${card.kind === 'note' ? card.label.replace('\n', ' ') : card.label}: show details`}>
                <CardFront card={card} />
              </div>
            )}
            {card.back && (
              <div className="back">
                {card.back.title && <b>{card.back.title}</b>}
                {card.back.paras.map((p) => <p key={p}>{p}</p>)}
                {card.back.links.map((link) => <a key={link.href} href={link.href} {...external(link.href)}>{link.label}</a>)}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="region-label" aria-hidden="true">research</div>
    </main>
  </>
));

// "/" is the main desk and "/publications" the research desk, one continuous desk that pans between them.
const DeskPage = ({ region }: { region: DeskRegion }) => {
  const root = useRef<HTMLDivElement>(null);
  const desk = useRef<Desk | null>(null);
  const navigate = useNavigate();
  const fromMain = useRef(false);
  const { isDark, showSmoke } = useTheme();
  const state = useRef({ region, isDark, navigate });
  useEffect(() => { state.current = { region, isDark, navigate }; });

  useEffect(() => {
    let live = true;
    import('../desk/engine').then(({ createDesk }) => {
      if (!live || !root.current) return;
      desk.current = createDesk(root.current, {
        cards: deskCards,
        region: state.current.region,
        dark: state.current.isDark,
        navigate: (to) => {
          // Back from research returns through history when we came from the main desk, keeping history tidy.
          if (to === 0 && fromMain.current) { fromMain.current = false; state.current.navigate(-1); return; }
          fromMain.current = to === 1;
          state.current.navigate(deskPath(to));
        },
      });
    }).catch(() => root.current?.classList.add('ready')); // without the engine the content still shows, as a list
    return () => { live = false; desk.current?.destroy(); desk.current = null; };
  }, []);
  useEffect(() => { desk.current?.setRegion(region); }, [region]);
  useEffect(() => { desk.current?.setDark(isDark); }, [isDark]);

  return (
    <div ref={root} className="desk">
      <DeskContent smoke={isDark && showSmoke} />
    </div>
  );
};

export default DeskPage;
