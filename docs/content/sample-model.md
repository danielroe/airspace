```ts
// lexicons.ts
import { defineLexicons, field, space } from 'airspace/lexicon'

export default defineLexicons('dev.roe', {
  note: {
    title: field.text({ max: 120 }),
    body: field.markdown(),
    createdAt: field.datetime().optional(),
  },
  workspace: space(['note']),
})
```

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
