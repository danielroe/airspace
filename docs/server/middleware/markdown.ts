import type { RequestEvent } from 'nuxt/server'
import { defineEventHandler } from 'nuxt/server'
import { acceptsHtml, isKnownRoute, markdownRouteFor, notFoundMarkdown, prefersMarkdown } from '#shared/site'
import { markdownFor } from '../utils/markdown.ts'

function markdown(event: RequestEvent, body: string, status = 200) {
  event.res.status = status
  event.res.headers.set('content-type', 'text/markdown; charset=utf-8')
  event.res.headers.set('vary', 'Accept, Accept-Encoding')
  return body
}

/** Answers agents for anything the static handler did not serve: rendered documents, and missing paths. */
export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET' && event.req.method !== 'HEAD')
    return
  const { pathname } = event.url
  const accept = event.req.headers.get('accept')
  const route = markdownRouteFor(pathname)

  if (route) {
    if (!pathname.endsWith('.md') && !prefersMarkdown(accept))
      return
    const body = await markdownFor(route)
    return body && markdown(event, body)
  }

  if (isKnownRoute(pathname) || acceptsHtml(accept))
    return

  return markdown(event, notFoundMarkdown(pathname), 404)
})
