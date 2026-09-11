import type { DidString, NsidString } from '@atproto/lex-schema'
import type { AnyPlugin } from './plugin.ts'
import type { Infer, IsSingleton, RecordSchema, SortSpec } from './types.ts'
import { AirspaceError } from './errors.ts'
import { TYPE_ONLY } from './type-model.ts'

export interface BelongsTo<T extends RecordSchema = RecordSchema, P extends readonly AnyPlugin[] = []> {
  kind: 'belongsTo'
  target: () => Collection<T, any, P>
  /** Field holding the strongRef. */
  field: string
}

export interface HasMany<T extends RecordSchema = RecordSchema, P extends readonly AnyPlugin[] = []> {
  kind: 'hasMany'
  target: () => Collection<T, any, P>
  /** Field holding the list of refs. */
  field: string
}

export type Relation = BelongsTo<any, any> | HasMany<any, any>
export type Relations = Record<string, Relation>
export type NoRelations = Record<never, Relation>

export interface CollectionOptions<S extends RecordSchema, R extends Relations, P extends readonly AnyPlugin[]> {
  /** Default for `list()`. */
  sort?: readonly SortSpec<Infer<S>>[]
  relations?: R
  /** Run after airspace-wide plugins. */
  plugins?: P
}

export interface Collection<S extends RecordSchema, R extends Relations = NoRelations, P extends readonly AnyPlugin[] = []> {
  readonly kind: 'collection'
  readonly schema: S
  readonly nsid: S['$type']
  readonly singleton: IsSingleton<S>
  readonly sort: readonly SortSpec<Infer<S>>[]
  readonly relations: R
  readonly plugins: P
}

export type AnyCollection = Collection<any, any, any>
export type CollectionSchema<C> = C extends Collection<infer S, any, any> ? S : never
export type CollectionPlugins<C> = C extends Collection<any, any, infer P> ? P : never

export const literalKey = (key: string): string | undefined => key.startsWith('literal:') ? key.slice('literal:'.length) : undefined

/** Top-level property names of a record schema, or `undefined` if it is not an object. */
export function schemaFields(schema: RecordSchema): Set<string> | undefined {
  const shape = (schema.schema as { shape?: Record<string, unknown> }).shape
  return shape ? new Set(Object.keys(shape)) : undefined
}

/** Describe a collection from a record schema. */
export function defineCollection<const S extends RecordSchema, const R extends Relations = NoRelations, const P extends readonly AnyPlugin[] = []>(
  schema: S,
  options: CollectionOptions<S, R, P> = {},
): Collection<S, R, P> {
  return {
    kind: 'collection',
    schema,
    nsid: schema.$type,
    singleton: (literalKey(schema.key) !== undefined) as IsSingleton<S>,
    sort: options.sort ?? [],
    relations: options.relations ?? ({} as R),
    plugins: options.plugins ?? ([] as unknown as P),
  }
}

/** The record schemas in a `defineLexicons` result, by the name the lexicon map used. Spaces and permission sets are dropped. */
type RecordEntries<M> = { [K in keyof M as M[K] extends RecordSchema ? K : never]: M[K] extends RecordSchema ? M[K] : never }

/** Per-collection options for `defineCollections`, every collection optional. */
export type CollectionsSpec<M> = { [K in keyof RecordEntries<M>]?: CollectionOptions<RecordEntries<M>[K], Relations, readonly AnyPlugin[]> }

/** The collections a callback spec sees, before its own options are applied. */
export type BaseCollections<M> = { [K in keyof RecordEntries<M>]: Collection<RecordEntries<M>[K]> }

export type CollectionsFrom<M, O> = {
  [K in keyof RecordEntries<M>]: Collection<
    RecordEntries<M>[K],
    K extends keyof O ? (O[K] extends { relations: infer R extends Relations } ? R : NoRelations) : NoRelations,
    K extends keyof O ? (O[K] extends { plugins: infer P extends readonly AnyPlugin[] } ? P : []) : []
  >
}

function isRecordSchema(value: unknown): value is RecordSchema {
  return !!value && typeof (value as RecordSchema).$type === 'string' && typeof (value as RecordSchema).validate === 'function' && 'key' in (value as RecordSchema)
}

/**
 * A collection per record in a lexicon map, keyed by its short name, so a model
 * file is one call. Pass a callback to reference siblings in a relation:
 * `(c) => ({ notes: { relations: { tag: belongsTo(c.tags, 'tag') } } })`.
 */
export function defineCollections<const M extends Record<string, unknown>, const O extends CollectionsSpec<M> = Record<never, never>>(
  lexicons: M,
  options?: O | ((collections: BaseCollections<M>) => O),
): CollectionsFrom<M, O> {
  const collections: Record<string, AnyCollection> = {}
  for (const [name, schema] of Object.entries(lexicons)) {
    if (isRecordSchema(schema))
      collections[name] = defineCollection(schema)
  }
  const spec = (typeof options === 'function' ? options(collections as BaseCollections<M>) : options) ?? {}
  for (const [name, collection] of Object.entries(collections)) {
    const own = (spec as Record<string, CollectionOptions<any, any, any> | undefined>)[name]
    if (own)
      Object.assign(collection, { sort: own.sort ?? [], relations: own.relations ?? {}, plugins: own.plugins ?? [] })
  }
  return collections as CollectionsFrom<M, O>
}

/** A field pointing at `target`: a `com.atproto.repo.strongRef` or a bare `at-uri` string. Pass a thunk for circular references. */
export function belongsTo<T extends RecordSchema, P extends readonly AnyPlugin[]>(
  target: Collection<T, any, P> | (() => Collection<T, any, P>),
  field: string,
): BelongsTo<T, P> {
  return {
    kind: 'belongsTo',
    target: typeof target === 'function' ? target : () => target,
    field,
  }
}

/** A list field pointing at `target`, each entry a `com.atproto.repo.strongRef` or a bare `at-uri`. Refs that do not resolve are dropped. */
export function hasMany<T extends RecordSchema, P extends readonly AnyPlugin[]>(
  target: Collection<T, any, P> | (() => Collection<T, any, P>),
  field: string,
): HasMany<T, P> {
  return {
    kind: 'hasMany',
    target: typeof target === 'function' ? target : () => target,
    field,
  }
}

/** A `"type": "space"` lexicon def. */
export interface SpaceDeclaration<N extends NsidString = NsidString, K extends string = string> {
  readonly nsid: N
  readonly key: K
  /** Defaults to the NSIDs of the collections passed to `defineSpace`. */
  readonly collections?: readonly string[]
  readonly name?: string
  readonly description?: string
}

export interface SpaceOptions<C extends Record<string, AnyCollection>> {
  /** Defaults to the declaration's `literal:` key; required otherwise. */
  skey?: string
  /** `self` (default) is the airspace identity. */
  authority?: DidString | 'self'
  collections: C
}

export interface Space<D extends SpaceDeclaration = SpaceDeclaration, C extends Record<string, AnyCollection> = Record<string, AnyCollection>> {
  readonly kind: 'space'
  readonly declaration: D & { collections: readonly string[] }
  readonly type: D['nsid']
  readonly skey: string
  readonly authority: DidString | 'self'
  readonly collections: C
}

export type AnySpace = Space<SpaceDeclaration, any>
export type SpaceCollections<S> = S extends Space<any, infer C> ? C : never

/**
 * Model layer: bind a space declaration to the collections it holds, so they
 * gain a second, permissioned home alongside the public repo. The lexicon's
 * `space()` def declares the space; `airspace.<space>` is the client for it.
 */
export function defineSpace<const D extends SpaceDeclaration, const C extends Record<string, AnyCollection>>(
  declaration: D,
  options: SpaceOptions<C>,
): Space<D, C> {
  // A `model()` declaration carries no key, and a space key is `literal:self` in practice.
  const skey = options.skey ?? literalKey(declaration.key) ?? (TYPE_ONLY in declaration ? 'self' : undefined)
  if (!skey)
    throw new AirspaceError(`space ${declaration.nsid} has key "${declaration.key}"; pass \`skey\``)
  const mapped = Object.values(options.collections).map(c => c.nsid as string)
  const declared = declaration.collections ?? mapped
  for (const nsid of declared) {
    if (!mapped.includes(nsid))
      throw new AirspaceError(`space ${declaration.nsid} declares ${nsid} but no collection with that NSID was passed`)
  }
  return {
    kind: 'space',
    declaration: { ...declaration, collections: declared },
    type: declaration.nsid,
    skey,
    authority: options.authority ?? 'self',
    collections: options.collections,
  }
}
