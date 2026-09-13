import { defineEventHandler } from 'nuxt/server'
import { documentRoutes, siteUrl } from '#shared/site'
import { markdownFor } from '../utils/markdown.ts'

export default defineEventHandler(async (event) => {
  const sections = await Promise.all(documentRoutes.map(async (route) => {
    const markdown = await markdownFor(route)
    return markdown && `<!-- source: ${siteUrl}${route.path} -->\n\n${markdown}`
  }))
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  return sections.filter(section => !!section).join('\n---\n\n')
})
