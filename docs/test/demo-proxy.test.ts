import { describe, expect, it } from 'vitest'
import { inspect, repoMatches } from '../server/utils/demo-proxy.ts'
import { notes, workspace } from '../shared/collections.ts'

const params = (init?: Record<string, string>) => new URLSearchParams(init)
const did = 'did:plc:sandbox'

describe('demo proxy', () => {
  it('should let a read of a demo collection through without a grant', () => {
    expect(inspect({ method: 'com.atproto.repo.listRecords', params: params({ repo: did, collection: notes.nsid }) }))
      .toEqual({ ok: true, authenticated: false })
  })

  it('should require a grant for writes', () => {
    expect(inspect({ method: 'com.atproto.repo.createRecord', params: params(), body: { repo: did, collection: notes.nsid } }))
      .toEqual({ ok: true, authenticated: true })
  })

  it('should refuse a collection outside the demo model', () => {
    for (const request of [
      { method: 'com.atproto.repo.listRecords', params: params({ collection: 'app.bsky.feed.post' }) },
      { method: 'com.atproto.repo.createRecord', params: params(), body: { collection: 'app.bsky.feed.post' } },
      { method: 'com.atproto.repo.applyWrites', params: params(), body: { writes: [{ collection: notes.nsid }, { collection: 'app.bsky.feed.post' }] } },
      { method: 'com.atproto.repo.applyWrites', params: params(), body: { writes: [{}] } },
    ]) {
      expect(inspect(request)).toMatchObject({ ok: false, status: 403 })
    }
  })

  it('should refuse a space other than the demo workspace', () => {
    expect(inspect({ method: 'com.atproto.space.listRecords', params: params({ space: `at://${did}/space/com.example.other/self`, collection: notes.nsid }) }))
      .toMatchObject({ ok: false, status: 403 })
    expect(inspect({ method: 'com.atproto.space.listRecords', params: params({ space: `at://${did}/space/${workspace.type}/self`, collection: notes.nsid }) }))
      .toEqual({ ok: true, authenticated: true })
  })

  it('should refuse methods that are not proxied at all', () => {
    for (const method of ['com.atproto.server.createSession', 'com.atproto.server.createAppPassword', 'app.bsky.actor.getProfile']) {
      expect(inspect({ method, params: params() })).toMatchObject({ ok: false, status: 403 })
    }
  })

  it('should only accept a repo naming the grant itself', () => {
    expect(repoMatches(did, { params: params({ repo: did }) })).toBe(true)
    expect(repoMatches(did, { params: params(), body: { repo: did } })).toBe(true)
    expect(repoMatches(did, { params: params({ repo: 'did:plc:someone-else' }) })).toBe(false)
    expect(repoMatches(did, { params: params() })).toBe(true)
  })
})
