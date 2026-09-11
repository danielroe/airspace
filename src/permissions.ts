import type { NsidString } from '@atproto/lex-schema'
import { AirspaceError } from './errors.ts'

export type RepoAction = 'create' | 'update' | 'delete'

type ParamValue = string | number | boolean

/** A `"type": "permission"` entry of a permission set. */
export interface LexiconPermission {
  readonly type: 'permission'
  readonly resource: string
  readonly [param: string]: ParamValue | readonly ParamValue[] | undefined
}

export interface PermissionSetOptions {
  /** Collections the set grants, by short name in a `defineLexicons(namespace, model)` model and by NSID otherwise. */
  collections?: readonly string[]
  /** Defaults to create, update and delete. */
  actions?: readonly RepoAction[]
  /** XRPC methods the set grants, as NSIDs. */
  rpc?: readonly string[]
  /** Send the `rpc` permissions to the audience named by the `include:<nsid>?aud=` scope that loaded the set. */
  inheritAud?: boolean
  /** MIME patterns for blob uploads. */
  blobs?: readonly string[]
  title?: string
  /** `title:lang`, keyed by BCP 47 code. */
  titleLang?: Record<string, string>
  detail?: string
  /** `detail:lang`, keyed by BCP 47 code. */
  detailLang?: Record<string, string>
  description?: string
  /** Permissions the options above cannot express, emitted as given. */
  extra?: readonly LexiconPermission[]
}

/** A permission set before it knows the NSID it is published at. */
export interface PermissionSetSpec {
  readonly type: 'permission-set'
  readonly options: PermissionSetOptions
}

/** A `"type": "permission-set"` lexicon def, stamped with the NSID it is published at. */
export interface PermissionSetDeclaration<N extends NsidString = NsidString> {
  readonly 'type': 'permission-set'
  readonly 'nsid': N
  readonly 'permissions': readonly LexiconPermission[]
  readonly 'title'?: string
  readonly 'title:lang'?: Record<string, string>
  readonly 'detail'?: string
  readonly 'detail:lang'?: Record<string, string>
  readonly 'description'?: string
}

/**
 * The OAuth surface of a lexicon family, requested as one `include:<nsid>`
 * scope instead of a scope per collection.
 */
export function permissions(options: PermissionSetOptions = {}): PermissionSetSpec {
  return { type: 'permission-set', options }
}

export function isPermissionSetSpec(value: unknown): value is PermissionSetSpec {
  return !!value && typeof value === 'object' && (value as PermissionSetSpec).type === 'permission-set' && 'options' in value
}

export function isPermissionSet(value: unknown): value is PermissionSetDeclaration {
  return !!value && typeof value === 'object' && (value as PermissionSetDeclaration).type === 'permission-set' && 'permissions' in value
}

/**
 * Resolve a permission set against the NSID it is published at. Every
 * collection and method has to sit under the set's own authority, since a
 * consumer's `include:` drops anything that does not.
 */
export function buildPermissionSet(nsid: NsidString, { options }: PermissionSetSpec, resolve: (name: string) => string = name => name): PermissionSetDeclaration {
  const authority = nsid.slice(0, nsid.lastIndexOf('.') + 1)
  const under = (target: string): string => {
    if (!target.startsWith(authority))
      throw new AirspaceError(`${nsid}: "${target}" is not under "${authority}", so an \`include:\` of this set would drop it`)
    return target
  }
  const permissions: LexiconPermission[] = []
  if (options.collections?.length) {
    permissions.push({
      type: 'permission',
      resource: 'repo',
      collection: options.collections.map(name => under(resolve(name))),
      ...(options.actions ? { action: [...options.actions] } : {}),
    })
  }
  if (options.rpc?.length) {
    permissions.push({
      type: 'permission',
      resource: 'rpc',
      ...(options.inheritAud ? { inheritAud: true } : {}),
      lxm: options.rpc.map(under),
    })
  }
  if (options.blobs?.length)
    permissions.push({ type: 'permission', resource: 'blob', accept: [...options.blobs] })
  permissions.push(...(options.extra ?? []))

  return {
    type: 'permission-set',
    nsid,
    permissions,
    ...(options.title ? { title: options.title } : {}),
    ...(options.titleLang ? { 'title:lang': options.titleLang } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.detailLang ? { 'detail:lang': options.detailLang } : {}),
    ...(options.description ? { description: options.description } : {}),
  }
}
