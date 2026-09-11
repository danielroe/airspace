import type lexicons from './fixtures/lexicons.ts'
import type { TestPds } from './pds.ts'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import { createAirspace, defineCollection, defineSpace, model } from '../src/index.ts'
import { startTestPds } from './pds.ts'

const lex = model<typeof lexicons>('space.getair.notes')

const tags = defineCollection(lex.tag)
const notes = defineCollection(lex.note)
const profile = defineCollection(lex.profile)
const workspace = defineSpace(lex.workspace, { collections: { notes, tags } })

let pds: TestPds
beforeAll(async () => {
  pds = await startTestPds()
})
afterAll(() => pds.close())

async function setup() {
  const account = await pds.account()
  const airspace = createAirspace({
    identity: { did: account.did, service: pds.service },
    collections: { notes, tags, profile },
    spaces: { workspace },
    session: account.session,
  })
  return { account, airspace }
}

describe('model', () => {
  it('carries NSIDs at runtime and the schema types at compile time', () => {
    expect(lex.note.$type).toBe('space.getair.notes.note')
    expect(lex.note).toBe(lex.note)
    expect(notes.nsid).toBe('space.getair.notes.note')
    expect(workspace.skey).toBe('self')
    expectTypeOf(notes.nsid).toEqualTypeOf<'space.getair.notes.note'>()
    expectTypeOf(profile.singleton).toEqualTypeOf<true>()
  })

  it('drops validate() from the type, since nothing is validated', () => {
    expectTypeOf(notes).not.toHaveProperty('validate')
    expect('validate' in ({} as Record<string, unknown>)).toBe(false)
  })

  it('reads and writes public records and singletons', async () => {
    const { airspace } = await setup()
    const written = await airspace.notes.create({ title: 'Hi', body: '# Hi', state: 'live' })
    const read = await airspace.notes.get(written.rkey)
    expect(read?.value.title).toBe('Hi')
    expectTypeOf(read!.value.state).toEqualTypeOf<'draft' | 'live'>()

    await airspace.profile.put({ displayName: 'Ada' })
    expect((await airspace.profile.get())?.value.displayName).toBe('Ada')
  })

  it('writes to a space and publishes without a validator', async () => {
    const { airspace } = await setup()
    await airspace.workspace.manage.ensure()
    const draft = await airspace.workspace.notes.create({ title: 'Draft', body: 'x', state: 'draft' })
    await airspace.workspace.notes.publish(draft.rkey)
    expect(await airspace.workspace.notes.published()).toEqual([draft.rkey])
    expect((await airspace.notes.get(draft.rkey))?.value.title).toBe('Draft')
  })
})
