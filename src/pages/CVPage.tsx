import { siteConfig } from '../data/siteData';
import { wideMeasure, pageBackground } from '../data/theme';

const CVPage = () => (
  <main className={`w-full grow ${pageBackground}`}>
    <section className={`${wideMeasure} py-6 sm:py-8`}>
      <iframe
        src={siteConfig.resumeUrl}
        title="Clark Peng Resume"
        className="h-[84vh] w-full rounded-sm border border-black/10 bg-white dark:border-white/15"
      />
    </section>
  </main>
);

export default CVPage;
