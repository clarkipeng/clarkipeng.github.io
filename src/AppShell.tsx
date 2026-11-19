import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { ThemeToggle } from './components/ThemeToggle';
import { pageMeta } from './data/seo';
import HomePage from './pages/HomePage';
import PortfolioPage from './pages/PortfolioPage';
import CVPage from './pages/CVPage';
import PublicationsPage from './pages/PublicationsPage';
import SmokePage from './pages/SmokePage';
import DeskPage from './pages/DeskPage';

const PageTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = pageMeta(pathname).title;
  }, [pathname]);

  return null;
};

const Site = () => (
  <div className="relative flex min-h-screen flex-col">
    <Header />
    <ThemeToggle className="fixed right-5 top-1/2 z-30 h-10 w-10 -translate-y-1/2" />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/portfolio" element={<PortfolioPage />} />
      <Route path="/resume" element={<CVPage />} />
      <Route path="/publications" element={<PublicationsPage />} />
      <Route path="/smoke" element={<SmokePage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  </div>
);

// The desk is its own page: always the light paper desk, without the site header or theme toggle.
export const AppShell = () => {
  const { pathname } = useLocation();

  return (
    <ThemeProvider>
      <PageTitle />
      {pathname === '/desk' ? <DeskPage /> : <Site />}
    </ThemeProvider>
  );
};
