// Writes static HTML for each public route so crawlers that do not run JavaScript see real content.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ssrDir = 'dist-ssr';
const { pages, render, renderHead, llmsText } = await import(pathToFileURL(`${ssrDir}/entry-server.js`).href);
const template = readFileSync('dist/index.html', 'utf8');
const site = 'https://clarkipeng.github.io';

for (const { path } of pages) {
  const html = template
    .replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, renderHead(path))
    .replace('<div id="root"></div>', `<div id="root">${render(path)}</div>`);
  writeFileSync(path === '/' ? 'dist/index.html' : `dist${path}.html`, html);
}

const urls = pages.map(({ path }) => `  <url><loc>${path === '/' ? site : site + path}</loc></url>`).join('\n');
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync('dist/llms.txt', llmsText());
rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerendered ${pages.length} pages`);
