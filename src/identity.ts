import type { DidString, Identity } from './types.ts'
import { AirspaceError } from './errors.ts'

const PUBLIC_API = 'https://public.api.bsky.app'
const DOH = 'https://cloudflare-dns.com/dns-query'

export type IdentityInput = string | Identity | (Partial<Identity> & { did: DidString })

interface DidDocument {
  alsoKnownAs?: string[]
  service?: Array<{ id: string, type: string, serviceEndpoint: string }>
}

const isDid = (value: string): value is DidString => value.startsWith('did:')

// Per spec: `_atproto` DNS TXT, then the well-known file, then the public appview.
async function resolveHandle(handle: string): Promise<DidString> {
  const fromDns = await resolveHandleDns(handle)
  if (fromDns)
    return fromDns
  try {
    const res = await fetch(`https://${handle}/.well-known/atproto-did`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const text = (await res.text()).trim()
      if (isDid(text))
        return text
    }
  }
  catch {}
  const res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)
  if (!res.ok)
    throw new AirspaceError(`could not resolve handle ${handle}: ${res.status}`)
  const { did } = await res.json() as { did: DidString }
  return did
}

function didFromTxt(records: Iterable<string>): DidString | undefined {
  for (const value of records) {
    if (value.startsWith('did=') && isDid(value.slice(4)))
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
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok)
      return undefined
    const { Answer } = await res.json() as { Answer?: { data?: string }[] }
    return didFromTxt((Answer ?? []).map(answer => (answer.data ?? '').replace(/^"|"$/g, '')))
  }
  catch {
    return undefined
  }
}

async function resolveDidDocument(did: DidString): Promise<DidDocument> {
  const url = did.startsWith('did:plc:')
    ? `https://plc.directory/${did}`
    : did.startsWith('did:web:')
      ? `https://${did.slice('did:web:'.length)}/.well-known/did.json`
      : null
  if (!url)
    throw new AirspaceError(`unsupported DID method: ${did}`)
  const res = await fetch(url)
  if (!res.ok)
    throw new AirspaceError(`could not resolve ${did}: ${res.status}`)
  return await res.json() as DidDocument
}

function pdsEndpoint(doc: DidDocument): string | undefined {
  return doc.service?.find(s => s.id === '#atproto_pds' || s.id.endsWith('#atproto_pds'))?.serviceEndpoint
}

/** `{ did, service }` needs no network and resolves synchronously; anything else goes handle -> DID -> PDS. */
export function resolveIdentity(input: IdentityInput): Identity | Promise<Identity> {
  if (typeof input !== 'string' && !isDid(String(input?.did)))
    throw new AirspaceError(`identity.did must be a DID, got ${JSON.stringify(input?.did)}`)
  if (typeof input === 'string' && !input.trim())
    throw new AirspaceError('identity must be a handle or a DID, got an empty string')
  if (typeof input !== 'string' && input.service)
    return { did: input.did, handle: input.handle, service: input.service }
  return (async () => {
    const did = typeof input !== 'string' ? input.did : isDid(input) ? input : await resolveHandle(input)
    const doc = await resolveDidDocument(did)
    const service = pdsEndpoint(doc)
    if (!service)
      throw new AirspaceError(`${did} has no #atproto_pds service`)
    const given = typeof input === 'string' ? (isDid(input) ? undefined : input) : input.handle
    return { did, handle: given ?? handleFromDoc(doc), service }
  })()
}

function handleFromDoc(doc: DidDocument): string | undefined {
  const aka = doc.alsoKnownAs?.find(a => a.startsWith('at://'))
  return aka?.slice('at://'.length)
}
