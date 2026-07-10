import { createContext, useContext, useState, useEffect, useRef } from 'react';
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
    showSmoke: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
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
    const [shaderTransition, setShaderTransition] = useState<ThemeShaderTransition | null>(null);
    const [showSmoke, setShowSmoke] = useState(theme === 'dark');
    const transitionTimeoutRef = useRef<number | null>(null);

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
        const root = document.documentElement;
        if (transitionTimeoutRef.current) window.clearTimeout(transitionTimeoutRef.current);

        if (!shaderTransition) {
            root.classList.remove('theme-text-adaptive');
            root.style.removeProperty('--adaptive-text-color');
            return;
        }

        root.classList.add('theme-text-adaptive');
        root.style.setProperty('--adaptive-text-color', shaderTransition.to === 'dark' ? '#fafaf7' : '#dbdbda');
        transitionTimeoutRef.current = window.setTimeout(() => {
            setShaderTransition(null);
            setShowSmoke(shaderTransition.to === 'dark');
            root.classList.remove('theme-text-adaptive');
            root.style.removeProperty('--adaptive-text-color');
        }, shaderTransition.duration + 120);

        return () => {
            if (transitionTimeoutRef.current) window.clearTimeout(transitionTimeoutRef.current);
        };
    }, [shaderTransition]);

    const toggleTheme = (origin?: ThemeOrigin) => {
        const nextTheme = theme === 'light' ? 'dark' : 'light';

        if (typeof window === 'undefined') {
            setTheme(nextTheme);
            return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const root = document.documentElement;
        const transitionOrigin = origin ?? {
            x: window.scrollX + window.innerWidth / 2,
            y: window.scrollY + window.innerHeight / 2,
        };

        if (!prefersReducedMotion) {
            root.classList.add('theme-text-adaptive');
            root.style.setProperty('--adaptive-text-color', nextTheme === 'dark' ? '#fafaf7' : '#dbdbda');
            if (nextTheme === 'dark') setShowSmoke(false);
            setShaderTransition({
                id: Date.now(),
                from: theme,
                to: nextTheme,
                origin: transitionOrigin,
                duration: 1800,
            });
        } else {
            setShaderTransition(null);
            setShowSmoke(nextTheme === 'dark');
        }

        setTheme(nextTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark', showSmoke }}>
            <ThemeShaderCanvas transition={shaderTransition} onSmokeReach={(reachedTheme) => setShowSmoke(reachedTheme === 'dark')} />
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
