import { scopesFor } from 'airspace'
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { notes, profile, tags, workspace } from '#shared/collections'
import { issueGrant, requireAccount } from '../../utils/demo.ts'

export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const { token, expiresAt } = await issueGrant(event)
  return {
    did: account.did,
    handle: account.handle,
    service: getRequestURL(event).origin,
    token,
    expiresAt,
    scopes: scopesFor({ collections: { notes, tags, profile }, spaces: { workspace } }),
  }
})
