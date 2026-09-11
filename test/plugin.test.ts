import type { MarkdownDocument } from 'comark'
import type { TestPds } from './pds.ts'

import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import { belongsTo, createAirspace, defineCollection, definePlugin, defineSpace } from '../src/index.ts'
import { markdown } from '../src/plugins/markdown.ts'
import { timestamps } from '../src/plugins/timestamps.ts'
import { note, project, projectCategory } from './fixtures/lex.ts'
import { startTestPds } from './pds.ts'

const wordCount = definePlugin({
  name: 'word-count',
  read: record => ({ words: String((record.value as { description?: string }).description ?? '').split(/\s+/).filter(Boolean).length }),
})

const touched = definePlugin({
  name: 'touched',
  write: value => ({ ...value, name: `${value.name} ✓` }),
})

const seen = definePlugin({
  name: 'seen',
  read: (record, ctx) => ({ seenIn: ctx.collection.nsid, seenBy: ctx.identity.did }),
})

const categories = defineCollection(projectCategory, { plugins: [markdown('name')] })
const projects = defineCollection(project, {
  relations: { category: belongsTo(categories, 'category') },
  plugins: [wordCount, touched],
})

const workspace = defineSpace({ nsid: 'dev.example.workspace', key: 'literal:self', collections: [] }, {
  collections: { projects },
})

const now = () => new Date().toISOString()

let pds: TestPds
beforeAll(async () => {
  pds = await startTestPds()
})
afterAll(() => pds.close())

async function setup() {
  const account = await pds.account()
  const airspace = createAirspace({
    identity: { did: account.did, service: pds.service },
    collections: { projects, categories },
    spaces: { workspace },
    plugins: [seen],
    session: account.session,
  })
  return { account, airspace }
}

describe('plugins', () => {
  it('runs write hooks before validation and read hooks into typed meta', async () => {
    const { airspace, account } = await setup()
    const cat = await airspace.categories.create({ name: '# Tools', createdAt: new Date().toISOString() })
    const { rkey } = await airspace.projects.create({
      name: 'npmx',
      description: 'a fast modern registry browser',
      category: { uri: cat.uri, cid: cat.cid },
      createdAt: new Date().toISOString(),
    })

    const record = await airspace.projects.get(rkey)
    expect(record!.value.name).toBe('npmx ✓')
    expect(record!.meta).toEqual({ words: 5, seenIn: 'dev.example.project', seenBy: account.did })
    expectTypeOf(record!.meta.words).toEqualTypeOf<number>()
    expectTypeOf(record!.meta.seenIn).toBeString()
    // @ts-expect-error markdown is only on categories
    void record!.meta.markdown
  })

  it('types related records with their own plugins plus the global ones', async () => {
    const { airspace } = await setup()
    const cat = await airspace.categories.create({ name: '# Tools', createdAt: new Date().toISOString() })
    await airspace.projects.create({ name: 'x', category: { uri: cat.uri, cid: cat.cid }, createdAt: new Date().toISOString() })

    const [p] = await airspace.projects.list({ with: ['category'] })
    const related = p!.related.category!
    expect(related.meta.markdown?.nodes).toEqual([['h1', { id: 'tools' }, 'Tools']])
    expect(related.meta.seenIn).toBe('dev.example.projectCategory')
    expectTypeOf(related.meta.markdown).toEqualTypeOf<MarkdownDocument | null>()
    expectTypeOf(related.meta.seenBy).toBeString()
  })

  it('applies to space collections too', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    const cat = await airspace.categories.create({ name: 'c', createdAt: new Date().toISOString() })
    const { rkey } = await airspace.workspace.projects.create({ name: 'draft', category: { uri: cat.uri, cid: cat.cid }, createdAt: new Date().toISOString() })
    const draft = await airspace.workspace.projects.get(rkey)
    expect(draft!.value.name).toBe('draft ✓')
    expect(draft!.meta.words).toBe(0)
    expectTypeOf(draft!.meta.seenIn).toBeString()
  })

  it('runs read hooks over the records a query keeps, not everything it scanned', async () => {
    let reads = 0
    const counted = defineCollection(projectCategory, { plugins: [definePlugin({ name: 'counted', read: () => ({ counted: ++reads }) })] })
    const account = await pds.account()
    const airspace = createAirspace({ identity: { did: account.did, service: pds.service }, collections: { counted }, session: account.session })
    for (const name of ['one', 'two', 'three'])
      await airspace.counted.create({ name, createdAt: now() })

    reads = 0
    expect(await airspace.counted.list({ where: { name: 'two' } })).toHaveLength(1)
    expect(reads).toBe(1)

    reads = 0
    expect(await airspace.counted.list({ sort: [['name', 'asc']], limit: 2 })).toHaveLength(2)
    expect(reads).toBe(2)

    reads = 0
    expect((await airspace.counted.list()).map(record => record.meta.counted)).toEqual([1, 2, 3])
  })

  it('leaves meta empty and typed as such without plugins', async () => {
    const account = await pds.account()
    const plain = defineCollection(project)
    const airspace = createAirspace({ identity: { did: account.did, service: pds.service }, collections: { plain } })
    const records = await airspace.plain.list()
    expect(records).toEqual([])
    expectTypeOf<(typeof records)[number]['meta']>().toEqualTypeOf<Record<never, never>>()
  })
})

describe('markdown plugin', () => {
  it('parses the field and returns null when absent', async () => {
    const { airspace } = await setup()
    const cat = await airspace.categories.create({ name: 'Plain **bold**', createdAt: new Date().toISOString() })
    const record = await airspace.categories.get(cat.rkey)
    expect(record!.meta.markdown!.nodes).toEqual([['p', {}, 'Plain ', ['strong', {}, 'bold']]])
    expect(JSON.parse(JSON.stringify(record!.meta.markdown))).toEqual(record!.meta.markdown)
  })

  it('names the collection when the field is not in the schema', async () => {
    const account = await pds.account()
    const typo = defineCollection(projectCategory, { plugins: [markdown('nmae')] })
    const airspace = createAirspace({ identity: { did: account.did, service: pds.service }, collections: { typo }, session: account.session })
    await airspace.typo.create({ name: 'x', createdAt: now() })
    await expect(airspace.typo.list()).rejects.toThrow(/dev.example.projectCategory has no field "nmae"/)
  })
})

describe('timestamps plugin', () => {
  it('stamps createdAt on create and updatedAt on put, skipping schemas without the field', async () => {
    const account = await pds.account()
    const notes = defineCollection(note)
    const plain = defineCollection(projectCategory)
    const airspace = createAirspace({
      identity: { did: account.did, service: pds.service },
      collections: { notes, plain },
      plugins: [timestamps()],
      session: account.session,
    })

    const { rkey } = await airspace.notes.create({ body: 'first' })
    const created = await airspace.notes.get(rkey)
    expect(created!.value.createdAt).toBeTypeOf('string')
    expect(created!.value.updatedAt).toBeUndefined()

    await airspace.notes.put(rkey, { body: 'second', createdAt: created!.value.createdAt })
    const updated = await airspace.notes.get(rkey)
    expect(updated!.value.createdAt).toBe(created!.value.createdAt)
    expect(updated!.value.updatedAt).toBeTypeOf('string')

    const other = await airspace.plain.create({ name: 'has createdAt but no updatedAt', createdAt: now() })
    await airspace.plain.put(other.rkey, { name: 'edited', createdAt: now() })
    expect(await airspace.plain.get(other.rkey)).toMatchObject({ value: { name: 'edited' } })
    expect((await airspace.plain.get(other.rkey))!.value).not.toHaveProperty('updatedAt')
  })
})
