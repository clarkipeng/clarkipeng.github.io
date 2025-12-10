import { GithubIcon, GoogleScholarIcon, ItchIcon, KaggleIcon, HeadShot, LinkedInIcon } from './Icons';
import { siteConfig, socialLinks as socialLinksData } from '../data/siteData';

// Map icon types to components
const iconMap: Record<string, React.FC<{ className?: string }>> = {
    github: GithubIcon,
    scholar: GoogleScholarIcon,
    itch: ItchIcon,
    kaggle: KaggleIcon,
    linkedin: LinkedInIcon,
};

interface SidebarProps {
    showName?: boolean;
}

// Sidebar Component - reusable across pages
export const Sidebar = ({ showName = true }: SidebarProps) => (
    <aside className="inline-flex flex-col items-center gap-2.5 p-2.5 
                    bg-white dark:bg-[#0f0f0f] min-w-[250px] transition-colors duration-300">
        <HeadShot className="w-32 h-32" src={siteConfig.avatarUrl} />

        {showName && (
            <div className="flex w-[230px] h-[73px] items-center justify-center gap-2.5 px-[63px] py-[27px]">
                <h2 className="font-h1 text-black dark:text-white text-[36px] whitespace-nowrap">
                    {siteConfig.name}
                </h2>
            </div>
        )}

        <nav
            className="inline-flex flex-col items-start gap-5 px-[15px] py-2.5"
            aria-label="Social links"
        >
            {socialLinksData.map((link, index) => {
                const IconComponent = iconMap[link.type];
                return (
                    <a
                        key={index}
                        href={link.href}
                        className="inline-flex items-center gap-2.5 
                       hover:opacity-70 transition-opacity"
                        aria-label={link.label}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <div className="w-4 h-4 flex items-center justify-center text-black dark:text-white">
                            {IconComponent && <IconComponent className="w-4 h-4" />}
                        </div>
                        <span className="font-h4 text-black dark:text-white text-[16px]">
                            {link.label}
                        </span>
                    </a>
                );
            })}
        </nav>
    </aside>
);
