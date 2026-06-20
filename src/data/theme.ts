export const transitions = {
  theme: 'transition-colors duration-300',
  interactive: 'transition-all duration-200 ease-out',
};

export const pageBackground = `bg-[#fbfbfa] text-[#202020] dark:bg-[#050505] dark:text-[#f5f5f2] ${transitions.theme}`;

export const contentMeasure = 'mx-auto w-full max-w-3xl px-5 sm:px-8';
export const wideMeasure = 'mx-auto w-full max-w-5xl px-5 sm:px-8';

export const getButtonClass = (variant: 'primary' | 'secondary' | 'ghost' = 'primary') => {
  const base = 'inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm no-underline transition duration-200 ease-out active:scale-[0.98]';
  const variants = {
    primary: 'bg-[#e7ebe2] !text-[#202020] hover:bg-[#dde5d6] dark:bg-[#f1f1ed] dark:!text-[#101010] dark:hover:bg-white',
    secondary: 'border border-black/12 bg-white/60 text-[#202020] hover:border-black/25 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-[#f5f5f2] dark:hover:border-white/30',
    ghost: 'text-[#3d3d39] hover:bg-black/5 dark:text-[#d7d7d0] dark:hover:bg-white/10',
  };

  return `${base} ${variants[variant]}`;
};

export const getRuleClass = () => 'border-t border-black/10 dark:border-white/15';

export const getTagClass = () => 'inline-flex items-center rounded-full border border-black/10 px-2.5 py-1 text-xs text-[#676760] dark:border-white/15 dark:text-[#b9b9b0]';
