import { FileText } from 'lucide-react';
import { siteConfig } from '../data/siteData';
import { contentMeasure, getButtonClass, pageBackground } from '../data/theme';

const CVPage = () => (
  <main className={`w-full grow ${pageBackground}`}>
    <section className={`${contentMeasure} py-12 sm:py-16`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans text-4xl font-medium text-[#202020] dark:text-[#f5f5f2]">Resume</h1>
          <p className="mt-4 text-xl leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">
            The current version of my resume.
          </p>
        </div>
        <a href={siteConfig.resumeUrl} className={getButtonClass('primary')} target="_blank" rel="noopener noreferrer">
          <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          Open PDF
        </a>
      </div>

      <iframe
        src={siteConfig.resumeUrl}
        title="Clark Peng Resume"
        className="mt-10 h-[78vh] w-full rounded-sm border border-black/10 bg-white dark:border-white/15"
      />
    </section>
  </main>
);

export default CVPage;
