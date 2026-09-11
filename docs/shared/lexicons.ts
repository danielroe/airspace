import { defineLexicons, field, space } from 'airspace/lexicon'

export default defineLexicons('space.getair.notes', {
  tag: {
    name: field.text({ max: 32 }),
  },
  note: {
    description: 'A note. The body is markdown.',
    title: field.text({ max: 120 }),
    body: field.markdown(),
    tag: field.ref('tag').optional(),
    cover: field.image({ max: 1_000_000 }).optional(),
    createdAt: field.datetime().optional(),
    updatedAt: field.datetime().optional(),
  },
  profile: {
    key: 'self',
    displayName: field.text({ max: 64 }),
    bio: field.text().optional(),
  },
  workspace: space(['note', 'tag']),
})
