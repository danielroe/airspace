import type { LexMap } from '@atproto/lex-data'
import type { JsonValue } from '@atproto/lex-json'
import type { CidString } from '@atproto/lex-schema'
import type { Backend, BatchWrite, RawRecord } from './backend.ts'
import type { Collection, CollectionPlugins, CollectionSchema, Relations } from './model.ts'
import type { AnyPlugin, MergeMeta, MergeTwo, PluginContext } from './plugin.ts'
import type { TypeOnly } from './type-model.ts'
import type { AirspaceRecord, Identity, Infer, InferRecordKey, IsSingleton, ListQuery, PageQuery, Plain, RecordInput, RecordSchema, SortSpec, ValidationIssue, ValidationResult, WriteResult } from './types.ts'
import { jsonToLex, lexToJson } from '@atproto/lex-json'
import { LexValidationError } from '@atproto/lex-schema'
import { MAX_BATCH } from './batch.ts'
import { AirspaceError, ValidationError } from './errors.ts'
import { literalKey } from './model.ts'
import { applyRead, applyWrite } from './plugin.ts'
import { TYPE_ONLY } from './type-model.ts'

/** Joined records, one per requested relation. `G` is the airspace-wide plugin meta. */
export type Related<R extends Relations, K extends keyof R, G = Record<never, never>> = {
  [P in K]: R[P] extends { kind: infer Kind, target: () => Collection<infer T, any, infer TP> }
    ? Kind extends 'hasMany' ? AirspaceRecord<T, MergeTwo<G, MergeMeta<TP>>>[] : AirspaceRecord<T, MergeTwo<G, MergeMeta<TP>>> | null
    : never
}

type Value<S extends RecordSchema> = Plain<Infer<S>>

/** What a relation field may hold: a strongRef, or a bare URI, which is what most published lexicons use. */
type RefField = string | { uri?: string } | undefined

type ListWithQuery<S extends RecordSchema, R extends Relations, K extends keyof R> = ListQuery<Value<S>> & { with: readonly K[] }

/** One `listRecords` page. `records` are newest first unless `reverse` is set. */
export interface RecordPage<S extends RecordSchema, M> {
  records: AirspaceRecord<S, M>[]
  /** Pass back as `cursor` for the next page. Absent on the last page. */
  cursor?: string
}

interface CollectionReads<S extends RecordSchema, R extends Relations, M, G> {
  /** One page straight from the PDS: no `where`, `sort` or `offset`, and a cursor back. */
  page: (query?: PageQuery) => Promise<RecordPage<S, M>>
  list: ((query?: ListQuery<Value<S>>) => Promise<AirspaceRecord<S, M>[]>) & (<K extends keyof R>(query: ListWithQuery<S, R, K>) => Promise<Array<AirspaceRecord<S, M> & { related: Related<R, K, G> }>>)
  resolve: <K extends keyof R>(record: AirspaceRecord<S, M>, relation: K) => Promise<Related<R, K, G>[K]>
}

/** Absent for a `model()` schema, which ships no validator. */
type Validates<S extends RecordSchema> = S extends TypeOnly ? unknown : {
  /** Run the write path over a value without writing it. */
  validate: (value: RecordInput<S>) => Promise<ValidationResult>
}

export interface WriteOptions {
  /** Only write if the record still has this CID, otherwise throw `ConflictError`. */
  ifMatch?: CidString
  /** Read the record first and skip the write when the prepared value is identical. */
  ifChanged?: boolean
}

/** `com.atproto.space.putRecord` takes no swap parameter, so `ifMatch` is a type error in a space. */
export interface SpaceWriteOptions extends WriteOptions {
  ifMatch?: never
}

export interface MigrateOptions {
  /** Transform and validate every record, report, and write nothing. */
  dryRun?: boolean
}

export interface MigrateReport {
  scanned: number
  changed: number
  /** Records the transform left as they were. */
  unchanged: number
  /** Issues by record key. Those records were left alone; the rest were still written. */
  failed: Record<string, ValidationIssue[]>
}

interface Migrates<S extends RecordSchema, M> {
  /** Rewrite every record in the collection, in `applyWrites` batches. */
  migrate: (transform: (value: Value<S>, record: AirspaceRecord<S, M>) => RecordInput<S>, options?: MigrateOptions) => Promise<MigrateReport>
}

export interface PublishOptions<S extends RecordSchema> extends WriteOptions {
  /** Adjust the value on its way into the public repo. */
  transform?: (value: Value<S>) => RecordInput<S>
}

export type KeyedCollection<S extends RecordSchema, R extends Relations, M = Record<never, never>, G = Record<never, never>, O extends WriteOptions = WriteOptions> = CollectionReads<S, R, M, G> & Validates<S> & Migrates<S, M> & {
  get: (rkey: InferRecordKey<S>) => Promise<AirspaceRecord<S, M> | null>
  create: (value: RecordInput<S>, options?: { rkey?: InferRecordKey<S> }) => Promise<WriteResult<S>>
  put: (rkey: InferRecordKey<S>, value: RecordInput<S>, options?: O) => Promise<WriteResult<S>>
  delete: (rkey: InferRecordKey<S>, options?: O) => Promise<void>
}

export type SingletonCollection<S extends RecordSchema, R extends Relations, M = Record<never, never>, G = Record<never, never>, O extends WriteOptions = WriteOptions> = CollectionReads<S, R, M, G> & Validates<S> & Migrates<S, M> & {
  get: () => Promise<AirspaceRecord<S, M> | null>
  put: (value: RecordInput<S>, options?: O) => Promise<WriteResult<S>>
  delete: (options?: O) => Promise<void>
}

/** Extra methods on collections inside a space. */
export interface SpaceExtras<S extends RecordSchema> {
  /** Copy the record into the public repo at the same key, leaving the draft in place. */
  publish: IsSingleton<S> extends true
    ? (options?: PublishOptions<S>) => Promise<WriteResult<S>>
    : (rkey: InferRecordKey<S>, options?: PublishOptions<S>) => Promise<WriteResult<S>>
  /** Keys in this collection that also exist in the public repo. One listing. */
  published: () => Promise<InferRecordKey<S>[]>
}

/** `P` is the collection's plugins, `G` the airspace-wide plugin meta. */
export type CollectionClient<S extends RecordSchema, R extends Relations, P extends readonly AnyPlugin[] = [], G = Record<never, never>, O extends WriteOptions = WriteOptions>
  = IsSingleton<S> extends true ? SingletonCollection<S, R, MergeTwo<G, MergeMeta<P>>, G, O> : KeyedCollection<S, R, MergeTwo<G, MergeMeta<P>>, G, O>

export type ClientFor<C extends AnyCollectionLike, G = Record<never, never>, O extends WriteOptions = WriteOptions> = CollectionClient<CollectionSchema<C>, C extends Collection<any, infer R, any> ? R : never, CollectionPlugins<C>, G, O>

/** The record type a collection client returns, plugins included. */
export type RecordOf<C extends AnyCollectionLike, G = Record<never, never>> = AirspaceRecord<CollectionSchema<C>, MergeTwo<G, MergeMeta<CollectionPlugins<C>>>>

type AnyCollectionLike = Collection<any, any, any>

export interface ClientContext {
  backend: () => Promise<Backend>
  identity: () => Promise<Identity>
  plugins: readonly AnyPlugin[]
  /** How long reads stay fresh, in milliseconds. `0` only shares in-flight reads. */
  ttl: number
  /** Backs the in-memory cache with something that survives the process. Errors are swallowed. */
  store?: {
    get: (key: string) => Promise<{ value: unknown } | undefined>
    set: (key: string, value: unknown) => Promise<void>
    clear: () => Promise<void>
  }
  /** Records behind a set of strongRef URIs, wherever they live. Missing ones are absent. */
  resolveRefs: (collection: AnyCollectionLike, uris: readonly string[]) => Promise<Map<string, AirspaceRecord<any, any>>>
  /** Present for collections inside a space: the public-repo client to publish into. */
  publishTarget?: <C extends AnyCollectionLike>(c: C) => ClientFor<C, any>
  /** Rewrites written values, e.g. refs into the current space. */
  prepareWrite?: (value: LexMap) => LexMap | Promise<LexMap>
}

/** Off the public surface: what `batch()` needs to prepare an operation the way a single write would. */
export const INTERNAL: unique symbol = Symbol('airspace.internal')

interface InternalClient {
  schema: RecordSchema
  /** The key of a singleton collection. */
  fixedRkey?: string
  prepare: (value: unknown, operation: 'create' | 'put', rkey?: string) => Promise<LexMap>
  invalidate: () => void
}

export type AnyClient = CollectionClient<any, any, any, any, any> & { invalidate: () => void, [INTERNAL]: InternalClient }

export const rkeyFromUri = (uri: string): string => uri.slice(uri.lastIndexOf('/') + 1)

export function createCollectionClient<S extends RecordSchema, R extends Relations, P extends readonly AnyPlugin[]>(
  collection: Collection<S, R, P>,
  ctx: ClientContext,
): AnyClient {
  const { schema } = collection
  // A `model()` schema validates nothing and knows no record key, so both call shapes are accepted and `self` is the fallback.
  const typeOnly = TYPE_ONLY in schema
  const fixedRkey = typeOnly ? 'self' : literalKey(schema.key)
  const plugins = [...ctx.plugins, ...collection.plugins]
  const context = (rkey?: string) => `${schema.$type}${rkey ? `/${rkey}` : ''}`

  const cache = new Map<string, { at: number, value: Promise<unknown> }>()
  const store = ctx.store

  const fromStore = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = await store!.get(key).catch(() => undefined)
    if (hit)
      return hit.value as T
    const value = await load()
    await store!.set(key, value).catch(() => {})
    return value
  }

  const remember = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key)
    if (hit && (ctx.ttl > 0 ? Date.now() - hit.at < ctx.ttl : hit.at === Infinity))
      return hit.value as Promise<T>
    const entry = { at: ctx.ttl > 0 ? Date.now() : Infinity, value: store ? fromStore(key, load) : load() }
    cache.set(key, entry)
    entry.value.then(() => {
      if (ctx.ttl === 0)
        cache.delete(key)
    }, () => cache.delete(key))
    return entry.value as Promise<T>
  }

  const invalidate = (): void => {
    cache.clear()
    void store?.clear().catch(() => {})
  }

  const pluginCtx = async (operation: PluginContext['operation']): Promise<PluginContext> => {
    const [identity, backend] = await Promise.all([ctx.identity(), ctx.backend()])
    return { identity, collection: collection as unknown as PluginContext['collection'], blobUrl: backend.blobUrl, operation }
  }

  const shell = async (raw: RawRecord): Promise<AirspaceRecord<S>> => ({
    uri: raw.uri as AirspaceRecord<S>['uri'],
    cid: raw.cid as AirspaceRecord<S>['cid'],
    rkey: rkeyFromUri(raw.uri) as InferRecordKey<S>,
    author: (await ctx.backend()).repo,
    value: lexToJson(raw.value as LexMap) as Value<S>,
    meta: {},
  })

  const withMeta = async (record: AirspaceRecord<S>): Promise<AirspaceRecord<S>> => {
    record.meta = await applyRead(plugins, record, await pluginCtx('read')) as AirspaceRecord<S>['meta']
    return record
  }

  const envelope = async (raw: RawRecord): Promise<AirspaceRecord<S>> => withMeta(await shell(raw))

  async function prepare(value: RecordInput<S>, operation: 'create' | 'put', rkey?: string): Promise<LexMap> {
    const written = await applyWrite(plugins, value as Record<string, unknown>, await pluginCtx(operation))
    const lex = jsonToLex({ ...written, $type: schema.$type } as JsonValue) as LexMap
    const rewritten = ctx.prepareWrite ? await ctx.prepareWrite(lex) : lex
    try {
      return schema.parse(rewritten) as LexMap
    }
    catch (err) {
      if (err instanceof LexValidationError)
        throw new ValidationError(context(rkey), err)
      throw err
    }
  }

  const writeResult = (res: { uri: string, cid: string }, changed = true): WriteResult<S> => ({
    uri: res.uri as WriteResult<S>['uri'],
    cid: res.cid as WriteResult<S>['cid'],
    rkey: rkeyFromUri(res.uri) as InferRecordKey<S>,
    changed,
  })

  async function get(rkey: string = fixedRkey!): Promise<AirspaceRecord<S> | null> {
    if (!schema.keySchema.safeParse(rkey).success)
      return null
    const raw = await remember(`get\0${rkey}`, async () => {
      try {
        return await (await ctx.backend()).get(schema, rkey)
      }
      catch (err) {
        if (err instanceof LexValidationError)
          throw new ValidationError(context(rkey), err)
        throw err
      }
    })
    return raw && await envelope(raw)
  }

  async function page(query: PageQuery = {}): Promise<RecordPage<S, Record<never, never>>> {
    const raw = await remember(`page\0${query.limit ?? ''}\0${query.cursor ?? ''}\0${query.reverse ?? ''}`, async () => (await ctx.backend()).page(schema, query))
    return { records: await Promise.all(raw.records.map(envelope)), cursor: raw.cursor }
  }

  async function listRaw(limit?: number, unvalidated?: boolean): Promise<RawRecord[]> {
    return await remember(`list\0${limit ?? ''}\0${unvalidated ?? ''}`, async () => {
      const out: RawRecord[] = []
      for await (const raw of (await ctx.backend()).list(schema, { limit, unvalidated })) out.push(raw)
      return out
    })
  }

  async function listAll(limit?: number, unvalidated?: boolean): Promise<AirspaceRecord<S>[]> {
    return await Promise.all((await listRaw(limit, unvalidated)).map(envelope))
  }

  const uriOf = (ref: RefField): string | undefined => {
    const uri = typeof ref === 'string' ? ref : ref?.uri
    return uri?.startsWith('at://') ? uri : undefined
  }

  /** The URIs a relation field points at: at most one for `belongsTo`, the whole list for `hasMany`. */
  function refUris(record: AirspaceRecord<S>, relation: keyof R): (string | undefined)[] {
    const rel = collection.relations[relation]
    if (!rel)
      throw new AirspaceError(`${schema.$type} has no relation "${String(relation)}"`)
    const held = (record.value as Record<string, unknown>)[rel.field]
    if (rel.kind === 'hasMany')
      return Array.isArray(held) ? (held as RefField[]).map(uriOf) : []
    return [uriOf(held as RefField)]
  }

  async function resolve(record: AirspaceRecord<S>, relation: keyof R) {
    const uris = refUris(record, relation)
    const found = await ctx.resolveRefs(collection.relations[relation]!.target(), uris.filter((u): u is string => !!u))
    if (collection.relations[relation]!.kind === 'hasMany')
      return uris.map(uri => uri && found.get(uri)).filter(Boolean)
    return (uris[0] && found.get(uris[0])) ?? null
  }

  async function list(query: (ListQuery<Value<S>> & { with?: readonly (keyof R)[] }) = {}) {
    const sort = query.sort ?? collection.sort
    const pushdown = query.limit !== undefined && !query.where && !sort.length && !query.offset
    const scanned = await Promise.all((await listRaw(pushdown ? query.limit : undefined)).map(shell))
    const records = applyQuery(scanned, query, collection.sort)
    await Promise.all(records.map(withMeta))
    if (!query.with?.length)
      return records

    const related = records.map(() => ({}) as Record<string, unknown>)
    await Promise.all(query.with.map(async (name) => {
      const many = collection.relations[name]!.kind === 'hasMany'
      const per = records.map(record => refUris(record, name))
      const found = await ctx.resolveRefs(collection.relations[name]!.target(), per.flat().filter((u): u is string => !!u))
      per.forEach((uris, i) => {
        related[i]![name as string] = many
          ? uris.map(uri => uri && found.get(uri)).filter(Boolean)
          : (uris[0] && found.get(uris[0])) ?? null
      })
    }))
    return records.map((record, i) => Object.assign(record, { related: related[i] }))
  }

  async function validate(value: RecordInput<S>): Promise<ValidationResult> {
    try {
      await prepare(value, 'put')
      return { ok: true }
    }
    catch (err) {
      if (err instanceof ValidationError)
        return { ok: false, issues: err.issues }
      throw err
    }
  }

  const written = async (write: (backend: Backend) => Promise<{ uri: string, cid: string }>): Promise<WriteResult<S>> => {
    const res = await write(await ctx.backend())
    invalidate()
    return writeResult(res)
  }

  async function create(value: RecordInput<S>, options: { rkey?: string } = {}): Promise<WriteResult<S>> {
    const lex = await prepare(value, 'create', options.rkey)
    return written(backend => backend.create(schema, lex, options.rkey))
  }

  async function put(...args: [RecordInput<S>, WriteOptions?] | [string, RecordInput<S>, WriteOptions?]): Promise<WriteResult<S>> {
    const keyed = typeof args[0] === 'string'
    const rkey = keyed ? args[0] as string : fixedRkey!
    const value = (keyed ? args[1] : args[0]) as RecordInput<S>
    const options = (keyed ? args[2] : args[1]) as WriteOptions | undefined ?? {}
    const lex = await prepare(value, 'put', rkey)
    if (options.ifChanged) {
      const existing = await get(rkey)
      if (existing && deepEqual(lexToJson(lex), existing.value))
        return writeResult(existing, false)
    }
    return written(backend => backend.put(schema, rkey, lex, options.ifMatch))
  }

  async function del(...args: [WriteOptions?] | [string, WriteOptions?]): Promise<void> {
    const keyed = typeof args[0] === 'string'
    const rkey = keyed ? args[0] as string : fixedRkey!
    const options = (keyed ? args[1] : args[0]) as WriteOptions | undefined ?? {}
    await (await ctx.backend()).delete(schema, rkey, options.ifMatch)
    invalidate()
  }

  async function publish(...args: [] | [PublishOptions<S>] | [string] | [string, PublishOptions<S>]): Promise<WriteResult<S>> {
    const rkey = typeof args[0] === 'string' ? args[0] : fixedRkey!
    const options = (typeof args[0] === 'string' ? args[1] : args[0]) ?? {}
    const draft = await get(rkey)
    if (!draft)
      throw new AirspaceError(`${context(rkey)} not found in ${(await ctx.backend()).location}`)
    const { $type, ...value } = draft.value as Record<string, unknown>
    const next = options.transform ? options.transform(draft.value) : value as RecordInput<S>
    const target = ctx.publishTarget!(collection) as unknown as KeyedCollection<S, R>
    return await target.put(rkey as InferRecordKey<S>, next, { ifMatch: options.ifMatch })
  }

  async function published(): Promise<string[]> {
    const target = ctx.publishTarget!(collection) as unknown as CollectionReads<S, R, any, any>
    const [drafts, live] = await Promise.all([listAll(), target.list()])
    const keys = new Set(live.map(record => record.rkey))
    return drafts.map(record => record.rkey).filter(rkey => keys.has(rkey))
  }

  async function migrate(transform: (value: Value<S>, record: AirspaceRecord<S>) => RecordInput<S>, options: MigrateOptions = {}): Promise<MigrateReport> {
    // Records the current schema rejects are the ones a migration is for, so the scan does not validate.
    const records = await listAll(undefined, true)
    const report: MigrateReport = { scanned: records.length, changed: 0, unchanged: 0, failed: {} }
    const writes: BatchWrite[] = []
    for (const record of records) {
      let lex: LexMap
      try {
        lex = await prepare(transform(record.value, record), 'put', record.rkey)
      }
      catch (err) {
        if (!(err instanceof ValidationError))
          throw err
        report.failed[record.rkey] = err.issues
        continue
      }
      if (deepEqual(lexToJson(lex), record.value)) {
        report.unchanged++
        continue
      }
      report.changed++
      writes.push({ operation: 'put', schema, rkey: record.rkey, value: lex })
    }
    if (!options.dryRun && writes.length) {
      const backend = await ctx.backend()
      for (let i = 0; i < writes.length; i += MAX_BATCH) await backend.batch(writes.slice(i, i + MAX_BATCH))
      invalidate()
    }
    return report
  }

  const api: Record<string | symbol, unknown> = collection.singleton
    ? { page, list, resolve, get, put, delete: del, migrate, invalidate }
    : { page, list, resolve, get, create, put, delete: del, migrate, invalidate }
  if (!typeOnly)
    api.validate = validate
  if (ctx.publishTarget) {
    api.publish = publish
    api.published = published
  }
  api[INTERNAL] = { schema, fixedRkey, prepare: (value, operation, rkey) => prepare(value as RecordInput<S>, operation, rkey), invalidate } satisfies InternalClient
  return api as unknown as AnyClient
}

function applyQuery<S extends RecordSchema>(
  records: AirspaceRecord<S>[],
  query: ListQuery<Value<S>>,
  defaultSort: readonly SortSpec<Value<S>>[],
): AirspaceRecord<S>[] {
  let out = records
  if (query.where) {
    const where = query.where
    out = typeof where === 'function'
      ? out.filter(r => where(r.value))
      : out.filter(r => Object.entries(where).every(([k, v]) => (r.value as Record<string, unknown>)[k] === v))
  }
  const sort = query.sort ?? defaultSort
  if (sort.length) {
    out = [...out].sort((a, b) => {
      for (const [field, direction = 'asc'] of sort) {
        const cmp = compare((a.value as Record<string, unknown>)[field], (b.value as Record<string, unknown>)[field])
        if (cmp !== 0)
          return direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }
  if (query.offset)
    out = out.slice(query.offset)
  if (query.limit !== undefined)
    out = out.slice(0, query.limit)
  return out
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b)
    return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b)
    return false
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

function compare(a: unknown, b: unknown): number {
  if (a === b)
    return 0
  if (a === undefined || a === null)
    return 1
  if (b === undefined || b === null)
    return -1
  if (typeof a === 'number' && typeof b === 'number')
    return a - b
  return String(a).localeCompare(String(b))
}
