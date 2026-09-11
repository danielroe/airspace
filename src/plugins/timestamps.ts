import type { Plugin } from '../plugin.ts'
import { schemaFields } from '../model.ts'
import { definePlugin } from '../plugin.ts'

export interface TimestampsOptions {
  /** Set on `create` when absent. */
  createdAt?: string
  /** Set on every `put`. */
  updatedAt?: string
}

/** Stamp datetime fields on write, skipping collections whose schema has no such field. */
export function timestamps(options: TimestampsOptions = {}): Plugin {
  const createdAt = options.createdAt ?? 'createdAt'
  const updatedAt = options.updatedAt ?? 'updatedAt'
  return definePlugin({
    name: 'timestamps',
    write(value, ctx) {
      const fields = schemaFields(ctx.collection.schema)
      const now = new Date().toISOString()
      const out = { ...value }
      if (ctx.operation === 'create' && out[createdAt] === undefined && fields?.has(createdAt))
        out[createdAt] = now
      if (ctx.operation === 'put' && fields?.has(updatedAt))
        out[updatedAt] = now
      return out
    },
  })
}
