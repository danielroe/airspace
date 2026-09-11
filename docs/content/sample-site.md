```ts
// airspace.ts
import { createAirspace } from 'airspace'
import { workspace } from './collections.ts'

export const airspace = createAirspace({
  identity: 'roe.dev',
  spaces: { workspace }, // its `notes` is a public collection too
  session, // omit for read-only
})

const published = await airspace.notes.list({ limit: 5 })

const draft = await airspace.workspace.notes.create({
  title: 'Not public yet',
  body: '# hello',
})
await airspace.workspace.notes.publish(draft.rkey)
```
