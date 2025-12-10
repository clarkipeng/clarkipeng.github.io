// GitHub icon - Lineicons style
export const GithubIcon = ({ className = '' }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 16 16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
);

// Google Scholar icon
export const GoogleScholarIcon = ({ className = '' }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" />
    </svg>
);

// Itch.io icon
export const ItchIcon = ({ className = '' }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 32 32"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M4.172 1.787C2.776 2.615 0 5.266 0 6.473v1.635c0 1.849 1.599 3.375 3.266 3.375 1.912 0 3.464-1.495 3.464-3.318 0 1.823 1.505 3.318 3.417 3.318 1.912 0 3.359-1.495 3.359-3.318 0 1.823 1.552 3.318 3.464 3.318h.057c1.912 0 3.464-1.495 3.464-3.318 0 1.823 1.448 3.318 3.359 3.318 1.912 0 3.417-1.495 3.417-3.318 0 1.823 1.553 3.318 3.464 3.318C31.401 11.483 32 9.957 32 8.108V6.473c0-1.208-2.776-3.859-4.172-4.687C26.641 1.063 21.802.896 16 .896S5.359 1.063 4.172 1.787zm7.839 9.943c-.437.593-.974 1.073-1.578 1.422-.438.26-1.62.974-2.349.974h-.057c-.729 0-1.911-.714-2.349-.974-.604-.349-1.141-.828-1.578-1.422-.547.755-1.276 1.318-2.099 1.635v13.557c0 1.208.974 3.182 2.13 3.182h24.042c1.156 0 2.13-1.974 2.13-3.182V13.365c-.823-.318-1.552-.88-2.099-1.635-.438.593-.974 1.073-1.578 1.422-.438.26-1.62.974-2.349.974h-.057c-.729 0-1.911-.714-2.349-.974-.604-.349-1.141-.828-1.578-1.422-.438.593-.974 1.073-1.578 1.422-.438.26-1.62.974-2.349.974h-.057c-.729 0-1.911-.714-2.349-.974-.604-.349-1.141-.828-1.578-1.422zM12 18h8v8h-8v-8z" />
    </svg>
);

// Kaggle icon (K logo)
export const KaggleIcon = ({ className = '' }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M18.825 23.859c-.022.092-.117.141-.281.141h-3.139c-.187 0-.351-.082-.492-.248l-5.178-6.589-1.448 1.374v5.111c0 .235-.117.352-.351.352H5.505c-.236 0-.354-.117-.354-.352V.353c0-.233.118-.353.354-.353h2.431c.234 0 .351.12.351.353v14.343l6.203-6.272c.165-.165.33-.246.495-.246h3.239c.144 0 .236.06.281.18.046.149.034.255-.036.315l-6.555 6.344 6.836 8.507c.095.104.117.208.075.339z" />
    </svg>
);

// HeadShot Component - matches Figma avatar style
export const HeadShot = ({ className = '', src }: { className?: string; src?: string }) => (
    <div className={`rounded-full bg-black flex items-center justify-center overflow-hidden ${className}`}>
        {src ? (
            <img src={src} alt="Profile" className="w-full h-full object-cover" />
        ) : (
            <svg viewBox="0 0 128 128" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                {/* Simple person icon */}
                <circle cx="64" cy="45" r="20" fill="white" />
                <ellipse cx="64" cy="100" rx="35" ry="25" fill="white" />
                {/* Face details */}
                <circle cx="56" cy="42" r="3" fill="black" />
                <circle cx="72" cy="42" r="3" fill="black" />
                <path d="M58 52 Q64 58 70 52" stroke="black" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>
        )}
    </div>
);

// LinkedIn icon
export const LinkedInIcon = ({ className = '' }: { className?: string }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
);
