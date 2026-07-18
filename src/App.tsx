import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { ThemeToggle } from './components/ThemeToggle';
import HomePage from './pages/HomePage';
import PortfolioPage from './pages/PortfolioPage';
import CVPage from './pages/CVPage';
import PublicationsPage from './pages/PublicationsPage';
import SmokePage from './pages/SmokePage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="relative z-10 flex min-h-screen flex-col">
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
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
