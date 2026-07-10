import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle = ({ className = '' }: { className?: string }) => {
  const { isDark, toggleTheme } = useTheme();
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        toggleTheme({
          x: window.scrollX + rect.left + rect.width / 2,
          y: window.scrollY + rect.top + rect.height / 2,
        });
      }}
      className={`inline-flex h-8 w-8 items-center justify-center text-[#202020] transition duration-200 hover:text-[#676760] active:scale-[0.98] dark:text-[#f5f5f2] dark:hover:text-[#b9b9b0] ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      type="button"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
};
