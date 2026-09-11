A plugin is `{ name, read?, write? }`. `read` returns data for `record.meta`, which is typed by inference from the plugins you register.

```ts
import { definePlugin } from 'airspace'
import { markdown } from 'airspace/plugins/markdown' // optional peer: comark
import { timestamps } from 'airspace/plugins/timestamps'

const posts = defineCollection(lexicons.post, { plugins: [markdown('body')] })

const airspace = createAirspace({ identity: 'roe.dev', collections: { posts }, plugins: [timestamps()] })
const [post] = await airspace.posts.list()
post.meta.markdown?.nodes // typed
```

`timestamps()` sets `createdAt` on create and `updatedAt` on put, and skips collections whose schema has no such field, so it is safe to register for every collection. Mark those fields optional in the lexicon: a write plugin can't relax the input type.

Write plugins run on `publish()` too.
