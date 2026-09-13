import { defineEventHandler } from 'nuxt/server'
import { buildSitemap } from '#shared/site'

export default defineEventHandler((event) => {
  event.res.headers.set('content-type', 'application/xml; charset=utf-8')
  return buildSitemap()
})
