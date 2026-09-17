# spaces

Anything in your repo is public straight away, which is no good for drafts. A [permissioned space](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data) is a private area of the same repo, using the same collections and schemas.

> [!WARNING]
> Spaces are experimental. They need a PDS running prerelease software: atproto's `permissioned-data` branch, or the `@atproto/pds` [spaces alpha](https://atproto.com/blog/atproto-spaces-alpha). Hosted PDSes, including `bsky.social`, do not support them yet. The API may change.

## drafting and publishing

Declare a space with `space([...])` and `defineSpace`, as in [your content model](/docs/model). Its collections then have the same API public ones do:

```ts
const draft = await airspace.workspace.projects.create({ name: 'Not public yet', category: ref, createdAt: now })

await airspace.workspace.projects.publish(draft.rkey) // copies to the public repo at the same key
await airspace.workspace.projects.publish(draft.rkey, { transform: value => ({ ...value, publishedAt: now }) })
await airspace.workspace.projects.publish(draft.rkey, { ifMatch: draft.cid })

const live = await airspace.workspace.projects.published() // keys that exist in both
await airspace.workspace.supported() // false on most PDSes today, needs no session
```

A published copy is identical to its draft, down to the content hash, so `ifMatch: draft.cid` means "only if nobody has edited the public record since". Pointers between drafts are stored as plain AT URIs, so a published copy keeps them.

Without support, a space call throws [`SpacesUnsupportedError`](/docs/errors).

## managing a space

`airspace.workspace.manage` creates a space and sets who can see it. Reading and writing are set separately, each to `'public'`, `'member-list'` or `{ managingApp: did }`:

```ts
await airspace.workspace.manage.ensure({ read: 'member-list', write: 'member-list', appAccess: 'open' })
await airspace.workspace.manage.update({ read: 'public' })
await airspace.workspace.manage.members.add(did) // read and write, unless you pass { read, write }
await airspace.workspace.manage.members.list() // [{ did, read, write }]

await airspace.workspace.manage.exists() // is the space there at all?
await airspace.workspace.manage.info() // how is it configured? `null` until `ensure()`
```

You only need `ensure()` for a shared space. Writing to your own space creates it but leaves it unconfigured.

> [!WARNING]
> Blobs uploaded into a space are currently readable through the public `sync.getBlob` endpoint ([atproto#5435](https://github.com/bluesky-social/atproto/issues/5435)). Don't put images in a space that you'd mind being seen.
