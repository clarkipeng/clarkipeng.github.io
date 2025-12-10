// ============================================
// THEME CONFIGURATION
// Edit this file to customize colors and styles!
// ============================================

// === COLOR PALETTE ===
// Primary colors used throughout the site
export const colors = {
  // Primary brand color (used for buttons, accents)
  primary: {
    DEFAULT: '#FF9D9D',      // Warm pink/coral - primary color
    hover: '#FF8080',        // Darker pink - hover
    text: '#000000',         // Black - text on primary buttons
  },

  // Dark mode inverse
  primaryDark: {
    DEFAULT: '#FF9D9D',      // Same primary in dark mode
    hover: '#FFBABA',        // Lighter hover in dark
    text: '#000000',         // Black text
  },

  // Secondary/accent colors
  secondary: {
    DEFAULT: '#FFEEAA',      // Soft yellow
    hover: '#FFE680',
  },

  // Text colors
  text: {
    primary: '#000000',      // Main text
    secondary: '#757575',    // Muted text
    muted: '#9CA3AF',        // Very muted
  },

  // Background colors
  background: {
    DEFAULT: '#FFFFFF',      // Main background
    card: '#FFFFFF',         // Card backgrounds
    hover: '#F9FAFB',        // Hover state backgrounds
  },

  // Border colors
  border: {
    DEFAULT: '#E5E7EB',      // Standard borders
    hover: '#D1D5DB',        // Hover state borders
  },

  // Tag colors
  tag: {
    background: '#F3F4F6',   // Tag background
    text: '#4B5563',         // Tag text
  },
};

// === BUTTON STYLES ===
// Customize button appearance
// Bigger buttons with more internal padding
export const buttonStyles = {
  // Primary button (Repository, Paper, etc.)
  // Uses primary color, same in dark mode
  // Button size is DECOUPLED from text size via min-h and min-w
  primary: {
    base: `
      inline-flex items-center justify-center
      min-h-[48px] min-w-[120px]
      px-6
      text-xs font-medium
      rounded-lg 
      transition-all duration-200
      hover:shadow-md
    `,
    // Primary color (pink), dark text
    colors: `
      bg-[#FF9D9D] text-black 
      hover:bg-[#FF8080]
      dark:bg-[#1a1a1a] dark:text-white dark:border dark:border-gray-700
      dark:hover:bg-[#2d2d2d]
    `,
  },

  // Secondary/outline button
  secondary: {
    base: `
      py-3 px-5
      text-sm font-medium 
      rounded-md 
      border 
      transition-all duration-200
    `,
    colors: `
      bg-white text-black border-gray-300
      hover:bg-gray-50 hover:border-gray-400
      dark:bg-gray-800 dark:text-white dark:border-gray-600
      dark:hover:bg-gray-700
    `,
  },

  // Ghost button (minimal)
  ghost: {
    base: `
      py-2 px-4
      text-sm font-medium 
      rounded-md 
      transition-all duration-200
    `,
    colors: `
      bg-transparent text-gray-600
      hover:bg-gray-100 hover:text-gray-900
      dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white
    `,
  },
};

// === SECTION PADDING ===
// 5px padding for sections
export const sectionPadding = 'p-[5px]';

// === CARD STYLES ===
export const cardStyles = {
  base: `
    !p-12
    bg-white dark:bg-[#1a1a1a]
    rounded-lg border border-gray-200 dark:border-gray-700
    transition-all duration-300
    hover:shadow-lg dark:hover:shadow-gray-900/50
  `,
  // Helper for flex-row layout (like in Portfolio)
  row: `
    flex flex-col lg:flex-row gap-6
  `,
  // Helper for column layout (like in CV/Publications)
  col: `
    flex flex-col gap-3
  `,
};

// === TAG STYLES ===
export const tagStyles = {
  base: `
    px-2.5 py-1 
    text-xs font-medium 
    rounded-md
  `,
  colors: `
    bg-gray-100 dark:bg-gray-800
    text-gray-600 dark:text-gray-300
  `,
};

// === TYPOGRAPHY ===
export const typography = {
  fontFamily: "'Space Grotesk', Helvetica, sans-serif",

  // Font sizes (in pixels)
  sizes: {
    h1: 36,
    h2: 24,
    h3: 20,
    h4: 16,
    h5: 12,
    paragraph: 20,
  },
};

// === HELPER: Get combined button classes ===
export const getButtonClass = (variant: 'primary' | 'secondary' | 'ghost' = 'primary') => {
  const style = buttonStyles[variant];
  return `${style.base} ${style.colors}`.replace(/\s+/g, ' ').trim();
};

// === HELPER: Get combined card classes ===
export const getCardClass = (layout: 'row' | 'col' = 'col') => {
  return `${cardStyles.base} ${cardStyles[layout]}`.replace(/\s+/g, ' ').trim();
};
