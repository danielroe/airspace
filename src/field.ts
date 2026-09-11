import type { LexMap, LexValue } from '@atproto/lex-data'
import type { ArraySchema, BlobSchema, BooleanSchema, EnumSchema, InferInput, InferOutput, IntegerSchema, LexiconRecordKey, NsidString, ObjectSchema, ObjectSchemaShape, OptionalSchema, RecordSchema, RefSchema, StringFormat, StringSchema, StringSchemaOptions, TypedObjectSchema, TypedObjectValidator, TypedRefSchema, TypedUnionSchema, Unknown$Type, Validator } from '@atproto/lex-schema'
import type { SpaceDeclaration } from './model.ts'
import type { PermissionSetDeclaration, PermissionSetSpec } from './permissions.ts'
import { l as base, STRING_FORMATS } from '@atproto/lex-schema'
import { describe, emitAs, fresh } from './describe.ts'
import { AirspaceError } from './errors.ts'
import { buildPermissionSet, isPermissionSetSpec } from './permissions.ts'

/** A field in a `defineLexicons(namespace, model)` record, before it is made optional or described. */
export interface Field<V extends Validator = Validator, O extends boolean = boolean> {
  readonly kind: 'field'
  readonly schema: V
  readonly isOptional: O
  /** Short names or NSIDs this field points at, checked when the model is built. */
  readonly refs: readonly string[]
  optional: () => Field<V, true>
  describe: (description: string) => Field<V, O>
}

export type AnyField = Field<any, boolean>

function make<V extends Validator, O extends boolean>(schema: V, isOptional: O, refs: readonly string[]): Field<V, O> {
  return {
    kind: 'field',
    schema,
    isOptional,
    refs,
    optional: () => make(schema, true, refs),
    describe: description => make(describe(schema, description), isOptional, refs),
  }
}

const f = <V extends Validator>(schema: V, refs: readonly string[] = []): Field<V, false> => make(schema, false, refs)

type StrongRef = TypedObjectSchema<'com.atproto.repo.strongRef', ObjectSchema<{ uri: StringSchema<{ format: 'at-uri' }>, cid: StringSchema<{ format: 'cid' }> }>>

/** `com.atproto.repo.strongRef`, the shape `belongsTo` reads. */
const strongRef: StrongRef = base.typedObject('com.atproto.repo.strongRef', 'main', base.object({
  uri: base.string({ format: 'at-uri' }),
  cid: base.string({ format: 'cid' }),
}))

/** A lexicon string format, including one `@atproto/lex-schema` has no verifier for. */
export type AnyStringFormat = StringFormat | (string & Record<never, never>)

export type FormattedString<O> = O extends StringSchemaOptions ? StringSchema<O>
  : Omit<O, 'format'> extends infer Rest extends StringSchemaOptions ? StringSchema<Rest> : StringSchema

/**
 * `l.string`, tolerating a format the runtime cannot verify: the value is
 * validated as a plain string and the format is still emitted to lexicon JSON,
 * so a lexicon using one can be authored and published.
 */
export function formattedString<const O extends Omit<StringSchemaOptions, 'format'> & { format?: AnyStringFormat }>(options: O): FormattedString<O> {
  const format = options.format
  if (!format || (STRING_FORMATS as readonly string[]).includes(format))
    return base.string(options as StringSchemaOptions) as FormattedString<O>
  const { format: _, ...rest } = options
  return emitAs(base.string(rest as StringSchemaOptions), { format }) as FormattedString<O>
}

/** Graphemes; the byte limit is ten times this. */
const TEXT_MAX = 1000
const MARKDOWN_MAX = 100_000
const LIST_MAX = 100
const BLOB_MAX = 5_000_000

type TextSchema = StringSchema<{ maxLength: number, maxGraphemes: number }>

export interface TextOptions {
  /** Graphemes. */
  min?: number
  /** Graphemes. Defaults to 1000 (100,000 for markdown). */
  max?: number
  /** A lexicon string format. One the runtime cannot verify is emitted but validated as a plain string. */
  format?: AnyStringFormat
}

export interface NumberOptions {
  min?: number
  max?: number
}

export interface ListOptions {
  min?: number
  /** Defaults to 100. */
  max?: number
}

export interface BlobOptions {
  /** MIME types or patterns. Defaults to anything. */
  accept?: readonly string[]
  /** Bytes. Defaults to 5,000,000. */
  max?: number
}

function text({ min, max = TEXT_MAX, format }: TextOptions = {}): StringSchema<any> {
  return formattedString({
    ...(min === undefined ? {} : { minGraphemes: min }),
    ...(format ? { format } : {}),
    maxGraphemes: max,
    maxLength: max * 10,
  })
}

type Shape<F> = { [K in keyof F]: F[K] extends Field<infer V, infer O> ? (O extends true ? OptionalSchema<V> : V) : never }

function shapeOf<F extends Record<string, AnyField>>(fields: F): Shape<F> {
  const shape: Record<string, Validator> = {}
  for (const [name, field] of Object.entries(fields)) shape[name] = field.isOptional ? base.optional(field.schema) : field.schema
  return shape as Shape<F>
}

const refsOf = (fields: Record<string, AnyField>): string[] => Object.values(fields).flatMap(field => [...field.refs])

/**
 * Fields for the `defineLexicons(namespace, model)` style. Every one takes
 * `.optional()` and `.describe()`; `field.raw` drops back to `l`.
 */
export const field: {
  text: (options?: TextOptions) => Field<TextSchema, false>
  markdown: (options?: TextOptions) => Field<TextSchema, false>
  number: (options?: NumberOptions) => Field<IntegerSchema, false>
  boolean: () => Field<BooleanSchema, false>
  datetime: () => Field<StringSchema<{ format: 'datetime' }>, false>
  url: () => Field<StringSchema<{ format: 'uri' }>, false>
  enum: <const V extends string>(values: readonly V[]) => Field<EnumSchema<V>, false>
  /** A strongRef to another record in this model, by short name, or to any NSID. */
  ref: (target: string) => Field<RefSchema<StrongRef>, false>
  /** A union of typed object defs, closed until `.open()`. */
  union: <const R extends readonly TypedGetter[]>(refs: R) => UnionField<R>
  list: <const T extends AnyField>(items: T, options?: ListOptions) => Field<ArraySchema<T extends Field<infer V, any> ? V : never>, false>
  /** Emitted as a def of its own, since lexicon JSON has no inline object type. */
  object: <const F extends Record<string, AnyField>>(fields: F) => Field<RefSchema<ObjectSchema<Extract<Shape<F>, ObjectSchemaShape>>>, false>
  blob: (options?: BlobOptions) => Field<BlobSchema<any>, false>
  /** A blob accepting `image/*`. */
  image: (options?: BlobOptions) => Field<BlobSchema<any>, false>
  /** Any `l` schema, for whatever the friendly fields do not cover. */
  raw: <const V extends Validator>(schema: V) => Field<V, false>
} = {
  text: options => f(text(options)) as Field<TextSchema, false>,
  markdown: ({ min, max = MARKDOWN_MAX } = {}) => f(describe(text({ min, max }), 'Markdown.')) as Field<TextSchema, false>,
  number: ({ min, max } = {}) => f(base.integer({ ...(min === undefined ? {} : { minimum: min }), ...(max === undefined ? {} : { maximum: max }) })),
  boolean: () => f(fresh(base.boolean())),
  datetime: () => f(base.string({ format: 'datetime' })),
  url: () => f(base.string({ format: 'uri' })),
  enum: values => f(base.enum(values)),
  ref: target => f(base.ref(() => strongRef), [target]),
  union: refs => ({
    ...f(base.typedUnion(refs.map(get => base.typedRef(get)), true) as any),
    open: () => f(openUnion(refs)),
  }),
  list: (items, { min, max = LIST_MAX } = {}) => f(base.array(items.schema, { ...(min === undefined ? {} : { minLength: min }), maxLength: max }), items.refs) as any,
  object: (fields) => {
    const schema = base.object(shapeOf(fields))
    return f(base.ref(() => schema), refsOf(fields)) as any
  },
  blob: ({ accept, max = BLOB_MAX } = {}) => f(base.blob({ ...(accept ? { accept: [...accept] } : {}), maxSize: max })),
  image: ({ accept = ['image/*'], max = BLOB_MAX } = {}) => f(base.blob({ accept: [...accept], maxSize: max })),
  raw: schema => f(schema),
}

export type TypedGetter = () => TypedObjectValidator
export type UnionRefs<R extends readonly TypedGetter[]> = { [I in keyof R]: TypedRefSchema<ReturnType<R[I]>> }

/** A union member whose `$type` is none of the known ones. */
export interface UnknownMember { $type: Unknown$Type, [property: string]: LexValue | undefined }

type KnownUnion<R extends readonly TypedGetter[]> = TypedUnionSchema<UnionRefs<R>, true>

/**
 * A union that keeps unknown members: they read back as `{ $type, ... }` with
 * their data, so anything you do not know survives a read-modify-write. Narrow
 * with a member's `isTypeOf`; a `switch` on `$type` cannot narrow a union whose
 * members are not all known.
 */
export interface OpenUnionSchema<R extends readonly TypedGetter[]> extends Omit<TypedUnionSchema<UnionRefs<R>, false>, '__lex'> {
  readonly __lex: {
    input: InferInput<KnownUnion<R>> | UnknownMember
    output: InferOutput<KnownUnion<R>> | UnknownMember
  }
}

export interface UnionField<R extends readonly TypedGetter[]> extends Field<KnownUnion<R>, false> {
  /** Keep members this model does not know, instead of rejecting them. */
  open: () => Field<OpenUnionSchema<R>, false>
}

export function openUnion<const R extends readonly TypedGetter[]>(refs: R): OpenUnionSchema<R> {
  return base.typedUnion(refs.map(get => base.typedRef(get)), false) as unknown as OpenUnionSchema<R>
}

/** `key: 'self'` is the singleton spelling of `literal:self`. */
export type FriendlyKey = 'tid' | 'any' | 'nsid' | 'self' | `literal:${string}`

export type ResolvedKey<K> = K extends 'self' ? 'literal:self' : K extends FriendlyKey ? K : 'tid'

const resolveKey = (key: FriendlyKey = 'tid'): LexiconRecordKey => (key === 'self' ? 'literal:self' : key) as LexiconRecordKey

export interface SpaceSpec<C extends readonly string[] = readonly string[], K extends string = string> {
  readonly type: 'space'
  readonly key: K
  readonly collections: C
  readonly name?: string
  readonly description?: string
}

/**
 * Lexicon layer: a `"type": "space"` def declaring a permissioned space over
 * collections in this model, named by short name or NSID. `defineSpace` binds
 * the declaration to a model, and `airspace.<space>` is the client for it.
 */
export function space<const C extends readonly string[], const K extends FriendlyKey = 'self'>(
  collections: C,
  options: { key?: K, name?: string, description?: string } = {},
): SpaceSpec<C, ResolvedKey<K>> {
  const { key = 'self' as K, ...rest } = options
  return { type: 'space', key: resolveKey(key) as ResolvedKey<K>, collections, ...rest }
}

export type RecordSpec = { key?: FriendlyKey, description?: string } & { [name: string]: AnyField | string | undefined }

type FieldsOf<S> = { [K in keyof S as K extends 'key' | 'description' ? never : K]: S[K] }
type KeyOf<S> = S extends { key: infer K } ? ResolvedKey<K> : 'tid'
type ShapeOf<S> = Shape<FieldsOf<S>>

// `ObjectSchema<S>` only satisfies `RecordSchema` once `S` is concrete, so the constraint goes through `infer`.
type Built<N extends string, K extends string, S>
  = S extends SpaceSpec<any, infer SK> ? SpaceDeclaration<`${N}.${K}` & NsidString, SK>
    : S extends PermissionSetSpec ? PermissionSetDeclaration<`${N}.${K}` & NsidString>
      : ObjectSchema<Extract<ShapeOf<S>, ObjectSchemaShape>> extends infer O extends Validator<LexMap>
        ? RecordSchema<KeyOf<S> & LexiconRecordKey, `${N}.${K}` & NsidString, O>
        : never

/** The runtime schemas for a `defineLexicons(namespace, model)` model, keyed by short name. */
export type Model<N extends string, M> = { [K in keyof M & string]: Built<N, K, M[K]> }

const isSpaceSpec = (spec: unknown): spec is SpaceSpec => !!spec && typeof spec === 'object' && (spec as SpaceSpec).type === 'space'

export function buildModel(namespace: string, model: Record<string, RecordSpec | SpaceSpec | PermissionSetSpec>): Record<string, unknown> {
  const nsidOf = (name: string): string => name.includes('.') ? name : `${namespace}.${name}`
  const known = new Set(Object.keys(model))
  const out: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(model)) {
    const nsid = `${namespace}.${name}` as NsidString
    if (isPermissionSetSpec(spec)) {
      for (const collection of spec.options.collections ?? []) {
        if (!collection.includes('.') && !known.has(collection))
          throw new AirspaceError(`${nsid}: no "${collection}" in this model`)
      }
      out[name] = buildPermissionSet(nsid, spec, nsidOf)
      continue
    }
    if (isSpaceSpec(spec)) {
      for (const collection of spec.collections) {
        if (!collection.includes('.') && !known.has(collection))
          throw new AirspaceError(`${nsid}: no "${collection}" in this model`)
      }
      out[name] = {
        nsid,
        key: spec.key,
        collections: spec.collections.map(nsidOf),
        ...(spec.name ? { name: spec.name } : {}),
        ...(spec.description ? { description: spec.description } : {}),
      } satisfies SpaceDeclaration
      continue
    }
    const { key, description, ...rest } = spec
    const fields = rest as Record<string, AnyField>
    for (const target of refsOf(fields)) {
      if (!target.includes('.') && !known.has(target))
        throw new AirspaceError(`${nsid}: ref to "${target}", which is not in this model; pass a full NSID for a record elsewhere`)
    }
    out[name] = describe(base.record(resolveKey(key as FriendlyKey | undefined), nsid, base.object(shapeOf(fields))), description as string | undefined)
  }
  return out
}
