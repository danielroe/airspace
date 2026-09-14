# plugins

A plugin runs on every read or write of a collection: setting timestamps on save, parsing a markdown field on read. It is an object, `{ name, read?, write? }`, and whatever `read` returns appears on `record.meta`, typed.

```ts
import { definePlugin } from 'airspace'
import { markdown } from 'airspace/plugins/markdown' // optional peer: comark
import { timestamps } from 'airspace/plugins/timestamps'

// one collection, or all of them through `createAirspace`
const posts = defineCollection(lexicons.post, { plugins: [markdown('body')] })

const airspace = createAirspace({ identity: 'roe.dev', collections: { posts }, plugins: [timestamps()] })
const [post] = await airspace.posts.list()
post.meta.markdown?.nodes // typed
```

`timestamps()` sets `createdAt` on create and `updatedAt` on put, and skips collections with no such field. Mark those fields optional in your lexicon, or you still have to pass them by hand: a write plugin cannot relax the input type.

Write plugins also run on [`publish()`](/docs/spaces).
