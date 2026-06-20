import { Link, NavLink } from 'react-router-dom';
import { navigation, siteConfig } from '../data/siteData';
import { pageBackground } from '../data/theme';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';

export const Header = () => {
  const { isDark } = useTheme();

  return (
    <header className={`sticky top-0 z-40 w-full border-b border-black/10 bg-[#fbfbfa]/90 backdrop-blur dark:border-white/15 dark:bg-[#050505]/90 ${pageBackground}`}>
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-5 px-5 sm:px-8">
        <Link
          to="/"
          className="shrink-0 font-sans text-sm font-medium uppercase text-[#202020] no-underline hover:opacity-70 dark:text-[#f5f5f2]"
        >
          {siteConfig.wordmark}
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                `${item.href === '/' ? 'hidden sm:inline-flex' : 'inline-flex'} rounded-full px-2.5 py-2 font-sans text-sm no-underline transition duration-200 hover:bg-black/5 sm:px-3 dark:hover:bg-white/10 ${
                  isActive
                    ? 'text-[#202020] dark:text-white'
                    : 'text-[#6c6c64] dark:text-[#b9b9b0]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          {isDark && (
            <NavLink
              to="/smoke"
              className={({ isActive }) =>
                `hidden rounded-full px-3 py-2 font-sans text-sm no-underline transition duration-200 hover:bg-white/10 sm:inline-flex ${
                  isActive ? 'text-white' : 'text-[#b9b9b0]'
                }`
              }
            >
              Smoke
            </NavLink>
          )}

          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
};
