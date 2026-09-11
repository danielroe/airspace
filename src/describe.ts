const descriptions = new WeakMap<object, string>()

/** Record a lexicon `description` for a schema instance, which carries none. */
export function describe<T extends object>(schema: T, description: string | undefined): T {
  if (description)
    descriptions.set(schema, description)
  return schema
}

/**
 * A distinct instance of a schema. `l.boolean()`, `l.cid()` and `l.unknown()`
 * memoise their no-argument result, so a description on what they return would
 * otherwise apply to every other use of them.
 */
export const fresh = <T extends object>(schema: T): T => new (schema.constructor as new () => T)()

export const descriptionOf = (schema: object): string | undefined => descriptions.get(schema)

const emitted = new WeakMap<object, Record<string, unknown>>()

/** Lexicon JSON a schema should carry but cannot validate, such as an unknown string format. */
export function emitAs<T extends object>(schema: T, json: Record<string, unknown>): T {
  emitted.set(schema, { ...emitted.get(schema), ...json })
  return schema
}

export const emittedFor = (schema: object): Record<string, unknown> | undefined => emitted.get(schema)
