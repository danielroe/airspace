import type { PageServerLoad } from './$types'
import { useAirspace } from '$lib/airspace.server.ts'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ params }) => {
  const airspace = await useAirspace()
  const note = await airspace.notes.get(params.rkey)
  if (!note)
    error(404, 'No such note')

  const [tag, cover] = await Promise.all([airspace.notes.resolve(note, 'tag'), airspace.blobs.url(note.value.cover)])
  return { note, tag: tag?.value.name ?? null, cover }
}
