import { useStorage } from 'nitro/storage'
import { createError, defineEventHandler } from 'nuxt/server'
import { docsPageFor } from '#shared/docs-nav'
import { parseSiteMarkdown, tableOfContents } from '../../utils/markdown.ts'

export default defineEventHandler(async (event) => {
  const slug = event.url.pathname.split('/').pop()
  const page = docsPageFor(slug)
  if (!page)
    throw createError({ statusCode: 404, message: 'Not found' })

  const source = await useStorage('assets:content').getItem<string>(`docs/${page.slug}.md`)
  if (!source)
    throw createError({ statusCode: 404, message: `content/docs/${page.slug}.md missing` })

  const document = await parseSiteMarkdown(source)
  return { document, toc: tableOfContents(document), title: page.title }
})
