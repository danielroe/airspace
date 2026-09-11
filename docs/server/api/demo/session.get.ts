import { defineEventHandler } from 'nuxt/server'
import { demoSession } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const { data } = await demoSession(event)
  return data.did ? { did: data.did, handle: data.handle! } : null
})
