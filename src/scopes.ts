import type { AnyCollection, AnySpace } from './model.ts'
import type { PermissionSetDeclaration } from './permissions.ts'

export interface ScopesInput {
  collections?: Record<string, AnyCollection> | readonly AnyCollection[]
  spaces?: Record<string, AnySpace> | readonly AnySpace[]
  /**
   * Permission sets to request as `include:<nsid>`: a `permissions()` def from
   * your own model, or the NSID of someone else's.
   */
  include?: readonly (string | PermissionSetDeclaration)[]
}

const values = <T>(input: Record<string, T> | readonly T[] | undefined): T[] => Array.isArray(input) ? [...input] : Object.values(input ?? {})

/** OAuth scopes for a model. Usable before a session exists. */
export function scopesFor(input: ScopesInput): string[] {
  const collections = values(input.collections)
  const spaces = values(input.spaces)
  const includes = input.include ?? []
  const covered = coverage(includes)
  const scopes = [
    'atproto',
    ...includes.map(set => `include:${typeof set === 'string' ? set : set.nsid}`),
    ...collections.filter(c => !covered(c.nsid)).map(c => `repo:${c.nsid}`),
  ]
  for (const s of spaces) {
    const params = new URLSearchParams()
    if (s.authority !== 'self')
      params.set('authority', s.authority)
    params.set('skey', s.skey)
    const declared = new Set(s.declaration.collections)
    for (const c of Object.values(s.collections) as AnyCollection[]) {
      if (!declared.has(c.nsid))
        params.append('collection', c.nsid)
    }
    if (s.authority === 'self')
      params.append('manage', 'create')
    const query = params.toString()
    scopes.push(`space:${s.type}${query ? `?${query}` : ''}`)
  }
  const all = [...collections, ...spaces.flatMap(s => Object.values(s.collections) as AnyCollection[])]
  scopes.push(...blobScopes(all))
  return scopes
}

/**
 * A permission set only grants within its own authority, and a set given by
 * NSID alone cannot be read here, so the prefix is the most a bare NSID covers.
 */
function coverage(includes: readonly (string | PermissionSetDeclaration)[]): (nsid: string) => boolean {
  const exact = new Set<string>()
  const prefixes: string[] = []
  for (const set of includes) {
    if (typeof set === 'string') {
      prefixes.push(set.slice(0, set.lastIndexOf('.') + 1))
      continue
    }
    for (const permission of set.permissions) {
      if (permission.resource === 'repo' && Array.isArray(permission.collection)) {
        for (const nsid of permission.collection) exact.add(String(nsid))
      }
    }
  }
  return nsid => exact.has(nsid) || prefixes.some(prefix => nsid.startsWith(prefix))
}

/** `blob:` scopes narrowed to the MIME patterns of the blob fields in these collections. */
function blobScopes(collections: readonly AnyCollection[]): string[] {
  const accept = new Set<string>()
  for (const collection of collections) {
    for (const options of blobOptions(collection)) {
      const patterns = options.accept?.length ? options.accept : ['*/*']
      for (const pattern of patterns) accept.add(pattern)
    }
  }
  if (!accept.size)
    return []
  if (accept.has('*/*'))
    return ['blob:*/*']
  return [...accept].sort().map(pattern => `blob:${pattern}`)
}

// `l.ref` hides its target behind a lazy `unwrap()` on the prototype.
function blobOptions(collection: AnyCollection): { accept?: string[] }[] {
  const seen = new Set<unknown>()
  const found: { accept?: string[] }[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node))
      return
    seen.add(node)
    const n = node as Record<string, unknown> & { unwrap?: () => unknown }
    if (n.type === 'blob') {
      found.push((n.options ?? {}) as { accept?: string[] })
      return
    }
    if (typeof n.unwrap === 'function')
      walk(n.unwrap())
    Object.values(n).forEach(walk)
  }
  walk(collection.schema.schema)
  return found
}
