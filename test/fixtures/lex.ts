import { l as lex } from '@atproto/lex-schema'
import { defineLexicons, l } from '../../src/lexicon.ts'

const strongRef = l.object({
  uri: l.string({ format: 'at-uri' }),
  cid: l.string({ format: 'cid' }),
})

const lexicons = defineLexicons({
  'dev.example.defs': { strongRef },
  'dev.example.projectCategory': l.record({
    key: 'tid',
    record: l.object({
      name: l.string(),
      order: l.optional(l.integer()),
      createdAt: l.string({ format: 'datetime' }),
    }),
  }),
  'dev.example.project': l.record({
    key: 'tid',
    description: 'A project, belonging to a category.',
    record: l.object({
      category: l.ref(() => strongRef, { description: 'The parent category.' }),
      name: l.string({ maxGraphemes: 256 }),
      description: l.optional(l.string()),
      order: l.optional(l.integer()),
      createdAt: l.string({ format: 'datetime' }),
    }),
  }),
  'dev.example.location': l.record({
    key: 'literal:self',
    record: l.object({
      city: l.string(),
      createdAt: l.string({ format: 'datetime' }),
    }),
  }),
  'dev.example.photo': l.record({
    key: 'tid',
    record: l.object({
      image: l.blob({ accept: ['image/*'], maxSize: 1_000_000 }),
      alt: l.string(),
      aspectRatio: l.optional(l.object({ width: l.integer(), height: l.integer() })),
    }),
  }),
  'dev.example.note': l.record({
    key: 'tid',
    record: l.object({
      body: l.string(),
      createdAt: l.optional(l.string({ format: 'datetime' })),
      updatedAt: l.optional(l.string({ format: 'datetime' })),
    }),
  }),
  'dev.example.bookmark': l.record({
    key: 'tid',
    record: l.object({
      subject: l.string({ format: 'uri' }),
      label: l.string(),
      tags: l.optional(l.array(l.ref(() => strongRef))),
    }),
  }),
  'dev.example.workspace': l.space({ key: 'literal:self', collections: ['dev.example.project', 'dev.example.projectCategory'] }),
  'dev.example.authFull': l.permissionSet({ collections: ['dev.example.project', 'dev.example.projectCategory'], title: 'Full example access' }),
})

export const projectCategory = lexicons['dev.example.projectCategory']
export const project = lexicons['dev.example.project']
export const location = lexicons['dev.example.location']
export const photo = lexicons['dev.example.photo']
export const note = lexicons['dev.example.note']
export const bookmark = lexicons['dev.example.bookmark']
export const workspace = lexicons['dev.example.workspace']
export const authFull = lexicons['dev.example.authFull']

/* eslint-disable ts/consistent-type-definitions -- lex record types need implicit index signatures */
// The shape `lex build` emits: an explicit interface, a typed object def and a ref thunk cast to any.
export type GalleryImage = {
  $type?: 'dev.example.gallery#image'
  alt: string
  image: lex.BlobRef
}

const galleryImage = lex.typedObject<GalleryImage>('dev.example.gallery', 'image', lex.object({
  alt: lex.string(),
  image: lex.blob({ accept: ['image/*'] }),
}))

export type Gallery = {
  $type: 'dev.example.gallery'
  images: GalleryImage[]
}

export const gallery = lex.record<'tid', Gallery>('tid', 'dev.example.gallery', lex.object({
  images: lex.array(lex.ref<GalleryImage>((() => galleryImage) as any)),
}))

/** `dev.example.note` after a required field was added to it. */
export const noteV2 = defineLexicons({
  'dev.example.note': l.record({
    key: 'tid',
    record: l.object({
      body: l.string(),
      slug: l.string(),
      createdAt: l.optional(l.string({ format: 'datetime' })),
      updatedAt: l.optional(l.string({ format: 'datetime' })),
    }),
  }),
})['dev.example.note']

/** `dev.example.projectCategory` after a required field was added to it. */
export const projectCategoryV2 = defineLexicons({
  'dev.example.projectCategory': l.record({
    key: 'tid',
    record: l.object({
      name: l.string(),
      slug: l.string(),
      order: l.optional(l.integer()),
      createdAt: l.string({ format: 'datetime' }),
    }),
  }),
})['dev.example.projectCategory']
