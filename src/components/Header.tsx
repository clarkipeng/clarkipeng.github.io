import { Link, useLocation } from 'react-router-dom';
import { navigation, siteConfig } from '../data/siteData';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';

// Header Component - reusable across pages
export const Header = () => {
    const location = useLocation();
    const { isDark } = useTheme();

    return (
        <header className="flex h-20 items-center gap-2.5 px-[50px] py-2.5 w-full 
                       bg-white dark:bg-[#0f0f0f] transition-colors duration-300">
            <div className="flex w-[230px] h-[73px] items-center justify-center gap-2.5 px-[63px] py-[27px]">
                <Link
                    to="/"
                    className="font-h1 text-black dark:text-white text-[36px] 
                     hover:opacity-70 transition-opacity whitespace-nowrap"
                >
                    {siteConfig.name}
                </Link>
            </div>

            <nav
                className="flex flex-1 items-center justify-between px-[50px] py-2.5"
                role="navigation"
                aria-label="Main navigation"
            >
                <div className="flex items-center gap-8">
                    {navigation.map((item) => (
                        <Link
                            key={item.label}
                            to={item.href}
                            className={`font-h4 text-[16px] hover:opacity-70 transition-opacity ${location.pathname === item.href
                                ? 'text-black dark:text-white font-medium'
                                : 'text-gray-600 dark:text-gray-400'
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                    {isDark && (
                        <Link
                            to="/smoke"
                            className={`font-h4 text-[16px] hover:opacity-70 transition-opacity ${location.pathname === '/smoke'
                                ? 'text-white font-medium'
                                : 'text-gray-400'
                                }`}
                        >
                            Smoke
                        </Link>
                    )}
                </div>

                {/* Dark Mode Toggle */}
                <ThemeToggle />
            </nav>
        </header>
    );
};
