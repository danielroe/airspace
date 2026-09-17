import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { docsPages } from '../shared/docs-nav.ts'
import { siteUrl } from '../shared/site.ts'

const root = fileURLToPath(new URL('../.output/public', import.meta.url))

/** Rendered on request, so they never exist as files. */
const dynamic = [/^\/demo(\/|$)/, /^\/api\//, /^\/_/]

const pages: string[] = []
function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`
    if (statSync(path).isDirectory())
      walk(path)
    else if (path.endsWith('.html'))
      pages.push(path)
  }
}
walk(root)

let broken = 0
for (const page of pages) {
  const html = readFileSync(page, 'utf8')
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
    if (dynamic.some(pattern => pattern.test(href!)))
      continue
    if (existsSync(root + href) || existsSync(`${root + href}.html`) || existsSync(`${root + href}/index.html`))
      continue
    broken++
    console.error(`${page.slice(root.length) || '/'} links to ${href}, which is not in the output`)
  }
}

console.log(`${pages.length} pages, ${broken} broken links`)

let missing = 0
function expectFile(path: string, contains?: string) {
  if (!existsSync(root + path)) {
    missing++
    console.error(`${path} is not in the output`)
    return
  }
  if (contains && !readFileSync(root + path, 'utf8').includes(contains)) {
    missing++
    console.error(`${path} does not mention ${contains}`)
  }
}

for (const file of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/index.md', '/search.js', '/pagefind/pagefind-ui.js'])
  expectFile(file)

for (const page of docsPages) {
  expectFile(`${page.path}.md`, `# ${page.title}`)
  expectFile('/sitemap.xml', `${siteUrl}${page.path}</loc>`)
  expectFile('/llms.txt', `${siteUrl}${page.path}.md`)

  const source = fileURLToPath(new URL(`../content/docs/${page.slug}.md`, import.meta.url))
  if (existsSync(`${root + page.path}.md`) && readFileSync(`${root + page.path}.md`, 'utf8').trim() !== readFileSync(source, 'utf8').trim()) {
    missing++
    console.error(`${page.path}.md differs from content/docs/${page.slug}.md`)
  }
}

console.log(`${missing} missing machine-readable entries`)

let scripted = 0
for (const page of pages) {
  const html = readFileSync(page, 'utf8')
  const path = page.slice(root.length)
  if ((path === '/index.html' || path.startsWith('/docs')) && /<script[^>]+src="\/_nuxt\//.test(html)) {
    scripted++
    console.error(`${path} loads the client bundle, but is served without scripts`)
  }
}

console.log(`${scripted} pages unexpectedly loading the client bundle`)
if (broken || missing || scripted)
  process.exitCode = 1
