import type { AirspaceRecord, Infer, Plain, RecordInput } from '../src/index.ts'
import type { TestPds } from './pds.ts'
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { AirspaceError, belongsTo, cidFromBlob, ConflictError, createAirspace, defineCollection, defineCollections, definePlugin, hasMany, passwordSession, ScopeError, ValidationError } from '../src/index.ts'
import { bookmark, location, note, noteV2, photo, project, projectCategory } from './fixtures/lex.ts'
import friendly from './fixtures/lexicons.ts'
import { PNG_3X2 } from './fixtures/png.ts'
import { countCalls, routeIdentityTo, startTestPds, stubXrpcError } from './pds.ts'

type Project = Plain<Infer<typeof project>>
type ProjectCategory = Plain<Infer<typeof projectCategory>>

const categories = defineCollection(projectCategory, { sort: [['order', 'asc']] })
const projects = defineCollection(project, {
  relations: { category: belongsTo(categories, 'category') },
  sort: [['order', 'asc'], ['name', 'asc']],
})
const current = defineCollection(location)
const photos = defineCollection(photo)
const notes = defineCollection(note)
const bookmarks = defineCollection(bookmark, {
  relations: { subject: belongsTo(notes, 'subject'), tags: hasMany(notes, 'tags') },
})

let pds: TestPds
beforeAll(async () => {
  pds = await startTestPds()
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => pds.close())

async function setup() {
  const account = await pds.account()
  const airspace = createAirspace({
    identity: { did: account.did, service: pds.service },
    collections: { projects, categories, current, photos, notes, bookmarks },
    session: account.session,
    allowPrivateNetwork: true,
  })
  const readOnly = createAirspace({ identity: { did: account.did, service: pds.service }, collections: { projects } })
  return { account, airspace, readOnly }
}

const now = () => new Date().toISOString()

describe('defineCollection', () => {
  it('infers singleton-ness from a literal record key', () => {
    expect(projects.singleton).toBe(false)
    expect(current.singleton).toBe(true)
    expectTypeOf(projects.singleton).toEqualTypeOf<false>()
    expectTypeOf(current.singleton).toEqualTypeOf<true>()
  })
})

describe('defineCollections', () => {
  const bodyLength = definePlugin({ name: 'bodyLength', read: record => ({ bodyLength: String((record.value as { body?: string }).body ?? '').length }) })
  const model = defineCollections(friendly, c => ({
    note: { sort: [['createdAt', 'desc']], relations: { tag: belongsTo(c.tag, 'tag') }, plugins: [bodyLength] },
  }))

  it('makes one collection per record, keyed by its short name', () => {
    expect(Object.keys(model)).toEqual(['tag', 'note', 'profile'])
    expect(model.note.nsid).toBe('space.getair.notes.note')
    expect(model.profile.singleton).toBe(true)
    expect(model.note.sort).toEqual([['createdAt', 'desc']])
    expect(model.tag.sort).toEqual([])
    expectTypeOf(model.profile.singleton).toEqualTypeOf<true>()
  })

  it('points a relation at the sibling collection it returns', async () => {
    expect(model.note.relations.tag.target()).toBe(model.tag)

    const account = await pds.account()
    const airspace = createAirspace({ identity: { did: account.did, service: pds.service }, collections: model, session: account.session })
    const tag = await airspace.tag.create({ name: 'atproto' })
    await airspace.note.create({ title: 'Joined', body: '# hi', state: 'live', tag: { uri: tag.uri, cid: tag.cid } })
    const [note] = await airspace.note.list({ with: ['tag'] })
    expect(note!.related.tag?.value.name).toBe('atproto')
    expectTypeOf(note!.meta.bodyLength).toEqualTypeOf<number>()
  })
})

describe('passwordSession', () => {
  it('logs in with an app password and writes through the Airspace', async () => {
    const account = await pds.account()
    const session = await passwordSession({ service: pds.service, identifier: account.handle, password: account.password })
    const airspace = createAirspace({ identity: { did: account.did, service: pds.service }, collections: { notes }, session })
    const written = await airspace.notes.create({ body: 'From an app password' })
    expect((await airspace.notes.get(written.rkey))?.value.body).toBe('From an app password')
  })
})

describe('createAirspace', () => {
  it('returns synchronously and exposes collections by name', async () => {
    const { airspace, account } = await setup()
    expect(airspace.projects).toBe(airspace.collections.projects)
    expect(await airspace.identity()).toEqual({ did: account.did, handle: undefined, service: pds.service })
  })

  it('resolves a handle lazily and retries after a failed resolution', async () => {
    const account = await pds.account()
    const airspace = createAirspace({ identity: account.handle, collections: { projects }, allowPrivateNetwork: true })
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    await expect(airspace.projects.list()).rejects.toThrow()
    vi.unstubAllGlobals()
    routeIdentityTo(pds)
    expect(await airspace.projects.list()).toEqual([])
    expect(await airspace.identity()).toEqual({ did: account.did, handle: account.handle, service: pds.service })
  })

  it('makes no identity request when given did and service', async () => {
    const { account } = await setup()
    const calls = countCalls()
    const airspace = createAirspace({ identity: { did: account.did, service: pds.service }, collections: { projects } })
    await airspace.projects.list()
    expect(calls).toEqual(['com.atproto.repo.listRecords'])
  })

  it('names a missing or malformed identity rather than requesting at://undefined', async () => {
    const airspace = createAirspace({ identity: { did: undefined as never, service: pds.service }, collections: { projects } })
    await expect(airspace.projects.list()).rejects.toThrow(/identity\.did must be a DID, got undefined/)
    await expect(createAirspace({ identity: { did: 'alice.test' as never, service: pds.service }, collections: { projects } }).projects.list())
      .rejects
      .toThrow(/identity\.did must be a DID, got "alice\.test"/)
    await expect(createAirspace({ identity: '', collections: { projects } }).projects.list()).rejects.toThrow(/empty string/)
  })

  it('rejects reserved collection names', () => {
    // @ts-expect-error blobs is part of the Airspace surface
    expect(() => createAirspace({ identity: { did: 'did:plc:x', service: pds.service }, collections: { blobs: projects } })).toThrow(/reserved/)
  })
})

describe('keyed collection', () => {
  it('round-trips create / get / put / delete with typed rkeys', async () => {
    const { airspace, account } = await setup()
    const cat = await airspace.categories.create({ name: 'Frameworks', createdAt: now() })
    expect(cat.uri).toBe(`at://${account.did}/dev.example.projectCategory/${cat.rkey}`)

    const created = await airspace.projects.create({ name: 'Nuxt', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    expectTypeOf(created.rkey).toEqualTypeOf<string>()

    const fetched = await airspace.projects.get(created.rkey)
    expect(fetched?.value.name).toBe('Nuxt')
    expect(fetched?.author).toBe(account.did)
    expectTypeOf(fetched).toEqualTypeOf<AirspaceRecord<typeof project> | null>()
    expectTypeOf(fetched!.value).toEqualTypeOf<Project>()
    expectTypeOf(fetched!.value.createdAt).toEqualTypeOf<string>()
    expectTypeOf(fetched!.value.$type).toEqualTypeOf<'dev.example.project'>()

    await airspace.projects.put(created.rkey, { ...fetched!.value, name: 'Nuxt 4' })
    expect((await airspace.projects.get(created.rkey))?.value.name).toBe('Nuxt 4')

    await airspace.projects.delete(created.rkey)
    expect(await airspace.projects.get(created.rkey)).toBeNull()
  })

  it('validates client-side before sending', async () => {
    const { airspace } = await setup()
    // @ts-expect-error missing required fields
    await expect(airspace.projects.create({ name: 'broken' })).rejects.toThrow()
    expect(await airspace.projects.list()).toEqual([])
  })

  it('lists with where / sort / limit and default sort', async () => {
    const { airspace } = await setup()
    const cat = await airspace.categories.create({ name: 'A', createdAt: now() })
    const category = { uri: cat.uri, cid: cat.cid }
    await airspace.projects.create({ name: 'Zed', order: 2, category, createdAt: now() })
    await airspace.projects.create({ name: 'Alpha', order: 1, category, createdAt: now() })
    await airspace.projects.create({ name: 'Beta', order: 1, category, createdAt: now() })

    expect((await airspace.projects.list()).map(r => r.value.name)).toEqual(['Alpha', 'Beta', 'Zed'])
    expect((await airspace.projects.list({ where: { order: 1 }, sort: [['name', 'desc']], limit: 1 })).map(r => r.value.name)).toEqual(['Beta'])
    expect(await airspace.projects.list({ where: v => v.name.startsWith('Z') })).toHaveLength(1)
  })

  it('pushes a bare limit down to the PDS but not one that needs sorting', async () => {
    const { airspace } = await setup()
    const cat = await airspace.categories.create({ name: 'A', createdAt: now() })
    for (const name of ['a', 'b', 'c'])
      await airspace.projects.create({ name, category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })

    const calls = countCalls()
    expect(await airspace.projects.list({ limit: 2, sort: [] })).toHaveLength(2)
    expect(calls).toEqual(['com.atproto.repo.listRecords'])

    expect((await airspace.projects.list({ limit: 2 })).map(r => r.value.name)).toEqual(['a', 'b'])
  })

  it('returns newest first with no sort, because record keys are TIDs', async () => {
    const { airspace } = await setup()
    for (const body of ['first', 'second', 'third'])
      await airspace.notes.create({ body })

    expect((await airspace.notes.list()).map(r => r.value.body)).toEqual(['third', 'second', 'first'])
    expect((await airspace.notes.page({ reverse: true })).records.map(r => r.value.body)).toEqual(['first', 'second', 'third'])
  })

  it('pages through the collection with a cursor', async () => {
    const { airspace } = await setup()
    for (const body of ['a', 'b', 'c', 'd', 'e'])
      await airspace.notes.create({ body })

    const calls = countCalls()
    const first = await airspace.notes.page({ limit: 2 })
    expect(first.records.map(r => r.value.body)).toEqual(['e', 'd'])
    expect(first.cursor).toBeTypeOf('string')
    expect(calls).toEqual(['com.atproto.repo.listRecords'])

    const second = await airspace.notes.page({ limit: 2, cursor: first.cursor })
    expect(second.records.map(r => r.value.body)).toEqual(['c', 'b'])

    const last = await airspace.notes.page({ limit: 2, cursor: second.cursor })
    expect(last.records.map(r => r.value.body)).toEqual(['a'])
    expect(last.cursor).toBeUndefined()

    expectTypeOf(last.records).toEqualTypeOf<AirspaceRecord<typeof note>[]>()
    expectTypeOf(last.cursor).toEqualTypeOf<string | undefined>()
  })

  it('resolves belongsTo relations with one listing per collection', async () => {
    const { airspace, account } = await setup()
    const cat = await airspace.categories.create({ name: 'Tools', createdAt: now() })
    const p1 = await airspace.projects.create({ name: 'npmx', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    await airspace.projects.create({ name: 'orphan', category: { uri: `at://${account.did}/dev.example.projectCategory/3kzzzzzzzzzzz`, cid: cat.cid }, createdAt: now() })

    const calls = countCalls()
    await airspace.categories.list()
    const perListing = calls.length

    calls.length = 0
    const [npmx, orphan] = await airspace.projects.list({ with: ['category'] })
    expect(npmx!.related.category?.value.name).toBe('Tools')
    expect(orphan!.related.category).toBeNull()
    expectTypeOf(npmx!.related.category).toEqualTypeOf<AirspaceRecord<typeof projectCategory> | null>()
    expectTypeOf(npmx!.related.category!.value).toEqualTypeOf<ProjectCategory>()
    expect(calls).toHaveLength(perListing * 2)
    expect(calls).not.toContain('com.atproto.repo.getRecord')

    const resolved = await airspace.projects.resolve((await airspace.projects.get(p1.rkey))!, 'category')
    expect(resolved?.rkey).toBe(cat.rkey)
    // @ts-expect-error unknown relation
    await expect(airspace.projects.resolve(npmx!, 'nope')).rejects.toThrow(/no relation/)
  })

  it('reports a record the schema rejects as a ValidationError', async () => {
    const { airspace, account } = await setup()
    const res = await account.session.fetch(`${pds.service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repo: account.did,
        collection: projectCategory.$type,
        record: { $type: projectCategory.$type, name: 'legacy', order: 'not a number', createdAt: now() },
      }),
    })
    const { uri } = await res.json() as { uri: string }
    const rkey = uri.slice(uri.lastIndexOf('/') + 1)

    const error = await airspace.categories.get(rkey).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).message).toContain(`${projectCategory.$type}/${rkey}`)
    expect((error as ValidationError).issues).toEqual([{ path: 'order', message: expect.stringContaining('integer') }])
  })

  it('rejects a put or delete whose ifMatch no longer holds', async () => {
    const { airspace } = await setup()
    const created = await airspace.notes.create({ body: 'first' })
    const stale = created.cid

    const updated = await airspace.notes.put(created.rkey, { body: 'second' }, { ifMatch: stale })
    expect(updated.cid).not.toBe(stale)

    const conflict = await airspace.notes.put(created.rkey, { body: 'third' }, { ifMatch: stale }).catch(err => err)
    expect(conflict).toBeInstanceOf(ConflictError)
    expect(conflict).toBeInstanceOf(AirspaceError)
    expect(conflict.collection).toBe('dev.example.note')
    expect(conflict.rkey).toBe(created.rkey)
    expect(conflict.cid).toBe(stale)
    expect((await airspace.notes.get(created.rkey))?.value.body).toBe('second')

    await expect(airspace.notes.delete(created.rkey, { ifMatch: stale })).rejects.toBeInstanceOf(ConflictError)
    await airspace.notes.delete(created.rkey, { ifMatch: updated.cid })
    expect(await airspace.notes.get(created.rkey)).toBeNull()
  })

  it('joins through a bare at-uri field as well as a strongRef', async () => {
    const { airspace } = await setup()
    const target = await airspace.notes.create({ body: 'joined' })
    await airspace.bookmarks.create({ subject: target.uri, label: 'points at a note' })
    await airspace.bookmarks.create({ subject: 'https://example.com/elsewhere', label: 'points off atproto' })

    const [joined, offsite] = await airspace.bookmarks.list({ with: ['subject'], sort: [['label', 'asc']] })
    expect(joined!.related.subject?.value.body).toBe('joined')
    expectTypeOf(joined!.related.subject).toEqualTypeOf<AirspaceRecord<typeof note> | null>()
    expect(offsite!.related.subject).toBeNull()

    expect((await airspace.bookmarks.resolve(joined!, 'subject'))?.rkey).toBe(target.rkey)
  })

  it('joins a list of refs with hasMany, dropping the ones that do not resolve', async () => {
    const { airspace, account } = await setup()
    const first = await airspace.notes.create({ body: 'first tag' })
    const second = await airspace.notes.create({ body: 'second tag' })
    const gone = { uri: `at://${account.did}/dev.example.note/3kzzzzzzzzzzz`, cid: first.cid }
    await airspace.bookmarks.create({
      subject: 'https://example.com',
      label: 'tagged',
      tags: [{ uri: second.uri, cid: second.cid }, gone, { uri: first.uri, cid: first.cid }],
    })
    await airspace.bookmarks.create({ subject: 'https://example.com/none', label: 'untagged' })

    const [tagged, untagged] = await airspace.bookmarks.list({ with: ['tags'], sort: [['label', 'asc']] })
    expect(tagged!.related.tags.map(t => t.value.body)).toEqual(['second tag', 'first tag'])
    expect(untagged!.related.tags).toEqual([])
    expectTypeOf(tagged!.related.tags).toEqualTypeOf<AirspaceRecord<typeof note>[]>()

    expect((await airspace.bookmarks.resolve(tagged!, 'tags')).map(t => t.rkey)).toEqual([second.rkey, first.rkey])
    expectTypeOf(await airspace.bookmarks.resolve(tagged!, 'tags')).toEqualTypeOf<AirspaceRecord<typeof note>[]>()
  })

  it('skips a put whose value is already stored when ifChanged is set', async () => {
    const { airspace } = await setup()
    const created = await airspace.notes.create({ body: 'unchanged' })
    expect(created.changed).toBe(true)

    const calls = countCalls()
    const skipped = await airspace.notes.put(created.rkey, { body: 'unchanged' }, { ifChanged: true })
    expect(skipped).toEqual({ uri: created.uri, cid: created.cid, rkey: created.rkey, changed: false })
    expect(calls).not.toContain('com.atproto.repo.putRecord')

    const written = await airspace.notes.put(created.rkey, { body: 'different' }, { ifChanged: true })
    expect(written.changed).toBe(true)
    expect(written.cid).not.toBe(created.cid)
    expect(calls).toContain('com.atproto.repo.putRecord')
  })

  it('names the missing scope when a grant predates the collection', async () => {
    const { airspace } = await setup()
    stubXrpcError('com.atproto.repo.createRecord', 403, { error: 'InvalidRequest', message: 'Missing required scope "repo:dev.example.note"' })

    const err = await airspace.notes.create({ body: 'no scope for this' }).catch(error => error)
    expect(err).toBeInstanceOf(ScopeError)
    expect(err).toBeInstanceOf(AirspaceError)
    expect(err.missingScope).toBe('repo:dev.example.note')
  })

  it('refuses writes without a session', async () => {
    const { readOnly } = await setup()
    await expect(readOnly.projects.create({ name: 'x', category: { uri: 'at://did:plc:a/dev.example.projectCategory/x', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' }, createdAt: now() })).rejects.toThrow(/read-only/)
  })
})

describe('migrate', () => {
  it('rewrites a collection in batches and reports what it did', async () => {
    const { airspace } = await setup()
    for (const body of ['one', 'two', 'three'])
      await airspace.notes.create({ body })

    const dry = await airspace.notes.migrate(value => ({ ...value, body: value.body.toUpperCase() }), { dryRun: true })
    expect(dry).toEqual({ scanned: 3, changed: 3, unchanged: 0, failed: {} })
    expect((await airspace.notes.list()).map(r => r.value.body)).toEqual(['three', 'two', 'one'])

    const calls = countCalls()
    const report = await airspace.notes.migrate(value => ({ ...value, body: value.body.toUpperCase() }))
    expect(report).toEqual({ scanned: 3, changed: 3, unchanged: 0, failed: {} })
    expect(calls.filter(call => call === 'com.atproto.repo.applyWrites')).toHaveLength(1)
    expect((await airspace.notes.list()).map(r => r.value.body)).toEqual(['THREE', 'TWO', 'ONE'])

    expect(await airspace.notes.migrate(value => value)).toEqual({ scanned: 3, changed: 0, unchanged: 3, failed: {} })
  })

  it('leaves records the transform invalidates alone and names them', async () => {
    const { airspace } = await setup()
    const good = await airspace.notes.create({ body: 'keep' })
    const bad = await airspace.notes.create({ body: 'break' })

    const report = await airspace.notes.migrate(value => value.body === 'break' ? ({ ...value, createdAt: 'yesterday' }) : ({ ...value, body: 'kept' }))
    expect(report).toMatchObject({ scanned: 2, changed: 1, unchanged: 0 })
    expect(Object.keys(report.failed)).toEqual([bad.rkey])
    expect(report.failed[bad.rkey]).toEqual([{ path: 'createdAt', message: expect.any(String) }])
    expect((await airspace.notes.get(good.rkey))?.value.body).toBe('kept')
    expect((await airspace.notes.get(bad.rkey))?.value.body).toBe('break')
  })

  it('scans records the current schema rejects, which is the point of a migration', async () => {
    const { account } = await setup()
    const identity = { did: account.did, service: pds.service }
    const before = createAirspace({ identity, collections: { notes }, session: account.session })
    const after = createAirspace({ identity, collections: { notes: defineCollection(noteV2) }, session: account.session })

    for (const body of ['one', 'two'])
      await before.notes.create({ body })

    expect(await after.notes.list()).toEqual([])

    const report = await after.notes.migrate(value => ({ ...value, slug: value.body.toUpperCase() }))
    expect(report).toEqual({ scanned: 2, changed: 2, unchanged: 0, failed: {} })
    expect((await after.notes.list()).map(r => r.value.slug)).toEqual(['TWO', 'ONE'])
    expect(await after.notes.migrate(value => value)).toMatchObject({ scanned: 2, changed: 0, unchanged: 2 })
  })
})

describe('resolve', () => {
  it('fetches any record by URI, validated when a collection is named', async () => {
    const { airspace, account } = await setup()
    const created = await airspace.notes.create({ body: 'by uri' })

    const typed = await airspace.resolve(created.uri, notes)
    expect(typed?.value.body).toBe('by uri')
    expectTypeOf(typed).toEqualTypeOf<AirspaceRecord<typeof note> | null>()

    const untyped = await airspace.resolve(created.uri)
    expect(untyped).toMatchObject({ uri: created.uri, cid: created.cid, rkey: created.rkey, author: account.did })
    expectTypeOf(untyped!.value).toEqualTypeOf<unknown>()

    expect(await airspace.resolve(`at://${account.did}/dev.example.note/3kzzzzzzzzzzz`)).toBeNull()
    await expect(airspace.resolve(created.uri, categories)).rejects.toThrow(/not a dev.example.projectCategory record/)
    await expect(airspace.resolve(`at://${account.did}`)).rejects.toThrow(/not a record URI/)
  })

  it('reads another account\'s repo without declaring its collection', async () => {
    const { airspace } = await setup()
    const other = await pds.account()
    const theirs = createAirspace({ identity: { did: other.did, service: pds.service }, collections: { notes }, session: other.session })
    const created = await theirs.notes.create({ body: 'someone else' })

    routeIdentityTo(pds)
    expect((await airspace.resolve(created.uri, notes))?.value.body).toBe('someone else')
    expect((await airspace.resolve(created.uri))?.author).toBe(other.did)
  })

  it('reads another repo from the given service, making no identity request', async () => {
    const { airspace } = await setup()
    const other = await pds.account()
    const theirs = createAirspace({ identity: { did: other.did, service: pds.service }, collections: { notes, bookmarks }, session: other.session })
    const target = await theirs.notes.create({ body: 'across two dids' })
    await theirs.bookmarks.create({ subject: target.uri, label: 'mine' })

    const hosts: string[] = []
    const real = fetch
    vi.stubGlobal('fetch', ((input, init) => {
      hosts.push(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).host)
      return real(input, init)
    }) as typeof fetch)

    expect((await airspace.resolve(target.uri, notes))?.value.body).toBe('across two dids')
    const [joined] = await theirs.bookmarks.list({ with: ['subject'] })
    expect(joined!.related.subject?.value.body).toBe('across two dids')
    expect(hosts.some(host => host.includes('plc.directory') || host.includes('bsky.app'))).toBe(false)
  })

  it('refuses to follow a ref into a private host, so record content cannot steer a request inward', async () => {
    const other = await pds.account()
    const theirs = createAirspace({ identity: { did: other.did, service: pds.service }, collections: { notes, bookmarks }, session: other.session })
    await theirs.bookmarks.create({ subject: 'at://did:web:evil.example.com/dev.example.note/abc', label: 'trap' })

    const hosts: string[] = []
    const real = fetch
    vi.stubGlobal('fetch', ((input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      hosts.push(url.hostname)
      if (url.href === 'https://evil.example.com/.well-known/did.json')
        return Promise.resolve(Response.json({ id: 'did:web:evil.example.com', service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'http://169.254.169.254' }] }))
      if (url.pathname === '/xrpc/com.atproto.repo.getRecord')
        return Promise.resolve(Response.json({ error: 'InvalidRequest', message: 'Could not find repo: did:web:evil.example.com' }, { status: 400 }))
      return real(input, init)
    }) as typeof fetch)

    await expect(theirs.resolve('at://did:web:evil.example.com/dev.example.note/abc')).rejects.toThrow(/only https/)
    await theirs.bookmarks.list({ with: ['subject'] })
    await expect(theirs.resolve('at://did:web:evil.localhost/dev.example.note/abc')).rejects.toThrow(/malformed/)
    await expect(theirs.resolve('at://did:web:127.0.0.1%3A8443/dev.example.note/abc')).rejects.toThrow(/malformed/)
    expect(hosts).toContain('evil.example.com')
    expect(hosts).not.toContain('169.254.169.254')
    expect(hosts).not.toContain('evil.localhost')
  })

  it('falls back to the directory for a repo this PDS does not host', async () => {
    const { airspace } = await setup()
    const other = await startTestPds()
    try {
      const away = await other.account('away')
      const theirs = createAirspace({ identity: { did: away.did, service: other.service }, collections: { notes }, session: away.session })
      const target = await theirs.notes.create({ body: 'on another pds' })

      const real = fetch
      const directory: string[] = []
      vi.stubGlobal('fetch', ((input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        if (url.hostname !== 'plc.directory')
          return real(input, init)
        directory.push(url.pathname)
        return real(`${other.plc}${url.pathname}`, init)
      }) as typeof fetch)

      expect((await airspace.resolve(target.uri, notes))?.value.body).toBe('on another pds')
      expect(directory).toEqual([`/${away.did}`])
      expect((await airspace.resolve(target.uri, notes))?.author).toBe(away.did)
      expect(directory).toHaveLength(1)
    }
    finally {
      await other.close()
    }
  })
})

describe('batch', () => {
  it('commits creates, puts and deletes in one request, in order', async () => {
    const { airspace, account } = await setup()
    const gone = await airspace.notes.create({ body: 'to delete' })
    await airspace.current.put({ city: 'Sheffield', createdAt: now() })

    const calls = countCalls()
    const results = await airspace.batch((b) => {
      b.categories.create({ name: 'Frameworks', createdAt: now() })
      b.notes.create({ body: 'batched' })
      b.notes.delete(gone.rkey)
      b.current.put({ city: 'Edinburgh', createdAt: now() })
    })
    expect(calls).toEqual(['com.atproto.repo.applyWrites'])

    const [category] = results
    expect(results.map(r => [r.operation, r.collection, r.rkey])).toEqual([
      ['create', 'dev.example.projectCategory', expect.any(String)],
      ['create', 'dev.example.note', expect.any(String)],
      ['delete', 'dev.example.note', gone.rkey],
      ['put', 'dev.example.location', 'self'],
    ])
    expect(category).toMatchObject({ uri: `at://${account.did}/dev.example.projectCategory/${category!.rkey}` })

    expect((await airspace.categories.get(category!.rkey))?.value.name).toBe('Frameworks')
    expect((await airspace.notes.list()).map(r => r.value.body)).toEqual(['batched'])
    expect((await airspace.current.get())?.value.city).toBe('Edinburgh')
  })

  it('validates every operation before sending anything', async () => {
    const { airspace } = await setup()
    await expect(airspace.batch((b) => {
      b.notes.create({ body: 'fine' })
      // @ts-expect-error missing required fields
      b.projects.create({ name: 'broken' })
    })).rejects.toBeInstanceOf(ValidationError)
    expect(await airspace.notes.list()).toEqual([])
  })

  it('cannot put a record that does not exist yet', async () => {
    const { airspace } = await setup()
    await expect(airspace.batch(b => b.notes.put('3kzzzzzzzzzzz', { body: 'nothing here' }))).rejects.toThrow()
  })

  it('types each collection by its schema and its record key', async () => {
    const { airspace } = await setup()
    expectTypeOf(airspace.current).not.toHaveProperty('create')
    await airspace.batch((b) => {
      expectTypeOf(b.notes.create).parameter(0).toEqualTypeOf<RecordInput<typeof note>>()
      expectTypeOf(b.current.put).parameter(0).toEqualTypeOf<RecordInput<typeof location>>()
      expectTypeOf(b.current.delete).parameters.toEqualTypeOf<[]>()
      expectTypeOf(b.notes.delete).parameter(0).toEqualTypeOf<string>()
    })
  })
})

describe('singleton collection', () => {
  it('drops rkey from the API and has no create()', async () => {
    const { airspace } = await setup()
    expect(await airspace.current.get()).toBeNull()

    const res = await airspace.current.put({ city: 'Edinburgh', createdAt: now() })
    expect(res.rkey).toBe('self')
    expectTypeOf(res.rkey).toEqualTypeOf<'self'>()

    const rec = await airspace.current.get()
    expect(rec?.value.city).toBe('Edinburgh')
    expectTypeOf(rec!.value).toEqualTypeOf<Plain<Infer<typeof location>>>()

    expectTypeOf(airspace.current).not.toHaveProperty('create')
    // @ts-expect-error singleton get takes no rkey
    await airspace.current.get('self')

    await expect(airspace.current.delete({ ifMatch: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' })).rejects.toBeInstanceOf(ConflictError)
    await airspace.current.delete()
    expect(await airspace.current.get()).toBeNull()
  })
})

describe('blobs', () => {
  it('uploads an image, reads its dimensions and serves it back', async () => {
    const { airspace, account } = await setup()
    const uploaded = await airspace.blobs.upload(PNG_3X2, { mimeType: 'image/png' })
    expect(uploaded.mimeType).toBe('image/png')
    expect(uploaded.size).toBe(PNG_3X2.byteLength)
    expect(uploaded.aspectRatio).toEqual({ width: 3, height: 2 })
    expect(uploaded.cid).toMatch(/^bafkrei/)

    const url = (await airspace.blobs.url(uploaded.blob))!
    expect(url).toBe(`${pds.service}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(account.did)}&cid=${uploaded.cid}`)

    const { rkey } = await airspace.photos.create({ image: uploaded.blob, alt: 'tiny', aspectRatio: uploaded.aspectRatio })
    const stored = await airspace.photos.get(rkey)
    expect(cidFromBlob(stored!.value.image)).toBe(uploaded.cid)
    const res = await fetch((await airspace.blobs.url(stored!.value.image))!)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_3X2)
  })

  it('resolves an image def or a bare blob field to the same url', async () => {
    const { airspace } = await setup()
    const uploaded = await airspace.blobs.upload(PNG_3X2, { mimeType: 'image/png' })
    const url = (await airspace.blobs.url(uploaded.blob))!
    expect(await airspace.blobs.image({ image: uploaded.blob, alt: 'tiny', aspectRatio: { width: 3, height: 2 } })).toEqual({ url, alt: 'tiny', width: 3, height: 2 })
    expect(await airspace.blobs.image(uploaded.blob)).toEqual({ url, alt: '', width: undefined, height: undefined })
  })

  it('returns only an http(s) source for an image def carrying a uri', async () => {
    const { airspace } = await setup()
    expect(await airspace.blobs.image({ uri: 'https://cdn.example.com/a.png', alt: 'ok' })).toEqual({ url: 'https://cdn.example.com/a.png', alt: 'ok', width: undefined, height: undefined })

    expect(await airspace.blobs.image({ uri: 'javascript:alert(document.cookie)' })).toBeNull()
    expect(await airspace.blobs.image({ uri: 'data:text/html,<script>alert(1)</script>' })).toBeNull()
    expect(await airspace.blobs.image({ uri: 'file:///etc/passwd' })).toBeNull()
    expect(await airspace.blobs.image({ uri: '/relative.png' })).toBeNull()
  })

  it('takes the mime type from a Blob and skips dimensions for non-images', async () => {
    const { airspace } = await setup()
    const uploaded = await airspace.blobs.upload(new Blob(['hello'], { type: 'text/plain' }))
    expect(uploaded.mimeType).toBe('text/plain')
    expect(uploaded.size).toBe(5)
    expect(uploaded.aspectRatio).toBeUndefined()
  })

  it('enforces maxBytes and a session before uploading', async () => {
    const { airspace, readOnly } = await setup()
    await expect(airspace.blobs.upload(PNG_3X2, { maxBytes: 10 })).rejects.toThrow(/over the 10 byte limit/)
    await expect(readOnly.blobs.upload(PNG_3X2)).rejects.toThrow(/read-only/)
  })
})

describe('cache', () => {
  it('refuses persistent storage without a ttl', async () => {
    const account = await pds.account()
    const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getKeys: async () => [] }
    expect(() => createAirspace({ identity: { did: account.did, service: pds.service }, collections: { categories }, cache: { ttl: 0, storage } })).toThrow(/ttl above 0/)
  })

  it('shares in-flight reads, reuses them within the ttl, and drops them on write', async () => {
    const account = await pds.account()
    const airspace = createAirspace({
      identity: { did: account.did, service: pds.service },
      collections: { categories },
      session: account.session,
      cache: { ttl: 60_000 },
    })
    await airspace.categories.create({ name: 'A', createdAt: now() })

    const calls = countCalls()
    await Promise.all([airspace.categories.list(), airspace.categories.list()])
    const once = calls.length
    expect(once).toBeGreaterThan(0)

    await airspace.categories.list()
    expect(calls).toHaveLength(once)

    await airspace.categories.create({ name: 'B', createdAt: now() })
    expect(await airspace.categories.list()).toHaveLength(2)

    calls.length = 0
    await airspace.categories.list()
    expect(calls).toHaveLength(0)
    airspace.invalidate()
    await airspace.categories.list()
    expect(calls.length).toBeGreaterThan(0)
  })

  it('shares identical in-flight reads with no ttl configured', async () => {
    const account = await pds.account()
    const airspace = createAirspace({ identity: { did: account.did, service: pds.service }, collections: { categories }, session: account.session })
    await airspace.categories.create({ name: 'A', createdAt: now() })

    const calls = countCalls()
    await Promise.all([airspace.categories.list(), airspace.categories.list()])
    const shared = calls.length

    calls.length = 0
    await airspace.categories.list()
    expect(calls).toHaveLength(shared)
  })
})
