import { Link, NavLink } from 'react-router-dom';
import { navigation, siteConfig } from '../data/siteData';
import { useTheme } from '../context/ThemeContext';

export const Header = () => {
  const { isDark, showSmoke } = useTheme();

  return (
    <header className="relative z-20 w-full text-white mix-blend-difference">
      <div className="mx-auto flex min-h-14 w-full max-w-[980px] items-center justify-between gap-5 px-5 sm:px-8">
        <Link
          to="/"
          className="shrink-0 font-sans text-sm font-medium uppercase text-white no-underline hover:text-white/70"
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
                    ? 'border-white text-white'
                    : 'border-transparent text-white/65 hover:border-white/25 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <NavLink
            to="/smoke"
            data-smoke-link
            aria-hidden={!isDark || !showSmoke}
            tabIndex={isDark && showSmoke ? undefined : -1}
            className={({ isActive }) =>
              `hidden min-w-11 border-b py-1 text-center font-sans text-sm no-underline transition duration-200 sm:inline-flex ${
                !isDark
                  ? 'border-transparent text-white opacity-0 pointer-events-none'
                  : showSmoke
                  ? isActive
                    ? 'border-white text-white'
                    : 'border-transparent text-white/65 hover:border-white/25 hover:text-white'
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
