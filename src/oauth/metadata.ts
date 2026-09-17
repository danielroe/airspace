/** Structural form of the atproto client metadata document. */
export interface ClientMetadata {
  client_id: string
  client_name: string
  client_uri?: string
  redirect_uris: [string, ...string[]]
  scope: string
  grant_types: string[]
  response_types: string[]
  token_endpoint_auth_method: string
  application_type: string
  dpop_bound_access_tokens: boolean
}

export interface ClientMetadataOptions {
  /** App origin. Loopback origins get an inline `client_id`. */
  baseUrl: string
  redirectPath: string
  name: string
  /** See `scopesFor()`. */
  scopes: readonly string[]
  metadataPath?: string
}

const LOOPBACK = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/

/** Metadata for a public, DPoP-bound client, to serve at `metadataPath`. Loopback origins encode it into the `client_id`. */
export function clientMetadata(options: ClientMetadataOptions): ClientMetadata {
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const redirectUri = `${baseUrl}${options.redirectPath}`
  const scope = options.scopes.join(' ')
  const loopback = LOOPBACK.test(baseUrl)

  let clientId: string
  if (loopback) {
    const url = new URL('http://localhost')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope)
    clientId = url.toString()
  }
  else {
    clientId = `${baseUrl}${options.metadataPath ?? '/oauth-client-metadata.json'}`
  }

  return {
    client_id: clientId,
    client_name: options.name,
    ...(loopback ? {} : { client_uri: baseUrl }),
    redirect_uris: [redirectUri],
    scope,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  }
}
