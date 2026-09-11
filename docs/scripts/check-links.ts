import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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
if (broken)
  process.exitCode = 1
