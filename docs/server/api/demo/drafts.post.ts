import { createError, defineEventHandler } from 'nuxt/server'
import { useDemoAirspace } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const form = await event.req.formData()
  const title = String(form.get('title') ?? '')
  const body = String(form.get('body') ?? '')
  if (!title || !body)
    throw createError({ statusCode: 400, message: 'a draft needs a title and a body' })

  const file = form.get('cover')
  const cover = file instanceof File && file.size
    ? (await airspace.blobs.upload(file, { maxBytes: 1_000_000 })).blob
    : undefined

  const tagUri = String(form.get('tag') ?? '')
  const tag = tagUri ? { uri: tagUri, cid: String(form.get('tagCid')) } : undefined

  const draft = await airspace.workspace.notes.create({ title, body, tag, cover })
  return { rkey: draft.rkey }
})
