import type { LexMap } from '@atproto/lex-data'

declare const typeOnly: unique symbol

/** Present on a schema that only exists in the type system. */
export const TYPE_ONLY: unique symbol = Symbol.for('airspace.typeOnly') as never

const identity = <T>(value: T): T => value

/**
 * Enough of a record schema for `@atproto/lex-client`, validating nothing. The
 * key is `tid` because the real one is type-level only; airspace passes an
 * rkey on every call that needs one.
 */
export function stub(nsid: string): Record<string, unknown> {
  return {
    [TYPE_ONLY]: true,
    type: 'record',
    $type: nsid,
    nsid,
    key: 'tid',
    build: (input: LexMap) => ({ ...input, $type: nsid }),
    parse: identity,
    validate: identity,
    safeParse: (value: unknown) => ({ success: true, value }),
    safeValidate: (value: unknown) => ({ success: true, value }),
    keySchema: { parse: identity, assert: () => {}, safeParse: (value: unknown) => ({ success: true, value }) },
  }
}

/** A schema that exists only in the type system: no validator was shipped for it. */
export interface TypeOnly {
  readonly [typeOnly]: true
}

type NsidOf<M, K extends keyof M> = M[K] extends { $type: infer T extends string } ? T
  : M[K] extends { nsid: infer T extends string } ? T
    : never

/** The namespace short keys hang off, or `never` when the keys are NSIDs already. */
type Namespace<M> = { [K in keyof M & string]: NsidOf<M, K> extends `${infer P}.${K}` ? P : never }[keyof M & string]

export type TypeModel<M> = { [K in keyof M]: M[K] & TypeOnly }

/**
 * NSIDs at runtime, types from `import type`, so no schema code reaches the
 * bundle and nothing is validated client side. The namespace is an argument
 * because a type carries none of itself into the running program.
 */
export function model<M>(...args: [Namespace<M>] extends [never] ? [] : [namespace: Namespace<M>]): TypeModel<M>
export function model(namespace?: string): unknown {
  const cache = new Map<string, unknown>()
  return new Proxy({} as Record<string, unknown>, {
    get(_target, property) {
      if (typeof property !== 'string')
        return undefined
      let def = cache.get(property)
      if (!def)
        cache.set(property, def = stub(namespace ? `${namespace}.${property}` : property))
      return def
    },
  })
}
