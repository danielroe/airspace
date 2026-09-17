import { notes, profile, tags, workspace } from '#shared/collections'

const collections = new Set([notes.nsid, tags.nsid, profile.nsid])
const spaces = new Set([workspace.type])

const anonymous = new Set([
  'com.atproto.identity.resolveHandle',
  'com.atproto.repo.describeRepo',
  'com.atproto.repo.getRecord',
  'com.atproto.repo.listRecords',
  'com.atproto.server.describeServer',
  'com.atproto.sync.getBlob',
])

const authenticated = new Set([
  'com.atproto.repo.applyWrites',
  'com.atproto.repo.createRecord',
  'com.atproto.repo.deleteRecord',
  'com.atproto.repo.putRecord',
  'com.atproto.repo.uploadBlob',
  'com.atproto.server.getSession',
])

const authenticatedPrefixes = ['com.atproto.space.', 'com.atproto.simplespace.']

export const blobLimit = 1_000_000

export interface ProxyRequest {
  method: string
  params: URLSearchParams
  body?: unknown
}

export type ProxyDecision = { ok: true, authenticated: boolean } | { ok: false, status: number, message: string }

const deny = (message: string, status = 403): ProxyDecision => ({ ok: false, status, message })

const outside = (): ProxyDecision => deny(`the demo grant only covers ${[...collections].join(', ')}`)

/** Reads of the demo collections are open; everything else needs a grant. */
export function inspect({ method, params, body }: ProxyRequest): ProxyDecision {
  const authed = authenticated.has(method) || authenticatedPrefixes.some(prefix => method.startsWith(prefix))
  if (!authed && !anonymous.has(method))
    return deny(`${method} is not available through the demo proxy`)

  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const values = (key: string): string[] => [...params.getAll(key), ...(typeof record[key] === 'string' ? [record[key]] : [])]

  for (const nsid of values('collection')) {
    if (!collections.has(nsid))
      return outside()
  }

  for (const uri of values('space')) {
    const [, , , literal, type] = uri.split('/')
    if (literal !== 'space' || !type || !spaces.has(type))
      return deny(`the demo grant only covers the ${workspace.type} space`)
  }

  if (Array.isArray(record.writes)) {
    for (const write of record.writes) {
      const nsid = (write as { collection?: unknown })?.collection
      if (typeof nsid !== 'string' || !collections.has(nsid))
        return outside()
    }
  }

  return { ok: true, authenticated: authed }
}

export function repoMatches(did: string, { params, body }: Omit<ProxyRequest, 'method'>): boolean {
  const named = params.get('repo') ?? (body && typeof body === 'object' ? (body as { repo?: unknown }).repo : undefined)
  return named == null || named === did
}
