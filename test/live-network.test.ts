import { describe, expect, it } from 'vitest'
import { createAirspace, defineCollection } from '../src/index.ts'
import { invalidateOn, subscribe } from '../src/live.ts'
import { spacesSupported } from '../src/supported.ts'
import { main as profileSchema } from './fixtures/live/app.bsky.actor.profile.ts'

/**
 * Smoke tests against the public network: Bluesky's entryway, two hosted PDSes and Jetstream.
 * Run with `AIRSPACE_LIVE=1 pnpm vitest run test/live-network.test.ts`.
 *
 * `test/fixtures/live/*.ts` is `lex install app.bsky.actor.profile` followed by
 * `lex build --clear --ignore-invalid-lexicons --lib @atproto/lex-schema --import-ext .ts`,
 * with the two dependency imports flattened into this directory.
 */
const live = process.env.AIRSPACE_LIVE === '1'

const DANIEL = 'did:plc:jbeaa5kdaladzwq3r7f5xgwe'
const WHITEWIND = 'did:plc:fzkpgpjj7nki7r5rhtmgzrez'
const NPMX = 'https://npmx.social'
const JETSTREAM = 'wss://jetstream1.us-east.bsky.network'

const profile = defineCollection(profileSchema)

describe.skipIf(!live)('a hosted pds', () => {
  it('reads a singleton and a listing from a repo it resolved by handle', async () => {
    const airspace = createAirspace({ identity: 'roe.dev', collections: { profile } })

    const one = await airspace.profile.get()
    expect(one?.uri).toBe(`at://${DANIEL}/app.bsky.actor.profile/self`)
    expect(typeof one?.value.displayName).toBe('string')
    expect(await airspace.profile.list()).toHaveLength(1)
  }, 30_000)

  it('reads a record on another pds through the one it was pointed at', async () => {
    const airspace = createAirspace({ identity: { did: DANIEL, service: NPMX }, collections: { profile } })

    const foreign = await airspace.resolve(`at://${WHITEWIND}/app.bsky.actor.profile/self`, profile)
    expect(foreign?.value.displayName).toBeTypeOf('string')
    expect(foreign?.cid).toMatch(/^bafy/)
    expect(await airspace.profile.list()).toHaveLength(1)
  }, 30_000)

  it('reports no permissioned spaces on a pds that does not serve them', async () => {
    for (const service of ['https://bsky.social', NPMX])
      expect(await spacesSupported(service)).toBe(false)
  }, 30_000)
})

describe.skipIf(!live)('jetstream', () => {
  /** Jetstream needs traffic to prove anything, so watch the accounts that are producing it. */
  async function busyDids(count = 60): Promise<string[]> {
    const seen = new Set<string>()
    await new Promise<void>((done, fail) => {
      const socket = new WebSocket(`${JETSTREAM}/subscribe?wantedCollections=app.bsky.feed.like`)
      socket.onerror = fail
      socket.onmessage = (event) => {
        const { did } = JSON.parse(String(event.data)) as { did?: string }
        if (did)
          seen.add(did)
        if (seen.size >= count) {
          socket.close()
          done()
        }
      }
    })
    return [...seen]
  }

  const settle = (ms: number) => new Promise(done => setTimeout(done, ms))

  it('parses commits and resumes past the cursor across a reconnect', async () => {
    const sockets: WebSocket[] = []
    const urls: URL[] = []
    class Recording extends WebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        urls.push(new URL(String(url)))
        sockets.push(this)
      }
    }

    const seen: { timeUs: number, rkey: string, collection: string, record?: unknown }[] = []
    const errors: unknown[] = []
    const stop = subscribe({
      did: await busyDids(),
      collections: ['app.bsky.feed.like'],
      service: JETSTREAM,
      retry: 100,
      WebSocket: Recording as unknown as typeof WebSocket,
      onCommit: commit => seen.push(commit),
      onError: error => errors.push(error),
    })

    await settle(10_000)
    const before = seen.length
    expect(before).toBeGreaterThan(0)
    expect(seen[0]!.collection).toBe('app.bsky.feed.like')
    expect(seen[0]!.record).toBeTypeOf('object')
    expect(seen.every((c, i) => i === 0 || c.timeUs >= seen[i - 1]!.timeUs)).toBe(true)

    const resumeFrom = seen.at(-1)!.timeUs
    sockets.at(-1)!.close()
    await settle(10_000)
    stop()

    expect(urls).toHaveLength(2)
    expect(urls[0]!.searchParams.get('cursor')).toBeNull()
    expect(urls[1]!.searchParams.get('cursor')).toBe(String(resumeFrom + 1))
    expect(seen.length).toBeGreaterThan(before)
    expect(errors).toEqual([])
  }, 60_000)

  it('drops the committed collection from a airspace cache', async () => {
    const dropped: (string | undefined)[] = []
    const off = invalidateOn({ invalidate: nsid => dropped.push(nsid) }, {
      did: await busyDids(),
      collections: ['app.bsky.feed.like'],
      service: JETSTREAM,
    })

    await settle(10_000)
    off()

    expect(dropped.length).toBeGreaterThan(0)
    expect([...new Set(dropped)]).toEqual(['app.bsky.feed.like'])
  }, 45_000)
})
