import { createError, defineEventHandler } from 'nuxt/server'
import { useDemoAirspace } from '../../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const rkey = event.url.pathname.split('/').pop()!
  const note = await airspace.notes.get(rkey)
  if (!note)
    throw createError({ statusCode: 404, message: 'no such note' })
  return {
    title: note.value.title,
    createdAt: note.value.createdAt ?? null,
    body: note.meta.markdown,
    cover: await airspace.blobs.url(note.value.cover),
    tag: (await airspace.notes.resolve(note, 'tag'))?.value.name ?? null,
  }
})
