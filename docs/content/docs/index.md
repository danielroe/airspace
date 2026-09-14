# getting started

airspace uses an atproto account as the backend for your app: typed reads and writes, file uploads, login and a public API, with no database to run.

This page shows how to use `airspace` by building a sample app. New to atproto? [Read the terms first](/docs/concepts).

## what you need

Node 22 or newer, and an account on a PDS (personal data server) you can log into.

To run a PDS locally:

```sh
git clone https://github.com/danielroe/airspace
cd airspace
pnpm install
pnpm dev:pds
```

That serves a PDS on `http://localhost:2583` and prints credentials for two accounts. Keep it running.

To use your own account instead, create an app password in your account settings, and use `https://bsky.social` (or wherever your account lives) as the service. Spaces, at the end of this page, won't work there yet.

## a project

```sh
mkdir notes && cd notes
pnpm init
pnpm pkg set type=module
pnpm add airspace
```

## your schemas

Every record needs a schema, called a lexicon:

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

The first argument is your namespace: a domain you own, reversed. `getair.space` becomes `space.getair`, which sadly isn't that catchy. So `note` here defines the record type `dev.example.note`.

`workspace` declares a [space](/docs/spaces), a private area for drafts, used at the end of this page.

## your collections

Records of one type live in a collection:

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

Reads need no credentials, since a repo is public. Writes need a session:

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
  // on a public PDS, your handle is enough: identity: 'you.example.com'
  identity: { did: process.env.PDS_DID!, service: 'http://localhost:2583' },
  spaces: { workspace },
  session,
})
```

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
# `pnpm dev:pds` prints all three
PDS_DID=did:plc:... PDS_IDENTIFIER=alice.test PDS_PASSWORD=hunter2 node run.ts
```

Both notes are now in your public repo, which you can browse on [`pdsls`](https://pdsls.dev).

## your first draft

Anything in your repo is public straight away, which is awkward for a half-finished note. A space is a private area of the same repo, and `publish()` copies a record out of it.

> [!WARNING]
> Spaces are experimental. They need a PDS running prerelease software: atproto's `permissioned-data` branch, or the `@atproto/pds` spaces alpha. Hosted PDSes, including `bsky.social`, do not support them yet. The API may change. `pnpm dev:pds` runs one that does support them.

```ts
const draft = await airspace.workspace.notes.create({
  title: 'Not public yet',
  body: 'still writing',
  createdAt: new Date().toISOString(),
})

await airspace.workspace.notes.publish(draft.rkey)

await airspace.workspace.supported() // check first, and hide the feature if false
```

## next steps

- [Your content model](/docs/model): field types, relations and singletons.
- [Reading and writing](/docs/reading-and-writing): queries, paging, caching and live updates.
- [OAuth and permission sets](/docs/oauth): logging in as someone else.
