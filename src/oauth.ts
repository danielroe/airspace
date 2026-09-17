import type { NodeOAuthClient, NodeSavedSessionStore, NodeSavedStateStore, OAuthClientMetadataInput, OAuthSession } from '@atproto/oauth-client-node'
import type { ClientMetadataOptions } from './oauth/metadata.ts'
import { clientMetadata as buildClientMetadata } from './oauth/metadata.ts'

export type { ClientMetadataOptions } from './oauth/metadata.ts'
export { spacesSupported } from './supported.ts'
export type { NodeSavedSession, NodeSavedSessionStore, NodeSavedState, NodeSavedStateStore, OAuthSession } from '@atproto/oauth-client-node'

export interface OAuthOptions extends ClientMetadataOptions {
  stores: {
    /** In-flight authorizations. Defaults to memory. */
    state?: NodeSavedStateStore
    /** Sessions keyed by DID. */
    session: NodeSavedSessionStore
  }
  /** Allow `http:` authorization servers, for a local PDS. */
  allowHttp?: boolean
  /** Where handles resolve, when DNS and `.well-known` cannot answer. A local PDS serves `resolveHandle`. */
  handleResolver?: string | URL
  /** Defaults to `https://plc.directory`. A local PDS runs its own. */
  plcDirectoryUrl?: string | URL
}

export interface OAuth {
  /** Serve at `metadataPath`. */
  readonly metadata: OAuthClientMetadataInput
  readonly client: NodeOAuthClient
  /** URL to redirect the user to. */
  authorize: (identifier: string, options?: { state?: string }) => Promise<URL>
  /** The session works as `createAirspace({ session })`. */
  callback: (params: URLSearchParams) => Promise<{ session: OAuthSession, did: string, state: string | null }>
  restore: (did: string) => Promise<OAuthSession>
  revoke: (did: string) => Promise<void>
}

/** Metadata for a public, DPoP-bound client. Loopback origins encode it into the `client_id`. */
export function clientMetadata(options: ClientMetadataOptions): OAuthClientMetadataInput {
  return buildClientMetadata(options) as OAuthClientMetadataInput
}

function memoryStore<T>(): { get: (k: string) => Promise<T | undefined>, set: (k: string, v: T) => Promise<void>, del: (k: string) => Promise<void> } {
  const map = new Map<string, T>()
  return {
    async get(k) { return map.get(k) },
    async set(k, v) { map.set(k, v) },
    async del(k) { map.delete(k) },
  }
}

// Imported lazily: loading `@atproto/oauth-client-node` swaps Node's global undici dispatcher.
export async function createOAuth(options: OAuthOptions): Promise<OAuth> {
  const { NodeOAuthClient, requestLocalLock } = await import('@atproto/oauth-client-node')
  const metadata = clientMetadata(options)
  const client = new NodeOAuthClient({
    clientMetadata: metadata,
    stateStore: options.stores.state ?? memoryStore(),
    sessionStore: options.stores.session,
    requestLock: requestLocalLock,
    allowHttp: options.allowHttp,
    ...(options.handleResolver ? { handleResolver: options.handleResolver } : {}),
    ...(options.plcDirectoryUrl ? { plcDirectoryUrl: options.plcDirectoryUrl } : {}),
  })
  return {
    metadata,
    client,
    authorize: (identifier, opts) => client.authorize(identifier, { scope: metadata.scope, state: opts?.state }),
    async callback(params) {
      const { session, state } = await client.callback(params)
      return { session, did: session.did, state }
    },
    restore: did => client.restore(did),
    revoke: did => client.revoke(did),
  }
}
