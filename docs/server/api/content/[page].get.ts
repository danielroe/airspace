import { useStorage } from 'nitro/storage'
import { createError, defineEventHandler } from 'nuxt/server'
import { parseSiteMarkdown } from '../../utils/markdown.ts'

export default defineEventHandler(async (event) => {
  const page = event.url.pathname.split('/').pop()
  if (!page || !/^[\w-]+$/.test(page))
    throw createError({ statusCode: 404, message: 'Not found' })

  const source = await useStorage('assets:content').getItem<string>(`${page}.md`)
  if (!source)
    throw createError({ statusCode: 404, message: `content/${page}.md missing` })

  return { document: await parseSiteMarkdown(source) }
})
