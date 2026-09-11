import { defineLexicons, field, permissions, space } from '../../src/lexicon.ts'

export default defineLexicons('space.getair.notes', {
  tag: {
    name: field.text({ max: 32 }),
  },
  note: {
    description: 'A note.',
    title: field.text({ max: 120 }),
    body: field.markdown(),
    tag: field.ref('tag').optional(),
    cover: field.image().optional(),
    pinned: field.boolean().optional(),
    rating: field.number({ min: 1, max: 5 }).optional(),
    state: field.enum(['draft', 'live']),
    links: field.list(field.url(), { max: 4 }).optional(),
    source: field.object({ label: field.text({ max: 40 }), url: field.url().optional() }).optional(),
    createdAt: field.datetime().optional(),
  },
  profile: {
    key: 'self',
    displayName: field.text().describe('Shown on the notes index.'),
    bio: field.text().optional(),
  },
  workspace: space(['note', 'tag']),
  authFull: permissions({
    collections: ['note', 'tag'],
    blobs: ['image/*'],
    title: 'Full notes access',
    detail: 'Read and write your notes and their tags.',
  }),
})
