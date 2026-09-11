import type { DidString } from '@atproto/lex'
import { TestNetworkNoAppView } from '@atproto/dev-env'
import { Client } from '@atproto/lex'
import { vi } from 'vitest'

interface TestAccount {
  did: DidString
  handle: string
  password: string
  /** Authenticated agent for `createAirspace({ session })`. */
  session: { service: string, fetch: typeof fetch }
  /** Authenticated raw client, for writing records the Airspace would refuse. */
  raw: Client
}

export interface TestPds {
  service: string
  plc: string
  account: (name?: string) => Promise<TestAccount>
  close: () => Promise<void>
}

let counter = 0

/** A real PDS (with permissioned spaces) and PLC directory, in-process on SQLite. */
export async function startTestPds(options: { port?: number } = {}): Promise<TestPds> {
  const network = await TestNetworkNoAppView.create({ pds: options.port ? { port: options.port } : {} })
  const seed = network.getSeedClient()
  const service = network.pds.url

  return {
    service,
    plc: network.plc.url,
    async account(name = `user${++counter}`) {
      const handle = `${name}.test`
      const password = 'hunter2'
      await seed.createAccount(name, { handle: handle as `${string}.${string}`, email: `${handle}@example.com`, password })
      const did = seed.dids[name]!
      const bearer: typeof fetch = (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('authorization', `Bearer ${seed.accounts[did]!.accessJwt}`)
        return fetch(input, { ...init, headers })
      }
      const session = { service, fetch: bearer }
      return { did, handle, password, session, raw: new Client(session) }
    },
    close: () => network.close(),
  }
}

const urlOf = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)

/** Replace global fetch for the test with one that records XRPC method names. */
export function countCalls(): string[] {
  const calls: string[] = []
  const real = fetch
  vi.stubGlobal('fetch', ((input, init) => {
    calls.push(urlOf(input).pathname.replace('/xrpc/', ''))
    return real(input, init)
  }) as typeof fetch)
  return calls
}

/** Answer one XRPC method with a canned error for the rest of the test. */
export function stubXrpcError(method: string, status: number, body: unknown): void {
  const real = fetch
  vi.stubGlobal('fetch', ((input, init) => {
    if (urlOf(input).pathname === `/xrpc/${method}`)
      return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
    return real(input, init)
  }) as typeof fetch)
}

/** Answer every space method the way a PDS without the feature does: it tries to proxy the method and fails. */
export function hideSpaces(): void {
  const real = fetch
  vi.stubGlobal('fetch', ((input, init) => {
    if (/\/xrpc\/com\.atproto\.(?:simple)?space\./.test(urlOf(input).pathname))
      return Promise.resolve(Response.json({ error: 'UpstreamFailure', message: 'Upstream service unreachable' }, { status: 502 }))
    return real(input, init)
  }) as typeof fetch)
}

/** Route `plc.directory` and `public.api.bsky.app` to the test network for the rest of the test. */
export function routeIdentityTo(pds: TestPds): void {
  const real = fetch
  vi.stubGlobal('fetch', ((input, init) => {
    const url = urlOf(input)
    if (url.hostname === 'public.api.bsky.app')
      return real(`${pds.service}${url.pathname}${url.search}`, init)
    if (url.hostname === 'plc.directory')
      return real(`${pds.plc}${url.pathname}`, init)
    return real(input, init)
  }) as typeof fetch)
}
