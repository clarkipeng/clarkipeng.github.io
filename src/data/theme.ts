export const transitions = {
  theme: 'transition-colors duration-300',
  interactive: 'transition-all duration-200 ease-out',
};

export const pageBackground = `text-[#202020] dark:text-[#f5f5f2] ${transitions.theme}`;

export const contentMeasure = 'mx-auto w-full max-w-[760px] px-5 sm:px-8';
export const wideMeasure = 'mx-auto w-full max-w-[980px] px-5 sm:px-8';

export const getButtonClass = (variant: 'primary' | 'secondary' | 'ghost' = 'primary') => {
  const base = 'inline-flex min-h-8 items-center justify-center border-b font-sans text-sm no-underline transition duration-200 ease-out';
  const variants = {
    primary: 'border-[#202020] text-[#202020] hover:border-[#676760] hover:text-[#676760] dark:border-[#f5f5f2] dark:text-[#f5f5f2] dark:hover:border-[#b9b9b0] dark:hover:text-[#b9b9b0]',
    secondary: 'border-black/20 text-[#3d3d39] hover:border-[#202020] hover:text-[#202020] dark:border-white/25 dark:text-[#d7d7d0] dark:hover:border-white dark:hover:text-white',
    ghost: 'border-transparent text-[#676760] hover:border-black/20 hover:text-[#202020] dark:text-[#b9b9b0] dark:hover:border-white/25 dark:hover:text-white',
  };

  return `${base} ${variants[variant]}`;
};

export const getRuleClass = () => 'border-t border-black/10 dark:border-white/15';

export const getTagClass = () => 'inline-flex items-center font-sans text-xs text-[#676760] dark:text-[#b9b9b0]';
