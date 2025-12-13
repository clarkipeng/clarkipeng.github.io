import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import HomePage from './pages/HomePage';
import PortfolioPage from './pages/PortfolioPage';
import CVPage from './pages/CVPage';
import PublicationsPage from './pages/PublicationsPage';
import SmokePage from './pages/SmokePage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="flex flex-col min-h-screen items-start gap-2.5 p-2.5 bg-white dark:bg-[#0f0f0f] transition-colors duration-300">
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/cv" element={<CVPage />} />
            <Route path="/publications" element={<PublicationsPage />} />
            <Route path="/smoke" element={<SmokePage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
