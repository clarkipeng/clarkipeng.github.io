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

const PageTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = pageMeta(pathname).title;
  }, [pathname]);

  return null;
};

export const AppShell = () => (
  <ThemeProvider>
    <PageTitle />
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
  </ThemeProvider>
);
