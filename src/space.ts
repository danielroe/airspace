import type { LexMap } from '@atproto/lex-data'
import type { JsonValue } from '@atproto/lex-json'
import type { DidString, RecordSchema } from '@atproto/lex-schema'
import type { Backend, RawRecord, SpaceUri, WriteRef } from './backend.ts'
import type { Space } from './model.ts'
import type { Xrpc } from './xrpc.ts'
import { jsonToLex, lexToJson } from '@atproto/lex-json'
import { LexValidationError } from '@atproto/lex-schema'
import { isNotFound, PAGE, paginate, readOnly, scoped, spaceUri } from './backend.ts'
import { cidFromBlob } from './blob.ts'
import { SpacesUnsupportedError, ValidationError } from './errors.ts'
import { isXrpcError, wrapXrpc } from './xrpc.ts'

/** A client that reports a failing space call as `SpacesUnsupportedError` when the PDS has no spaces. */
export function guardSpaces(client: Xrpc, service: string, supported: () => Promise<boolean>): Xrpc {
  return wrapXrpc(client, async (call) => {
    try {
      return await call()
    }
    catch (err) {
      // A refused credential says nothing about space support; `AuthMissing` on an authenticated call means no route.
      const auth = isXrpcError(err) && (err.status === 403 || (err.status === 401 && err.error !== 'AuthMissing'))
      if (isXrpcError(err) && !auth && !await supported())
        throw new SpacesUnsupportedError(service, { cause: err })
      throw err
    }
  })
}

const DEFS = 'com.atproto.simplespace.defs'

interface SpaceRecord { collection: string, rkey: string, cid: string, value?: JsonValue }

const encode = (schema: RecordSchema, value: LexMap | undefined): JsonValue | undefined => value && lexToJson({ ...value, $type: schema.$type })

export interface SpaceBackendOptions {
  space: SpaceUri
  repo: DidString
  service: string
  client?: Xrpc
}

// The PDS cannot validate third-party lexicons in spaces (atproto#5433).
export function createSpaceBackend({ space, repo, service, client }: SpaceBackendOptions): Backend {
  const require = (): Xrpc => {
    if (!client)
      throw readOnly('use spaces')
    return client
  }
  const parse = (schema: RecordSchema, raw: RawRecord): RawRecord => {
    try {
      return { uri: raw.uri, cid: raw.cid, value: schema.parse(jsonToLex(raw.value as JsonValue)) }
    }
    catch (err) {
      if (err instanceof LexValidationError)
        throw new ValidationError(`${schema.$type}/${raw.uri.slice(raw.uri.lastIndexOf('/') + 1)}`, err)
      throw err
    }
  }

  const page: Backend['page'] = async (schema, { limit, cursor, reverse, unvalidated } = {}) => {
    const res = await scoped(() => require().query<{ records: SpaceRecord[], cursor?: string }>('com.atproto.space.listRecords', { space, repo, collection: schema.$type, limit: limit ?? PAGE, cursor, reverse }))
    return {
      records: res.records.filter(r => r.value).map((r) => {
        const raw = { uri: `${space}/${repo}/${r.collection}/${r.rkey}`, cid: r.cid, value: r.value }
        return unvalidated ? { ...raw, value: jsonToLex(r.value!) } : parse(schema, raw)
      }),
      cursor: res.cursor,
    }
  }

  return {
    repo,
    location: `${space}/${repo}`,
    blobUrl: (blob) => {
      const cid = cidFromBlob(blob)
      if (!cid)
        return null
      return `${service.replace(/\/$/, '')}/xrpc/com.atproto.space.getBlob?space=${encodeURIComponent(space)}&repo=${encodeURIComponent(repo)}&cid=${encodeURIComponent(cid)}`
    },
    async get(schema, rkey) {
      try {
        const res = await scoped(() => require().query<RawRecord>('com.atproto.space.getRecord', { space, repo, collection: schema.$type, rkey }))
        return parse(schema, res)
      }
      catch (err) {
        if (isNotFound(err))
          return null
        throw err
      }
    },
    page,
    list: (schema, { limit, unvalidated } = {}) => paginate(page, schema, limit, unvalidated),
    async create(schema, record, rkey): Promise<WriteRef> {
      return await scoped(() => require().procedure<WriteRef>('com.atproto.space.createRecord', { space, repo, collection: schema.$type, rkey, record: encode(schema, record) }))
    },
    async put(schema, rkey, record): Promise<WriteRef> {
      return await scoped(() => require().procedure<WriteRef>('com.atproto.space.putRecord', { space, repo, collection: schema.$type, rkey, record: encode(schema, record) }))
    },
    async delete(schema, rkey) {
      await scoped(() => require().procedure('com.atproto.space.deleteRecord', { space, repo, collection: schema.$type, rkey }))
    },
    async batch(writes) {
      const res = await scoped(() => require().procedure<{ results?: ({ uri: string, cid: string } | object)[] }>('com.atproto.space.applyWrites', {
        space,
        repo,
        writes: writes.map(({ operation, schema, rkey, value }) => ({
          $type: `com.atproto.space.applyWrites#${operation === 'put' ? 'update' : operation}`,
          collection: schema.$type,
          rkey,
          ...(value ? { value: encode(schema, value) } : {}),
        })),
      }))
      return (res.results ?? []).map(result => 'uri' in result ? { uri: result.uri, cid: result.cid } : undefined)
    },
  }
}

export type SpacePolicy = 'public' | 'member-list' | { managingApp: string }
export type SpaceAppAccess = 'open' | { allowed: readonly string[] }

export interface SpaceInfo {
  uri: string
  read: SpacePolicy
  write: SpacePolicy
  appAccess: SpaceAppAccess
}

export interface EnsureSpaceOptions {
  read?: SpacePolicy
  write?: SpacePolicy
  appAccess?: SpaceAppAccess
}

/** A member of a space, and which halves of the member-list policy they satisfy. */
export interface SpaceMember {
  did: DidString
  read: boolean
  write: boolean
}

export type SpaceMemberAccess = Partial<Omit<SpaceMember, 'did'>>

function policyToLex(policy: SpacePolicy): { $type: string, managingApp?: string } {
  return policy === 'public'
    ? { $type: `${DEFS}#publicPolicy` }
    : policy === 'member-list'
      ? { $type: `${DEFS}#memberListPolicy` }
      : { $type: `${DEFS}#managingAppPolicy`, managingApp: policy.managingApp }
}

function appAccessToLex(access: SpaceAppAccess): { $type: string, allowed?: string[] } {
  return access === 'open'
    ? { $type: `${DEFS}#open` }
    : { $type: `${DEFS}#allowList`, allowed: [...access.allowed] }
}

function policyFromLex(value: { $type?: string, managingApp?: string }): SpacePolicy {
  if (value.$type === `${DEFS}#publicPolicy`)
    return 'public'
  if (value.$type === `${DEFS}#managingAppPolicy`)
    return { managingApp: value.managingApp! }
  return 'member-list'
}

function appAccessFromLex(value: { $type?: string, allowed?: string[] }): SpaceAppAccess {
  if (value.$type === `${DEFS}#allowList`)
    return { allowed: value.allowed! }
  return 'open'
}

interface SpaceView {
  uri: string
  readPolicy: { $type?: string, managingApp?: string }
  writePolicy: { $type?: string, managingApp?: string }
  appAccess: { $type?: string, allowed?: string[] }
}

export interface SpaceManager {
  /**
   * Whether the space holds any of this repo's data, from
   * `com.atproto.space.listSpaces`. True for a space you have only ever
   * written to, which has no managed configuration and so no `info()`.
   */
  exists: () => Promise<boolean>
  /**
   * The space's managed configuration, or `null` when nothing has configured
   * it. Writing to your own space creates the space but not its configuration,
   * so `info()` stays `null` until `ensure()` runs; use `exists()` to ask
   * whether the space is there at all.
   */
  info: () => Promise<SpaceInfo | null>
  ensure: (options?: EnsureSpaceOptions) => Promise<SpaceInfo>
  update: (options: EnsureSpaceOptions) => Promise<void>
  delete: () => Promise<void>
  members: {
    list: () => Promise<SpaceMember[]>
    add: (did: DidString, access?: SpaceMemberAccess) => Promise<void>
    remove: (did: DidString) => Promise<void>
  }
}

/** `com.atproto.simplespace` management for a space anchored on the session's DID. */
export function createSpaceManager(space: Space, authority: DidString, client: Xrpc | undefined): SpaceManager {
  const uri = spaceUri(authority, space.type, space.skey)
  const require = (): Xrpc => {
    if (!client)
      throw readOnly('manage spaces')
    return client
  }

  async function info(): Promise<SpaceInfo | null> {
    try {
      const res = await require().query<SpaceView>('com.atproto.simplespace.getSpace', { space: uri })
      return { uri: res.uri, read: policyFromLex(res.readPolicy), write: policyFromLex(res.writePolicy), appAccess: appAccessFromLex(res.appAccess) }
    }
    catch (err) {
      if (isXrpcError(err) && err.error === 'SpaceNotFound')
        return null
      throw err
    }
  }

  async function exists(): Promise<boolean> {
    let cursor: string | undefined
    do {
      const res = await require().query<{ spaces: { uri: string }[], cursor?: string }>('com.atproto.space.listSpaces', { type: space.type, did: authority, limit: PAGE, cursor })
      if (res.spaces.some(view => view.uri === uri))
        return true
      cursor = res.cursor
    } while (cursor)
    return false
  }

  return {
    exists,
    info,
    async ensure(options = {}) {
      const existing = await info()
      if (existing)
        return existing
      const read = options.read ?? 'member-list'
      const write = options.write ?? 'member-list'
      const appAccess = options.appAccess ?? 'open'
      const res = await require().procedure<{ uri: string }>('com.atproto.simplespace.createSpace', {
        type: space.type,
        skey: space.skey,
        readPolicy: policyToLex(read),
        writePolicy: policyToLex(write),
        appAccess: appAccessToLex(appAccess),
      })
      return { uri: res.uri, read, write, appAccess }
    },
    async update(options) {
      await require().procedure('com.atproto.simplespace.updateSpace', {
        space: uri,
        readPolicy: options.read ? policyToLex(options.read) : undefined,
        writePolicy: options.write ? policyToLex(options.write) : undefined,
        appAccess: options.appAccess ? appAccessToLex(options.appAccess) : undefined,
      })
    },
    async delete() {
      await require().procedure('com.atproto.simplespace.deleteSpace', { space: uri })
    },
    members: {
      async list() {
        const out: SpaceMember[] = []
        let cursor: string | undefined
        do {
          const res = await require().query<{ members: SpaceMember[], cursor?: string }>('com.atproto.simplespace.listMembers', { space: uri, limit: PAGE, cursor })
          out.push(...res.members.map(m => ({ did: m.did, read: m.read, write: m.write })))
          cursor = res.cursor
        } while (cursor)
        return out
      },
      async add(did, access = {}) {
        await require().procedure('com.atproto.simplespace.putMember', { space: uri, did, read: access.read ?? true, write: access.write ?? true })
      },
      async remove(did) {
        await require().procedure('com.atproto.simplespace.removeMember', { space: uri, did })
      },
    },
  }
}
