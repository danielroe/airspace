import { definePlugin } from 'nitro'
import { markdownRouteFor, prefersMarkdown } from '#shared/site'

/**
 * Serves the markdown variant to clients that ask for it, per {@link https://acceptmarkdown.com}.
 * Runs on the request hook so that it rewrites before the static handler answers with prerendered
 * HTML; hosts that serve prerendered pages from a CDN need the equivalent rewrite in their own
 * config, as `vercelMarkdownRoutes` does.
 */
export default definePlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    if (event.req.method !== 'GET' && event.req.method !== 'HEAD')
      return
    if (event.url.pathname.endsWith('.md') || !prefersMarkdown(event.req.headers.get('accept')))
      return
    const route = markdownRouteFor(event.url.pathname)
    if (route)
      event.url.pathname = route.markdownPath
  })
})
