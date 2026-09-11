import { defineEventHandler } from 'nuxt/server'
import { useDemoAirspace } from '../../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const rkey = event.url.pathname.split('/').pop()!
  const published = await airspace.workspace.notes.publish(rkey)
  return { rkey: published.rkey }
})
