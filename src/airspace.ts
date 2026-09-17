import type { Agent, AgentOptions } from '@atproto/lex-client'
import type { LexMap } from '@atproto/lex-data'
import type { JsonValue } from '@atproto/lex-json'
import type { AtUriString, CidString, DidString, RecordSchema } from '@atproto/lex-schema'
import type { Backend, SpaceUri } from './backend.ts'
import type { Batch } from './batch.ts'
import type { BlobInput, UploadBlobOptions, UploadedBlob } from './blob.ts'
import type { AnyClient, ClientContext, ClientFor, RecordOf, SpaceExtras, SpaceWriteOptions } from './client.ts'
import type { ImageSource, ResolvedImage } from './community.ts'
import type { IdentityInput } from './identity.ts'
import type { AnyCollection, AnySpace, SpaceCollections } from './model.ts'
import type { AnyPlugin, MergeMeta, UnionToIntersection } from './plugin.ts'
import type { SpaceManager } from './space.ts'
import type { AirspaceRecord, Identity, UnknownRecord } from './types.ts'
import { Client } from '@atproto/lex-client'
import { jsonToLex, lexToJson } from '@atproto/lex-json'
import { createPublicBackend, parseAtUri, readOnly, repoShapedRefs, scopedClient, spaceUri, withRepoFallback } from './backend.ts'
import { createBatch } from './batch.ts'
import { uploadBlob } from './blob.ts'
import { createCollectionClient } from './client.ts'
import { resolveImage } from './community.ts'
import { AirspaceError } from './errors.ts'
import { isDid, resolveIdentity } from './identity.ts'
import { stub } from './type-model.ts'

/** The part of an [unstorage](https://unstorage.unjs.io) driver a cache needs. */
export interface CacheStorage {
  getItem: (key: string) => Promise<unknown>
  setItem: (key: string, value: unknown, options?: { ttl?: number }) => Promise<void>
  removeItem: (key: string) => Promise<void>
  getKeys: (base?: string) => Promise<string[]>
}

export interface CacheOptions {
  /** How long a listing or record stays fresh, in milliseconds. Writes invalidate their collection. `0` only shares in-flight reads. */
  ttl: number
  /** Survive a restart, and share the cache between processes. Reads fall back to the PDS on any storage error. Needs a `ttl` above `0`. */
  storage?: CacheStorage
}

type NotReserved<T, Reserved extends PropertyKey> = { [K in keyof T]: K extends Reserved ? never : T[K] }

type SpacesCollections<S extends Record<string, AnySpace>>
  = UnionToIntersection<{ [K in keyof S]: SpaceCollections<S[K]> }[keyof S]> extends infer R extends Record<string, AnyCollection> ? R : Record<never, never>

/**
 * A space collection is a public collection too, since `publish()` targets one,
 * so a name that only appears inside a space still reaches `airspace.<name>`.
 * An explicit `collections` entry wins on the name it uses.
 */
export type PublicCollections<C extends Record<string, AnyCollection>, S extends Record<string, AnySpace>> = C & Omit<SpacesCollections<S>, keyof C>

export interface AirspaceOptions<C extends Record<string, AnyCollection>, S extends Record<string, AnySpace>, P extends readonly AnyPlugin[]> {
  /** Handle, DID or `{ did, service }`. Pass the object when the handle is not publicly resolvable (a local PDS). */
  identity: IdentityInput
  collections?: C & NotReserved<C, keyof AirspaceBase<any, any, any>>
  spaces?: S & NotReserved<S, keyof AirspaceBase<any, any, any> | keyof C>
  /** Run on every collection, before its own plugins. */
  plugins?: P
  /** An OAuth or password session, or anything `new Client()` accepts. Required for writes and for spaces. */
  session?: Agent | AgentOptions
  /** Cache reads in memory. Off by default; identical in-flight requests are always shared. */
  cache?: CacheOptions
  /** Let any resolved identity live on a loopback, private or `http:` address. A `service` given directly in `identity` is never checked. */
  allowPrivateNetwork?: boolean
}

export type CollectionClients<C extends Record<string, AnyCollection>, G = Record<never, never>> = {
  [K in keyof C]: ClientFor<C[K], G>
}

type SpaceCollectionClients<C extends Record<string, AnyCollection>, G> = {
  [K in keyof C]: ClientFor<C[K], G, SpaceWriteOptions> & SpaceExtras<C[K]['schema']>
}

interface SpaceClientBase<C extends Record<string, AnyCollection>, G> {
  /** `at://{authority}/space/{type}/{skey}` */
  uri: () => Promise<SpaceUri>
  /** Does the PDS serve permissioned spaces? No session needed. One probe per PDS, cached for the life of this client. */
  supported: () => Promise<boolean>
  readonly collections: SpaceCollectionClients<C, G>
  /** Several writes in one commit, validated before anything is sent. */
  batch: Batch<C>
  /** `com.atproto.simplespace` management; the authority must be the session's own DID. */
  readonly manage: SpaceManager
  blobs: {
    url: (blob: unknown) => Promise<string | null>
    image: (image: ImageSource | undefined | null) => Promise<ResolvedImage | null>
  }
}

/**
 * Client layer: one permissioned space on a PDS, its collections carrying the
 * public surface plus `publish()`. `defineSpace` describes what it holds.
 */
export type SpaceClient<S extends AnySpace, G = Record<never, never>> = SpaceClientBase<SpaceCollections<S>, G> & SpaceCollectionClients<SpaceCollections<S>, G>

type SpaceClients<S extends Record<string, AnySpace>, G> = {
  [K in keyof S]: SpaceClient<S[K], G>
}

/**
 * Every network call awaits identity resolution internally, so `createAirspace`
 * returns synchronously and a failed resolution is retried on the next call.
 * Anything derived from the DID or PDS URL is therefore async.
 */
interface AirspaceBase<C extends Record<string, AnyCollection>, S extends Record<string, AnySpace>, G> {
  identity: () => Promise<Identity>
  readonly collections: CollectionClients<C, G>
  readonly spaces: SpaceClients<S, G>
  /** Several writes in one commit, validated before anything is sent. */
  batch: Batch<C>
  blobs: {
    url: (blob: unknown) => Promise<string | null>
    /** An image def or a bare blob field, to a renderable source. */
    image: (image: ImageSource | undefined | null) => Promise<ResolvedImage | null>
    upload: (input: BlobInput, options?: UploadBlobOptions) => Promise<UploadedBlob>
  }
  /** Any record by AT URI, from any repo or space, `null` when it does not exist. Validated when a collection is named. */
  resolve: (<T extends AnyCollection>(uri: string, collection: T) => Promise<RecordOf<T, G> | null>) & ((uri: string) => Promise<UnknownRecord | null>)
  /** Drop cached reads, for one collection by NSID or for all of them. */
  invalidate: (collection?: string) => void
}

export type Airspace<C extends Record<string, AnyCollection>, S extends Record<string, AnySpace>, P extends readonly AnyPlugin[] = []>
  = AirspaceBase<PublicCollections<C, S>, S, MergeMeta<P>> & CollectionClients<PublicCollections<C, S>, MergeMeta<P>> & SpaceClients<S, MergeMeta<P>>

interface Runtime {
  identity: Identity
  session?: Client
  public: Backend
}

interface Repo {
  key: string
  backend: () => Promise<Backend>
  extra?: Partial<ClientContext>
}

// `fetch` is read per request so a dispatcher installed after construction is honoured.
const publicClient = (service: string): Client => new Client({ service, fetch: (input, init) => fetch(input, init) })

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => pending ??= load().catch((err) => {
    pending = undefined
    throw err
  })
}

export function createAirspace<
  const C extends Record<string, AnyCollection> = Record<never, never>,
  const S extends Record<string, AnySpace> = Record<never, never>,
  const P extends readonly AnyPlugin[] = [],
>(options: AirspaceOptions<C, S, P>): Airspace<C, S, P> {
  type G = MergeMeta<P>
  const plugins: readonly AnyPlugin[] = options.plugins ?? []
  const ttl = options.cache?.ttl ?? 0
  const storage = options.cache?.storage
  if (storage && !(ttl > 0))
    throw new AirspaceError('cache.storage needs a ttl above 0')
  const network = { allowPrivateNetwork: options.allowPrivateNetwork }
  const keyOf = new WeakMap<Backend, string>()

  const runtime = once(async (): Promise<Runtime> => {
    const identity = await resolveIdentity(options.identity, network)
    const session = options.session ? new Client(options.session) : undefined
    const backend = createPublicBackend({ repo: identity.did, service: identity.service, read: publicClient(identity.service), write: session })
    keyOf.set(backend, 'public')
    return { identity, session, public: backend }
  })
  const identity = async () => (await runtime()).identity
  const spaceLib = once(() => import('./space.ts'))
  const supportLib = once(() => import('./supported.ts'))

  const backends = new Map<string, Promise<Backend>>()
  const backend = (key: string, create: () => Promise<Backend>): Promise<Backend> => {
    let pending = backends.get(key)
    if (!pending) {
      backends.set(key, pending = create().then((created) => {
        keyOf.set(created, key)
        return created
      }, (err) => {
        backends.delete(key)
        throw err
      }))
    }
    return pending
  }
  const support = new Map<string, Promise<boolean>>()
  const spacesSupported = async (): Promise<boolean> => {
    const [rt, lib] = await Promise.all([runtime(), supportLib()])
    let pending = support.get(rt.identity.service)
    if (!pending) {
      support.set(rt.identity.service, pending = lib.spacesSupported(rt.identity.service).catch((err) => {
        support.delete(rt.identity.service)
        throw err
      }))
    }
    return pending
  }

  const spaceClient = async (): Promise<Client | undefined> => {
    const [rt, lib] = await Promise.all([runtime(), spaceLib()])
    return rt.session && lib.guardSpaces(rt.session, rt.identity.service, spacesSupported)
  }

  const spaceBackend = (uri: SpaceUri, author: DidString): Promise<Backend> => backend(`${uri}|${author}`, async () => {
    const [rt, lib] = await Promise.all([runtime(), spaceLib()])
    return lib.createSpaceBackend({ space: uri, repo: author, service: rt.identity.service, client: await spaceClient() })
  })

  const backendFor = async (uri: string): Promise<Backend> => {
    const ref = parseAtUri(uri)
    const author = ref.author ?? ref.authority
    if (ref.space)
      return spaceBackend(spaceUri(ref.authority, ref.space.type, ref.space.skey), author)
    const rt = await runtime()
    if (author === rt.identity.did)
      return rt.public
    return backend(author, async () => {
      const foreign = (repo: DidString, service: string): Backend => createPublicBackend({ repo, service, read: publicClient(service) })
      if (!isDid(author)) {
        const resolved = await resolveIdentity(author, network)
        return foreign(resolved.did, resolved.service)
      }
      // Most refs point at an account on the same PDS, so try that before resolving an identity.
      return withRepoFallback(foreign(author, rt.identity.service), async () => foreign(author, (await resolveIdentity({ did: author }, network)).service))
    })
  }

  const clients = new Map<string, Map<AnyCollection, AnyClient>>()
  function clientFor(repo: Repo, collection: AnyCollection): AnyClient {
    let byCollection = clients.get(repo.key)
    if (!byCollection)
      clients.set(repo.key, byCollection = new Map())
    let client = byCollection.get(collection)
    if (!client) {
      byCollection.set(collection, client = createCollectionClient(collection, {
        backend: repo.backend,
        identity,
        plugins,
        ttl,
        store: storage && persistentStore(storage, `${repo.key}\0${collection.nsid}`, ttl),
        resolveRefs: resolveRefs(repo.backend),
        ...repo.extra,
      }))
    }
    return client
  }
  const repoOf = (backend: Backend): Repo => ({ key: keyOf.get(backend) ?? backend.location, backend: async () => backend })

  function resolveRefs(fromRepo: () => Promise<Backend>): ClientContext['resolveRefs'] {
    return async (collection, uris) => {
      const from = await fromRepo()
      const found = new Map<string, AirspaceRecord<any>>()
      const byBackend = new Map<Backend, string[]>()
      for (const uri of new Set(uris)) {
        const ref = parseAtUri(uri)
        if (!ref.rkey || ref.collection !== collection.nsid)
          continue
        const backend = await backendFor(uri)
        byBackend.set(backend, [...byBackend.get(backend) ?? [], uri])
      }
      const lookup = async (backend: Backend, group: string[]) => {
        const client = clientFor(repoOf(backend), collection)
        if (group.length === 1) {
          const record = await client.get(parseAtUri(group[0]!).rkey!) as AirspaceRecord<any> | null
          if (record)
            found.set(group[0]!, record)
          return record ? [] : group
        }
        const wanted = new Set(group)
        for (const record of await client.list() as AirspaceRecord<any>[]) {
          if (wanted.has(record.uri))
            found.set(record.uri, record)
        }
        return group.filter(uri => !found.has(uri))
      }
      await Promise.all([...byBackend].map(async ([backend, group]) => {
        // Refs written inside a space are repo-shaped, so look in the space before the public repo.
        if (from !== backend && from.repo === backend.repo && from.location !== backend.location) {
          const spaceUris = group.map(uri => uri.replace(`at://${backend.repo}/`, `${from.location}/`))
          const stillMissing = await lookup(from, spaceUris)
          for (const [i, uri] of spaceUris.entries()) {
            const record = found.get(uri)
            if (record) {
              found.delete(uri)
              found.set(group[i]!, record)
            }
          }
          const remaining = group.filter((_, i) => stillMissing.includes(spaceUris[i]!))
          if (remaining.length)
            await lookup(backend, remaining)
          return
        }
        await lookup(backend, group)
      }))
      return found
    }
  }

  const publicRepo: Repo = { key: 'public', backend: async () => (await runtime()).public }
  const blobUrl = async (blob: unknown) => (await runtime()).public.blobUrl(blob)

  const collect = (defined: Record<string, AnyCollection>, repo: Repo): Record<string, AnyClient> =>
    Object.fromEntries(Object.keys(defined).map(name => [name, clientFor(repo, defined[name]!)]))

  /** Collection clients by name, attached both under `target.collections` and directly on `target`. */
  function attach(target: { collections: object }, attached: Record<string, AnyClient>): void {
    for (const [name, client] of Object.entries(attached)) {
      if (name in target)
        throw new AirspaceError(`"${name}" is a reserved name`)
      Object.assign(target.collections, { [name]: client })
      Object.assign(target, { [name]: client })
    }
  }

  function space<T extends AnySpace>(def: T): SpaceClient<T, G> {
    const authority = async (): Promise<DidString> => def.authority === 'self' ? (await identity()).did : def.authority
    const uri = async () => spaceUri(await authority(), def.type, def.skey)
    const backend = async () => spaceBackend(await uri(), (await identity()).did)
    const manager = once(async () => (await spaceLib()).createSpaceManager(def, await authority(), scopedClient(await spaceClient())))
    const repo: Repo = {
      key: `space:${def.type}/${def.skey}/${def.authority}`,
      backend,
      extra: {
        publishTarget: c => clientFor(publicRepo, c) as unknown as ClientFor<typeof c, any>,
        prepareWrite: async value => repoShapedRefs(value, await uri(), (await identity()).did),
      },
    }
    const attached = collect(def.collections, repo)
    const base: SpaceClientBase<SpaceCollections<T>, G> = {
      uri,
      supported: spacesSupported,
      collections: {} as SpaceCollectionClients<SpaceCollections<T>, G>,
      batch: createBatch(attached, backend),
      manage: {
        exists: async () => (await manager()).exists(),
        info: async () => (await manager()).info(),
        ensure: async opts => (await manager()).ensure(opts),
        update: async opts => (await manager()).update(opts),
        delete: async () => (await manager()).delete(),
        members: {
          list: async () => (await manager()).members.list(),
          add: async (did, access) => (await manager()).members.add(did, access),
          remove: async did => (await manager()).members.remove(did),
        },
      },
      blobs: {
        url: async blob => (await backend()).blobUrl(blob),
        image: async image => resolveImage(image, (await backend()).blobUrl),
      },
    }
    attach(base, attached)
    return base as SpaceClient<T, G>
  }

  const attached = collect(publicCollections(options.collections, options.spaces), publicRepo)
  const base: AirspaceBase<PublicCollections<C, S>, S, G> = {
    identity,
    collections: {} as CollectionClients<PublicCollections<C, S>, G>,
    spaces: {} as SpaceClients<S, G>,
    batch: createBatch(attached, publicRepo.backend),
    blobs: {
      url: blobUrl,
      image: async image => resolveImage(image, (await runtime()).public.blobUrl),
      upload: async (input, opts) => {
        const { session } = await runtime()
        if (!session)
          throw readOnly('upload')
        return await uploadBlob(session, input, opts)
      },
    },
    resolve: (async (uri: string, collection?: AnyCollection) => {
      const ref = parseAtUri(uri)
      if (!ref.collection || !ref.rkey)
        throw new AirspaceError(`not a record URI: ${uri}`)
      if (collection && collection.nsid !== ref.collection)
        throw new AirspaceError(`${uri} is not a ${collection.nsid} record`)
      const backend = await backendFor(uri)
      if (collection)
        return await clientFor(repoOf(backend), collection).get(ref.rkey)
      const raw = await backend.get(stub(ref.collection) as unknown as RecordSchema, ref.rkey)
      return raw && { uri: raw.uri as AtUriString, cid: raw.cid as CidString, rkey: ref.rkey, author: backend.repo, value: lexToJson(raw.value as LexMap) }
    }) as AirspaceBase<PublicCollections<C, S>, S, G>['resolve'],
    invalidate: (nsid?: string) => {
      for (const byCollection of clients.values()) {
        for (const [collection, client] of byCollection) {
          if (!nsid || collection.nsid === nsid)
            client.invalidate()
        }
      }
    },
  }

  attach(base, attached)
  for (const name of Object.keys(options.spaces ?? {})) {
    if (name in base)
      throw new AirspaceError(`"${name}" is a reserved or duplicate name`)
    const client = space(options.spaces![name]!)
    Object.assign(base.spaces, { [name]: client })
    Object.assign(base, { [name]: client })
  }
  return base as Airspace<C, S, P>
}

/** Every collection named by a space, plus the explicit ones, which win on a shared name. */
function publicCollections(collections: Record<string, AnyCollection> = {}, spaces: Record<string, AnySpace> = {}): Record<string, AnyCollection> {
  const derived: Record<string, AnyCollection> = {}
  for (const space of Object.values(spaces)) {
    for (const [name, collection] of Object.entries(space.collections as Record<string, AnyCollection>)) {
      const existing = derived[name]
      if (existing && existing !== collection)
        throw new AirspaceError(`spaces give the name "${name}" to two different collections (${existing.nsid} and ${collection.nsid}); name one of them in \`collections\``)
      derived[name] = collection
    }
  }
  return { ...derived, ...collections }
}

/** Values go through the IPLD JSON codec: a cached record holds CIDs and blob refs `JSON.stringify` would flatten. */
function persistentStore(storage: CacheStorage, prefix: string, ttl: number): NonNullable<ClientContext['store']> {
  const keyOf = (key: string): string => `airspace:${prefix}\0${key}`.replaceAll(/[\0/]/g, ':')
  return {
    async get(key) {
      const raw = await storage.getItem(keyOf(key))
      return raw === null || raw === undefined ? undefined : { value: jsonToLex(raw as JsonValue) }
    },
    async set(key, value) {
      await storage.setItem(keyOf(key), lexToJson(value as LexMap), ttl > 0 ? { ttl: Math.ceil(ttl / 1000) } : undefined)
    },
    async clear() {
      const base = keyOf('')
      await Promise.all((await storage.getKeys(base)).map(key => storage.removeItem(key)))
    },
  }
}
