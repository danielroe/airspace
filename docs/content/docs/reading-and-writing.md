# reading and writing

Every collection in your model is a property on the client, with the same small API.

## the client

`createAirspace` returns straight away, so you can call it at module level. Finding the right PDS takes a network call, deferred until the first read or write.

```ts
import { createAirspace, passwordSession } from 'airspace'

const session = await passwordSession({ service: 'https://pds.example', identifier: 'roe.dev', password: appPassword })

export const airspace = createAirspace({
  identity: 'roe.dev', // or { did, service } for a handle that can't be looked up
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

A record arrives as `{ uri, author, rkey, cid, value }`: its address, the account it belongs to, its key, a hash of its contents, and the record itself.

`airspace.workspace.projects` and `airspace.projects` are two ends of one collection: the draft, and the record [`publish()`](/docs/spaces) writes to your public repo. So `collections` only needs the collections no space uses.

Anything that depends on the PDS lookup is async:

```ts
await airspace.identity()
await airspace.blobs.url(blob)
await airspace.workspace.uri()
```

## relations

A relation follows a pointer stored in a field. `belongsTo(target, field)` takes `{ uri, cid }` or a plain AT URI string; `hasMany(target, field)` does the same over a list field, which is how tags are usually modelled.

```ts
export const bookmarks = defineCollection(lexicons.bookmark, {
  relations: { tags: hasMany(tags, 'tags') },
})

const [bookmark] = await airspace.bookmarks.list({ with: ['tags'] })
bookmark.related.tags.map(tag => tag.value.name) // an array, never null
```

Pointers that don't resolve are dropped. Either relation costs one listing of the target collection. For a record you have no collection for:

```ts
await airspace.resolve(uri, projects) // typed and validated, null when it does not exist
await airspace.resolve(uri) // any repo, any space, `value` is `unknown`
```

The authority of a URI must be a DID or a handle, and a `did:web` host or PDS endpoint it resolves to must be a public `https:` origin. Pass `allowPrivateNetwork: true` to `createAirspace` for a local or `http:` PDS; a `service` given directly in `identity` is never checked.

## listing and paging

Records come back newest first, since the default record key is a timestamp. Pass `sort` for any other order.

`list()` reads the whole collection, applying `where`, `sort`, `limit` and `offset` in memory. `page()` is the raw PDS listing, for collections too large to read end to end:

```ts
const { records, cursor } = await airspace.projects.page({ limit: 50 })
await airspace.projects.page({ limit: 50, cursor }) // `cursor` is absent on the last page
await airspace.projects.page({ reverse: true }) // oldest first
```

## concurrent writes

Pass the content hash you last saw, and a second editor cannot silently overwrite the first. A mismatch throws [`ConflictError`](/docs/errors):

```ts
const project = await airspace.projects.get(rkey)
await airspace.projects.put(rkey, value, { ifMatch: project.cid })
await airspace.projects.delete(rkey, { ifMatch: project.cid })

// skip the write if the value is identical
const { changed } = await airspace.projects.put(rkey, value, { ifChanged: true })
```

`ifMatch` is a type error inside a space, which has no such option. `ifChanged` works in both.

## several writes, one commit

`batch` writes everything in one commit, so either all of it lands or none of it does:

```ts
const results = await airspace.batch((b) => {
  b.categories.create({ name: 'Frameworks', createdAt: now })
  b.projects.create({ name: 'Nuxt', category: ref, createdAt: now })
  b.projects.delete(oldRkey)
})
```

Results come back in order, each with `operation`, `collection` and `rkey`, plus `uri` and `cid` for anything written. Inside a batch, `put` requires an existing record; otherwise use `create` with an explicit `rkey`.

## caching

Reads are cached on request, and identical reads in flight share one request. Add `storage`, any [unstorage](https://unstorage.unjs.io) driver, and the cache survives a restart and is shared between processes.

```ts
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

const airspace = createAirspace({
  identity: 'roe.dev',
  collections,
  cache: { ttl: 300_000, storage: createStorage({ driver: fsDriver({ base: '.cache/airspace' }) }) },
})

airspace.invalidate() // everything
airspace.invalidate('dev.roe.project') // one collection; writes already do this for their own
```

## live updates

Every public write on the network is broadcast, so you can react to a change made elsewhere without polling. `airspace/live` watches one repo through [Jetstream](https://github.com/bluesky-social/jetstream), over the global `WebSocket`, so it runs anywhere.

```ts
import { invalidateOn, subscribe } from 'airspace/live'

const stop = subscribe({
  did: 'did:plc:jbeaa5kdaladzwq3r7f5xgwe',
  collections: ['dev.roe.project'],
  onCommit: ({ operation, rkey, record }) => console.log(operation, rkey, record),
})

// or clear the cache on every change, wherever it came from
const stopCache = invalidateOn(airspace, { did, collections: ['dev.roe.project'] })
```

A dropped connection reconnects from the last timestamp seen, replaying what was missed. Pass `retry: 0` to handle that yourself, `service` for another Jetstream instance, or `cursor` to resume after a restart. Records in a space are private, so they are not broadcast.

## server-rendered frameworks

Load records on the server and return them from a Nuxt `useAsyncData`, a SvelteKit `load`, an Astro page or a React server component. Resolve images there too, with `airspace.blobs.image()`, and keep the writing client in a server route, so the session never reaches the browser.
