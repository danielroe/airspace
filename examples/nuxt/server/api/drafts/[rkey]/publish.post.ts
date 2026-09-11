import { parseAtUri } from 'airspace'

export default defineEventHandler(async (event) => {
  const airspace = await useAirspace()
  const rkey = getRouterParam(event, 'rkey')!
  const draft = await airspace.workspace.notes.get(rkey)
  if (!draft)
    throw createError({ statusCode: 404, statusMessage: 'No such draft' })

  const tagRkey = draft.value.tag ? parseAtUri(draft.value.tag.uri).rkey : undefined
  if (tagRkey && !(await airspace.workspace.tags.published()).includes(tagRkey))
    await airspace.workspace.tags.publish(tagRkey)

  return await airspace.workspace.notes.publish(rkey)
})
