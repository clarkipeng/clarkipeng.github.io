import { Link, NavLink } from 'react-router-dom';
import { navigation, siteConfig } from '../data/siteData';
import { pageBackground } from '../data/theme';
import { useTheme } from '../context/ThemeContext';

export const Header = () => {
  const { isDark, showSmoke } = useTheme();

  return (
    <header className={`w-full ${pageBackground}`}>
      <div className="mx-auto flex min-h-14 w-full max-w-[980px] items-center justify-between gap-5 px-5 sm:px-8">
        <Link
          to="/"
          className="shrink-0 font-sans text-sm font-medium uppercase text-[#202020] no-underline hover:text-[#676760] dark:text-[#f5f5f2] dark:hover:text-[#b9b9b0]"
        >
          {siteConfig.wordmark}
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                `${item.href === '/' ? 'hidden sm:inline-flex' : 'inline-flex'} border-b py-1 font-sans text-sm no-underline transition duration-200 ${
                  isActive
                    ? 'border-[#202020] text-[#202020] dark:border-white dark:text-white'
                    : 'border-transparent text-[#6c6c64] hover:border-black/20 hover:text-[#202020] dark:text-[#b9b9b0] dark:hover:border-white/25 dark:hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <NavLink
            to="/smoke"
            data-smoke-link
            aria-hidden={!showSmoke}
            tabIndex={showSmoke ? undefined : -1}
            className={({ isActive }) =>
              `hidden min-w-11 border-b py-1 text-center font-sans text-sm no-underline transition duration-200 sm:inline-flex ${
                showSmoke
                  ? isActive
                    ? isDark
                      ? 'border-white text-white'
                      : 'border-[#202020] text-[#202020]'
                    : 'border-transparent text-[#6c6c64] hover:border-black/20 hover:text-[#202020] dark:text-[#b9b9b0] dark:hover:border-white/25 dark:hover:text-white'
                  : 'invisible pointer-events-none border-transparent'
              }`
            }
          >
            Smoke
          </NavLink>
        </nav>
      </div>
    </header>
  );
};
