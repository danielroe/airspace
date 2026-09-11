export default defineEventHandler(async (event) => {
  const airspace = await useAirspace()
  const parts = await readMultipartFormData(event) ?? []
  const field = (name: string) => parts.find(part => part.name === name && !part.filename)?.data.toString()
  const file = parts.find(part => part.name === 'cover' && part.filename)

  const newTag = field('newTag')?.trim()
  const tag = newTag
    ? await airspace.workspace.tags.create({ name: newTag })
    : field('tag')
      ? await airspace.workspace.tags.get(field('tag')!)
      : null
  const cover = file?.data.length
    ? (await airspace.blobs.upload(new Uint8Array(file.data), { mimeType: file.type })).blob
    : undefined

  return await airspace.workspace.notes.create({
    title: field('title') ?? '',
    body: field('body') ?? '',
    tag: tag ? { uri: tag.uri, cid: tag.cid } : undefined,
    cover,
  })
})
