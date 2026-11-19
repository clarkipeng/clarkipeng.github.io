import { useEffect, type ComponentType } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { ThemeToggle } from './components/ThemeToggle';
import { pageMeta } from './data/seo';
import DeskPage from './pages/DeskPage';
import PortfolioPage from './pages/PortfolioPage';
import CVPage from './pages/CVPage';
import SmokePage from './pages/SmokePage';

const PageTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = pageMeta(pathname).title;
  }, [pathname]);

  return null;
};

const otherPages: Record<string, ComponentType> = { '/portfolio': PortfolioPage, '/resume': CVPage, '/smoke': SmokePage };

// "/" and "/publications" are two regions of one desk; it stays mounted between them so the camera can pan.
export const AppShell = () => {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  const onDesk = !otherPages[path];

  return (
    <ThemeProvider>
      <PageTitle />
      <div className="relative flex min-h-screen flex-col">
        {!onDesk && <Header />}
        <ThemeToggle className="fixed right-5 top-1/2 z-30 h-10 w-10 -translate-y-1/2" />
        {onDesk ? (
          <DeskPage region={path === '/publications' ? 1 : 0} />
        ) : (
          <Routes>
            {Object.entries(otherPages).map(([to, Page]) => <Route key={to} path={to} element={<Page />} />)}
          </Routes>
        )}
      </div>
    </ThemeProvider>
  );
};
