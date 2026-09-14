import type { ResolveOptions } from './network.ts'
import type { DidString, Identity } from './types.ts'
import { AirspaceError } from './errors.ts'
import { assertPublicUrl, boundedJson, boundedText, FETCH_TIMEOUT, isPublicHostname } from './network.ts'

const PUBLIC_API = 'https://public.api.bsky.app'
const DOH = 'https://cloudflare-dns.com/dns-query'
const PLC = 'https://plc.directory'

export type IdentityInput = string | Identity | (Partial<Identity> & { did: DidString })
export type { ResolveOptions }

interface DidDocument {
  id?: string
  alsoKnownAs?: string[]
  service?: Array<{ id: string, type: string, serviceEndpoint: string }>
}

const DID_PLC = /^did:plc:[a-z2-7]{24}$/
const DID_WEB_LOCALHOST = /^did:web:localhost(?:%3A\d{1,5})?$/i
const DID_SYNTAX = /^did:[a-z]+:[\w.:%-]*[\w.-]$/i

/** Syntactically a DID, of any method. */
export const isDid = (value: unknown): value is DidString => typeof value === 'string' && DID_SYNTAX.test(value) && value.length <= 2048

/** Syntactically a handle: a DNS name of at least two labels, not under a reserved TLD. */
export const isHandle: (value: unknown) => value is string = isPublicHostname

/** A `did:web` DID is supported in its hostname form only, with a `%3A`-encoded port for `localhost`. */
export function didWebUrl(did: string): URL | undefined {
  const host = did.slice('did:web:'.length)
  if (!isHandle(host) && !DID_WEB_LOCALHOST.test(did))
    return undefined
  return new URL(`https://${decodeURIComponent(host)}/.well-known/did.json`)
}

/** Only `did:plc` and `did:web` resolve to a DID document here. */
export const isResolvableDid = (value: unknown): value is DidString => typeof value === 'string' && (DID_PLC.test(value) || (value.startsWith('did:web:') && !!didWebUrl(value)))

const guarded = (url: URL): Promise<Response> => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), redirect: 'error' })

// Per spec: `_atproto` DNS TXT, then the well-known file, then the public appview.
async function resolveHandle(handle: string): Promise<DidString> {
  const fromDns = await resolveHandleDns(handle)
  if (fromDns)
    return fromDns
  try {
    const res = await guarded(new URL(`https://${handle}/.well-known/atproto-did`))
    if (res.ok) {
      const text = (await boundedText(res)).trim()
      if (isResolvableDid(text))
        return text
    }
  }
  catch {}
  const res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
  if (!res.ok)
    throw new AirspaceError(`could not resolve handle ${handle}: ${res.status}`)
  const { did } = await boundedJson<{ did?: unknown }>(res)
  if (!isResolvableDid(did))
    throw new AirspaceError(`could not resolve handle ${handle}: the directory answered with ${JSON.stringify(did)}`)
  return did
}

function didFromTxt(records: Iterable<string>): DidString | undefined {
  for (const value of records) {
    if (value.startsWith('did=') && isResolvableDid(value.slice(4)))
      return value.slice(4) as DidString
  }
  return undefined
}

type Resolver = (name: string) => Promise<string[][]>
let nodeResolver: Promise<Resolver | undefined> | undefined
function loadNodeResolver(): Promise<Resolver | undefined> {
  return nodeResolver ??= import('node:dns/promises').then(dns => dns.resolveTxt as Resolver, () => undefined)
}

// `node:dns` is absent at the edge and in a browser, so fall back to DNS over HTTPS there.
async function resolveHandleDns(handle: string): Promise<DidString | undefined> {
  const name = `_atproto.${handle}`
  const resolveTxt = await loadNodeResolver()
  if (resolveTxt) {
    try {
      return didFromTxt((await resolveTxt(name)).map(chunks => chunks.join('')))
    }
    catch {
      return undefined
    }
  }
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok)
      return undefined
    const { Answer } = await boundedJson<{ Answer?: { data?: string }[] }>(res)
    return didFromTxt((Array.isArray(Answer) ? Answer : []).map(answer => String(answer?.data ?? '').replace(/^"|"$/g, '')))
  }
  catch {
    return undefined
  }
}

async function resolveDidDocument(did: DidString, options: ResolveOptions): Promise<DidDocument> {
  let res: Response
  if (DID_PLC.test(did)) {
    res = await fetch(`${PLC}/${did}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
  }
  else if (did.startsWith('did:web:')) {
    const url = didWebUrl(did)
    if (!url)
      throw new AirspaceError(`malformed did:web: ${did}`)
    assertPublicUrl(url, options)
    res = await guarded(url)
  }
  else {
    throw new AirspaceError(`unsupported DID method: ${did}`)
  }
  if (!res.ok)
    throw new AirspaceError(`could not resolve ${did}: ${res.status}`)
  const doc = await boundedJson<DidDocument>(res)
  if (!doc || typeof doc !== 'object')
    throw new AirspaceError(`could not resolve ${did}: not a DID document`)
  if (did.startsWith('did:web:') && doc.id !== did)
    throw new AirspaceError(`could not resolve ${did}: the document describes ${JSON.stringify(doc.id)}`)
  return doc
}

function pdsEndpoint(did: DidString, doc: DidDocument, options: ResolveOptions): string {
  const services = Array.isArray(doc.service) ? doc.service : []
  const endpoint = services.find(s => s && typeof s.id === 'string' && (s.id === '#atproto_pds' || s.id.endsWith('#atproto_pds')))?.serviceEndpoint
  if (typeof endpoint !== 'string')
    throw new AirspaceError(`${did} has no #atproto_pds service`)
  let url: URL
  try {
    url = new URL(endpoint)
  }
  catch {
    throw new AirspaceError(`${did} has an invalid #atproto_pds endpoint: ${endpoint}`)
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw new AirspaceError(`${did} has an invalid #atproto_pds endpoint: ${endpoint}`)
  assertPublicUrl(url, options)
  return url.origin
}

/** `{ did, service }` needs no network and resolves synchronously; anything else goes handle -> DID -> PDS. */
export function resolveIdentity(input: IdentityInput, options: ResolveOptions = {}): Identity | Promise<Identity> {
  if (typeof input !== 'string' && !isDid(input?.did))
    throw new AirspaceError(`identity.did must be a DID, got ${JSON.stringify(input?.did)}`)
  if (typeof input === 'string' && !input.trim())
    throw new AirspaceError('identity must be a handle or a DID, got an empty string')
  if (typeof input === 'string' && !isDid(input) && !isHandle(input))
    throw new AirspaceError(`identity must be a handle or a DID, got ${JSON.stringify(input)}`)
  if (typeof input !== 'string' && input.service)
    return { did: input.did, handle: input.handle, service: input.service }
  return (async () => {
    const did = typeof input !== 'string' ? input.did : isDid(input) ? input : await resolveHandle(input.toLowerCase())
    if (!isResolvableDid(did))
      throw new AirspaceError(`unsupported or malformed DID: ${did}`)
    const doc = await resolveDidDocument(did, options)
    const service = pdsEndpoint(did, doc, options)
    const given = typeof input === 'string' ? (isDid(input) ? undefined : input) : input.handle
    return { did, handle: given ?? handleFromDoc(doc), service }
  })()
}

function handleFromDoc(doc: DidDocument): string | undefined {
  const aka = (Array.isArray(doc.alsoKnownAs) ? doc.alsoKnownAs : []).find(a => typeof a === 'string' && a.startsWith('at://'))
  const handle = aka?.slice('at://'.length)
  return isHandle(handle) ? handle : undefined
}
