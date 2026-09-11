import type { TestPds } from './pds.ts'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lexiconDnsRecords, loadLexicons, ownedLexicons, planLexiconPublish, publishLexicons } from '../src/publish.ts'
import { startTestPds } from './pds.ts'

const post = { lexicon: 1, id: 'dev.example.post', defs: { main: { type: 'record', key: 'tid', record: { type: 'object', properties: {} } } } }
const tag = { lexicon: 1, id: 'dev.example.blog.tag', defs: { main: { type: 'record', key: 'any', record: { type: 'object', properties: {} } } } }
const shared = { lexicon: 1, id: 'community.lexicon.app.defs', defs: { link: { type: 'object', properties: {} } } }

async function fixtureDir() {
  const dir = await mkdtemp(join(tmpdir(), 'airspace-lex-'))
  await mkdir(join(dir, 'dev/example/blog'), { recursive: true })
  await mkdir(join(dir, 'community/lexicon/app'), { recursive: true })
  await writeFile(join(dir, 'dev/example/post.json'), JSON.stringify(post))
  await writeFile(join(dir, 'dev/example/blog/tag.json'), JSON.stringify(tag))
  await writeFile(join(dir, 'community/lexicon/app/defs.json'), JSON.stringify(shared))
  await writeFile(join(dir, 'README.md'), 'not a lexicon')
  return dir
}

describe('lexicon files', () => {
  it('loads recursively, sorted by nsid, ignoring non-json', async () => {
    const all = await loadLexicons(await fixtureDir())
    expect(all.map(l => l.nsid)).toEqual(['community.lexicon.app.defs', 'dev.example.blog.tag', 'dev.example.post'])
  })

  it('filters to owned authorities including sub-authorities', async () => {
    const all = await loadLexicons(await fixtureDir())
    expect(ownedLexicons(all, ['dev.example']).map(l => l.nsid)).toEqual(['dev.example.blog.tag', 'dev.example.post'])
    expect(ownedLexicons(all, ['dev.example.blog']).map(l => l.nsid)).toEqual(['dev.example.blog.tag'])
    expect(ownedLexicons(all, ['dev.exam'])).toEqual([])
  })

  it('emits one DNS record per distinct authority', () => {
    expect(lexiconDnsRecords(['dev.example.post', 'dev.example.blog.tag', 'dev.example.comment'], 'did:plc:a')).toEqual([
      { name: '_lexicon.example.dev', type: 'TXT', value: `did=${'did:plc:a'}` },
      { name: '_lexicon.blog.example.dev', type: 'TXT', value: `did=${'did:plc:a'}` },
    ])
  })
})

let pds: TestPds
beforeAll(async () => {
  pds = await startTestPds()
})
afterAll(() => pds.close())

describe('publishLexicons', () => {
  it('plans create / unchanged / update / delete and applies them', async () => {
    const { did, raw: client } = await pds.account()
    const published = async () => (await client.listRecords('com.atproto.lexicon.schema', { repo: did })).body.records
    const lexicons = ownedLexicons(await loadLexicons(await fixtureDir()), ['dev.example'])

    const first = await publishLexicons({ client, did, lexicons })
    expect(first.map(s => [s.nsid, s.action])).toEqual([
      ['dev.example.blog.tag', 'create'],
      ['dev.example.post', 'create'],
    ])
    const stored = await published()
    expect(stored.map(r => r.uri).sort()).toEqual([
      `at://${did}/com.atproto.lexicon.schema/dev.example.blog.tag`,
      `at://${did}/com.atproto.lexicon.schema/dev.example.post`,
    ])
    expect(stored.find(r => r.uri.endsWith('/dev.example.post'))!.value).toEqual({ $type: 'com.atproto.lexicon.schema', ...post })

    const second = await planLexiconPublish({ client, did, lexicons })
    expect(second.every(s => s.action === 'unchanged')).toBe(true)

    const edited = lexicons.map(l => l.nsid === 'dev.example.post'
      ? { ...l, doc: { ...l.doc, defs: { main: { ...post.defs.main, description: 'changed' } } } }
      : l)
    const withoutTag = edited.filter(l => l.nsid !== 'dev.example.blog.tag')

    const dry = await publishLexicons({ client, did, lexicons: withoutTag, prune: ['dev.example'], dryRun: true })
    expect(dry.map(s => [s.nsid, s.action])).toEqual([
      ['dev.example.post', 'update'],
      ['dev.example.blog.tag', 'delete'],
    ])
    expect(await published()).toHaveLength(2)

    await publishLexicons({ client, did, lexicons: withoutTag, prune: ['dev.example'] })
    const after = await published()
    expect(after).toHaveLength(1)
    expect((after[0]!.value as any).defs.main.description).toBe('changed')
  })

  it('never prunes schemas outside the owned authorities', async () => {
    const { did, raw: client } = await pds.account()
    await client.putRecord({ $type: 'com.atproto.lexicon.schema', ...shared } as any, 'community.lexicon.app.defs', { repo: did, validate: false })
    const steps = await planLexiconPublish({ client, did, lexicons: [], prune: ['dev.example'] })
    expect(steps).toEqual([])
  })
})
