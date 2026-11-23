import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The desk's media keep their file names, so a re-cut clip or poster would load from a browser's cache under its old
// address. virtual:desk-media gives every file in these folders an address carrying a hash of its content (?v=), plus
// clips.json itself, so a changed file is a new address and nothing stale can show.
function deskMedia(): Plugin {
  const id = 'virtual:desk-media'
  const dirs = ['public/desk-media', 'public/images']
  return {
    name: 'desk-media',
    resolveId: (source) => (source === id ? '\0' + id : undefined),
    load(resolved) {
      if (resolved !== '\0' + id) return
      const urls: Record<string, string> = {}
      for (const dir of dirs)
        for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
          if (!e.isFile()) continue
          const file = join(e.parentPath, e.name)
          this.addWatchFile(file)
          const path = '/' + relative('public', file)
          urls[path] = `${path}?v=${createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 10)}`
        }
      const clips = readFileSync('public/desk-media/clips.json', 'utf8')
      return `const urls = ${JSON.stringify(urls)};
export const clips = ${clips};
export const mediaUrl = (path) => urls[path] ?? path;
export const versionHtml = (html) => html.replace(/(src|href)="(\\/(?:desk-media|images)\\/[^"?]+)"/g, (m, attr, path) => attr + '="' + mediaUrl(path) + '"');`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), deskMedia()],
  // Base path for GitHub Pages (username.github.io deploys at root)
  base: '/',
  build: {
    outDir: 'dist',
  },
})
