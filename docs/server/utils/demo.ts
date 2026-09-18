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

const cookie = () => ({
  password: useRuntimeConfig().sessionPassword,
  name: 'airspace-demo',
  cookie: { secure: !import.meta.dev },
})

const ttl = 15 * 60_000
const limit = 100
const instances = new Map<string, { at: number, instance: Promise<DemoInstance> }>()
const grants = new Map<string, { at: number, account: DemoAccount }>()

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
  if (session.data.did) {
    instances.delete(session.data.did)
    for (const [token, grant] of grants) {
      if (grant.account.did === session.data.did)
        grants.delete(token)
    }
  }
  await session.clear()
}

/** A bearer token for the demo proxy, in place of the account password. */
export async function issueGrant(event: RequestEvent): Promise<{ token: string, expiresAt: string }> {
  const account = await requireAccount(event)
  const now = Date.now()
  for (const [token, grant] of grants) {
    if (now - grant.at > ttl)
      grants.delete(token)
    else if (grant.account.did === account.did)
      grants.delete(token)
  }
  if (grants.size >= limit)
    grants.delete(grants.keys().next().value!)
  const token = randomBytes(24).toString('base64url')
  grants.set(token, { at: now, account })
  return { token, expiresAt: new Date(now + ttl).toISOString() }
}

export function accountForGrant(token: string | undefined): DemoAccount | undefined {
  const grant = token ? grants.get(token) : undefined
  if (!grant)
    return undefined
  if (Date.now() - grant.at > ttl) {
    grants.delete(token!)
    return undefined
  }
  grant.at = Date.now()
  return grant.account
}

async function build(account: DemoAccount) {
  const service = useRuntimeConfig().pdsService
  const session = await passwordSession({ service, identifier: account.handle, password: account.password })
  const airspace = createAirspace({
    identity: { did: account.did as `did:${string}:${string}`, service },
    collections: { profile },
    spaces: { workspace },
    plugins: [timestamps()],
    session,
  })
  return { session, airspace }
}

type DemoInstance = Awaited<ReturnType<typeof build>>
export type DemoAirspace = DemoInstance['airspace']
export type DemoSession = DemoInstance['session']

export const useDemoAirspace = async (event: RequestEvent): Promise<DemoAirspace> => (await instanceFor(await requireAccount(event))).airspace

export const airspaceFor = async (account: DemoAccount): Promise<DemoAirspace> => (await instanceFor(account)).airspace

export const sessionFor = async (account: DemoAccount): Promise<DemoSession> => (await instanceFor(account)).session

async function instanceFor(account: DemoAccount): Promise<DemoInstance> {
  const now = Date.now()
  for (const [did, entry] of instances) {
    if (now - entry.at > ttl)
      instances.delete(did)
  }
  const hit = instances.get(account.did)
  if (hit) {
    hit.at = now
    return await hit.instance
  }
  if (instances.size >= limit)
    instances.delete(instances.keys().next().value!)
  const instance = build(account)
  instances.set(account.did, { at: now, instance })
  return await instance.catch((error) => {
    instances.delete(account.did)
    throw error
  })
}
