import { defineEventHandler } from 'nuxt/server'
import { useDemoAirspace } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const airspace = await useDemoAirspace(event)
  const record = await airspace.profile.get()
  return record?.value ?? null
})
