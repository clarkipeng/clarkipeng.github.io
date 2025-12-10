import { Sidebar } from '../components/Sidebar';
import { aboutText } from '../data/siteData';

// Home Page - Bio/About
const HomePage = () => {
    return (
        <main className="flex items-start w-full grow min-h-[calc(100vh-80px)]">
            <Sidebar />

            {/* Main content with padding around the edges */}
            <article className="flex items-start p-8 lg:p-12 flex-1 grow 
                         bg-white dark:bg-[#0f0f0f] transition-colors duration-300">
                <div className="flex-1 font-paragraph text-black dark:text-white text-[20px] font-light leading-relaxed whitespace-pre-line">
                    {aboutText}
                </div>
            </article>
        </main>
    );
};

export default HomePage;
