import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import HomePage from './pages/HomePage';
import PortfolioPage from './pages/PortfolioPage';
import CVPage from './pages/CVPage';
import PublicationsPage from './pages/PublicationsPage';
import { GameGate } from './components/GameGate';

function App() {
  const [accessGranted, setAccessGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has already won the game
    const unlocked = localStorage.getItem('portfolio_unlocked');
    if (unlocked === 'true') {
      setAccessGranted(true);
    }
    setIsLoading(false);
  }, []);

  const handleWin = () => {
    localStorage.setItem('portfolio_unlocked', 'true');
    setAccessGranted(true);
  };

  if (isLoading) return null;

  return (
    <ThemeProvider>
      {!accessGranted ? (
        <GameGate onWin={handleWin} />
      ) : (
        <BrowserRouter>
          <div className="flex flex-col min-h-screen items-start gap-2.5 p-2.5 
                          bg-white dark:bg-[#0f0f0f] transition-colors duration-300">
            <Header />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/cv" element={<CVPage />} />
              <Route path="/publications" element={<PublicationsPage />} />
            </Routes>
          </div>
        </BrowserRouter>
      )}
    </ThemeProvider>
  );
}

export default App;
