import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { ThemeToggle } from './components/ThemeToggle';
import { pageMeta } from './data/seo';
import CVPage from './pages/CVPage';
import SmokePage from './pages/SmokePage';
import DeskPage from './pages/DeskPage';

const PageTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = pageMeta(pathname).title;
  }, [pathname]);

  return null;
};

const Site = ({ children }: { children: ReactNode }) => (
  <div className="relative flex min-h-screen flex-col">
    <Header />
    <ThemeToggle className="fixed right-5 top-1/2 z-30 h-10 w-10 -translate-y-1/2" />
    {children}
  </div>
);

// The desk is the homepage: / is its main page and /publications its research page, one desk that turns between them.
// It is always the light paper desk, without the site header or theme toggle. Any other address (the old /portfolio
// and /desk among them) goes to the desk.
const deskPaths = ['/', '/publications'];
const sitePages: Record<string, () => ReactNode> = { '/resume': () => <CVPage />, '/smoke': () => <SmokePage /> };

export const AppShell = () => {
  const pathname = useLocation().pathname.replace(/(.)\/+$/, '$1');
  const page = sitePages[pathname];

  return (
    <ThemeProvider>
      <PageTitle />
      {deskPaths.includes(pathname) ? <DeskPage /> : page ? <Site>{page()}</Site> : <Navigate to="/" replace />}
    </ThemeProvider>
  );
};
