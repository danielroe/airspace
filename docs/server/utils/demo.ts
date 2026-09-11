import type { RequestEvent } from 'nuxt/server'
import { randomBytes, randomUUID } from 'node:crypto'
import { createAirspace, passwordSession } from 'airspace'
import { timestamps } from 'airspace/plugins/timestamps'
import { useSession } from 'nitro/h3'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { createError, toNuxtRequestEvent } from 'nuxt/server'
import { profile, workspace } from '#shared/collections'

export interface DemoAccount {
  did: string
  handle: string
  password: string
}

const cookie = () => ({ password: useRuntimeConfig().sessionPassword, name: 'airspace-demo' })

const ttl = 15 * 60_000
const limit = 100
const instances = new Map<string, { at: number, airspace: Promise<DemoAirspace> }>()

export const demoSession = (event: RequestEvent) => useSession<Partial<DemoAccount>>(toNuxtRequestEvent(event), cookie())

export async function requireAccount(event: RequestEvent): Promise<DemoAccount> {
  const { data } = await demoSession(event)
  if (!data.did || !data.handle || !data.password)
    throw createError({ statusCode: 401, message: 'no sandbox account; press "Try it" first' })
  return data as DemoAccount
}

/** Create a throwaway account on the demo PDS and remember it in the visitor's cookie. */
export async function createAccount(event: RequestEvent): Promise<DemoAccount> {
  const { pdsService, pdsInviteCode } = useRuntimeConfig()
  const describe = await fetch(`${pdsService}/xrpc/com.atproto.server.describeServer`)
  if (!describe.ok)
    throw createError({ statusCode: 502, message: `demo PDS at ${pdsService} is not answering` })
  const { availableUserDomains } = await describe.json() as { availableUserDomains?: string[] }
  const name = `demo-${randomUUID().slice(0, 8)}`
  const account: DemoAccount = {
    did: '',
    handle: `${name}${availableUserDomains?.[0] ?? '.test'}`,
    password: randomBytes(15).toString('base64url'),
  }
  const created = await fetch(`${pdsService}/xrpc/com.atproto.server.createAccount`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      handle: account.handle,
      email: `${name}@demo.invalid`,
      password: account.password,
      ...(pdsInviteCode ? { inviteCode: pdsInviteCode } : {}),
    }),
  })
  if (!created.ok)
    throw createError({ statusCode: 502, message: `could not create a sandbox account: ${await created.text()}` })
  account.did = (await created.json() as { did: string }).did

  const session = await demoSession(event)
  await session.update(account)
  return account
}

export async function endSession(event: RequestEvent): Promise<void> {
  const session = await demoSession(event)
  if (session.data.did)
    instances.delete(session.data.did)
  await session.clear()
}

function build(account: DemoAccount) {
  const service = useRuntimeConfig().pdsService
  return passwordSession({ service, identifier: account.handle, password: account.password })
    .then(session => createAirspace({
      identity: { did: account.did as `did:${string}:${string}`, service },
      collections: { profile },
      spaces: { workspace },
      plugins: [timestamps()],
      session,
    }))
}

export type DemoAirspace = Awaited<ReturnType<typeof build>>

export const useDemoAirspace = async (event: RequestEvent): Promise<DemoAirspace> => await airspaceFor(await requireAccount(event))

export async function airspaceFor(account: DemoAccount): Promise<DemoAirspace> {
  const now = Date.now()
  for (const [did, entry] of instances) {
    if (now - entry.at > ttl)
      instances.delete(did)
  }
  const hit = instances.get(account.did)
  if (hit) {
    hit.at = now
    return await hit.airspace
  }
  if (instances.size >= limit)
    instances.delete(instances.keys().next().value!)
  const airspace = build(account)
  instances.set(account.did, { at: now, airspace })
  return await airspace.catch((error) => {
    instances.delete(account.did)
    throw error
  })
}
