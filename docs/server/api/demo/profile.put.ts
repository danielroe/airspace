import { createError, defineEventHandler, readBody } from 'nuxt/server'
import { useDemoAirspace } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const { displayName, bio } = await readBody<{ displayName?: string, bio?: string }>(event)
  const result = await airspace.profile.validate({ displayName: displayName ?? '', bio })
  if (!result.ok)
    throw createError({ statusCode: 400, message: result.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ') })
  await airspace.profile.put({ displayName: displayName!, bio })
  return { ok: true }
})
