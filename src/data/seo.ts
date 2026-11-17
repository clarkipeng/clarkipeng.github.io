import { aboutParagraphs, experience, leadership, portfolioProjects, publications, siteConfig, socialLinks } from './siteData';

type PageMeta = {
  path: string;
  title: string;
  description: string;
};

const site = siteConfig.website;
const personId = `${site}/#person`;
const absolute = (href: string) => (href.startsWith('/') ? `${site}${href}` : href);

export const pages: PageMeta[] = [
  {
    path: '/',
    title: 'Clark Peng | CS at UCLA',
    description: 'Clark Peng is a computer science student at UCLA and former CTO of Catapult (YC S26). His research includes VideoPhy-2 (ICLR 2026).',
  },
  {
    path: '/portfolio',
    title: 'Gadgets | Clark Peng',
    description: 'Games, renderers, and simulations by Clark Peng, including a real-time 3D slime simulation and a playable 4D puzzle game.',
  },
  {
    path: '/publications',
    title: 'Papers | Clark Peng',
    description: 'Papers by Clark Peng, including VideoPhy-2 at ICLR 2026 and DialectGen at the NeurIPS 2025 ResponsibleFM workshop.',
  },
  {
    path: '/resume',
    title: 'Resume | Clark Peng',
    description: 'Resume of Clark Peng, a computer science student at UCLA and former CTO of Catapult.',
  },
];

export const pageMeta = (path: string) => pages.find((page) => page.path === path) ?? pages[0];

const person = {
  '@type': 'Person',
  '@id': personId,
  name: siteConfig.name,
  url: site,
  image: absolute(siteConfig.avatarUrl),
  description: pages[0].description,
  affiliation: { '@type': 'CollegeOrUniversity', name: 'University of California, Los Angeles', url: 'https://www.ucla.edu' },
  sameAs: socialLinks.map((link) => link.href),
};

const scholarlyArticles = publications.map((pub) => ({
  '@type': 'ScholarlyArticle',
  headline: pub.title,
  url: pub.paperUrl,
  datePublished: pub.date,
  description: pub.abstract,
  author: pub.authors.split(', ').map((name) => (name === siteConfig.name ? { '@id': personId } : { '@type': 'Person', name })),
}));

const structuredData = (path: string) => {
  const meta = pageMeta(path);
  const graph: object[] = [
    { '@type': 'WebSite', '@id': `${site}/#website`, url: site, name: siteConfig.name, author: { '@id': personId } },
    person,
  ];

  if (path === '/') graph.push({ '@type': 'ProfilePage', url: site, name: meta.title, mainEntity: { '@id': personId } });
  if (path === '/publications') graph.push(...scholarlyArticles);

  return { '@context': 'https://schema.org', '@graph': graph };
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const renderHead = (path: string) => {
  const meta = pageMeta(path);
  const url = path === '/' ? site : `${site}${path}`;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const json = JSON.stringify(structuredData(path)).replace(/</g, '\\u003c');

  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="${path === '/' ? 'profile' : 'website'}" />
    <meta property="og:site_name" content="${siteConfig.name}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${absolute(siteConfig.avatarUrl)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:site" content="@clarkipeng" />
    <script type="application/ld+json">${json}</script>`;
};

export const llmsText = () => {
  const lines = [
    `# ${siteConfig.name}`,
    '',
    `> ${pages[0].description}`,
    '',
    ...aboutParagraphs.flatMap((paragraph) => [paragraph, '']),
    '## Experience',
    '',
    ...experience.map((job) => `- ${job.role}, ${job.company} (${job.period}): ${job.description}`),
    '',
    '## Activities',
    '',
    ...leadership.map((item) => `- ${item.title}, ${item.role} (${item.period}): ${item.description}`),
    '',
    '## Papers',
    '',
    ...publications.map((pub) => `- [${pub.title}](${pub.paperUrl}). ${pub.authors}. ${pub.venue}.`),
    '',
    '## Projects',
    '',
    ...portfolioProjects.map((project) => `- [${project.title}](${project.links[0].href}) (${project.year}): ${project.description}`),
    '',
    '## Links',
    '',
    `- [Resume (PDF)](${absolute(siteConfig.resumeUrl)})`,
    ...socialLinks.map((link) => `- [${link.label}](${link.href})`),
  ];

  return `${lines.join('\n')}\n`;
};
