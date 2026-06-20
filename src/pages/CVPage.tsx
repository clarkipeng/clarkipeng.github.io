import { ArrowUpRight, FileText } from 'lucide-react';
import { education, experience, leadership, siteConfig, skills } from '../data/siteData';
import { contentMeasure, getButtonClass, getRuleClass, getTagClass, pageBackground } from '../data/theme';

const skillGroups = [
  { label: 'Languages', values: skills.languages },
  { label: 'Systems', values: skills.systems },
  { label: 'ML Systems', values: skills.mlSystems },
  { label: 'Infrastructure', values: skills.infrastructure },
  { label: 'Data', values: skills.data },
  { label: 'Creative', values: skills.creative },
];

const CVPage = () => (
  <main className={`w-full grow ${pageBackground}`}>
    <section className={`${contentMeasure} py-12 sm:py-16`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans text-4xl font-medium text-[#202020] dark:text-[#f5f5f2]">CV</h1>
          <p className="mt-4 text-xl leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">
            Systems, research, leadership, and small sharp tools.
          </p>
        </div>
        <a href={siteConfig.resumeUrl} className={getButtonClass('primary')}>
          <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          Resume
        </a>
      </div>

      <section className="mt-12">
        <h2 className="text-center font-sans text-2xl font-medium text-[#202020] dark:text-[#f5f5f2]">Experience</h2>
        <div className="mt-6">
          {experience.map((exp) => (
            <article key={exp.id} className={`${getRuleClass()} py-6`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="font-sans text-xl font-medium text-[#202020] dark:text-white">{exp.role}</h3>
                  <p className="mt-1 text-[16px] text-[#676760] dark:text-[#b9b9b0]">
                    {exp.companyUrl ? (
                      <a href={exp.companyUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-black/20 underline-offset-4 hover:text-[#202020] dark:decoration-white/25 dark:hover:text-white">
                        {exp.company}
                        <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      exp.company
                    )}
                    {exp.location ? ` / ${exp.location}` : ''}
                  </p>
                </div>
                <span className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]">{exp.period}</span>
              </div>
              <p className="mt-3 text-[18px] leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">{exp.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {exp.tags.map((tag) => (
                  <span key={tag} className={getTagClass()}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-center font-sans text-2xl font-medium text-[#202020] dark:text-[#f5f5f2]">Education</h2>
        <div className="mt-6">
          {education.map((edu) => (
            <article key={edu.id} className={`${getRuleClass()} py-6`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-sans text-xl font-medium text-[#202020] dark:text-white">{edu.school}</h3>
                <span className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]">{edu.period}</span>
              </div>
              <p className="mt-1 text-[16px] text-[#676760] dark:text-[#b9b9b0]">{edu.degree}</p>
              <p className="mt-3 text-[18px] leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">{edu.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-center font-sans text-2xl font-medium text-[#202020] dark:text-[#f5f5f2]">Leadership</h2>
        <div className="mt-6">
          {leadership.map((item) => (
            <article key={item.id} className={`${getRuleClass()} py-6`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-sans text-xl font-medium text-[#202020] dark:text-white">{item.title}</h3>
                <span className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]">{item.period}</span>
              </div>
              <p className="mt-1 text-[16px] text-[#676760] dark:text-[#b9b9b0]">{item.role}</p>
              <p className="mt-3 text-[18px] leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-center font-sans text-2xl font-medium text-[#202020] dark:text-[#f5f5f2]">Skills</h2>
        <div className="mt-6">
          {skillGroups.map((group) => (
            <div key={group.label} className={`${getRuleClass()} grid gap-3 py-5 sm:grid-cols-[9rem_1fr]`}>
              <h3 className="font-sans text-sm font-medium text-[#202020] dark:text-white">{group.label}</h3>
              <p className="text-[17px] leading-7 text-[#4f4f49] dark:text-[#d7d7d0]">{group.values.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  </main>
);

export default CVPage;
