import { Sidebar } from '../components/Sidebar';
import { experience, education, skills } from '../data/siteData';
import { getCardClass } from '../data/theme';

// CV Page
const CVPage = () => (
    <main className="flex items-start w-full grow min-h-[calc(100vh-80px)]">
        <Sidebar />

        {/* Main content with padding around the edges */}
        <div className="flex flex-col items-start gap-12 p-8 lg:p-12 flex-1 grow 
                    bg-white dark:bg-[#0f0f0f] transition-colors duration-300 overflow-auto">

            {/* Header */}
            <div className="inline-flex flex-col items-start gap-2">
                <h1 className="font-h1 text-black dark:text-white text-[36px]">
                    CV
                </h1>
                <p className="font-h2 text-gray-500 dark:text-gray-400 text-[24px]">
                    Experience, education, and skills
                </p>
            </div>

            {/* Experience Section */}
            <section className="w-full">
                <h2 className="font-h2 text-black dark:text-white text-[24px] mb-6 pb-2 
                       border-b border-gray-200 dark:border-gray-700">
                    Experience
                </h2>

                <div className="flex flex-col gap-6">
                    {experience.map((exp) => (
                        <article
                            key={exp.id}
                            className={getCardClass()}
                        >
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                    <h3 className="font-h3 text-black dark:text-white text-[20px] font-medium">
                                        {exp.role}
                                    </h3>
                                    <p className="text-gray-600 dark:text-gray-300">
                                        {exp.companyUrl ? (
                                            <a
                                                href={exp.companyUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:underline"
                                            >
                                                {exp.company}
                                            </a>
                                        ) : (
                                            exp.company
                                        )}
                                        {exp.location && ` • ${exp.location}`}
                                    </p>
                                </div>
                                <span className="text-gray-400 dark:text-gray-500 text-sm whitespace-nowrap">
                                    {exp.period}
                                </span>
                            </div>

                            <p className="font-h4 text-gray-600 dark:text-gray-300 text-[16px] leading-relaxed mt-2">
                                {exp.description}
                            </p>

                            {exp.tags && (
                                <div className="flex gap-2 flex-wrap mt-2">
                                    {exp.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-2 py-1 text-xs font-medium 
                                 bg-gray-100 dark:bg-gray-800 
                                 text-gray-600 dark:text-gray-300 rounded"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            </section>

            {/* Education Section */}
            <section className="w-full">
                <h2 className="font-h2 text-black dark:text-white text-[24px] mb-6 pb-2 
                       border-b border-gray-200 dark:border-gray-700">
                    Education
                </h2>

                <div className="flex flex-col gap-6">
                    {education.map((edu) => (
                        <article
                            key={edu.id}
                            className={getCardClass()}
                        >
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                    <h3 className="font-h3 text-black dark:text-white text-[20px] font-medium">
                                        {edu.school}
                                    </h3>
                                    <p className="text-gray-600 dark:text-gray-300">{edu.degree}</p>
                                </div>
                                <span className="text-gray-400 dark:text-gray-500 text-sm whitespace-nowrap">
                                    {edu.period}
                                </span>
                            </div>

                            {edu.description && (
                                <p className="font-h4 text-gray-600 dark:text-gray-300 text-[16px] leading-relaxed mt-2">
                                    {edu.description}
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            </section>

            {/* Skills Section */}
            <section className="w-full">
                <h2 className="font-h2 text-black dark:text-white text-[24px] mb-6 pb-2 
                       border-b border-gray-200 dark:border-gray-700">
                    Skills
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className={getCardClass()}>
                        <h3 className="font-h4 text-black dark:text-white text-[16px] font-medium mb-3">
                            Languages
                        </h3>
                        <div className="flex gap-2 flex-wrap">
                            {skills.languages.map((skill) => (
                                <span key={skill} className="px-3 py-1.5 text-sm 
                                              bg-gray-100 dark:bg-gray-800 
                                              text-gray-700 dark:text-gray-300 rounded">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className={getCardClass()}>
                        <h3 className="font-h4 text-black dark:text-white text-[16px] font-medium mb-3">
                            Frameworks & Tools
                        </h3>
                        <div className="flex gap-2 flex-wrap">
                            {skills.frameworks.map((skill) => (
                                <span key={skill} className="px-3 py-1.5 text-sm 
                                              bg-gray-100 dark:bg-gray-800 
                                              text-gray-700 dark:text-gray-300 rounded">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className={getCardClass()}>
                        <h3 className="font-h4 text-black dark:text-white text-[16px] font-medium mb-3">
                            Tools
                        </h3>
                        <div className="flex gap-2 flex-wrap">
                            {skills.tools.map((skill) => (
                                <span key={skill} className="px-3 py-1.5 text-sm 
                                              bg-gray-100 dark:bg-gray-800 
                                              text-gray-700 dark:text-gray-300 rounded">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className={getCardClass()}>
                        <h3 className="font-h4 text-black dark:text-white text-[16px] font-medium mb-3">
                            Areas of Focus
                        </h3>
                        <div className="flex gap-2 flex-wrap">
                            {skills.areas.map((skill) => (
                                <span key={skill} className="px-3 py-1.5 text-sm 
                                              bg-gray-100 dark:bg-gray-800 
                                              text-gray-700 dark:text-gray-300 rounded">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </main>
);

export default CVPage;
