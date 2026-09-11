import { defineEventHandler } from 'nuxt/server'
import { useDemoAirspace } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const [drafts, published, tags] = await Promise.all([
    airspace.workspace.notes.list({ with: ['tag'] }),
    airspace.workspace.notes.published(),
    airspace.tags.list(),
  ])
  return {
    tags: tags.map(tag => ({ uri: tag.uri, cid: tag.cid, name: tag.value.name })),
    drafts: drafts.map(draft => ({
      rkey: draft.rkey,
      title: draft.value.title,
      tag: draft.related.tag?.value.name ?? null,
      published: published.includes(draft.rkey),
    })),
  }
})
