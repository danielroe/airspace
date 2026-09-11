import type { AtUriString, CidString, NsidString } from '@atproto/lex-schema'
import type { Backend, BatchWrite } from './backend.ts'
import type { AnyClient } from './client.ts'
import type { AnyCollection, CollectionSchema } from './model.ts'
import type { InferRecordKey, IsSingleton, RecordInput, RecordSchema } from './types.ts'
import { INTERNAL, rkeyFromUri } from './client.ts'
import { AirspaceError } from './errors.ts'

/** Operations on one collection inside a batch. Nothing is sent until the builder returns. */
export type BatchCollection<S extends RecordSchema> = IsSingleton<S> extends true
  ? {
      put: (value: RecordInput<S>) => void
      delete: () => void
    }
  : {
      create: (value: RecordInput<S>, options?: { rkey?: InferRecordKey<S> }) => void
      put: (rkey: InferRecordKey<S>, value: RecordInput<S>) => void
      delete: (rkey: InferRecordKey<S>) => void
    }

export type BatchCollections<C extends Record<string, AnyCollection>> = {
  [K in keyof C]: BatchCollection<CollectionSchema<C[K]>>
}

export type BatchResult
  = | { operation: 'create' | 'put', collection: NsidString, rkey: string, uri: AtUriString, cid: CidString }
    | { operation: 'delete', collection: NsidString, rkey: string }

/** One commit for every operation, in the order they were built. */
export type Batch<C extends Record<string, AnyCollection>> = (build: (b: BatchCollections<C>) => void) => Promise<BatchResult[]>

/** `com.atproto.repo.applyWrites` takes at most this many operations in one commit. */
export const MAX_BATCH = 200

interface Intent {
  client: AnyClient
  operation: BatchWrite['operation']
  rkey?: string
  value?: unknown
}

export function createBatch<C extends Record<string, AnyCollection>>(clients: Record<string, AnyClient>, backend: () => Promise<Backend>): Batch<C> {
  const builder = {} as Record<string, Record<string, (...args: any[]) => void>>
  let intents: Intent[] | undefined
  const push = (intent: Intent) => {
    if (!intents)
      throw new AirspaceError('batch operations can only be added while the builder runs')
    intents.push(intent)
  }
  for (const [name, client] of Object.entries(clients)) {
    const { fixedRkey } = client[INTERNAL]
    builder[name] = {
      create: (value: unknown, options: { rkey?: string } = {}) => push({ client, operation: 'create', rkey: options.rkey, value }),
      put: (...args: unknown[]) => push({
        client,
        operation: 'put',
        rkey: typeof args[0] === 'string' ? args[0] : fixedRkey,
        value: typeof args[0] === 'string' ? args[1] : args[0],
      }),
      delete: (rkey?: string) => push({ client, operation: 'delete', rkey: rkey ?? fixedRkey }),
    }
  }

  return async (build) => {
    const collected: Intent[] = []
    intents = collected
    try {
      build(builder as BatchCollections<C>)
    }
    finally {
      intents = undefined
    }

    const writes: BatchWrite[] = await Promise.all(collected.map(async ({ client, operation, rkey, value }) => {
      const internal = client[INTERNAL]
      return {
        operation,
        schema: internal.schema,
        rkey,
        value: operation === 'delete' ? undefined : await internal.prepare(value, operation === 'create' ? 'create' : 'put', rkey),
      }
    }))

    const refs = await (await backend()).batch(writes)
    for (const { client } of collected) client[INTERNAL].invalidate()

    return collected.map(({ client, operation, rkey }, i): BatchResult => {
      const collection = client[INTERNAL].schema.$type as NsidString
      const ref = refs[i]
      if (operation === 'delete' || !ref)
        return { operation: 'delete', collection, rkey: rkey! }
      return { operation, collection, rkey: rkey ?? rkeyFromUri(ref.uri), uri: ref.uri as AtUriString, cid: ref.cid as CidString }
    })
  }
}
