import { ArrowUpRight, X as XIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Carousel } from '../components/Carousel';
import { GithubIcon, GoogleScholarIcon, ItchIcon, KaggleIcon, LinkedInIcon } from '../components/Icons';
import { aboutParagraphs, portfolioProjects, publications, siteConfig, socialLinks } from '../data/siteData';
import { contentMeasure, getRuleClass, getTagClass, pageBackground } from '../data/theme';

const featuredProjects = portfolioProjects.filter((project) => project.featured).slice(0, 4);
const socialIcons: Record<string, LucideIcon | ComponentType<{ className?: string }>> = {
  x: XIcon,
  linkedin: LinkedInIcon,
  scholar: GoogleScholarIcon,
  github: GithubIcon,
  kaggle: KaggleIcon,
  itch: ItchIcon,
};

const HomePage = () => (
  <main className={`w-full grow ${pageBackground}`}>
    <section className={`${contentMeasure} py-12 sm:py-20`}>
      <div className="mb-12 grid gap-8 sm:grid-cols-[1fr_10rem] sm:items-start">
        <div>
          <h1 className="font-sans text-5xl font-medium leading-none text-[#202020] dark:text-[#f5f5f2] sm:text-6xl">
            {siteConfig.name}
          </h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-[#3d3d39] dark:text-[#d7d7d0]">
            {siteConfig.title}
          </p>

        </div>

        <img
          src={siteConfig.avatarUrl}
          alt={siteConfig.name}
          className="order-first aspect-[4/5] w-32 rounded-sm border border-black/10 object-cover object-[50%_34%] sm:order-none sm:ml-auto sm:w-40 dark:border-white/15"
        />
      </div>

      <article className="space-y-5 text-[18px] leading-8 text-[#2d2d29] dark:text-[#ededeb]">
        <p>
          I am the CTO of{' '}
          <a href="https://playcatapult.io/" target="_blank" rel="noopener noreferrer" className="underline decoration-black/20 underline-offset-4 hover:text-[#202020] dark:decoration-white/25 dark:hover:text-white">
            Catapult
          </a>{' '}
          and study CS at UCLA.
        </p>
        {aboutParagraphs.slice(1).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </article>

      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-sans text-2xl font-medium text-[#202020] dark:text-[#f5f5f2]">Gadgets</h2>
          <Link to="/portfolio" className="font-sans text-sm text-[#676760] underline decoration-black/20 underline-offset-4 hover:text-[#202020] dark:text-[#b9b9b0] dark:decoration-white/25 dark:hover:text-white">
            More
          </Link>
        </div>

        <div className="mt-5">
          {featuredProjects.map((project) => (
            <article key={project.id} className={`${getRuleClass()} grid gap-4 py-6 sm:grid-cols-[1fr_8.5rem]`}>
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-sans text-lg font-medium text-[#202020] dark:text-white">{project.title}</h3>
                  <span className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]">{project.year}</span>
                </div>
                <p className="mt-2 text-[17px] leading-7 text-[#4f4f49] dark:text-[#d7d7d0]">{project.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  {project.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className={getTagClass()}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="aspect-square overflow-hidden rounded-sm bg-black/5 dark:bg-white/10">
                <Carousel images={project.images} label={project.title} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-sans text-2xl font-medium text-[#202020] dark:text-[#f5f5f2]">Papers</h2>
          <Link to="/publications" className="font-sans text-sm text-[#676760] underline decoration-black/20 underline-offset-4 hover:text-[#202020] dark:text-[#b9b9b0] dark:decoration-white/25 dark:hover:text-white">
            All
          </Link>
        </div>

        <div className="mt-5">
          {publications.slice(0, 2).map((pub) => (
            <a
              key={pub.id}
              href={pub.paperUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${getRuleClass()} block py-5 no-underline hover:bg-black/[0.025] dark:hover:bg-white/[0.04]`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-sans text-lg font-medium text-[#202020] dark:text-white">{pub.title}</h3>
                <span className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]">{pub.venue}</span>
              </div>
              <p className="mt-2 text-[17px] leading-7 text-[#4f4f49] dark:text-[#d7d7d0]">{pub.abstract}</p>
            </a>
          ))}
        </div>
      </section>

      <footer className={`${getRuleClass()} mt-16 flex flex-wrap gap-3 pt-5 text-[#676760] dark:text-[#b9b9b0]`}>
        {socialLinks.map((link) => {
          const Icon = socialIcons[link.type] ?? ArrowUpRight;

          return (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              title={link.label}
              className="inline-flex h-7 w-7 items-center justify-center hover:text-[#202020] dark:hover:text-white"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </a>
          );
        })}
      </footer>

    </section>
  </main>
);

export default HomePage;
