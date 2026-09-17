import type { BrowserOAuthClient, OAuthClientMetadataInput, OAuthSession } from '@atproto/oauth-client-browser'
import type { ClientMetadataOptions } from './metadata.ts'
import { clientMetadata as buildClientMetadata } from './metadata.ts'

export { spacesSupported } from '../supported.ts'
export type { ClientMetadataOptions } from './metadata.ts'
export type { OAuthSession } from '@atproto/oauth-client-browser'

export interface BrowserOAuthOptions extends ClientMetadataOptions {
  /** Where the PDS returns the user. Defaults to `fragment`, which keeps the authorization code out of the request your server sees. */
  responseMode?: 'query' | 'fragment'
  /** Allow `http:` authorization servers, for a local PDS. */
  allowHttp?: boolean
  /** Service that answers `resolveHandle`, since a browser cannot query DNS. Defaults to `https://bsky.social`. */
  handleResolver?: string | URL
  /** Defaults to `https://plc.directory`. A local PDS runs its own. */
  plcDirectoryUrl?: string | URL
}

export interface BrowserOAuthResult {
  /** Works as `createAirspace({ session })`. */
  session: OAuthSession
  did: string
  state: string | null
}

export interface BrowserOAuth {
  /** Serve at `metadataPath`. */
  readonly metadata: OAuthClientMetadataInput
  readonly client: BrowserOAuthClient
  /** Handle a redirect back from the PDS, restore a stored session, or `null` when neither applies. `state` is only set for a redirect. */
  init: (options?: { refresh?: boolean }) => Promise<BrowserOAuthResult | null>
  /** Navigates away; the promise never resolves. */
  signIn: (identifier: string, options?: { state?: string, signal?: AbortSignal }) => Promise<never>
  restore: (did: string) => Promise<OAuthSession>
  /** Revokes at the authorization server as well as dropping the stored session. */
  revoke: (did: string) => Promise<void>
}

/** Tokens and their storage stay in the browser; `@atproto/oauth-client-browser` is loaded on first call. */
export async function createBrowserOAuth(options: BrowserOAuthOptions): Promise<BrowserOAuth> {
  const { BrowserOAuthClient } = await import('@atproto/oauth-client-browser')
  const metadata = buildClientMetadata(options) as OAuthClientMetadataInput
  const client = new BrowserOAuthClient({
    clientMetadata: metadata,
    responseMode: options.responseMode,
    allowHttp: options.allowHttp,
    handleResolver: options.handleResolver ?? 'https://bsky.social',
    ...(options.plcDirectoryUrl ? { plcDirectoryUrl: options.plcDirectoryUrl } : {}),
  })
  return {
    metadata,
    client,
    async init(opts) {
      const result = await client.init(opts?.refresh)
      if (!result)
        return null
      return { session: result.session, did: result.session.did, state: result.state ?? null }
    },
    signIn: (identifier, opts) => client.signInRedirect(identifier, { scope: metadata.scope, state: opts?.state, signal: opts?.signal }),
    restore: did => client.restore(did),
    revoke: did => client.revoke(did),
  }
}
