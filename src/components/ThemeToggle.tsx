import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme();
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      onClick={toggleTheme}
      className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/60 text-[#202020] transition duration-200 hover:border-black/25 hover:bg-white active:scale-[0.98] dark:border-white/15 dark:bg-white/5 dark:text-[#f5f5f2] dark:hover:border-white/30 dark:hover:bg-white/10"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      type="button"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
};
