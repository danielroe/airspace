import { defineEventHandler } from 'nuxt/server'
import { useDemoAirspace } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const [drafts, notes] = await Promise.all([airspace.workspace.notes.list(), airspace.notes.list()])
  await Promise.all([
    ...drafts.map(draft => airspace.workspace.notes.delete(draft.rkey)),
    ...notes.map(note => airspace.notes.delete(note.rkey)),
  ])
  return { deleted: drafts.length + notes.length }
})
