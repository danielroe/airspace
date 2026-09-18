import { useStorage } from 'nitro/storage'
import { createError, defineEventHandler, getQuery } from 'nuxt/server'
import { parseSiteMarkdown } from '../../utils/markdown.ts'

const bases: Record<string, string> = { route: 'assets:demoRoutes', shared: 'assets:demoShared', proxy: 'assets:demoProxy' }

export default defineEventHandler(async (event) => {
  const { base = 'route', file = '' } = getQuery<{ base?: string, file?: string }>(event)
  if (!bases[base] || !/^[\w./[\]-]+$/.test(file) || file.includes('..'))
    throw createError({ statusCode: 400, message: 'unknown source file' })
  const stored = await useStorage(bases[base]).getItem(file.replaceAll('/', ':'))
  if (!stored)
    throw createError({ statusCode: 404, message: `no source for ${file}` })
  const source = typeof stored === 'string' ? stored : new TextDecoder().decode(stored as Uint8Array)
  return await parseSiteMarkdown(['```ts', source.trimEnd(), '```'].join('\n'))
})
