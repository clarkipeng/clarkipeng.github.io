import { ArrowUpRight } from 'lucide-react';
import { Carousel } from '../components/Carousel';
import { SpectralLightGadget } from '../components/SpectralLightGadget';
import { portfolioProjects } from '../data/siteData';
import { getButtonClass, getRuleClass, getTagClass, pageBackground, wideMeasure } from '../data/theme';

const PortfolioPage = () => (
  <main className={`w-full grow ${pageBackground}`}>
    <section className={`${wideMeasure} py-12 sm:py-16`}>
      <div className="max-w-3xl">
        <h1 className="font-sans text-4xl font-medium text-[#202020] dark:text-[#f5f5f2]">Gadgets</h1>
        <p className="mt-4 text-xl leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">
          Games, simulations, renderers, and small experiments.
        </p>
      </div>

      <div className="mt-10">
        <article className={`${getRuleClass()} py-8`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-sans text-2xl font-medium text-[#202020] dark:text-white">Spectral Slime Optics</h2>
            <span className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]">2026</span>
          </div>
          <p className="mt-3 max-w-2xl text-[18px] leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">
            White light separates into spectral caustics as it crosses a moving fluid density field.
          </p>
          <div className="mt-6 overflow-hidden rounded-sm">
            <SpectralLightGadget />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
            {['WebGPU', 'Simulation', 'Optics'].map((tag) => (
              <span key={tag} className={getTagClass()}>{tag}</span>
            ))}
          </div>
        </article>

        {portfolioProjects.map((project) => (
          <article key={project.id} className={`${getRuleClass()} grid gap-5 py-8 md:grid-cols-[15rem_1fr]`}>
            <div className="aspect-[4/3] overflow-hidden rounded-sm bg-black/5 dark:bg-white/10">
              <Carousel images={project.images} label={project.title} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-sans text-2xl font-medium text-[#202020] dark:text-white">{project.title}</h2>
                <span className="font-sans text-sm text-[#8a8a82] dark:text-[#9f9f96]">{project.year}</span>
              </div>

              <p className="mt-3 max-w-2xl text-[18px] leading-8 text-[#4f4f49] dark:text-[#d7d7d0]">
                {project.description}
              </p>

              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
                {project.tags.map((tag) => (
                  <span key={tag} className={getTagClass()}>{tag}</span>
                ))}
              </div>

              {project.links.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                  {project.links.map((link, index) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={getButtonClass(index === 0 ? 'secondary' : 'ghost')}
                    >
                      {link.label}
                      <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  </main>
);

export default PortfolioPage;
