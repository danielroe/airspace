import type { Collection, Relations } from './model.ts'
import type { AirspaceRecord, Identity, RecordSchema } from './types.ts'

export interface PluginContext {
  identity: Identity
  collection: Collection<RecordSchema, Relations, readonly AnyPlugin[]>
  operation: 'read' | 'create' | 'put'
  blobUrl: (blob: unknown) => string | null
}

export type NoMeta = Record<never, never>

/** `read` returns data for `record.meta`; `write` may replace a value before validation. */
export interface Plugin<TMeta = NoMeta> {
  name: string
  read?: (record: AirspaceRecord<RecordSchema>, ctx: PluginContext) => TMeta | Promise<TMeta> | undefined | Promise<undefined>
  write?: (value: Record<string, unknown>, ctx: PluginContext) => Record<string, unknown> | Promise<Record<string, unknown>> | undefined | Promise<undefined>
}

export type AnyPlugin = Plugin<any>

export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type IsEmpty<T> = [keyof T] extends [never] ? true : false

/** Intersection that drops empty sides, so `toEqualTypeOf` and hovers stay clean. */
export type MergeTwo<A, B> = IsEmpty<A> extends true ? B : IsEmpty<B> extends true ? A : A & B

// Must distribute: a non-distributive check infers the plugins' common supertype.
type MetaOf<P> = P extends Plugin<infer M> ? M : never

/** `record.meta` for a set of plugins. */
export type MergeMeta<P extends readonly AnyPlugin[]> = [P[number]] extends [never]
  ? NoMeta
  : UnionToIntersection<MetaOf<P[number]>>

/** The meta type is inferred from `read`. */
export function definePlugin<TMeta = NoMeta>(plugin: Plugin<TMeta>): Plugin<TMeta> {
  return plugin
}

export async function applyRead(plugins: readonly AnyPlugin[], record: AirspaceRecord<any>, ctx: PluginContext): Promise<Record<string, unknown>> {
  const meta: Record<string, unknown> = {}
  for (const plugin of plugins) {
    if (!plugin.read)
      continue
    Object.assign(meta, await plugin.read(record, ctx))
  }
  return meta
}

export async function applyWrite(plugins: readonly AnyPlugin[], value: Record<string, unknown>, ctx: PluginContext): Promise<Record<string, unknown>> {
  let out = value
  for (const plugin of plugins) {
    if (!plugin.write)
      continue
    out = await plugin.write(out, ctx) ?? out
  }
  return out
}
