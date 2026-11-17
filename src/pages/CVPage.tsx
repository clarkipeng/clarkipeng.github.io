import { siteConfig } from '../data/siteData';
import { getButtonClass, wideMeasure, pageBackground } from '../data/theme';

const CVPage = () => (
  <main className={`w-full grow ${pageBackground}`}>
    <section className={`${wideMeasure} py-6 sm:py-8`}>
      <iframe
        src={siteConfig.resumeUrl}
        title="Clark Peng Resume"
        className="hidden h-[84vh] w-full rounded-sm border border-black/10 bg-white sm:block dark:border-white/15"
      />
      {/* Phones render PDFs in iframes as a single page, so link to the file instead. */}
      <a href={siteConfig.resumeUrl} className={`${getButtonClass('primary')} sm:hidden`}>
        Open resume (PDF)
      </a>
    </section>
  </main>
);

export default CVPage;
