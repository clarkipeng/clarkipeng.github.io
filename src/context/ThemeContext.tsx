import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ThemeShaderCanvas } from '../components/ThemeShaderCanvas';
import type { ThemeShaderTransition } from '../components/ThemeShaderCanvas';

type Theme = 'light' | 'dark';
type ThemeOrigin = {
    x: number;
    y: number;
};

interface ThemeContextType {
    theme: Theme;
    toggleTheme: (origin?: ThemeOrigin) => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getTransitionRadius = (origin: ThemeOrigin) => Math.ceil(Math.max(
    Math.hypot(origin.x, origin.y),
    Math.hypot(window.innerWidth - origin.x, origin.y),
    Math.hypot(origin.x, window.innerHeight - origin.y),
    Math.hypot(window.innerWidth - origin.x, window.innerHeight - origin.y),
));

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [shaderTransition, setShaderTransition] = useState<ThemeShaderTransition | null>(null);

    // Check localStorage and system preference on mount
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme') as Theme;
            if (saved) return saved;

            // Check system preference
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        }
        return 'light';
    });

    useEffect(() => {
        // Update document class and localStorage
        const root = document.documentElement;

        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (!shaderTransition) return;

        const timeout = window.setTimeout(() => setShaderTransition(null), shaderTransition.duration + 180);
        return () => window.clearTimeout(timeout);
    }, [shaderTransition]);

    const toggleTheme = (origin?: ThemeOrigin) => {
        const nextTheme = theme === 'light' ? 'dark' : 'light';

        if (typeof window === 'undefined') {
            setTheme(nextTheme);
            return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const transitionOrigin = origin ?? {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        };

        if (!prefersReducedMotion) {
            setShaderTransition({
                id: Date.now(),
                from: theme,
                to: nextTheme,
                origin: transitionOrigin,
                radius: getTransitionRadius(transitionOrigin),
                feather: window.innerWidth < 640 ? 80 : 120,
                duration: 700,
            });
        } else {
            setShaderTransition(null);
        }

        setTheme(nextTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
            <ThemeShaderCanvas transition={shaderTransition} />
            {children}
        </ThemeContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
