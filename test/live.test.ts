import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { invalidateOn, subscribe, subscribeUrl, toCommit } from '../src/live.ts'

function commit(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    did: 'did:plc:alice',
    time_us: 1700,
    kind: 'commit',
    commit: { rev: 'r', operation: 'create', collection: 'dev.example.note', rkey: '3kabc', cid: 'bafy', record: { body: 'hi' }, ...over },
  })
}

/** A Jetstream-shaped server: one message per connection query, so a test can assert what was asked for. */
function fakeJetstream(send: (url: URL) => string[], hangUp = false) {
  const wss = new WebSocketServer({ port: 0 })
  const seen: URL[] = []
  wss.on('connection', (socket, request) => {
    const url = new URL(request.url!, 'http://localhost')
    seen.push(url)
    for (const message of send(url)) socket.send(message)
    if (hangUp)
      setTimeout(() => socket.close(), 10)
  })
  const { port } = wss.address() as AddressInfo
  return {
    service: `ws://127.0.0.1:${port}`,
    seen,
    close: () => new Promise<void>((done) => {
      for (const client of wss.clients) client.terminate()
      wss.close(() => done())
    }),
  }
}

const nextTick = (ms = 60) => new Promise(done => setTimeout(done, ms))

let stop: (() => void) | undefined
afterEach(() => stop?.())

describe('subscribeUrl', () => {
  it('asks for the dids and collections it was given', () => {
    const url = new URL(subscribeUrl({ did: ['did:plc:a', 'did:plc:b'], collections: ['dev.example.note'], cursor: 42 }))
    expect(url.origin).toBe('wss://jetstream1.us-east.bsky.network')
    expect(url.pathname).toBe('/subscribe')
    expect(url.searchParams.getAll('wantedDids')).toEqual(['did:plc:a', 'did:plc:b'])
    expect(url.searchParams.getAll('wantedCollections')).toEqual(['dev.example.note'])
    expect(url.searchParams.get('cursor')).toBe('42')
  })

  it('omits a cursor and collections when there are none', () => {
    const url = new URL(subscribeUrl({ did: 'did:plc:a' }))
    expect(url.search).toBe('?wantedDids=did%3Aplc%3Aa')
  })
})

describe('toCommit', () => {
  it('reads a commit and ignores anything else', () => {
    expect(toCommit(commit())).toEqual({
      did: 'did:plc:alice',
      timeUs: 1700,
      operation: 'create',
      collection: 'dev.example.note',
      rkey: '3kabc',
      cid: 'bafy',
      record: { body: 'hi' },
    })
    expect(toCommit(commit({ operation: 'delete', record: undefined }))?.record).toBeUndefined()
    expect(toCommit(JSON.stringify({ did: 'did:plc:a', kind: 'identity' }))).toBeUndefined()
    expect(toCommit(JSON.stringify({ did: 'did:plc:a', kind: 'commit', commit: { operation: 'create' } }))).toBeUndefined()
  })
})

describe('subscribe', () => {
  it('delivers commits and stops on unsubscribe', async () => {
    const server = fakeJetstream(() => [commit(), commit({ rkey: '3kdef', operation: 'delete', record: undefined })])
    const seen: string[] = []
    stop = subscribe({ did: 'did:plc:alice', collections: ['dev.example.note'], service: server.service, onCommit: c => seen.push(`${c.operation} ${c.rkey}`) })
    await nextTick()

    expect(seen).toEqual(['create 3kabc', 'delete 3kdef'])
    expect(server.seen[0]!.searchParams.getAll('wantedCollections')).toEqual(['dev.example.note'])

    stop()
    stop = undefined
    await nextTick()
    expect(server.seen).toHaveLength(1)
    await server.close()
  })

  it('reconnects past the last commit it saw, and reports a message it cannot read', async () => {
    let round = 0
    const server = fakeJetstream(() => (round++ === 0 ? [commit(), 'not json'] : []), true)
    const errors: unknown[] = []
    stop = subscribe({ did: 'did:plc:alice', service: server.service, retry: 5, onError: e => errors.push(e), onCommit: () => {} })
    await nextTick(200)

    expect(errors.length).toBeGreaterThan(0)
    expect(server.seen.length).toBeGreaterThan(1)
    expect(server.seen[0]!.searchParams.get('cursor')).toBeNull()
    expect(server.seen[1]!.searchParams.get('cursor')).toBe('1701')

    stop()
    stop = undefined
    await server.close()
  })

  it('does not replay the last commit, because jetstream\'s cursor is inclusive', async () => {
    let round = 0
    const server = fakeJetstream(url => (round++ === 0 ? [commit()] : [commit({ rkey: url.searchParams.get('cursor') === '1701' ? 'later' : 'replayed' })]), true)
    const seen: string[] = []
    stop = subscribe({ did: 'did:plc:alice', service: server.service, retry: 5, onCommit: c => seen.push(c.rkey) })
    await nextTick(200)

    expect(seen).not.toContain('replayed')
    expect(seen).toContain('later')

    stop()
    stop = undefined
    await server.close()
  })

  it('says so when the runtime has no WebSocket', () => {
    const global = globalThis.WebSocket
    // @ts-expect-error deleting a global for the length of one assertion
    delete globalThis.WebSocket
    expect(() => subscribe({ did: 'did:plc:a', onCommit: () => {} })).toThrow(/no WebSocket in this runtime/)
    globalThis.WebSocket = global
  })
})

describe('invalidateOn', () => {
  it('drops the collection that committed and passes the commit on', async () => {
    const server = fakeJetstream(() => [commit()])
    const dropped: (string | undefined)[] = []
    const seen: string[] = []
    stop = invalidateOn({ invalidate: nsid => dropped.push(nsid) }, {
      did: 'did:plc:alice',
      service: server.service,
      onCommit: c => seen.push(c.rkey),
    })
    await nextTick()

    expect(dropped).toEqual(['dev.example.note'])
    expect(seen).toEqual(['3kabc'])
    stop()
    stop = undefined
    await server.close()
  })
})
