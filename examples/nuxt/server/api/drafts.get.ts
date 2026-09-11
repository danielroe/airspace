export default defineEventHandler(async () => {
  const airspace = await useAirspace()
  const [drafts, live, tags] = await Promise.all([
    airspace.workspace.notes.list(),
    airspace.workspace.notes.published(),
    airspace.workspace.tags.list(),
  ])
  return {
    drafts: drafts.map(draft => ({ ...draft, published: live.includes(draft.rkey) })),
    tags: tags.map(tag => ({ rkey: tag.rkey, name: tag.value.name })),
  }
})
