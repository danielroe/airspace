import { defineEventHandler } from 'nuxt/server'
import { airspaceFor, createAccount } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const account = await createAccount(event)
  const airspace = await airspaceFor(account)
  await airspace.profile.put({ displayName: account.handle.split('.')[0]!, bio: 'A sandbox account on the airspace demo PDS.' })
  for (const name of ['ideas', 'writing']) await airspace.tags.create({ name })
  return { did: account.did, handle: account.handle }
})
