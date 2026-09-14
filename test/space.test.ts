import type { AirspaceRecord, Infer, Plain } from '../src/index.ts'
import type { TestPds } from './pds.ts'
import { XrpcResponseError } from '@atproto/lex-client'
import { l as lex } from '@atproto/lex-schema'
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { belongsTo, ConflictError, createAirspace, defineCollection, defineSpace, parseAtUri, ScopeError, SpacesUnsupportedError, ValidationError } from '../src/index.ts'
import { com } from '../src/lex/index.ts'
import { probeSpaces } from '../src/space.ts'
import { workspace as declaration, location, project, projectCategory, projectCategoryV2 } from './fixtures/lex.ts'
import { countCalls, hideSpaces, startTestPds } from './pds.ts'

type Project = Plain<Infer<typeof project>>

const categories = defineCollection(projectCategory)
const projects = defineCollection(project, { relations: { category: belongsTo(categories, 'category') } })
const current = defineCollection(location)

const workspace = defineSpace(declaration, { collections: { projects, categories, current } })

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
    session: account.session,
  })
  return { account, airspace }
}

const now = () => new Date().toISOString()

describe('defineSpace', () => {
  it('derives skey from a literal key and requires it otherwise', () => {
    expect(declaration).toEqual({ nsid: 'dev.example.workspace', key: 'literal:self', collections: ['dev.example.project', 'dev.example.projectCategory'] })
    expectTypeOf(declaration.nsid).toEqualTypeOf<'dev.example.workspace'>()
    expect(workspace.skey).toBe('self')
    expect(workspace.authority).toBe('self')
    expect(() => defineSpace({ nsid: 'dev.example.forum', key: 'any', collections: [] }, { collections: {} })).toThrow(/skey/)
    expect(defineSpace({ nsid: 'dev.example.forum', key: 'any', collections: [] }, { skey: 'general', collections: {} }).skey).toBe('general')
  })

  it('gives the Airspace a public collection for every space collection', async () => {
    const account = await pds.account()
    const airspace = createAirspace({
      identity: { did: account.did, service: pds.service },
      spaces: { workspace },
      session: account.session,
    })
    expectTypeOf(airspace.projects).toEqualTypeOf<typeof airspace.collections.projects>()
    const cat = await airspace.categories.create({ name: 'Derived category', createdAt: now() })
    const draft = await airspace.workspace.projects.create({ name: 'Derived', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    await airspace.workspace.projects.publish(draft.rkey)
    expect((await airspace.projects.get(draft.rkey))?.value.name).toBe('Derived')
  })

  it('prefers an explicit collection and refuses a name two spaces disagree on', async () => {
    const account = await pds.account()
    const identity = { did: account.did, service: pds.service }
    const explicit = defineCollection(project, { sort: [['name', 'asc']] })
    const airspace = createAirspace({ identity, collections: { projects: explicit }, spaces: { workspace }, session: account.session })
    expect(airspace.projects).not.toBe(airspace.workspace.projects)
    const cat = await airspace.categories.create({ name: 'Explicit category', createdAt: now() })
    const category = { uri: cat.uri, cid: cat.cid }
    await airspace.projects.create({ name: 'B', category, createdAt: now() })
    await airspace.projects.create({ name: 'A', category, createdAt: now() })
    expect((await airspace.projects.list()).map(r => r.value.name)).toEqual(['A', 'B'])

    const other = defineSpace({ nsid: 'dev.example.other', key: 'literal:self', collections: [] }, { collections: { projects: defineCollection(projectCategory) } })
    expect(() => createAirspace({ identity, spaces: { workspace, other } })).toThrow(/two different collections/)
  })

  it('parses both URI shapes', () => {
    expect(parseAtUri('at://did:plc:a/dev.example.project/abc')).toEqual({ authority: 'did:plc:a', author: 'did:plc:a', collection: 'dev.example.project', rkey: 'abc' })
    expect(parseAtUri('at://did:plc:a/space/dev.example.workspace/self/did:plc:b/dev.example.project/abc')).toEqual({
      authority: 'did:plc:a',
      space: { type: 'dev.example.workspace', skey: 'self' },
      author: 'did:plc:b',
      collection: 'dev.example.project',
      rkey: 'abc',
    })
    expect(parseAtUri('at://did:plc:a/space/dev.example.workspace/self').space).toEqual({ type: 'dev.example.workspace', skey: 'self' })
    expect(parseAtUri('at://alice.example.com/dev.example.project/abc').authority).toBe('alice.example.com')
  })

  it('rejects an authority that is not a DID or a handle, and any malformed segment', () => {
    for (const uri of [
      'at://did:plc:foo#frag/dev.example.project/abc',
      'at://did:plc:foo?x=1/dev.example.project/abc',
      'at://user name/dev.example.project/abc',
      'at://localhost:8443/dev.example.project/abc',
      'at://127.0.0.1/dev.example.project/abc',
      'at://did:plc:foo//dev.example.project',
      'at://did:plc:foo/dev.example.project/abc/extra',
      'at://did:plc:foo/not-an-nsid/abc',
      'at://did:plc:foo/dev.example.project/has space',
      'at://did:plc:foo/dev.example.project/..',
      'at://did:plc:a/space/dev.example.workspace/self/not-a-did/dev.example.project/abc',
      'at://did:plc:a/space/dev.example.workspace/self/did:plc:b/dev.example.project/abc/extra',
    ]) {
      expect(() => parseAtUri(uri), uri).toThrow(/malformed|not an at:\/\/ URI/)
    }
  })
})

describe('space client', () => {
  it('resolves the space URI against the identity and exposes collections', async () => {
    const { airspace, account } = await setup()
    expect(await airspace.workspace.uri()).toBe(`at://${account.did}/space/dev.example.workspace/self`)
    expect(airspace.workspace).toBe(airspace.spaces.workspace)
    expect(airspace.workspace.projects).toBe(airspace.workspace.collections.projects)
  })

  it('manages the space through simplespace', async () => {
    const { airspace } = await setup()
    expect(await airspace.workspace.manage.info()).toBeNull()

    const created = await airspace.workspace.manage.ensure({ read: 'member-list', write: 'member-list' })
    expect(created.uri).toBe(await airspace.workspace.uri())
    expect(await airspace.workspace.manage.ensure()).toEqual(created)

    await airspace.workspace.manage.members.add('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')
    expect(await airspace.workspace.manage.members.list()).toEqual([{ did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', read: true, write: true }])
    await airspace.workspace.manage.members.add('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', { write: false })
    expect(await airspace.workspace.manage.members.list()).toEqual([{ did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', read: true, write: false }])
    await airspace.workspace.manage.members.remove('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')
    expect(await airspace.workspace.manage.members.list()).toEqual([])

    await airspace.workspace.manage.update({ read: 'public' })
    expect(await airspace.workspace.manage.info()).toEqual({ uri: await airspace.workspace.uri(), read: 'public', write: 'member-list', appAccess: 'open' })

    await airspace.workspace.manage.delete()
    expect(await airspace.workspace.manage.info()).toBeNull()
  })

  it('reports a space written to but never configured as existing', async () => {
    const { airspace } = await setup()
    expect(await airspace.workspace.manage.exists()).toBe(false)

    const cat = await airspace.categories.create({ name: 'Category', createdAt: now() })
    await airspace.workspace.projects.create({ name: 'Draft', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    expect(await airspace.workspace.manage.exists()).toBe(true)
    expect(await airspace.workspace.manage.info()).toBeNull()

    await airspace.workspace.manage.ensure()
    expect(await airspace.workspace.manage.exists()).toBe(true)
    expect(await airspace.workspace.manage.info()).not.toBeNull()
  })

  it('reads and writes typed records inside the space, invisible to the public repo', async () => {
    const { airspace, account } = await setup()
    await airspace.workspace.manage.ensure()

    const cat = await airspace.categories.create({ name: 'Public category', createdAt: now() })
    const draft = await airspace.workspace.projects.create({ name: 'Secret project', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    expect(draft.uri).toBe(`${await airspace.workspace.uri()}/${account.did}/dev.example.project/${draft.rkey}`)

    const fetched = await airspace.workspace.projects.get(draft.rkey)
    expectTypeOf(fetched).toEqualTypeOf<AirspaceRecord<typeof project> | null>()
    expect(fetched?.value.name).toBe('Secret project')
    expect(fetched?.author).toBe(account.did)

    const listed = await airspace.workspace.projects.list({ with: ['category'] })
    expect(listed).toHaveLength(1)
    expect(listed[0]!.related.category?.uri).toBe(cat.uri)

    await airspace.workspace.current.put({ city: 'Somewhere private', createdAt: now() })
    expect((await airspace.workspace.current.get())?.value.city).toBe('Somewhere private')

    expect(await airspace.projects.list()).toEqual([])
    expect(await airspace.projects.get(draft.rkey)).toBeNull()
  })

  it('pages with a cursor and orders newest first, like the public repo', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    for (const name of ['a', 'b', 'c', 'd', 'e'])
      await airspace.workspace.categories.create({ name, createdAt: now() })

    const first = await airspace.workspace.categories.page({ limit: 2 })
    expect(first.records.map(r => r.value.name)).toEqual(['e', 'd'])
    const second = await airspace.workspace.categories.page({ limit: 2, cursor: first.cursor })
    expect(second.records.map(r => r.value.name)).toEqual(['c', 'b'])
    const last = await airspace.workspace.categories.page({ limit: 2, cursor: second.cursor })
    expect(last.records.map(r => r.value.name)).toEqual(['a'])
    expect(last.cursor).toBeUndefined()

    expect((await airspace.workspace.categories.page({ limit: 2, reverse: true })).records.map(r => r.value.name)).toEqual(['a', 'b'])
    expect((await airspace.workspace.categories.list()).map(r => r.value.name)).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('validates values client-side because the PDS does not know the lexicon', async () => {
    const { airspace, account } = await setup()
    await airspace.workspace.manage.ensure()
    // @ts-expect-error missing required fields
    await expect(airspace.workspace.projects.create({ name: 'broken' })).rejects.toThrow()
    expect(await airspace.workspace.projects.list()).toEqual([])

    const res = await account.raw.call(com.atproto.space.putRecord, {
      space: await airspace.workspace.uri(),
      repo: account.did,
      collection: 'dev.example.project',
      rkey: '3kzzzzzzzzzzz',
      record: { $type: 'dev.example.project', createdAt: 'not a date' },
    })
    expect(res.validationStatus).toBe('unknown')
    await expect(airspace.workspace.projects.get('3kzzzzzzzzzzz')).rejects.toThrow()
  })

  it('publishes a space record into the public repo at the same rkey', async () => {
    const { airspace, account } = await setup()
    await airspace.workspace.manage.ensure()
    const cat = await airspace.categories.create({ name: 'Ready', createdAt: now() })
    const draft = await airspace.workspace.projects.create({ name: 'Launch', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })

    const published = await airspace.workspace.projects.publish(draft.rkey, { transform: v => ({ ...v, name: `${v.name}!` }) })
    expect(published.rkey).toBe(draft.rkey)
    expect(published.uri).toBe(`at://${account.did}/dev.example.project/${draft.rkey}`)

    const live = await airspace.projects.get(draft.rkey)
    expectTypeOf(live!.value).toEqualTypeOf<Project>()
    expect(live?.value.name).toBe('Launch!')
    expect(await airspace.workspace.projects.get(draft.rkey)).not.toBeNull()

    await expect(airspace.workspace.projects.publish('3kzzzzzzzzzzz')).rejects.toThrow(/not found/)
    expectTypeOf(airspace.projects).not.toHaveProperty('publish')
  })

  it('offers no ifMatch in a space and guards publish with the draft CID', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    const cat = await airspace.categories.create({ name: 'Ready', createdAt: now() })
    const draft = await airspace.workspace.projects.create({ name: 'Launch', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })

    // @ts-expect-error com.atproto.space.putRecord takes no swap parameter
    await expect(airspace.workspace.categories.put(cat.rkey, { name: 'Ready', createdAt: now() }, { ifMatch: cat.cid })).resolves.toBeTruthy()

    const published = await airspace.workspace.projects.publish(draft.rkey)
    expect(published.cid).toBe(draft.cid)

    await airspace.projects.put(draft.rkey, { name: 'Edited live', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    const conflict = await airspace.workspace.projects.publish(draft.rkey, { ifMatch: draft.cid }).catch(err => err)
    expect(conflict).toBeInstanceOf(ConflictError)
    expect(conflict.collection).toBe('dev.example.project')
    expect((await airspace.projects.get(draft.rkey))?.value.name).toBe('Edited live')
  })

  it('reports which drafts are live', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    const cat = await airspace.categories.create({ name: 'Ready', createdAt: now() })
    const live = await airspace.workspace.projects.create({ name: 'Live', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    const draft = await airspace.workspace.projects.create({ name: 'Draft', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })
    await airspace.workspace.projects.publish(live.rkey)

    const onlyPublic = await airspace.projects.create({ name: 'Never drafted', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })

    const published = await airspace.workspace.projects.published()
    expect(published).toEqual([live.rkey])
    expect(published).not.toContain(draft.rkey)
    expect(published).not.toContain(onlyPublic.rkey)
    expectTypeOf(airspace.projects).not.toHaveProperty('published')

    await airspace.workspace.projects.delete(live.rkey)
    expect(await airspace.workspace.projects.published()).toEqual([])
  })

  it('resolves a space URI through airspace.resolve', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    const draft = await airspace.workspace.categories.create({ name: 'Draft category', createdAt: now() })

    expect((await airspace.resolve(draft.uri, categories))?.value.name).toBe('Draft category')
    expect((await airspace.resolve(draft.uri))?.cid).toBe(draft.cid)
  })

  it('batches writes inside the space in one commit', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    await airspace.workspace.current.put({ city: 'Edinburgh', createdAt: now() })
    const results = await airspace.workspace.batch((b) => {
      b.categories.create({ name: 'Batched', createdAt: now() })
      b.current.put({ city: 'Somewhere private', createdAt: now() })
    })
    expect(results.map(r => r.operation)).toEqual(['create', 'put'])
    expect((await airspace.workspace.categories.list()).map(r => r.value.name)).toEqual(['Batched'])
    expect((await airspace.workspace.current.get())?.value.city).toBe('Somewhere private')
  })

  it('publishes a draft category and the project pointing at it in one commit', async () => {
    const { airspace, account } = await setup()
    await airspace.workspace.manage.ensure()
    const cat = await airspace.workspace.categories.create({ name: 'Draft category', createdAt: now() })
    const draft = await airspace.workspace.projects.create({ name: 'Draft project', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })

    const [catValue, draftValue] = await Promise.all([airspace.workspace.categories.get(cat.rkey), airspace.workspace.projects.get(draft.rkey)])
    await airspace.batch((b) => {
      b.categories.create(catValue!.value, { rkey: cat.rkey })
      b.projects.create(draftValue!.value, { rkey: draft.rkey })
    })

    expect(await airspace.workspace.projects.published()).toEqual([draft.rkey])
    const [live] = await airspace.projects.list({ with: ['category'] })
    expect(live!.related.category?.uri).toBe(`at://${account.did}/dev.example.projectCategory/${cat.rkey}`)
  })

  it('stores refs between drafts repo-shaped and resolves them inside the space first', async () => {
    const { airspace, account } = await setup()
    await airspace.workspace.manage.ensure()
    const cat = await airspace.workspace.categories.create({ name: 'Draft category', createdAt: now() })
    const draft = await airspace.workspace.projects.create({ name: 'Draft project', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() })

    const stored = await airspace.workspace.projects.get(draft.rkey)
    expect(stored!.value.category.uri).toBe(`at://${account.did}/dev.example.projectCategory/${cat.rkey}`)

    const [joined] = await airspace.workspace.projects.list({ with: ['category'] })
    expect(joined!.related.category?.value.name).toBe('Draft category')
    expect(joined!.related.category?.uri).toBe(cat.uri)

    await airspace.workspace.categories.publish(cat.rkey)
    await airspace.workspace.projects.publish(draft.rkey)
    const [live] = await airspace.projects.list({ with: ['category'] })
    expect(live!.related.category?.value.name).toBe('Draft category')
    expect(live!.related.category?.uri).toBe(`at://${account.did}/dev.example.projectCategory/${cat.rkey}`)
  })

  it('validates with issues instead of throwing', async () => {
    const { airspace } = await setup()
    expect(await airspace.projects.validate({ name: 'ok', category: { uri: 'at://did:plc:a/dev.example.projectCategory/x', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' }, createdAt: now() })).toEqual({ ok: true })
    const missing = await airspace.projects.validate({ name: 'bad', createdAt: now() } as any)
    expect(missing.ok ? [] : missing.issues.map(i => i.path)).toEqual(['category'])
    const bad = await airspace.projects.validate({ name: 'bad', category: { uri: 'at://did:plc:a/dev.example.projectCategory/x', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' }, createdAt: 'yesterday' })
    expect(bad.ok ? [] : bad.issues.map(i => i.path)).toEqual(['createdAt'])
  })

  it('validates a draft ref the way the write path rewrites it', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    const cat = await airspace.workspace.categories.create({ name: 'Draft category', createdAt: now() })
    expect(cat.uri).toContain('/space/')
    const draft = { name: 'Draft', category: { uri: cat.uri, cid: cat.cid }, createdAt: now() }
    expect(await airspace.workspace.projects.validate(draft)).toEqual({ ok: true })
    await airspace.workspace.projects.create(draft)
  })

  it('deleting the space drops the authority\'s own repo in it', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    await airspace.workspace.current.put({ city: 'about to vanish', createdAt: now() })
    await airspace.workspace.manage.delete()
    expect(await airspace.workspace.current.get()).toBeNull()
    expect(await airspace.workspace.projects.list()).toEqual([])
  })

  it('refuses space access without a session', async () => {
    const airspace = createAirspace({ identity: { did: 'did:plc:x', service: pds.service }, spaces: { workspace } })
    await expect(airspace.workspace.projects.list()).rejects.toThrow(/session/)
    await expect(airspace.workspace.manage.info()).rejects.toThrow(/session/)
  })
})

describe('space reads', () => {
  it('wraps a record that no longer satisfies its schema', async () => {
    const account = await pds.account()
    const loose = defineCollection(lex.record('tid', 'dev.example.note', lex.object({ body: lex.string() })))
    const strict = defineCollection(lex.record('tid', 'dev.example.note', lex.object({ body: lex.string({ minLength: 3 }) })))
    const declaration = { nsid: 'dev.example.notes', key: 'literal:self' } as const
    const identity = { did: account.did, service: pds.service }

    const writer = createAirspace({ identity, spaces: { drafts: defineSpace(declaration, { collections: { notes: loose } }) }, session: account.session })
    await writer.drafts.manage.ensure()
    await writer.drafts.notes.create({ body: 'ok' })

    const reader = createAirspace({ identity, spaces: { drafts: defineSpace(declaration, { collections: { notes: strict } }) }, session: account.session })
    await expect(reader.drafts.notes.list()).rejects.toThrow(ValidationError)
    await expect(reader.drafts.notes.list()).rejects.toThrow(/dev\.example\.note\//)
  })
})

describe('space support', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('probes the PDS once and caches the answer', async () => {
    const { airspace } = await setup()
    const calls = countCalls()
    expect(await airspace.workspace.supported()).toBe(true)
    expect(await airspace.workspace.supported()).toBe(true)
    expect(calls.filter(call => call === 'com.atproto.simplespace.getSpace')).toHaveLength(1)
  })

  it.each(['MethodNotImplemented', 'AuthMissing', 'UpstreamFailure'])('does not read %s as an answer from the space domain', async (error) => {
    const status = error === 'AuthMissing' ? 401 : 501
    const client = { call: () => Promise.reject(new XrpcResponseError(com.atproto.simplespace.getSpace as never, new Response(null, { status }), { encoding: 'application/json', body: { error, message: error } })) }
    await expect(probeSpaces(client as never, 'at://did:plc:a/space/dev.example.workspace/self')).resolves.toBe(false)
  })

  it('reports a PDS without spaces rather than passing on its XRPC error', async () => {
    const { airspace } = await setup()
    hideSpaces()
    expect(await airspace.workspace.supported()).toBe(false)
    await expect(airspace.workspace.manage.ensure()).rejects.toThrow(SpacesUnsupportedError)
    await expect(airspace.workspace.projects.create({ name: 'Draft', category: { uri: 'at://did:plc:a/dev.example.projectCategory/x', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' }, createdAt: now() })).rejects.toThrow(/does not serve permissioned spaces/)
  })

  it('names the missing scope rather than blaming the PDS when the grant is too narrow', async () => {
    const { airspace } = await setup()
    const real = fetch
    vi.stubGlobal('fetch', ((input, init) => {
      if (/\/xrpc\/com\.atproto\.(?:simple)?space\./.test(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname))
        return Promise.resolve(Response.json({ error: 'InvalidToken', message: 'Missing required scope "space:dev.example.workspace?skey=self"' }, { status: 403 }))
      return real(input, init)
    }) as typeof fetch)

    const error = await airspace.workspace.projects.create({ name: 'Draft', category: { uri: 'at://did:plc:a/dev.example.projectCategory/x', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' }, createdAt: now() }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ScopeError)
    expect(error).not.toBeInstanceOf(SpacesUnsupportedError)
    expect((error as ScopeError).missingScope).toBe('space:dev.example.workspace?skey=self')
  })

  it('names the missing scope for space management too', async () => {
    const { airspace } = await setup()
    const real = fetch
    vi.stubGlobal('fetch', ((input, init) => {
      if (/\/xrpc\/com\.atproto\.simplespace\./.test(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname))
        return Promise.resolve(Response.json({ error: 'InvalidToken', message: 'Missing required scope "space:dev.example.workspace?skey=self&manage=create"' }, { status: 403 }))
      return real(input, init)
    }) as typeof fetch)

    for (const call of [() => airspace.workspace.manage.info(), () => airspace.workspace.manage.ensure(), () => airspace.workspace.manage.members.add('did:plc:bob')]) {
      const error = await call().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ScopeError)
      expect((error as ScopeError).missingScope).toBe('space:dev.example.workspace?skey=self&manage=create')
    }
  })
})

describe('migrate in a space', () => {
  it('scans records the current schema rejects, which a validating listing refuses', async () => {
    const account = await pds.account()
    const identity = { did: account.did, service: pds.service }
    const v2 = defineCollection(projectCategoryV2)
    const before = createAirspace({ identity, session: account.session, spaces: { workspace } })
    const after = createAirspace({
      identity,
      session: account.session,
      spaces: { workspace: defineSpace(declaration, { collections: { projects, categories: v2 } }) },
    })
    await before.workspace.manage.ensure()
    await before.workspace.categories.create({ name: 'Tools', createdAt: now() })

    await expect(after.workspace.categories.list()).rejects.toThrow(ValidationError)
    expect(await after.workspace.categories.migrate(value => ({ ...value, slug: 'tools' }))).toMatchObject({ scanned: 1, changed: 1, unchanged: 0 })
    expect((await after.workspace.categories.list()).map(record => record.value.slug)).toEqual(['tools'])
  })
})
