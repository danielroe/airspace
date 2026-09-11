import { belongsTo, defineCollections, defineSpace } from 'airspace'
import { markdown } from 'airspace/plugins/markdown'

import lexicons from './lexicons.ts'

export const { note: notes, tag: tags, profile } = defineCollections(lexicons, c => ({
  note: {
    sort: [['createdAt', 'desc']],
    relations: { tag: belongsTo(c.tag, 'tag') },
    plugins: [markdown('body')],
  },
}))

export const workspace = defineSpace(lexicons.workspace, {
  collections: { notes, tags },
})
