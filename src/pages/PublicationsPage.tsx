import { Sidebar } from '../components/Sidebar';
import { publications } from '../data/siteData';
import { getButtonClass, getCardClass } from '../data/theme';

// Publications Page
const PublicationsPage = () => (
    <main className="flex items-start w-full grow min-h-[calc(100vh-80px)]">
        <Sidebar />

        {/* Main content with padding around the edges */}
        <div className="flex flex-col items-start gap-12 p-8 lg:p-12 flex-1 grow 
                    bg-white dark:bg-[#0f0f0f] transition-colors duration-300 overflow-auto">

            {/* Header */}
            <div className="inline-flex flex-col items-start gap-2">
                <h1 className="font-h1 text-black dark:text-white text-[36px]">
                    Publications
                </h1>
                <p className="font-h2 text-gray-500 dark:text-gray-400 text-[24px]">
                    Research papers and preprints
                </p>
            </div>

            {/* Preprints Section */}
            <section className="w-full">
                <h2 className="font-h2 text-black dark:text-white text-[24px] mb-6 pb-2 
                       border-b border-gray-200 dark:border-gray-700">
                    Preprints
                </h2>

                <div className="flex flex-col gap-6">
                    {publications
                        .filter(pub => pub.category === 'preprints')
                        .map((pub) => (
                            <article
                                key={pub.id}
                                className={getCardClass()}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <h3 className="font-h3 text-black dark:text-white text-[20px] font-medium leading-tight">
                                        {pub.title}
                                    </h3>
                                    <span className="text-gray-400 dark:text-gray-500 text-sm whitespace-nowrap">
                                        {new Date(pub.date).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'short'
                                        })}
                                    </span>
                                </div>

                                <p className="text-gray-500 dark:text-gray-400 text-sm">
                                    {pub.authors}
                                </p>

                                <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                                    {pub.venue}
                                </p>

                                <p className="font-h4 text-gray-600 dark:text-gray-300 text-[14px] leading-relaxed">
                                    {pub.abstract}
                                </p>

                                <div className="flex gap-3 mt-2">
                                    <a
                                        href={pub.paperUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={getButtonClass('primary')}
                                    >
                                        View Paper
                                    </a>
                                </div>
                            </article>
                        ))}
                </div>
            </section>
        </div>
    </main>
);

export default PublicationsPage;
