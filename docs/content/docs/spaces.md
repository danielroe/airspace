> [!WARNING]
> Spaces are experimental. They need a PDS running prerelease software: atproto's `permissioned-data` branch, or the `@atproto/pds` spaces alpha. Hosted PDSes, including `bsky.social`, do not support them yet. The API may change.

A [permissioned space](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data) holds data that isn't public. A space collection has the same typed surface as a public one:

```ts
const draft = await airspace.workspace.projects.create({ name: 'Not public yet', category: ref, createdAt: now })

await airspace.workspace.projects.publish(draft.rkey) // copies into the public repo at the same key
await airspace.workspace.projects.publish(draft.rkey, {
  transform: value => ({ ...value, publishedAt: now }),
})
await airspace.workspace.projects.publish(draft.rkey, { ifMatch: draft.cid })

const live = await airspace.workspace.projects.published() // the keys that exist in both
```

Refs between two drafts are stored as `at://author/collection/rkey`, so a published copy carries the same refs its draft did.

A published copy is byte-identical to its draft and has the same CID, so `publish(rkey, { ifMatch: draft.cid })` means "only if nobody has edited the public record since".

## support

`await airspace.workspace.supported()` answers in one call, cached per PDS, so an app can hide the feature rather than fail at the first write. A space call against a PDS without them throws `SpacesUnsupportedError`.

## managing a space

`airspace.workspace.manage` covers `com.atproto.simplespace`: `exists()`, `info()`, `ensure()`, `update()`, `delete()` and `members`. Reading and writing are governed separately, each by one of `'public'`, `'member-list'` or `{ managingApp: did }`:

```ts
await airspace.workspace.manage.ensure({ read: 'member-list', write: 'member-list', appAccess: 'open' })
await airspace.workspace.manage.update({ read: 'public' })
await airspace.workspace.manage.members.add(did) // read and write, unless you pass { read, write }
await airspace.workspace.manage.members.list() // [{ did, read, write }]
```

You only need `ensure()` for a shared space, where the policies and the member list matter. Writing to your own personal space creates the space but not a configuration for it, so `exists()` and `info()` answer two different questions:

```ts
await airspace.workspace.manage.exists() // is the space there at all?
await airspace.workspace.manage.info() // how is it configured? `null` until `ensure()`
```

> [!WARNING]
> Blobs uploaded into a space are currently readable through the public `sync.getBlob` endpoint ([atproto#5435](https://github.com/bluesky-social/atproto/issues/5435)). Don't put images in a space that you'd mind being seen.
