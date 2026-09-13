import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { markdownRouteRules, vercelMarkdownRoutes } from '../modules/markdown.ts'
import { docsPages } from '../shared/docs-nav.ts'
import {
  acceptsHtml,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemap,
  isKnownRoute,
  landingMarkdown,
  markdownRouteFor,
  notFoundMarkdown,
  prefersMarkdown,
  siteUrl,
} from '../shared/site.ts'

describe('accept negotiation', () => {
  it('should prefer markdown only when the client asks for it', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true)
    expect(prefersMarkdown('text/markdown, text/html;q=0.5')).toBe(true)
    expect(prefersMarkdown('text/markdown, text/html')).toBe(true)
    expect(prefersMarkdown('text/x-markdown')).toBe(true)
    expect(prefersMarkdown('text/markdown;q=0')).toBe(false)
    expect(prefersMarkdown('text/markdown;q=0.5, text/html;q=0.9')).toBe(false)
    expect(prefersMarkdown('text/html,application/xhtml+xml,*/*;q=0.8')).toBe(false)
    expect(prefersMarkdown('*/*')).toBe(false)
    expect(prefersMarkdown(null)).toBe(false)
  })

  it('should detect clients that can render the html error page', () => {
    expect(acceptsHtml('text/html,application/xhtml+xml,*/*;q=0.8')).toBe(true)
    expect(acceptsHtml('text/markdown, text/html;q=0.5')).toBe(true)
    expect(acceptsHtml('text/html;q=0')).toBe(false)
    expect(acceptsHtml('*/*')).toBe(false)
    expect(acceptsHtml(null)).toBe(false)
  })
})

describe('markdown routes', () => {
  it('should resolve documents from both their html and markdown urls', () => {
    expect(markdownRouteFor('/')).toEqual({ path: '/', markdownPath: '/index.md' })
    expect(markdownRouteFor('/index.md')).toEqual({ path: '/', markdownPath: '/index.md' })
    expect(markdownRouteFor('/docs')?.page?.slug).toBe('index')
    expect(markdownRouteFor('/docs.md')?.markdownPath).toBe('/docs.md')
    expect(markdownRouteFor('/docs/spaces')?.page?.slug).toBe('spaces')
    expect(markdownRouteFor('/docs/spaces.md')?.markdownPath).toBe('/docs/spaces.md')
    expect(markdownRouteFor('/docs/spaces/')?.page?.slug).toBe('spaces')
  })

  it('should not resolve unknown paths', () => {
    expect(markdownRouteFor('/docs/nope')).toBeUndefined()
    expect(markdownRouteFor('/pricing')).toBeUndefined()
  })

  it('should treat rendered routes and file requests as known', () => {
    expect(isKnownRoute('/demo/notes/abc')).toBe(true)
    expect(isKnownRoute('/api/docs/spaces')).toBe(true)
    expect(isKnownRoute('/docs/spaces/_payload.json')).toBe(true)
    expect(isKnownRoute('/llms.txt')).toBe(true)
    expect(isKnownRoute('/og.png')).toBe(true)
    expect(isKnownRoute('/definitely-not-here')).toBe(false)
    expect(isKnownRoute('/definitely-not-here.md')).toBe(false)
  })
})

describe('markdown bodies', () => {
  it('should point a 404 at the recovery entry points', () => {
    const body = notFoundMarkdown('/definitely-not-here')
    expect(body.startsWith('# 404 · airspace')).toBe(true)
    expect(body).toContain('`/definitely-not-here` does not exist')
    expect(body).toContain(`${siteUrl}/docs`)
    expect(body).toContain(`${siteUrl}/llms.txt`)
    expect(body).toContain(`${siteUrl}/sitemap.xml`)
  })

  it('should give the landing page a heading and every docs link', () => {
    const body = landingMarkdown({ model: '', site: '' })
    expect(body.startsWith('# airspace')).toBe(true)
    for (const page of docsPages)
      expect(body).toContain(`(${siteUrl}${page.path})`)
  })
})

describe('document variants', () => {
  it('should give every docs page the heading its nav entry promises', () => {
    for (const page of docsPages) {
      const source = readFileSync(new URL(`../content/docs/${page.slug}.md`, import.meta.url), 'utf8')
      expect(source.split('\n')[0]).toBe(`# ${page.title}`)
    }
  })

  it('should vary html and markdown responses on accept', () => {
    const rules = markdownRouteRules()
    expect(rules['/docs/spaces']).toEqual({
      headers: {
        vary: 'Accept, Accept-Encoding',
        link: '</docs/spaces.md>; rel="alternate"; type="text/markdown"',
      },
    })
    expect(rules['/docs/spaces.md']).toEqual({ headers: { vary: 'Accept, Accept-Encoding' } })
    expect(rules['/']?.headers.link).toBe('</index.md>; rel="alternate"; type="text/markdown"')
    expect(Object.keys(rules)).toHaveLength((docsPages.length + 1) * 2)
  })

  it('should rewrite to markdown at the cdn for every document', () => {
    const routes = vercelMarkdownRoutes()
    expect(routes).toHaveLength(docsPages.length + 1)
    expect(routes[0]).toEqual({
      src: '^/$',
      has: [{ type: 'header', key: 'accept', value: '.*text/(x-)?markdown.*' }],
      dest: '/index.md',
      headers: { vary: 'Accept, Accept-Encoding' },
    })
    for (const route of routes)
      expect(new RegExp(route.src).test(route.dest.replace(/(\/index)?\.md$/, '') || '/')).toBe(true)
  })
})

describe('machine-readable files', () => {
  it('should list every docs page in llms.txt as markdown', () => {
    const llms = buildLlmsTxt()
    expect(llms.startsWith('# airspace\n\n> ')).toBe(true)
    for (const page of docsPages)
      expect(llms).toContain(`[${page.title}](${siteUrl}${page.path}.md)`)
  })

  it('should allow crawling and advertise the sitemap in robots.txt', () => {
    expect(buildRobotsTxt()).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`)
  })

  it('should emit absolute urls in a valid sitemap', () => {
    const sitemap = buildSitemap()
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    expect(sitemap).toContain(`<loc>${siteUrl}/</loc>`)
    for (const page of docsPages)
      expect(sitemap).toContain(`<loc>${siteUrl}${page.path}</loc>`)
    expect(sitemap).not.toContain('<loc>/')
  })
})
