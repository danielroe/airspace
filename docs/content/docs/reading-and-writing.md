`createAirspace` returns synchronously and resolves your identity (handle to DID to PDS) on the first call that needs it, so `export const airspace = createAirspace(...)` works at module level. A failed resolution is retried on the next call. Reads are unauthenticated; writes need a session.

```ts
import { createAirspace, passwordSession } from 'airspace'

const session = await passwordSession({ service: 'https://pds.example', identifier: 'roe.dev', password: appPassword })

export const airspace = createAirspace({
  identity: 'roe.dev',
  collections: { location },
  spaces: { workspace }, // brings its own `projects` and `categories` with it
  session, // omit for read-only; an OAuth session goes in the same slot
})

const featured = await airspace.projects.list({ with: ['category'], limit: 5 })
featured[0].related.category?.value.name

const one = await airspace.projects.get(rkey) // null when it doesn't exist
await airspace.projects.create({ name: 'npmx', category: ref, createdAt: now })
await airspace.projects.put(rkey, value)
await airspace.projects.delete(rkey)

await airspace.location.get() // singletons take no rkey
await airspace.location.put(value)
```

`airspace.workspace.projects` and `airspace.projects` are the two ends of one collection: the draft in the space, and the record [`publish()`](/docs/spaces) writes to your public repo. Naming a space is therefore enough, and `collections` only has to list the collections no space uses. An explicit entry wins on a shared name, and two spaces giving one name to different collections is an error.

Pass `identity: { did, service }` when the handle isn't publicly resolvable, such as a local development PDS, or when you want a build to make no identity requests. Resolution is lazy, so everything derived from the DID or PDS URL is async: `await airspace.identity()`, `await airspace.blobs.url(blob)`, `await airspace.workspace.uri()`.

An app-password session is `await passwordSession({ service, identifier, password })`, exported from `airspace` and loading `@atproto/lex-password-session` on first call. An OAuth one comes from [`airspace/oauth`](/docs/oauth). Either goes in as `session`.

Records are plain JSON, with no serialisation step. A blob ref arrives as `{ $type: 'blob', ref: { $link }, mimeType, size }`.

## relations

`belongsTo(target, field)` takes either shape of pointer: a `com.atproto.repo.strongRef` (`{ uri, cid }`) or a plain `at-uri` string. Anything that isn't an `at://` URI resolves to `null`.

`hasMany(target, field)` does the same over a list field, which is how tags are usually modelled:

```ts
export const bookmarks = defineCollection(lexicons.bookmark, {
  relations: { tags: hasMany(tags, 'tags') },
})

const [bookmark] = await airspace.bookmarks.list({ with: ['tags'] })
bookmark.related.tags.map(tag => tag.value.name) // an array, never null
```

A ref that doesn't resolve is dropped from the array. Either relation costs one listing of the target collection, however many records point at it.

A record you do not have a collection for is one call away:

```ts
await airspace.resolve(uri, projects) // typed and validated, null when it does not exist
await airspace.resolve(uri) // any repo, any space, `value` is `unknown`
```

## listing and paging

Records come back newest first, since a `tid` record key sorts by creation time. Pass `sort` for anything else.

`list()` answers the query over the whole collection: `where`, `sort`, `limit` and `offset` are applied in memory, and only a bare `limit` is handed to the PDS as a shortcut. It is the right call for a collection you are happy to read end to end.

`page()` is the PDS's own listing with nothing on top, for the collections you are not:

```ts
const { records, cursor } = await airspace.projects.page({ limit: 50 })
await airspace.projects.page({ limit: 50, cursor }) // the next page; `cursor` is absent on the last one
await airspace.projects.page({ reverse: true }) // oldest first
```

Spaces page identically: `com.atproto.space.listRecords` takes the same cursor and the same `reverse`.

## concurrent and repeated writes

`put` and `delete` take the CID you last saw, so a second editor cannot silently overwrite the first. A mismatch throws `ConflictError`, which names the collection, the record key and the CID the PDS rejected.

```ts
const project = await airspace.projects.get(rkey)
await airspace.projects.put(rkey, value, { ifMatch: project.cid })
await airspace.projects.delete(rkey, { ifMatch: project.cid })
```

`ifChanged` reads the record, compares the prepared value and skips the write if nothing changed.

```ts
const { changed } = await airspace.projects.put(rkey, value, { ifChanged: true })
```

`ifMatch` is a type error inside a space: `com.atproto.space.putRecord` takes no swap parameter. `ifChanged` works in both.

## several writes, one commit

`batch` sends one `applyWrites`, so either all of it lands or none of it does. Every value is validated, and every write plugin runs, before anything is sent.

```ts
const results = await airspace.batch((b) => {
  b.categories.create({ name: 'Frameworks', createdAt: now })
  b.projects.create({ name: 'Nuxt', category: ref, createdAt: now })
  b.projects.delete(oldRkey)
})
```

Results come back in order, each carrying `operation`, `collection` and `rkey`, plus `uri` and `cid` for anything that wrote. Inside a batch, `put` is an update and the record must exist; use `create` with an explicit `rkey` otherwise. `airspace.<space>.batch` does the same in a space.

## caching

Reads are cached if you ask for it, and identical in-flight reads always share one request:

```ts
const airspace = createAirspace({ identity: 'roe.dev', collections, cache: { ttl: 60_000 } })
airspace.invalidate() // everything
airspace.invalidate('dev.roe.project') // one collection; writes already do this for their own
```

Pass `storage` and the cache survives a restart and is shared between processes. It takes any [unstorage](https://unstorage.unjs.io) driver, and records go through the IPLD JSON codec, so blob refs and CIDs come back as themselves. A read the storage can't answer falls through to the PDS.

```ts
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

const airspace = createAirspace({
  identity: 'roe.dev',
  collections,
  cache: { ttl: 300_000, storage: createStorage({ driver: fsDriver({ base: '.cache/airspace' }) }) },
})
```

## live updates

`airspace/live` watches a repo over [Jetstream](https://github.com/bluesky-social/jetstream) and calls you back for every write. It uses the global `WebSocket` and no Node built-ins, so the same call runs in a browser, a worker or on a server.

```ts
import { subscribe } from 'airspace/live'

const stop = subscribe({
  did: 'did:plc:jbeaa5kdaladzwq3r7f5xgwe',
  collections: ['dev.roe.project'],
  onCommit: ({ operation, rkey, record }) => console.log(operation, rkey, record),
})
```

It reconnects with the last `timeUs` it saw as the cursor, so a dropped socket replays what it missed. Pass `retry: 0` to handle that yourself, `service` for another Jetstream instance, and `cursor` to resume across a restart.

`invalidateOn` wires that into a cache:

```ts
import { invalidateOn } from 'airspace/live'

const stop = invalidateOn(airspace, { did: await airspace.identity().then(i => i.did), collections: ['dev.roe.project'] })
```

A write from anywhere, including another process or another device, drops that collection from the cache. Writes made through this client already drop their own.

## server-rendered frameworks

Load records on the server and return them from a Nuxt `useAsyncData`, a SvelteKit `load`, an Astro page or an RSC.

Two things stay on the server. `airspace.blobs.image()` needs the PDS URL, so resolve images in the loader and send `ResolvedImage` to the client rather than the raw blob ref. And a session is a server concern, so keep the writing client in a server route.
