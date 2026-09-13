# getting started

A notes app, from an empty directory to a published record and a draft.

## what you need

- Node 22 or newer.
- A PDS you can log into.

**To run a PDS locally**, clone the `airspace` repository and start it:

```sh
git clone https://github.com/danielroe/airspace
cd airspace
pnpm install
pnpm dev:pds
```

That serves a PDS on `http://localhost:2583` and prints credentials for two accounts. Keep it running.

**You can also use your own PDS**. Create an app password in your account settings, and use your handle and `https://bsky.social` (or wherever your account lives) as the service.

If you're using your own PDS, you can read and write public collections, but spaces are probably not supported yet (see below).

## a project

```sh
mkdir notes && cd notes
pnpm init
pnpm pkg set type=module
pnpm add airspace
```

## your lexicons

```ts
// lexicons.ts
import { defineLexicons, field, space } from 'airspace/lexicon'

export default defineLexicons('dev.example', {
  note: {
    title: field.text({ max: 120 }),
    body: field.markdown(),
    createdAt: field.datetime(),
  },
  workspace: space(['note']),
})
```

The first argument is your namespace. A namespace is a reversed domain, for example `getair.space` becomes `space.getair` &ndash; which sadly isn't that catchy.

So, `note` becomes `dev.example.note`. Use a namespace under a domain you control.

## your collections

```ts
// collections.ts
import { defineCollections, defineSpace } from 'airspace'
import lexicons from './lexicons.ts'

export const { note: notes } = defineCollections(lexicons, {
  note: { sort: [['createdAt', 'desc']] },
})

export const workspace = defineSpace(lexicons.workspace, {
  collections: { notes },
})
```

## a client

```ts
// notes.ts
import { createAirspace, passwordSession } from 'airspace'
import { workspace } from './collections.ts'

const session = await passwordSession({
  service: 'http://localhost:2583',
  identifier: process.env.PDS_IDENTIFIER!,
  password: process.env.PDS_PASSWORD!,
})

export const airspace = createAirspace({
  identity: { did: process.env.PDS_DID!, service: 'http://localhost:2583' },
  spaces: { workspace },
  session,
})
```

If you are using a public PDS, it's enough to specify the `identity: 'you.example.com'`. The handle can be resolved to a DID and a PDS on the first call that needs it.

If you're running a local PDS (for testing, perhaps), you will need to pass `{ did, service }`.

## read and write

```ts
// run.ts
import { airspace } from './notes.ts'

await airspace.notes.create({
  title: 'Hello',
  body: '# hello\n\nfrom my own repo.',
  createdAt: new Date().toISOString(),
})

for (const note of await airspace.notes.list())
  console.log(note.rkey, note.value.title)
```

```sh
PDS_DID=did:plc:... PDS_IDENTIFIER=alice.test PDS_PASSWORD=hunter2 node run.ts
```

`pnpm dev:pds` prints all three.

Records are now in your public repo &ndash; you can browse it on [`pdsls`](https://pdsls.dev).

## your first draft

> [!WARNING]
> Spaces are experimental. They need a PDS running prerelease software: atproto's `permissioned-data` branch, or the `@atproto/pds` spaces alpha. Hosted PDSes, including `bsky.social`, do not support them yet. The API may change. `pnpm dev:pds` runs one that does support them.

```ts
const draft = await airspace.workspace.notes.create({
  title: 'Not public yet',
  body: 'still writing',
  createdAt: new Date().toISOString(),
})

await airspace.workspace.notes.publish(draft.rkey)
```

`await airspace.workspace.supported()` tells you whether this PDS serves spaces, so an app can hide the feature rather than fail at the first write.

## next

- [OAuth and permission sets](/docs/oauth), to write on someone else's behalf instead of using an app password.
- [publishing your lexicons](/docs/publishing-lexicons), so other people can resolve your schemas.
