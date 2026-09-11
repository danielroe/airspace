import { defineEventHandler } from 'nuxt/server'
import { useDemoAirspace } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const [profile, notes] = await Promise.all([
    airspace.profile.get(),
    airspace.notes.list({ with: ['tag'] }),
  ])
  return {
    profile: profile?.value ?? null,
    notes: notes.map(note => ({
      rkey: note.rkey,
      title: note.value.title,
      createdAt: note.value.createdAt ?? null,
      tag: note.related.tag?.value.name ?? null,
    })),
  }
})
