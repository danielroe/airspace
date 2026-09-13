import { defineEventHandler } from 'nuxt/server'
import { buildLlmsTxt } from '#shared/site'

export default defineEventHandler((event) => {
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  return buildLlmsTxt()
})
