import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { pageBackground } from './data/theme';
import HomePage from './pages/HomePage';
import PortfolioPage from './pages/PortfolioPage';
import CVPage from './pages/CVPage';
import PublicationsPage from './pages/PublicationsPage';
import SmokePage from './pages/SmokePage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className={`flex min-h-screen flex-col ${pageBackground}`}>
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/cv" element={<CVPage />} />
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
