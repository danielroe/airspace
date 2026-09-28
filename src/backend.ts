import type { LexMap } from '@atproto/lex-data'
import type { JsonValue } from '@atproto/lex-json'
import type { DidString, RecordSchema } from '@atproto/lex-schema'
import type { Xrpc } from './xrpc.ts'
import { jsonToLex, lexToJson } from '@atproto/lex-json'
import { blobUrl, cidFromBlob } from './blob.ts'
import { AirspaceError, ConflictError, ScopeError } from './errors.ts'
import { isDid, isHandle } from './identity.ts'
import { isXrpcError, wrapXrpc, xrpcMessage } from './xrpc.ts'

export interface RawRecord {
  uri: string
  cid: string
  value: unknown
}

export interface WriteRef {
  uri: string
  cid: string
}

/** One operation in an `applyWrites` batch; `value` is lex-encoded and validated. */
export interface BatchWrite {
  operation: 'create' | 'put' | 'delete'
  schema: RecordSchema
  rkey?: string
  value?: LexMap
}

interface PageOptions {
  limit?: number
  cursor?: string
  /** Oldest first. Records are newest first by default, because record keys are TIDs. */
  reverse?: boolean
  /** Hand back records the schema rejects, for a migration to rewrite. */
  unvalidated?: boolean
}

interface RawPage {
  records: RawRecord[]
  cursor?: string
}

/** Storage for a collection client: the public repo, or one member's repo in a space. */
export interface Backend {
  readonly repo: DidString
  /** `at://` prefix under which this backend's records live. */
  readonly location: string
  blobUrl: (blob: unknown) => string | null
  get: (schema: RecordSchema, rkey: string) => Promise<RawRecord | null>
  page: (schema: RecordSchema, options?: PageOptions) => Promise<RawPage>
  list: (schema: RecordSchema, options?: { limit?: number, unvalidated?: boolean }) => AsyncIterable<RawRecord>
  create: (schema: RecordSchema, value: LexMap, rkey?: string) => Promise<WriteRef>
  put: (schema: RecordSchema, rkey: string, value: LexMap, ifMatch?: string) => Promise<WriteRef>
  delete: (schema: RecordSchema, rkey: string, ifMatch?: string) => Promise<void>
  /** One commit for every write, in order. A delete has no ref. */
  batch: (writes: readonly BatchWrite[]) => Promise<(WriteRef | undefined)[]>
}

export function isNotFound(err: unknown): boolean {
  return isXrpcError(err) && (err.status === 404 || err.error === 'RecordNotFound')
}

/** A grant minted before a collection joined the model fails with a 403 naming the scope. */
export async function scoped<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  }
  catch (err) {
    const scope = isXrpcError(err) && err.status === 403 ? /Missing required scope "([^"]+)"/.exec(xrpcMessage(err))?.[1] : undefined
    throw scope ? new ScopeError(scope, { cause: err }) : err
  }
}

/** `scoped` applied to every call a client makes. */
export function scopedClient<T extends Xrpc | undefined>(client: T): T {
  return (client && wrapXrpc(client, scoped)) as T
}

/** Turn the PDS's `InvalidSwap` into a typed conflict naming what was written. */
async function swapping<T>(schema: RecordSchema, rkey: string, ifMatch: string | undefined, write: () => Promise<T>): Promise<T> {
  try {
    return await scoped(write)
  }
  catch (err) {
    if (ifMatch && isXrpcError(err) && err.error === 'InvalidSwap')
      throw new ConflictError(schema.$type, rkey, ifMatch, { cause: err })
    throw err
  }
}

export const readOnly = (what = 'write'): AirspaceError => new AirspaceError(`this Airspace instance is read-only; pass a \`session\` to createAirspace to ${what}`)

export const PAGE = 100

/** Follow the cursor from a backend's `page` until the limit is reached or the records run out. */
export async function* paginate(page: Backend['page'], schema: RecordSchema, limit?: number, unvalidated?: boolean): AsyncIterable<RawRecord> {
  let cursor: string | undefined
  let left = limit
  do {
    const res = await page(schema, { limit: left === undefined ? PAGE : Math.min(left, PAGE), cursor, unvalidated })
    for (const record of res.records) {
      yield record
      if (left !== undefined && --left <= 0)
        return
    }
    cursor = res.cursor
  } while (cursor)
}

export type SpaceUri = `at://${string}`

/** `at://{authority}/space/{type}/{skey}` */
export function spaceUri(authority: DidString, type: string, skey: string): SpaceUri {
  return `at://${authority}/space/${type}/${skey}`
}

const NSID = /^[a-z][a-z0-9-]{0,62}(?:\.[a-z0-9][a-z0-9-]{0,62})+\.[a-z][a-z0-9]{0,62}$/i
const RKEY = /^(?!\.\.?$)[\w.:~-]{1,512}$/

const malformed = (uri: string, what: string): AirspaceError => new AirspaceError(`malformed at:// URI (${what}): ${uri}`)

/** Parse a public or space AT URI, throwing on any malformed part. */
export function parseAtUri(uri: string): {
  authority: DidString
  space?: { type: string, skey: string }
  author?: DidString
  collection?: string
  rkey?: string
} {
  const m = /^at:\/\/([^/?#]+)(?:\/(.*))?$/.exec(uri)
  if (!m || uri.length > 8192)
    throw new AirspaceError(`not an at:// URI: ${uri}`)
  const authority = m[1]!
  if (!isDid(authority) && !isHandle(authority))
    throw malformed(uri, 'authority')
  const parts = m[2] === undefined ? [] : m[2].split('/')
  if (parts.some(part => !part))
    throw malformed(uri, 'empty segment')
  const collectionAt = (index: number): string | undefined => {
    const collection = parts[index]
    if (collection !== undefined && !NSID.test(collection))
      throw malformed(uri, 'collection')
    return collection
  }
  const rkeyAt = (index: number): string | undefined => {
    const rkey = parts[index]
    if (rkey !== undefined && !RKEY.test(rkey))
      throw malformed(uri, 'rkey')
    return rkey
  }
  if (parts[0] === 'space') {
    if (parts.length > 6)
      throw malformed(uri, 'too many segments')
    const [, type, skey, author] = parts
    if (!type || !skey || !NSID.test(type) || !RKEY.test(skey))
      throw new AirspaceError(`malformed space URI: ${uri}`)
    if (author !== undefined && !isDid(author))
      throw malformed(uri, 'author')
    return { authority: authority as DidString, space: { type, skey }, author: author as DidString | undefined, collection: collectionAt(4), rkey: rkeyAt(5) }
  }
  if (parts.length > 2)
    throw malformed(uri, 'too many segments')
  return { authority: authority as DidString, author: authority as DidString, collection: collectionAt(0), rkey: rkeyAt(1) }
}

/**
 * Rewrite refs into this space as `at://author/collection/rkey`: a space URI is
 * not a valid `at-uri`, and a published copy should carry its draft's refs.
 */
export function repoShapedRefs(value: LexMap, space: SpaceUri, repo: DidString): LexMap {
  const prefix = `${space}/${repo}/`
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node))
      return node.map(walk)
    if (node && typeof node === 'object' && Object.getPrototypeOf(node) === Object.prototype) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node)) {
        out[k] = k === 'uri' && typeof v === 'string' && v.startsWith(prefix) ? `at://${repo}/${v.slice(prefix.length)}` : walk(v)
      }
      return out
    }
    return node
  }
  return walk(value) as LexMap
}

/**
 * This PDS does not host the repo. `listRecords` says so outright; `getRecord` tries to proxy to
 * whichever PDS does and reports the failure of that hop.
 */
function repoElsewhere(err: unknown): boolean {
  if (!isXrpcError(err))
    return false
  return err.error === 'UpstreamFailure' || (err.error === 'InvalidRequest' && /could not find repo/i.test(xrpcMessage(err)))
}

/** Reads from `primary`, falling back to `elsewhere()` once the PDS answers that it does not host the repo. */
export function withRepoFallback(primary: Backend, elsewhere: () => Promise<Backend>): Backend {
  let active = primary
  let resolved: Promise<Backend> | undefined
  const fallback = async (): Promise<Backend> => active = await (resolved ??= elsewhere())

  const attempt = async <T>(call: (backend: Backend) => Promise<T>): Promise<T> => {
    try {
      return await call(active)
    }
    catch (err) {
      if (!repoElsewhere(err))
        throw err
      return await call(await fallback())
    }
  }

  return {
    repo: primary.repo,
    get location() { return active.location },
    blobUrl: blob => active.blobUrl(blob),
    get: (schema, rkey) => attempt(backend => backend.get(schema, rkey)),
    page: (schema, options) => attempt(backend => backend.page(schema, options)),
    async* list(schema, options) {
      let started = false
      try {
        for await (const raw of active.list(schema, options)) {
          started = true
          yield raw
        }
        return
      }
      catch (err) {
        if (started || !repoElsewhere(err))
          throw err
      }
      yield* (await fallback()).list(schema, options)
    },
    create: (schema, value, rkey) => attempt(backend => backend.create(schema, value, rkey)),
    put: (schema, rkey, value, ifMatch) => attempt(backend => backend.put(schema, rkey, value, ifMatch)),
    delete: (schema, rkey, ifMatch) => attempt(backend => backend.delete(schema, rkey, ifMatch)),
    batch: writes => attempt(backend => backend.batch(writes)),
  }
}

export interface PublicBackendOptions {
  repo: DidString
  service: string
  read: Xrpc
  write?: Xrpc
}

const literalKey = (schema: RecordSchema): string | undefined => schema.key.startsWith('literal:') ? schema.key.slice('literal:'.length) : undefined

function requireKey(schema: RecordSchema, rkey: string | undefined): string {
  const key = rkey ?? literalKey(schema)
  if (key === undefined)
    throw new TypeError(`An "rkey" must be provided for record key type "${schema.key}" (${schema.$type})`)
  schema.keySchema.parse(key)
  return key
}

const encode = (schema: RecordSchema, value: LexMap): JsonValue => lexToJson({ ...value, $type: schema.$type })

interface JsonRecord { uri: string, cid?: string, value: JsonValue }

export function createPublicBackend({ repo, service, read, write }: PublicBackendOptions): Backend {
  const requireWrite = (): Xrpc => {
    if (!write)
      throw readOnly()
    return write
  }
  const page: Backend['page'] = async (schema, { limit = PAGE, cursor, reverse, unvalidated } = {}) => {
    const res = await read.query<{ records: JsonRecord[], cursor?: string }>('com.atproto.repo.listRecords', { repo, collection: schema.$type, limit, cursor, reverse })
    const records: RawRecord[] = []
    for (const record of res.records) {
      const value = jsonToLex(record.value)
      const result = schema.safeValidate(value)
      if (result.success)
        records.push({ uri: record.uri, cid: record.cid ?? '', value: result.value })
      else if (unvalidated)
        records.push({ uri: record.uri, cid: record.cid ?? '', value })
    }
    // `listRecords` hands back a cursor even on a short final page, so an absent cursor means the last page.
    return { records, cursor: res.records.length < limit ? undefined : res.cursor }
  }
  return {
    repo,
    location: `at://${repo}`,
    blobUrl: (blob) => {
      const cid = cidFromBlob(blob)
      return cid ? blobUrl(service, repo, cid) : null
    },
    async get(schema, rkey) {
      try {
        const res = await read.query<JsonRecord>('com.atproto.repo.getRecord', { repo, collection: schema.$type, rkey: requireKey(schema, rkey) })
        return { uri: res.uri, cid: res.cid ?? '', value: schema.validate(jsonToLex(res.value)) }
      }
      catch (err) {
        if (isNotFound(err))
          return null
        throw err
      }
    },
    page,
    list: (schema, { limit, unvalidated } = {}) => paginate(page, schema, limit, unvalidated),
    async create(schema, value, rkey) {
      const key = rkey ?? literalKey(schema)
      if (key !== undefined)
        schema.keySchema.parse(key)
      return await scoped(() => requireWrite().procedure<WriteRef>('com.atproto.repo.createRecord', { repo, collection: schema.$type, rkey: key, record: encode(schema, value) }))
    },
    async put(schema, rkey, value, ifMatch) {
      return await swapping(schema, rkey, ifMatch, () => requireWrite().procedure<WriteRef>('com.atproto.repo.putRecord', { repo, collection: schema.$type, rkey: requireKey(schema, rkey), record: encode(schema, value), swapRecord: ifMatch }))
    },
    async delete(schema, rkey, ifMatch) {
      await swapping(schema, rkey, ifMatch, () => requireWrite().procedure('com.atproto.repo.deleteRecord', { repo, collection: schema.$type, rkey: requireKey(schema, rkey), swapRecord: ifMatch }))
    },
    async batch(writes) {
      const ops = writes.map(({ operation, schema, rkey, value }) => ({
        $type: `com.atproto.repo.applyWrites#${operation === 'put' ? 'update' : operation}`,
        collection: schema.$type,
        rkey,
        ...(value ? { value: encode(schema, value) } : {}),
      }))
      const res = await scoped(() => requireWrite().procedure<{ results?: ({ uri: string, cid: string } | object)[] }>('com.atproto.repo.applyWrites', { repo, writes: ops }))
      return (res.results ?? []).map(result => 'uri' in result ? { uri: result.uri, cid: result.cid } : undefined)
    },
  }
}
