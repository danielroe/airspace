import { defineEventHandler } from 'nuxt/server'
import { endSession } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  await endSession(event)
  return { ok: true }
})
