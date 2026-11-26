import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
    // Dev: a changed file reloads the page with new addresses (addWatchFile would make vite import the public files).
    configureServer(server) {
      server.watcher.add(dirs)
      server.watcher.on('all', (_, file) => {
        if (!dirs.some((d) => relative(d, file)[0] !== '.')) return
        const m = server.moduleGraph.getModuleById('\0' + id)
        if (m) { server.moduleGraph.invalidateModule(m); server.ws.send({ type: 'full-reload' }) }
      })
    },
    load(resolved) {
      if (resolved !== '\0' + id) return
      const urls: Record<string, string> = {}
      for (const dir of dirs)
        for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
          if (!e.isFile()) continue
          const file = join(e.parentPath, e.name)
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

// Dev only: the tweak panel's "save colors" (src/desk/colors.ts) posts every color here, and they are written back into
// the source they came from: the card colors into desk.html, the card text and stock into TOK (and the stylesheet's
// matching custom properties), each page's background and ink into STYLE_DEFAULTS.
type Colors = { tok: Record<string, string>; cards: Record<string, Record<string, string>>; pages: Record<string, Record<string, string>> }
function saveColors({ tok, cards, pages }: Colors) {
  const hex = (v: string) => { if (!/^#?[0-9a-f]{6}$/i.test(v)) throw new Error(`not a color: ${v}`); return v.replace('#', '').toLowerCase() }
  const key = (k: string) => { if (!/^\w+$/.test(k)) throw new Error(`bad key: ${k}`); return k }
  const edit = (file: string, fn: (s: string) => string) => { const s = readFileSync(file, 'utf8'), t = fn(s); if (t !== s) writeFileSync(file, t) }
  edit('src/desk/desk.html', (s) => Object.entries(cards).reduce((s, [card, attrs]) => s.replace(new RegExp(`<li [^>]*data-key="${key(card)}"[^>]*>`), (tag) =>
    Object.entries(attrs).reduce((t, [a, v]) => t.replace(new RegExp(`data-${key(a)}="[0-9a-f]{6}"`), `data-${a}="${hex(v)}"`), tag)), s))
  edit('src/desk/tunables.ts', (s) => {
    for (const [k, v] of Object.entries(tok)) s = s.replace(new RegExp(`\\b${key(k)}: '#[0-9a-f]{6}'`), `${k}: '#${hex(v)}'`)
    for (const [pg, st] of Object.entries(pages)) s = s.replace(new RegExp(`^(  ${key(pg)}: \\{ bg: .*)$`, 'm'), (line) =>
      Object.entries(st).reduce((l, [k, v]) => l.replace(new RegExp(`\\b${key(k)}: '[0-9a-f]{6}'`), `${k}: '${hex(v)}'`), line))
    return s
  })
  edit('src/desk/desk.css', (s) => Object.entries(tok).reduce((s, [k, v]) =>
    s.replace(new RegExp(`--${key(k).replace(/[A-Z0-9]/g, (m) => '-' + m.toLowerCase())}: #[0-9a-f]{6}`), (m) => m.slice(0, -6) + hex(v)), s))
}
// The admin panel's text edits, back into desk.html: in each card's <li>, the markup `from` becomes `to`.
function saveText(edits: { key: string; from: string; to: string }[]) {
  let s = readFileSync('src/desk/desk.html', 'utf8')
  for (const { key, from, to } of edits) {
    const at = s.indexOf(`data-key="${key}"`), end = s.indexOf('</li>', at), i = s.indexOf(from, at)
    if (at < 0 || i < 0 || i > end) throw new Error(`not found in ${key}: ${from}`)
    s = s.slice(0, i) + to + s.slice(i + from.length)
  }
  writeFileSync('src/desk/desk.html', s)
}
function deskColors(): Plugin {
  return {
    name: 'desk-colors',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__desk-colors', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try { saveColors(JSON.parse(body)); res.end('ok') } catch (e) { res.statusCode = 400; res.end(String(e)) }
        })
      })
      server.middlewares.use('/__desk-text', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try { saveText(JSON.parse(body)); res.end('ok') } catch (e) { res.statusCode = 400; res.end(String(e)) }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), deskMedia(), deskColors()],
  // Base path for GitHub Pages (username.github.io deploys at root)
  base: '/',
  build: {
    outDir: 'dist',
  },
})
