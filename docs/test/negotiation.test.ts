import { describe, expect, it, vi } from 'vitest'
import { landingMarkdown } from '../shared/site.ts'

vi.mock('../server/utils/markdown.ts', () => ({
  markdownFor: async (route: { page?: { slug: string } }) => (route.page ? `# ${route.page.slug}\n\nsource\n` : landingMarkdown()),
}))

const middleware = await import('../server/middleware/markdown.ts').then(m => m.default)
const plugin = await import('../server/plugins/markdown.ts').then(m => m.default)

function event(path: string, accept?: string, method = 'GET') {
  return {
    req: { method, headers: new Headers(accept ? { accept } : {}) },
    res: { status: undefined as number | undefined, headers: new Headers() },
    url: new URL(`https://getair.space${path}`),
  }
}

type FakeEvent = ReturnType<typeof event>

const onRequest = (() => {
  let hook: ((event: FakeEvent) => void) | undefined
  plugin({ hooks: { hook: (name: string, fn: (event: FakeEvent) => void) => {
    if (name === 'request')
      hook = fn
  } } } as never)
  return (e: FakeEvent) => hook!(e)
})()

const handle = (e: FakeEvent) => (middleware as unknown as (event: FakeEvent) => Promise<string | undefined>)(e)

describe('request hook', () => {
  it('should rewrite to the markdown variant when the client prefers markdown', () => {
    const page = event('/docs/spaces', 'text/markdown')
    onRequest(page)
    expect(page.url.pathname).toBe('/docs/spaces.md')

    const landing = event('/', 'text/markdown')
    onRequest(landing)
    expect(landing.url.pathname).toBe('/index.md')
  })

  it('should leave html clients, other routes and non-GET requests alone', () => {
    const html = event('/docs/spaces', 'text/html,*/*;q=0.8')
    onRequest(html)
    expect(html.url.pathname).toBe('/docs/spaces')

    const demo = event('/demo', 'text/markdown')
    onRequest(demo)
    expect(demo.url.pathname).toBe('/demo')

    const alreadyMarkdown = event('/docs/spaces.md', 'text/markdown')
    onRequest(alreadyMarkdown)
    expect(alreadyMarkdown.url.pathname).toBe('/docs/spaces.md')

    const post = event('/docs/spaces', 'text/markdown', 'POST')
    onRequest(post)
    expect(post.url.pathname).toBe('/docs/spaces')
  })
})

describe('markdown middleware', () => {
  it('should render documents that the static handler did not serve', async () => {
    const e = event('/docs/spaces.md')
    await expect(handle(e)).resolves.toBe('# spaces\n\nsource\n')
    expect(e.res.status).toBe(200)
    expect(e.res.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(e.res.headers.get('vary')).toBe('Accept, Accept-Encoding')
  })

  it('should leave documents as html for clients that did not ask for markdown', async () => {
    const e = event('/docs/spaces', 'text/html')
    await expect(handle(e)).resolves.toBeUndefined()
    expect(e.res.status).toBeUndefined()
  })

  it('should answer missing paths with a markdown 404', async () => {
    for (const accept of ['text/markdown', '*/*', undefined]) {
      const e = event('/does-not-exist', accept)
      expect(await handle(e)).toContain('# 404 · airspace')
      expect(e.res.status).toBe(404)
      expect(e.res.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    }
  })

  it('should leave the html error page to browsers', async () => {
    const e = event('/does-not-exist', 'text/html,*/*;q=0.8')
    await expect(handle(e)).resolves.toBeUndefined()
    expect(e.res.status).toBeUndefined()
  })

  it('should not claim that existing non-document routes are missing', async () => {
    for (const path of ['/demo/notes/abc', '/api/docs/spaces', '/llms.txt', '/og.png'])
      await expect(handle(event(path, 'text/markdown'))).resolves.toBeUndefined()
  })
})
