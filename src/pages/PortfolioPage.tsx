import { Sidebar } from '../components/Sidebar';
import { portfolioProjects } from '../data/siteData';
import { getButtonClass, getCardClass } from '../data/theme';
// import { GameGate } from '../components/GameGate';
// import { useTheme } from '../context/ThemeContext';

// Portfolio Page - Projects from Jekyll
const PortfolioPage = () => {
    // const { isDark } = useTheme();

    return (
        <main className="flex items-start w-full grow min-h-[calc(100vh-80px)] relative">
            {/* Smoke background - only in dark mode
            {isDark && (
                <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
                    <GameGate
                        showUI={false}
                        backgroundColor="transparent"
                        defaultBrushMode="havoc"
                        config={{
                            velocityDecay: 0.95,
                            smokeDiffusion: 0.01
                        }}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
            )} */}

            <Sidebar />

            {/* Main content with padding around the edges */}
            <div className="flex flex-col items-start gap-12 p-8 lg:p-12 flex-1 grow 
                        bg-white/80 dark:bg-[#0f0f0f]/80 backdrop-blur-sm transition-colors duration-300 overflow-auto relative z-10">

                {/* Header section */}
                <div className="inline-flex flex-col items-start gap-2">
                    <h1 className="font-h1 text-black dark:text-white text-[36px]">
                        Portfolio
                    </h1>
                    <p className="font-h2 text-gray-500 dark:text-gray-400 text-[24px]">
                        A collection of projects I've done
                    </p>
                </div>

                {/* Projects list */}
                <div className="flex flex-col gap-8 w-full">
                    {portfolioProjects.map((project) => (
                        <article
                            key={project.id}
                            className={getCardClass('row')}
                        >
                            {/* Project Image */}
                            {project.image ? (
                                <div className="w-full lg:w-64 h-48 lg:h-40 flex-shrink-0 
                              bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                                    <img
                                        src={project.image}
                                        alt={project.title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="w-full lg:w-64 h-48 lg:h-40 flex-shrink-0 
                              bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center">
                                    <span className="text-gray-400 text-4xl font-bold">{project.id}</span>
                                </div>
                            )}

                            {/* Project Info */}
                            <div className="flex flex-col gap-3 flex-1">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h3 className="font-h2 text-black dark:text-white text-[24px]">
                                        {project.title}
                                    </h3>
                                    <span className="text-gray-400 dark:text-gray-500 text-sm">{project.year}</span>
                                </div>

                                {/* Tags */}
                                <div className="flex gap-2 flex-wrap">
                                    {project.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-2.5 py-1 text-xs font-medium 
                               bg-gray-100 dark:bg-gray-800 
                               text-gray-600 dark:text-gray-300 rounded-md"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                <p className="font-h4 text-gray-600 dark:text-gray-300 text-[16px] leading-relaxed">
                                    {project.description}
                                </p>

                                {/* Links - Using theme button styles with bigger padding */}
                                {project.links && project.links.length > 0 && (
                                    <div className="flex gap-3 flex-wrap mt-2">
                                        {project.links.map((link) => (
                                            <a
                                                key={link.label}
                                                href={link.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={getButtonClass('primary')}
                                            >
                                                {link.label}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </main>
    );
};

export default PortfolioPage;
