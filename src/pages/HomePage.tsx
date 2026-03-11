import { Sidebar } from '../components/Sidebar';
import { aboutText } from '../data/siteData';
import { pageBackground } from '../data/theme';

// Home Page - Bio/About
const HomePage = () => {
    return (
        <main className="flex items-start w-full grow min-h-[calc(100vh-80px)]">
            <Sidebar />

            {/* Main content with padding around the edges */}
            <article className={`flex items-start p-8 lg:p-12 flex-1 grow ${pageBackground}`}>
                <div className="flex-1 font-paragraph text-black dark:text-white text-[20px] font-light leading-relaxed whitespace-pre-line">
                    {aboutText}
                </div>
            </article>
        </main>
    );
};

export default HomePage;
