export default defineEventHandler(async (event) => {
  const airspace = await useAirspace()
  const note = await airspace.notes.get(getRouterParam(event, 'rkey')!)
  if (!note)
    throw createError({ statusCode: 404, statusMessage: 'No such note' })
  const [tag, cover] = await Promise.all([airspace.notes.resolve(note, 'tag'), airspace.blobs.url(note.value.cover)])
  return { note, tag: tag?.value.name ?? null, cover }
})
