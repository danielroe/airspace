import type { LexValue } from '@atproto/lex-data'
import type { Infer } from '../src/lexicon.ts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { lexiconDocumentSchema, LexiconIterableIndexer, LexiconSchemaBuilder } from '@atproto/lex-document'
import { l as lex } from '@atproto/lex-schema'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineLexicons, field, l, permissions, space, toLexiconJson } from '../src/lexicon.ts'
import { loadLexicons } from '../src/publish.ts'
import notes from './fixtures/lexicons.ts'

// What `lex build` emits for an installed community def.
const strongRef = lex.typedObject('com.atproto.repo.strongRef', 'main', lex.object({ uri: lex.string({ format: 'at-uri' }), cid: lex.string({ format: 'cid' }) }))
const link = lex.typedObject('community.lexicon.app.defs', 'link', lex.object({ uri: lex.string({ format: 'uri' }) }))
const image = lex.typedObject('community.lexicon.app.defs', 'image', lex.object({ alt: lex.string() }))

const badge = l.object({ label: l.string({ maxGraphemes: 32, description: 'Shown on the card.' }), colour: l.optional(l.string({ knownValues: ['red', 'green'] })) })
const tier = l.typedObject('dev.example.defs', 'tier', l.object({ level: l.integer({ minimum: 1, maximum: 3 }) }))

const lexicons = defineLexicons({
  'dev.example.defs': {
    badge,
    tier,
    featured: l.token(),
  },
  'dev.example.project': l.record({
    key: 'tid',
    description: 'A project on the /projects page.',
    record: l.object({
      category: l.ref(() => strongRef, { description: 'Strong-ref to the parent category.' }),
      name: l.string({ maxLength: 2560, maxGraphemes: 256 }),
      links: l.optional(l.array(l.ref(() => link), { maxLength: 12, description: 'Relevant destinations.' })),
      hero: l.optional(l.ref(() => image)),
      badge: l.optional(l.ref(() => badge)),
      media: l.optional(l.union([() => image, () => tier], { closed: true })),
      state: l.enum(['draft', 'live'], { description: 'Editorial state.' }),
      kind: l.literal('project'),
      order: l.optional(l.withDefault(l.integer(), 100)),
      archived: l.optional(l.boolean({ description: 'Hidden from listings.' })),
      cover: l.optional(l.blob({ accept: ['image/*'], maxSize: 2_000_000 })),
      digest: l.optional(l.bytes({ maxLength: 64 })),
      snapshot: l.optional(l.cid()),
      extra: l.optional(l.unknown()),
      note: l.nullable(l.optional(l.string())),
      createdAt: l.string({ format: 'datetime' }),
    }),
  }),
  'dev.example.studio': l.space({ key: 'literal:self', name: 'Studio', description: 'Drafts.', collections: ['dev.example.project'] }),
})

describe('defineLexicons', () => {
  it('builds record schemas and space declarations from the map keys', () => {
    const project = lexicons['dev.example.project']
    expect(project.$type).toBe('dev.example.project')
    expect(project.key).toBe('tid')
    expectTypeOf(project.$type).toEqualTypeOf<'dev.example.project'>()
    expectTypeOf(project.key).toEqualTypeOf<'tid'>()
    expectTypeOf<Infer<typeof project>['state']>().toEqualTypeOf<'draft' | 'live'>()
    expectTypeOf<Infer<typeof project>['badge']>().toEqualTypeOf<Infer<typeof badge> | undefined>()
    expectTypeOf<Infer<typeof badge>['colour']>().toEqualTypeOf<'red' | 'green' | (string & NonNullable<unknown>) | undefined>()
    expectTypeOf<Infer<typeof project>['createdAt']>().toEqualTypeOf<lex.DatetimeString>()

    expect(lexicons['dev.example.studio']).toEqual({ nsid: 'dev.example.studio', key: 'literal:self', name: 'Studio', description: 'Drafts.', collections: ['dev.example.project'] })
    expectTypeOf(lexicons['dev.example.studio'].key).toEqualTypeOf<'literal:self'>()
    expect(lexicons['dev.example.defs'].badge).toBe(badge)
    expect(lexicons['dev.example.defs'].featured.value).toBe('dev.example.defs#featured')
    expectTypeOf(lexicons['dev.example.defs'].featured.value).toEqualTypeOf<'dev.example.defs#featured'>()
  })

  it('rejects records outside main and non-nsid keys', () => {
    expect(() => defineLexicons({ 'dev.example.x': { other: l.record({ key: 'tid', record: l.object({}) }) } })).toThrow(/records must be the main def/)
    // @ts-expect-error not an nsid
    defineLexicons({ note: l.object({}) })
  })
})

describe('toLexiconJson', () => {
  const docs = toLexiconJson(lexicons)
  const byId = Object.fromEntries(docs.map(d => [d.id, d]))

  it('emits every field the DSL can express', () => {
    expect(byId['dev.example.project']).toEqual({
      lexicon: 1,
      id: 'dev.example.project',
      defs: {
        main: {
          type: 'record',
          key: 'tid',
          description: 'A project on the /projects page.',
          record: {
            type: 'object',
            required: ['category', 'name', 'state', 'kind', 'createdAt'],
            nullable: ['note'],
            properties: {
              category: { type: 'ref', ref: 'com.atproto.repo.strongRef', description: 'Strong-ref to the parent category.' },
              name: { type: 'string', maxLength: 2560, maxGraphemes: 256 },
              links: { type: 'array', items: { type: 'ref', ref: 'community.lexicon.app.defs#link' }, maxLength: 12, description: 'Relevant destinations.' },
              hero: { type: 'ref', ref: 'community.lexicon.app.defs#image' },
              badge: { type: 'ref', ref: 'dev.example.defs#badge' },
              media: { type: 'union', refs: ['community.lexicon.app.defs#image', 'dev.example.defs#tier'], closed: true },
              state: { type: 'string', enum: ['draft', 'live'], description: 'Editorial state.' },
              kind: { type: 'string', const: 'project' },
              order: { type: 'integer', default: 100 },
              archived: { type: 'boolean', description: 'Hidden from listings.' },
              cover: { type: 'blob', accept: ['image/*'], maxSize: 2_000_000 },
              digest: { type: 'bytes', maxLength: 64 },
              snapshot: { type: 'cid-link' },
              extra: { type: 'unknown' },
              note: { type: 'string' },
              createdAt: { type: 'string', format: 'datetime' },
            },
          },
        },
      },
    })
    expect(byId['dev.example.defs']).toEqual({
      lexicon: 1,
      id: 'dev.example.defs',
      defs: {
        badge: {
          type: 'object',
          required: ['label'],
          properties: {
            label: { type: 'string', maxGraphemes: 32, description: 'Shown on the card.' },
            colour: { type: 'string', knownValues: ['red', 'green'] },
          },
        },
        tier: { type: 'object', required: ['level'], properties: { level: { type: 'integer', minimum: 1, maximum: 3 } } },
        featured: { type: 'token' },
      },
    })
    expect(byId['dev.example.studio']!.defs).toEqual({
      main: { type: 'space', key: 'literal:self', name: 'Studio', description: 'Drafts.', collections: ['dev.example.project'] },
    })
  })

  it('produces documents upstream accepts, whose validators agree with the DSL', async () => {
    const records = docs.filter(d => d.id !== 'dev.example.studio')
    for (const doc of records) lexiconDocumentSchema.parse(doc)

    const external = [
      { lexicon: 1, id: 'com.atproto.repo.strongRef', defs: { main: { type: 'object', required: ['uri', 'cid'], properties: { uri: { type: 'string', format: 'at-uri' }, cid: { type: 'string', format: 'cid' } } } } },
      { lexicon: 1, id: 'community.lexicon.app.defs', defs: { link: { type: 'object', required: ['uri'], properties: { uri: { type: 'string', format: 'uri' } } }, image: { type: 'object', required: ['alt'], properties: { alt: { type: 'string' } } } } },
    ]
    // The builder wants every ref as `nsid#def`; published lexicons write bare NSIDs for main.
    const explicitMain = JSON.parse(JSON.stringify([...records, ...external]).replaceAll(/"ref":"([^"#]+)"/g, '"ref":"$1#main"'))
    const fromJson = await LexiconSchemaBuilder.build(new LexiconIterableIndexer(explicitMain), 'dev.example.project#main')
    const fromDsl = lexicons['dev.example.project']

    const valid = { $type: 'dev.example.project', category: { uri: 'at://did:plc:a/dev.example.projectCategory/x', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' }, name: 'ok', state: 'live', kind: 'project', note: null, media: { $type: 'dev.example.defs#tier', level: 2 }, createdAt: '2024-01-01T00:00:00.000Z' }
    for (const value of [
      valid,
      { ...valid, state: 'archived' },
      { ...valid, kind: 'other' },
      { ...valid, media: { $type: 'dev.example.defs#tier', level: 9 } },
      { ...valid, media: { $type: 'dev.example.unknown', x: 1 } },
      { ...valid, badge: { label: 'x'.repeat(33) } },
      { ...valid, name: undefined },
    ]) {
      expect(fromJson.safeParse(value).success, JSON.stringify(value)).toBe(fromDsl.safeParse(value).success)
    }
  })

  it('hoists a ref to an object that is not a def', () => {
    const orphan = l.object({ x: l.string() })
    const model = defineLexicons({ 'dev.example.bad': l.record({ key: 'tid', record: l.object({ thing: l.ref(() => orphan, { description: 'Inline.' }) }) }) })
    expect(toLexiconJson(model)[0]!.defs.main).toEqual({
      type: 'record',
      key: 'tid',
      record: {
        type: 'object',
        required: ['thing'],
        properties: { thing: { type: 'ref', ref: 'dev.example.bad#thing', description: 'Inline.' } },
      },
    })
    expect(toLexiconJson(model)[0]!.defs.thing).toEqual({ type: 'object', required: ['x'], properties: { x: { type: 'string' } } })
  })

  it('refuses to invent a def for a foreign ref target it cannot name, unless given the nsid', () => {
    const status = lex.string({ knownValues: ['community.lexicon.app.defs#preview'] })
    const bad = defineLexicons('dev.example.foreign', { project: { status: field.raw(l.ref(() => status)) } })
    expect(() => toLexiconJson(bad)).toThrow(/is a "string" def that is not in this file/)

    const good = defineLexicons('dev.example.foreign', {
      project: { status: field.raw(l.ref(() => status, { nsid: 'community.lexicon.app.defs#status' })) },
    })
    expect((toLexiconJson(good)[0]!.defs.main as any).record.properties.status).toEqual({ type: 'ref', ref: 'community.lexicon.app.defs#status' })
    expect(Object.keys(toLexiconJson(good)[0]!.defs)).toEqual(['main'])
  })

  it('loads a defineLexicons module the way the CLI does', async () => {
    const dir = await mkdtemp(join(resolve(import.meta.dirname), '.lexicons-'))
    await writeFile(join(dir, 'lexicons.ts'), [
      `import { defineLexicons, l } from '../../src/lexicon.ts'`,
      `export default defineLexicons({ 'dev.example.note': l.record({ key: 'tid', record: l.object({ body: l.string() }) }) })`,
    ].join('\n'))
    try {
      const loaded = await loadLexicons(join(dir, 'lexicons.ts'))
      expect(loaded).toEqual([{ nsid: 'dev.example.note', doc: { lexicon: 1, id: 'dev.example.note', defs: { main: { type: 'record', key: 'tid', record: { type: 'object', required: ['body'], properties: { body: { type: 'string' } } } } } } }])
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('defineLexicons(namespace, model)', () => {
  const docs = toLexiconJson(notes)
  const byId = Object.fromEntries(docs.map(d => [d.id, d]))

  it('keys short names and stamps NSIDs from the namespace', () => {
    expect(notes.note.$type).toBe('space.getair.notes.note')
    expect(notes.note.key).toBe('tid')
    expect(notes.profile.key).toBe('literal:self')
    expect(notes.workspace).toEqual({
      nsid: 'space.getair.notes.workspace',
      key: 'literal:self',
      collections: ['space.getair.notes.note', 'space.getair.notes.tag'],
    })
    expectTypeOf(notes.note.$type).toEqualTypeOf<'space.getair.notes.note'>()
    expectTypeOf(notes.profile.key).toEqualTypeOf<'literal:self'>()
    expectTypeOf<Infer<typeof notes.note>['title']>().toEqualTypeOf<string>()
    expectTypeOf<Infer<typeof notes.note>['state']>().toEqualTypeOf<'draft' | 'live'>()
    expectTypeOf<Infer<typeof notes.note>['createdAt']>().toEqualTypeOf<lex.DatetimeString | undefined>()
    expectTypeOf<Infer<typeof notes.note>['links']>().toEqualTypeOf<lex.UriString[] | undefined>()
    expectTypeOf<NonNullable<Infer<typeof notes.note>['source']>['label']>().toEqualTypeOf<string>()
    expectTypeOf<NonNullable<Infer<typeof notes.note>['tag']>['uri']>().toEqualTypeOf<lex.AtUriString>()
  })

  it('emits every field the friendly DSL can express', () => {
    expect(byId['space.getair.notes.note']!.defs.main).toEqual({
      type: 'record',
      key: 'tid',
      description: 'A note.',
      record: {
        type: 'object',
        required: ['title', 'body', 'state'],
        properties: {
          title: { type: 'string', maxGraphemes: 120, maxLength: 1200 },
          body: { type: 'string', maxGraphemes: 100_000, maxLength: 1_000_000, description: 'Markdown.' },
          tag: { type: 'ref', ref: 'com.atproto.repo.strongRef' },
          cover: { type: 'blob', accept: ['image/*'], maxSize: 5_000_000 },
          pinned: { type: 'boolean' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          state: { type: 'string', enum: ['draft', 'live'] },
          links: { type: 'array', items: { type: 'string', format: 'uri' }, maxLength: 4 },
          source: { type: 'ref', ref: 'space.getair.notes.note#source' },
          createdAt: { type: 'string', format: 'datetime' },
        },
      },
    })
    expect(byId['space.getair.notes.note']!.defs.source).toEqual({ type: 'object', required: ['label'], properties: { label: { type: 'string', maxGraphemes: 40, maxLength: 400 }, url: { type: 'string', format: 'uri' } } })
    expect(byId['space.getair.notes.profile']!.defs.main).toEqual({
      type: 'record',
      key: 'literal:self',
      record: {
        type: 'object',
        required: ['displayName'],
        properties: {
          displayName: { type: 'string', maxGraphemes: 1000, maxLength: 10_000, description: 'Shown on the notes index.' },
          bio: { type: 'string', maxGraphemes: 1000, maxLength: 10_000 },
        },
      },
    })
    expect(byId['space.getair.notes.workspace']!.defs.main).toEqual({
      type: 'space',
      key: 'literal:self',
      collections: ['space.getair.notes.note', 'space.getair.notes.tag'],
    })
  })

  it('round trips through the upstream schema builder', async () => {
    const records = docs.filter(d => !['space.getair.notes.workspace', 'space.getair.notes.authFull'].includes(d.id))
    for (const doc of records) lexiconDocumentSchema.parse(doc)

    const external = [{ lexicon: 1, id: 'com.atproto.repo.strongRef', defs: { main: { type: 'object', required: ['uri', 'cid'], properties: { uri: { type: 'string', format: 'at-uri' }, cid: { type: 'string', format: 'cid' } } } } }]
    const explicitMain = JSON.parse(JSON.stringify([...records, ...external]).replaceAll(/"ref":"([^"#]+)"/g, '"ref":"$1#main"'))
    const fromJson = await LexiconSchemaBuilder.build(new LexiconIterableIndexer(explicitMain), 'space.getair.notes.note#main')
    const fromDsl = notes.note

    const valid = { $type: 'space.getair.notes.note', title: 'Hello', body: '# Hello', state: 'live' }
    for (const value of [
      valid,
      { ...valid, state: 'archived' },
      { ...valid, title: 'x'.repeat(121) },
      { ...valid, rating: 9 },
      { ...valid, links: ['https://example.com'] },
      { ...valid, tag: { uri: 'at://did:plc:a/space.getair.notes.tag/x', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' } },
      { ...valid, body: undefined },
    ]) {
      expect(fromJson.safeParse(value).success, JSON.stringify(value)).toBe(fromDsl.safeParse(value).success)
    }
  })

  it('emits a permission set in the shape published lexicons use', () => {
    expect(byId['space.getair.notes.authFull']!.defs.main).toEqual({
      type: 'permission-set',
      permissions: [
        { type: 'permission', resource: 'repo', collection: ['space.getair.notes.note', 'space.getair.notes.tag'] },
        { type: 'permission', resource: 'blob', accept: ['image/*'] },
      ],
      title: 'Full notes access',
      detail: 'Read and write your notes and their tags.',
    })
    lexiconDocumentSchema.parse(byId['space.getair.notes.authFull'])
  })

  it('treats `description` and `key` as fields unless they hold a record description or key', () => {
    const model = defineLexicons('dev.example.docs', {
      project: {
        description: field.text({ max: 2500 }).optional(),
        key: field.text({ max: 40 }),
        name: field.text(),
      },
      page: {
        key: 'self',
        description: 'A page.',
        title: field.text(),
      },
    })
    expectTypeOf<Infer<typeof model.project>['description']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Infer<typeof model.project>['key']>().toEqualTypeOf<string>()
    expect(model.project.key).toBe('tid')
    expect(model.page.key).toBe('literal:self')

    const byNsid = Object.fromEntries(toLexiconJson(model).map(d => [d.id, d]))
    expect(byNsid['dev.example.docs.project']!.defs.main).toEqual({
      type: 'record',
      key: 'tid',
      record: {
        type: 'object',
        required: ['key', 'name'],
        properties: {
          description: { type: 'string', maxGraphemes: 2500, maxLength: 25_000 },
          key: { type: 'string', maxGraphemes: 40, maxLength: 400 },
          name: { type: 'string', maxGraphemes: 1000, maxLength: 10_000 },
        },
      },
    })
    expect(byNsid['dev.example.docs.page']!.defs.main).toMatchObject({ type: 'record', key: 'literal:self', description: 'A page.' })
    for (const doc of Object.values(byNsid)) lexiconDocumentSchema.parse(doc)
  })

  it('rejects a key that is not a record key', () => {
    // @ts-expect-error not a record key
    expect(() => defineLexicons('dev.example.docs', { page: { key: 'slug', title: field.text() } })).toThrow(/"slug" is not a record key/)
  })

  it('rejects a ref or a space collection that names nothing in the model', () => {
    expect(() => defineLexicons('dev.example.notes', { authFull: permissions({ collections: ['nope'] }) })).toThrow(/no "nope" in this model/)
    expect(() => defineLexicons('dev.example.notes', { note: { tag: field.ref('missing') } })).toThrow(/not in this model/)
    expect(() => defineLexicons('dev.example.notes', { note: { title: field.text() }, studio: space(['nope']) })).toThrow(/no "nope" in this model/)
  })
})

describe('permission sets', () => {
  it('emits what community.lexicon.bookmarks.authManageBookmarks publishes', () => {
    const model = defineLexicons({
      'community.lexicon.bookmarks.authManageBookmarks': l.permissionSet({
        collections: ['community.lexicon.bookmarks.bookmark'],
        rpc: ['community.lexicon.bookmarks.getActorBookmarks'],
        inheritAud: true,
        title: 'Manage bookmarks',
        titleLang: { de: 'Lesezeichen verwalten' },
        detail: 'View, create, edit, and delete the account\'s saved bookmarks.',
        detailLang: { de: 'Die gespeicherten Lesezeichen des Kontos anzeigen, erstellen, bearbeiten und löschen.' },
      }),
    })
    const doc = toLexiconJson(model)[0]!
    expect(doc).toEqual({
      lexicon: 1,
      id: 'community.lexicon.bookmarks.authManageBookmarks',
      defs: {
        main: {
          'type': 'permission-set',
          'permissions': [
            { type: 'permission', resource: 'repo', collection: ['community.lexicon.bookmarks.bookmark'] },
            { type: 'permission', resource: 'rpc', inheritAud: true, lxm: ['community.lexicon.bookmarks.getActorBookmarks'] },
          ],
          'title': 'Manage bookmarks',
          'title:lang': { de: 'Lesezeichen verwalten' },
          'detail': 'View, create, edit, and delete the account\'s saved bookmarks.',
          'detail:lang': { de: 'Die gespeicherten Lesezeichen des Kontos anzeigen, erstellen, bearbeiten und löschen.' },
        },
      },
    })
    lexiconDocumentSchema.parse(doc)
    expectTypeOf(model['community.lexicon.bookmarks.authManageBookmarks'].nsid).toEqualTypeOf<'community.lexicon.bookmarks.authManageBookmarks'>()
  })

  it('narrows actions and passes through permissions it cannot express', () => {
    const model = defineLexicons({
      'dev.example.authRead': l.permissionSet({
        collections: ['dev.example.note'],
        actions: ['create', 'update'],
        extra: [{ type: 'permission', resource: 'space', space: 'dev.example.workspace' }],
      }),
    })
    expect(toLexiconJson(model)[0]!.defs.main).toEqual({
      type: 'permission-set',
      permissions: [
        { type: 'permission', resource: 'repo', collection: ['dev.example.note'], action: ['create', 'update'] },
        { type: 'permission', resource: 'space', space: 'dev.example.workspace' },
      ],
    })
  })

  it('rejects grants outside its own authority, and sets outside main', () => {
    expect(() => defineLexicons({ 'dev.example.authFull': l.permissionSet({ collections: ['app.bsky.feed.post'] }) })).toThrow(/not under "dev\.example\."/)
    expect(() => defineLexicons({ 'dev.example.auth': { extra: l.permissionSet({}) } })).toThrow(/must be the main def/)
  })
})

describe('open unions', () => {
  // What `lex build` emits for a block someone else publishes.
  const markdown = lex.typedObject('at.markpub.markdown', 'main', lex.object({ markdown: lex.string() }))

  const site = defineLexicons('site.example.blog', {
    document: {
      title: field.text(),
      content: field.list(field.union([() => markdown]).open()),
      links: field.list(field.union([]).open()).optional(),
    },
  })

  it('emits refs without a closed flag, and closes only when asked', () => {
    const doc = toLexiconJson(site)[0]!
    expect((doc.defs.main as any).record.properties).toMatchObject({
      content: { type: 'array', items: { type: 'union', refs: ['at.markpub.markdown'] } },
      links: { type: 'array', items: { type: 'union', refs: [] } },
    })
    const closed = defineLexicons('site.example.blog', { closed: { content: field.union([() => markdown]) } })
    expect((toLexiconJson(closed)[0]!.defs.main as any).record.properties.content).toEqual({ type: 'union', refs: ['at.markpub.markdown'], closed: true })

    const raw = defineLexicons({ 'site.example.blog.block': l.object({ content: l.openUnion([() => markdown]) }) })
    expect((toLexiconJson(raw)[0]!.defs.main as any).properties.content).toEqual({ type: 'union', refs: ['at.markpub.markdown'] })
  })

  it('narrows the members it knows and keeps the ones it does not', () => {
    const unknown = { $type: 'pub.leaflet.blocks.image', image: { alt: 'x' } }
    const content = [{ $type: 'at.markpub.markdown', markdown: '# hi' }, unknown]
    const parsed = site.document.parse({ $type: 'site.example.blog.document', title: 'Post', content })
    expect(parsed.content[1]).toEqual(unknown)
    expect(site.document.build({ ...parsed, title: 'Edited' }).content).toEqual(content)

    for (const block of parsed.content) {
      if (markdown.isTypeOf(block))
        expectTypeOf(block.markdown).toEqualTypeOf<string>()
      else
        expectTypeOf(block.image).toEqualTypeOf<LexValue | undefined>()
    }
  })

  it('rejects a member of a closed union', () => {
    const closed = defineLexicons('site.example.blog', { post: { content: field.union([() => markdown]) } })
    expect(closed.post.safeParse({ $type: 'site.example.blog.post', content: { $type: 'other.thing' } }).success).toBe(false)
  })
})

describe('string formats', () => {
  it('emits a format the runtime cannot verify, and validates it as a string', () => {
    const clips = defineLexicons('app.buttery.clips', {
      clip: {
        length: field.text({ max: 32, format: 'duration' }),
        poster: field.text({ format: 'uri-reference' }),
        createdAt: field.datetime(),
      },
    })
    expect((toLexiconJson(clips)[0]!.defs.main as any).record.properties).toMatchObject({
      length: { type: 'string', format: 'duration', maxGraphemes: 32 },
      poster: { type: 'string', format: 'uri-reference' },
      createdAt: { type: 'string', format: 'datetime' },
    })
    expect(clips.clip.safeParse({ $type: 'app.buttery.clips.clip', length: 'PT3M', poster: '/x.png', createdAt: '2024-01-01T00:00:00.000Z' }).success).toBe(true)
    expectTypeOf<Infer<typeof clips.clip>['length']>().toEqualTypeOf<string>()

    const raw = defineLexicons({ 'app.buttery.clips.defs': l.object({ length: l.string({ format: 'duration', description: 'ISO 8601.' }) }) })
    expect((toLexiconJson(raw)[0]!.defs.main as any).properties.length).toEqual({ type: 'string', format: 'duration', description: 'ISO 8601.' })
  })

  it('still validates the formats it knows', () => {
    const model = defineLexicons('app.buttery.clips', { clip: { at: field.text({ format: 'datetime' }) } })
    expect(model.clip.safeParse({ $type: 'app.buttery.clips.clip', at: 'nope' }).success).toBe(false)
  })
})
