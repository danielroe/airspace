import type { LexMap } from '@atproto/lex-data'
import type { $Type, ArraySchema, ArraySchemaOptions, BlobSchema, BlobSchemaOptions, BooleanSchema, BytesSchema, BytesSchemaOptions, CidSchema, EnumSchema, IntegerSchema, IntegerSchemaOptions, LexiconRecordKey, LexMapSchema, LiteralSchema, NsidString, ObjectSchema, ObjectSchemaShape, RecordSchema, RefSchema, StringSchemaOptions, TokenSchema, TypedUnionSchema, Validator } from '@atproto/lex-schema'
import type { AnyStringFormat, FormattedString, Model, OpenUnionSchema, RecordSpec, SpaceSpec, TypedGetter, UnionRefs } from './field.ts'
import type { SpaceDeclaration } from './model.ts'
import type { PermissionSetDeclaration, PermissionSetOptions, PermissionSetSpec } from './permissions.ts'
import { l as base, Schema } from '@atproto/lex-schema'
import { describe, descriptionOf, emitAs, emittedFor, fresh } from './describe.ts'
import { AirspaceError } from './errors.ts'
import { buildModel, formattedString, openUnion } from './field.ts'
import { buildPermissionSet, isPermissionSet, isPermissionSetSpec, permissions } from './permissions.ts'

export type { AnyField, AnyStringFormat, Field, FormattedString, Model, OpenUnionSchema, RecordSpec, SpaceSpec, TextOptions, UnionField, UnknownMember } from './field.ts'
export { field, space } from './field.ts'
export type { LexiconPermission, PermissionSetDeclaration, PermissionSetOptions, RepoAction } from './permissions.ts'
export { permissions } from './permissions.ts'
export type { Infer, InferInput } from '@atproto/lex-schema'
export type { SpaceDeclaration }

type Described<O> = O & { description?: string }

function split<O extends { description?: string }>(options: O | undefined): [Omit<O, 'description'> | undefined, string | undefined] {
  if (!options)
    return [undefined, undefined]
  const { description, ...rest } = options
  return [rest, description]
}

export interface RecordDef<K extends LexiconRecordKey = LexiconRecordKey, S extends Validator<LexMap> = Validator<LexMap>> {
  readonly type: 'record'
  readonly key: K
  readonly record: S
  readonly description?: string
}

export interface TokenDef {
  readonly type: 'token'
  readonly description?: string
}

export interface SpaceDef<K extends string = string> {
  readonly type: 'space'
  readonly key: K
  readonly collections?: readonly string[]
  readonly name?: string
  readonly description?: string
}

/**
 * `@atproto/lex-schema`'s `l`, with `description` accepted everywhere the
 * lexicon JSON allows one, plus `record` and `space` defs for `defineLexicons`.
 */
export const l: {
  /** A `format` the runtime cannot verify is emitted to JSON and validated as a plain string. */
  string: <const O extends Described<Omit<StringSchemaOptions, 'format'> & { format?: AnyStringFormat }>>(options?: O) => FormattedString<O>
  integer: (options?: Described<IntegerSchemaOptions>) => IntegerSchema
  boolean: (options?: Described<object>) => BooleanSchema
  bytes: (options?: Described<BytesSchemaOptions>) => BytesSchema
  blob: <const O extends Described<BlobSchemaOptions>>(options?: O) => BlobSchema<O>
  cid: (options?: Described<object>) => CidSchema
  unknown: (options?: Described<object>) => LexMapSchema
  array: <const T extends Validator>(items: T, options?: Described<ArraySchemaOptions>) => ArraySchema<T>
  object: <const T extends ObjectSchemaShape>(shape: T, options?: Described<object>) => ObjectSchema<T>
  /** Reference a def from this file, from `lex build` output, or any schema carrying a `$type`. One carrying none, such as a foreign `knownValues` string, needs its `nsid`. */
  ref: <const T extends Validator>(get: () => T, options?: Described<{ nsid?: string }>) => RefSchema<T>
  /** A union of typed object defs (`l.typedObject` or `lex build` output). */
  union: <const R extends readonly TypedGetter[], const Closed extends boolean = false>(refs: R, options?: Described<{ closed?: Closed }>) => TypedUnionSchema<UnionRefs<R>, Closed>
  /** A union that keeps the members it does not know. */
  openUnion: <const R extends readonly TypedGetter[]>(refs: R, options?: Described<object>) => OpenUnionSchema<R>
  enum: <const V extends string | number>(values: readonly V[], options?: Described<object>) => EnumSchema<V>
  literal: <const V extends string | number | boolean>(value: V, options?: Described<object>) => LiteralSchema<V>
  optional: typeof base.optional
  nullable: typeof base.nullable
  withDefault: typeof base.withDefault
  typedObject: typeof base.typedObject
  token: (def?: { description?: string }) => TokenDef
  /** See `permissions()`. */
  permissionSet: (options?: PermissionSetOptions) => PermissionSetSpec
  record: <const K extends LexiconRecordKey, const S extends Validator<LexMap>>(def: { key: K, record: S, description?: string }) => RecordDef<K, S>
  space: <const K extends string>(def: { key: K, collections?: readonly string[], name?: string, description?: string }) => SpaceDef<K>
} = {
  string: (options) => {
    const [rest, description] = split(options)
    return describe(formattedString(rest ?? {}), description) as never
  },
  integer: (options) => {
    const [rest, description] = split(options)
    return describe(base.integer(rest), description)
  },
  boolean: options => describe(options?.description ? fresh(base.boolean()) : base.boolean(), options?.description),
  bytes: (options) => {
    const [rest, description] = split(options)
    return describe(base.bytes(rest), description)
  },
  blob: (options) => {
    const [rest, description] = split(options)
    return describe(base.blob(rest as BlobSchemaOptions), description) as BlobSchema<any>
  },
  cid: options => describe(options?.description ? fresh(base.cid()) : base.cid(), options?.description),
  unknown: options => describe(options?.description ? fresh(base.lexMap()) : base.lexMap(), options?.description),
  array: (items, options) => {
    const [rest, description] = split(options)
    return describe(base.array(items, rest), description)
  },
  object: (shape, options) => describe(base.object(shape), options?.description),
  ref: (get, options) => {
    const schema = describe(base.ref(get), options?.description)
    return options?.nsid ? emitAs(schema, { ref: options.nsid }) : schema
  },
  union: (refs, options) => describe(base.typedUnion(refs.map(get => base.typedRef(get)), options?.closed ?? false), options?.description) as TypedUnionSchema<any, any>,
  openUnion: (refs, options) => describe(openUnion(refs), options?.description) as OpenUnionSchema<any>,
  enum: (values, options) => describe(base.enum(values), options?.description),
  literal: (value, options) => describe(base.literal(value), options?.description),
  optional: base.optional,
  nullable: base.nullable,
  withDefault: base.withDefault,
  typedObject: base.typedObject,
  token: (def = {}) => ({ type: 'token', ...def }),
  permissionSet: permissions,
  record: def => ({ type: 'record', ...def }),
  space: def => ({ type: 'space', ...def }),
}

type Def = Validator | RecordDef | SpaceDef | TokenDef | PermissionSetSpec
type Entry = Def | { readonly [def: string]: Def }

type Build<N extends NsidString, H extends string, D> = D extends RecordDef<infer K, infer S> ? RecordSchema<K, N, S>
  : D extends SpaceDef<infer K> ? SpaceDeclaration<N, K>
    : D extends PermissionSetSpec ? PermissionSetDeclaration<N>
      : D extends TokenDef ? TokenSchema<$Type<N, H>>
        : D

/** The runtime schemas for a `defineLexicons` map. */
export type Lexicons<M> = {
  [N in keyof M & NsidString]: M[N] extends Def ? Build<N, 'main', M[N]> : { [H in keyof M[N] & string]: Build<N, H, M[N][H]> }
}

type NsidKeys<M> = { [N in keyof M]: N extends NsidString ? M[N] : never }

const marker = (def: unknown): def is { type: string } => !!def && typeof def === 'object' && !(def instanceof Schema) && typeof (def as { type?: unknown }).type === 'string'
const isRecordDef = (def: unknown): def is RecordDef => marker(def) && def.type === 'record'
const isSpaceDef = (def: unknown): def is SpaceDef => marker(def) && def.type === 'space'
const isTokenDef = (def: unknown): def is TokenDef => marker(def) && def.type === 'token'

/**
 * Lexicons keyed by NSID. A bare value is the `main` def; an object is a set
 * of named defs. Records and spaces are stamped with their NSID; other schemas
 * are returned as given.
 */
export function defineLexicons<const M extends Record<string, Entry>>(lexicons: M & NsidKeys<M>): Lexicons<M>
/**
 * A model under one namespace, keyed by short name: `<namespace>.<name>` is the
 * NSID, values are `field.*` maps or `space()`, and `key` defaults to `tid`.
 */
export function defineLexicons<const N extends NsidString, const M extends Record<string, RecordSpec | SpaceSpec | PermissionSetSpec>>(namespace: N, model: M): Model<N, M>
export function defineLexicons(a: unknown, b?: unknown): unknown {
  return typeof a === 'string'
    ? buildModel(a, b as Record<string, RecordSpec | SpaceSpec | PermissionSetSpec>)
    : defineNsidLexicons(a as Record<string, Entry>)
}

function defineNsidLexicons<const M extends Record<string, Entry>>(lexicons: M): Lexicons<M> {
  const out: Record<string, unknown> = {}
  for (const [nsid, entry] of Object.entries(lexicons) as [NsidString, Entry][]) {
    if (entry instanceof Schema || marker(entry)) {
      out[nsid] = build(nsid, 'main', entry)
      continue
    }
    const defs: Record<string, unknown> = {}
    for (const [name, def] of Object.entries(entry)) defs[name] = build(nsid, name, def)
    out[nsid] = defs
  }
  return out as Lexicons<M>
}

function build(nsid: NsidString, name: string, def: Def): unknown {
  if (isRecordDef(def)) {
    if (name !== 'main')
      throw new AirspaceError(`${nsid}#${name}: records must be the main def`)
    return describe(base.record(def.key, nsid, def.record), def.description)
  }
  if (isSpaceDef(def)) {
    const { type, ...rest } = def
    return { nsid, ...rest } satisfies SpaceDeclaration
  }
  if (isPermissionSetSpec(def)) {
    if (name !== 'main')
      throw new AirspaceError(`${nsid}#${name}: permission sets must be the main def, since \`include:\` names an NSID`)
    return buildPermissionSet(nsid, def)
  }
  if (isTokenDef(def))
    return describe(base.token(nsid, name), def.description)
  return def
}

export interface LexiconDoc {
  lexicon: 1
  id: string
  defs: Record<string, unknown>
}

/** The NSID of an entry: its own for a record or space, else the map key. */
function idOf(key: string, entry: unknown): string {
  if (!entry || typeof entry !== 'object')
    return key
  const e = entry as { type?: unknown, $type?: unknown, nsid?: unknown }
  if (e.type === 'record' && typeof e.$type === 'string')
    return e.$type
  return typeof e.nsid === 'string' ? e.nsid : key
}

/**
 * Lexicon JSON documents for a `defineLexicons` result, one per NSID.
 * Refs resolve to defs in the same map or to schemas carrying a `$type`; a ref
 * to a local object becomes a def of its own, since lexicon JSON has no inline
 * object type.
 */
export function toLexiconJson(lexicons: Record<string, unknown>): LexiconDoc[] {
  const entries = Object.entries(lexicons).map(([key, entry]) => [idOf(key, entry), entry] as const)
  const names = new Map<object, string>()
  for (const [nsid, entry] of entries) {
    const defs = isDefs(entry) ? entry : { main: entry }
    for (const [name, def] of Object.entries(defs)) {
      if (def && typeof def === 'object')
        names.set(def, name === 'main' ? nsid : `${nsid}#${name}`)
    }
  }
  const refName = (target: object): string | undefined => {
    const name = names.get(target) ?? ($typeOf(target) ?? undefined)
    return name?.endsWith('#main') ? name.slice(0, -'#main'.length) : name
  }

  return entries.map(([nsid, entry]) => {
    const defs = isDefs(entry) ? entry : { main: entry }
    const out: Record<string, unknown> = {}
    const hoisted = new Map<object, string>()
    const pending: [string, object][] = []
    const ctx: Emit = {
      refName,
      hoist(target, where) {
        let name = hoisted.get(target)
        if (!name) {
          name = defName(where, key => key in out || [...hoisted.values()].includes(key))
          hoisted.set(target, name)
          pending.push([name, target])
        }
        return `${nsid}#${name}`
      },
    }
    for (const [name, def] of Object.entries(defs)) out[name] = topLevel(def, `${nsid}#${name}`, ctx)
    while (pending.length) {
      const [name, target] = pending.shift()!
      out[name] = property(target as Validator, `${nsid}#${name}`, ctx)
    }
    return { lexicon: 1, id: nsid, defs: out }
  })
}

/** A def name for a hoisted object, from the field path that reached it. */
function defName(where: string, taken: (name: string) => boolean): string {
  const base = where.split(/[#.]/).pop()!.replace(/\W/g, '') || 'def'
  let name = base
  for (let i = 2; taken(name); i++) name = `${base}${i}`
  return name
}

function isDefs(entry: unknown): entry is Record<string, unknown> {
  return !!entry && typeof entry === 'object' && !(entry instanceof Schema) && !('nsid' in entry) && Object.getPrototypeOf(entry) === Object.prototype
}

function $typeOf(node: object): string | null {
  return typeof (node as { $type?: unknown }).$type === 'string' ? (node as { $type: string }).$type : null
}

interface Emit {
  refName: (target: object) => string | undefined
  /** Add a local object as a def of the document being emitted, and return its ref. */
  hoist: (target: object, where: string) => string
}

function requireRefName(target: object, where: string, { refName }: Emit): string {
  const name = refName(target)
  if (!name)
    throw new AirspaceError(`${where}: ref target is not a def in this file and has no $type`)
  return name
}

function withDescription(node: object, json: Record<string, unknown>): Record<string, unknown> {
  const description = descriptionOf(node)
  return description ? { ...json, description } : json
}

function topLevel(def: unknown, where: string, ctx: Emit): Record<string, unknown> {
  if (isPermissionSet(def)) {
    const { nsid, ...rest } = def
    return rest
  }
  if (def && typeof def === 'object' && 'nsid' in def) {
    const { nsid, ...rest } = def as SpaceDeclaration
    return { type: 'space', ...rest }
  }
  const schema = def as Schema & { type: string }
  switch (schema.type) {
    case 'record': {
      const record = schema as unknown as RecordSchema
      return withDescription(schema, { type: 'record', key: record.key, record: property(record.schema, where, ctx) })
    }
    case 'typedObject':
      return withDescription(schema, property((schema as unknown as { schema: Validator }).schema, where, ctx))
    case 'token':
      return withDescription(schema, { type: 'token' })
    default:
      return property(schema, where, ctx)
  }
}

function property(node: Validator, where: string, ctx: Emit): Record<string, unknown> {
  const schema = node as Validator & { type: string } & Record<string, any>
  switch (schema.type) {
    case 'withDefault':
      return { ...property(schema.validator, where, ctx), default: schema.defaultValue }
    case 'string':
      return withDescription(schema, { type: 'string', ...schema.options, ...emittedFor(schema) })
    case 'integer':
      return withDescription(schema, { type: 'integer', ...schema.options })
    case 'boolean':
      return withDescription(schema, { type: 'boolean' })
    case 'bytes':
      return withDescription(schema, { type: 'bytes', ...schema.options })
    case 'blob':
      return withDescription(schema, { type: 'blob', ...schema.options })
    case 'cid':
      return withDescription(schema, { type: 'cid-link' })
    case 'lexMap':
    case 'unknown':
      return withDescription(schema, { type: 'unknown' })
    case 'enum': {
      const values = schema.values as (string | number)[]
      return withDescription(schema, { type: typeof values[0] === 'number' ? 'integer' : 'string', enum: values })
    }
    case 'literal': {
      const value = schema.value as string | number | boolean
      return withDescription(schema, { type: typeof value === 'number' ? 'integer' : typeof value === 'boolean' ? 'boolean' : 'string', const: value })
    }
    case 'array':
      return withDescription(schema, { type: 'array', items: property(schema.validator, where, ctx), ...schema.options })
    case 'ref': {
      const target = schema.unwrap() as Validator & { type: string }
      const named = (emittedFor(schema)?.ref as string | undefined) ?? ctx.refName(target)
      // Only an object can be hoisted, since lexicon JSON has no inline object type.
      if (!named && target.type !== 'object')
        throw new AirspaceError(`${where}: ref target is a "${target.type}" def that is not in this file and carries no $type; pass its NSID as \`l.ref(get, { nsid: '...' })\``)
      return withDescription(schema, { type: 'ref', ref: named ?? ctx.hoist(target, where) })
    }
    case 'typedRef':
      return { type: 'ref', ref: requireRefName(schema.validator, where, ctx) }
    case 'typedUnion': {
      const refs = [...(schema.validatorsMap as Map<unknown, { validator: object }>).values()].map(ref => requireRefName(ref.validator, where, ctx))
      return withDescription(schema, { type: 'union', refs, ...(schema.closed ? { closed: true } : {}) })
    }
    case 'object': {
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      const nullable: string[] = []
      for (const [key, raw] of Object.entries(schema.shape as ObjectSchemaShape)) {
        let inner = raw as Validator & { type: string, validator?: Validator }
        let isRequired = true
        let isNullable = false
        while (inner.type === 'optional' || inner.type === 'nullable') {
          if (inner.type === 'optional')
            isRequired = false
          else isNullable = true
          inner = inner.validator as typeof inner
        }
        properties[key] = property(inner, `${where}.${key}`, ctx)
        if (isRequired)
          required.push(key)
        if (isNullable)
          nullable.push(key)
      }
      return withDescription(schema, {
        type: 'object',
        ...(required.length ? { required } : {}),
        ...(nullable.length ? { nullable } : {}),
        properties,
      })
    }
    case 'typedObject':
      return { type: 'ref', ref: requireRefName(schema, where, ctx) }
    default:
      throw new AirspaceError(`${where}: cannot express a "${schema.type}" schema as lexicon JSON`)
  }
}
