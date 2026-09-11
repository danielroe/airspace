import type { PageServerLoad } from './$types'
import { useAirspace } from '$lib/airspace.server.ts'

export const load: PageServerLoad = async () => {
  const airspace = await useAirspace()
  const [me, notes] = await Promise.all([airspace.profile.get(), airspace.notes.list({ with: ['tag'] })])
  return { profile: me?.value ?? null, notes }
}
