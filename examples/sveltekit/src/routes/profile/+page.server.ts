import type { Actions, PageServerLoad } from './$types'
import { useAirspace } from '$lib/airspace.server.ts'
import { fail } from '@sveltejs/kit'

export const load: PageServerLoad = async () => {
  const airspace = await useAirspace()
  return { profile: (await airspace.profile.get())?.value ?? null }
}

export const actions: Actions = {
  async default({ request }) {
    const form = await request.formData()
    const value = {
      displayName: String(form.get('displayName') ?? '').trim(),
      bio: String(form.get('bio') ?? '').trim() || undefined,
    }

    const airspace = await useAirspace()
    const check = await airspace.profile.validate(value)
    if (!check.ok)
      return fail(400, { message: check.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ') })

    await airspace.profile.put(value)
    return { message: 'Saved' }
  },
}
