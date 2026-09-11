import type { Client } from '@atproto/lex-client'
import type { LexMap } from '@atproto/lex-data'
import type { DidString, RecordSchema } from '@atproto/lex-schema'
import { XrpcResponseError } from '@atproto/lex-client'
import { blobUrl, cidFromBlob } from './blob.ts'
import { AirspaceError, ConflictError, ScopeError } from './errors.ts'

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
  return err instanceof XrpcResponseError && (err.status === 404 || err.error === 'RecordNotFound')
}

/** A grant minted before a collection joined the model fails with a 403 naming the scope. */
export async function scoped<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  }
  catch (err) {
    const scope = err instanceof XrpcResponseError && err.status === 403 ? /Missing required scope "([^"]+)"/.exec(err.message)?.[1] : undefined
    throw scope ? new ScopeError(scope, { cause: err }) : err
  }
}

/** `scoped` applied to every call a client makes. */
export function scopedClient<T extends Client | undefined>(client: T): T {
  if (!client)
    return client
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (property !== 'call' || typeof value !== 'function')
        return value
      return (...args: Parameters<Client['call']>) => scoped(() => (value as Client['call']).apply(target, args))
    },
  }) as T
}

/** Turn the PDS's `InvalidSwap` into a typed conflict naming what was written. */
async function swapping<T>(schema: RecordSchema, rkey: string, ifMatch: string | undefined, write: () => Promise<T>): Promise<T> {
  try {
    return await scoped(write)
  }
  catch (err) {
    if (ifMatch && err instanceof XrpcResponseError && err.error === 'InvalidSwap')
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

/** Parse a public or space AT URI. */
export function parseAtUri(uri: string): {
  authority: DidString
  space?: { type: string, skey: string }
  author?: DidString
  collection?: string
  rkey?: string
} {
  const m = /^at:\/\/([^/]+)(?:\/(.*))?$/.exec(uri)
  if (!m)
    throw new AirspaceError(`not an at:// URI: ${uri}`)
  const authority = m[1] as DidString
  const parts = m[2] ? m[2].split('/') : []
  if (parts[0] === 'space') {
    const [, type, skey, author, collection, rkey] = parts
    if (!type || !skey)
      throw new AirspaceError(`malformed space URI: ${uri}`)
    return { authority, space: { type, skey }, author: author as DidString | undefined, collection, rkey }
  }
  const [collection, rkey] = parts
  return { authority, author: authority, collection, rkey }
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
  if (!(err instanceof XrpcResponseError))
    return false
  return err.error === 'UpstreamFailure' || (err.error === 'InvalidRequest' && /could not find repo/i.test(err.message))
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
  read: Client
  write?: Client
}

// `RecordKeyOptions<S>` does not resolve for a generic `S`, hence the casts; callers see concrete types.
export function createPublicBackend({ repo, service, read, write }: PublicBackendOptions): Backend {
  const requireWrite = (): Client => {
    if (!write)
      throw readOnly()
    return write
  }
  const page: Backend['page'] = async (schema, { limit = PAGE, cursor, reverse, unvalidated } = {}) => {
    const res = await read.list(schema, { repo, limit, cursor, reverse })
    // `listRecords` hands back a cursor even on a short final page, so an absent cursor means the last page.
    return { records: unvalidated ? res.records : res.records.filter(item => item.valid), cursor: res.records.length < limit ? undefined : res.cursor }
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
        const res = await read.get(schema, { repo, rkey } as any)
        return { uri: res.uri, cid: res.cid ?? '', value: res.value }
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
      return await scoped(() => requireWrite().create(schema, value as any, { repo, rkey } as any))
    },
    async put(schema, rkey, value, ifMatch) {
      return await swapping(schema, rkey, ifMatch, () => requireWrite().put(schema, value as any, { repo, rkey, swapRecord: ifMatch } as any))
    },
    async delete(schema, rkey, ifMatch) {
      await swapping(schema, rkey, ifMatch, () => requireWrite().delete(schema, { repo, rkey, swapRecord: ifMatch } as any))
    },
    async batch(writes) {
      const ops = writes.map(({ operation, schema, rkey, value }) => ({
        $type: `com.atproto.repo.applyWrites#${operation === 'put' ? 'update' : operation}`,
        collection: schema.$type,
        rkey,
        value,
      }))
      const res = await scoped(() => requireWrite().applyWrites(() => ops as any, { repo }))
      return (res.body.results ?? []).map(result => 'uri' in result ? { uri: result.uri, cid: result.cid } : undefined)
    },
  }
}
