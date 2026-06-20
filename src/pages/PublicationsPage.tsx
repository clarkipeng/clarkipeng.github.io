import { ArrowUpRight } from 'lucide-react';
import { publications } from '../data/siteData';
import { getButtonClass, getRuleClass, pageBackground, contentMeasure } from '../data/theme';

const PublicationsPage = () => (
  <main className={`w-full grow ${pageBackground}`}>
    <section className={`${contentMeasure} py-12 sm:py-16`}>
      <h1 className="font-sans text-4xl font-medium text-[#202020] dark:text-[#f5f5f2]">Papers</h1>
      <p className="mt-4 text-xl leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">
        Work on evaluating, controlling, and reframing model behavior.
      </p>

      <div className="mt-10">
        {publications.map((pub) => (
          <article key={pub.id} className={`${getRuleClass()} py-7`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-sans text-2xl font-medium leading-8 text-[#202020] dark:text-white">{pub.title}</h2>
              <time className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]" dateTime={pub.date}>
                {new Date(pub.date).getFullYear()}
              </time>
            </div>
            <p className="mt-2 text-[16px] leading-7 text-[#676760] dark:text-[#b9b9b0]">{pub.authors}</p>
            <p className="mt-1 font-sans text-sm text-[#202020] dark:text-[#ededeb]">{pub.venue}</p>
            <p className="mt-4 text-[18px] leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">{pub.abstract}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {pub.links.map((link, index) => (
                <a
                  key={link.href}
                  href={link.href}
                  target={link.href.startsWith('/') ? undefined : '_blank'}
                  rel={link.href.startsWith('/') ? undefined : 'noopener noreferrer'}
                  className={getButtonClass(index === 0 ? 'secondary' : 'ghost')}
                >
                  {link.label}
                  <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  </main>
);

export default PublicationsPage;
