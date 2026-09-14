import { afterEach, describe, expect, it, vi } from 'vitest'

const DID = 'did:plc:jbeaa5kdaladzwq3r7f5xgwe'

/** A fresh copy of the module, so its memoised `node:dns` probe runs again. */
async function identity() {
  vi.resetModules()
  return await import('../src/identity.ts')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('node:dns/promises')
})

describe('handle resolution', () => {
  it('reads the _atproto TXT record through node:dns when there is one', async () => {
    vi.doMock('node:dns/promises', () => ({ resolveTxt: async () => [[`did=${DID}`]] }))
    const calls: string[] = []
    vi.stubGlobal('fetch', ((input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('plc.directory'))
        return Promise.resolve(Response.json({ service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://npmx.social' }] }))
      return Promise.resolve(Response.json({}, { status: 404 }))
    }) as typeof fetch)

    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('roe.dev')).resolves.toMatchObject({ did: DID, service: 'https://npmx.social' })
    expect(calls.some(url => url.includes('dns-query'))).toBe(false)
  })

  it('falls back to DNS over HTTPS where node:dns does not exist', async () => {
    vi.doMock('node:dns/promises', () => {
      throw new Error('No such module "node:dns/promises"')
    })
    const calls: string[] = []
    vi.stubGlobal('fetch', ((input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('dns-query'))
        return Promise.resolve(Response.json({ Answer: [{ data: `"did=${DID}"` }] }))
      if (url.includes('plc.directory'))
        return Promise.resolve(Response.json({ service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://npmx.social' }] }))
      return Promise.resolve(Response.json({}, { status: 404 }))
    }) as typeof fetch)

    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('roe.dev')).resolves.toEqual({ did: DID, handle: 'roe.dev', service: 'https://npmx.social' })

    const doh = new URL(calls.find(url => url.includes('dns-query'))!)
    expect(doh.searchParams.get('name')).toBe('_atproto.roe.dev')
    expect(doh.searchParams.get('type')).toBe('TXT')
    expect(calls.some(url => url.includes('well-known') || url.includes('public.api.bsky.app'))).toBe(false)
  })

  it('carries on to the well-known file when DNS over HTTPS answers nothing', async () => {
    vi.doMock('node:dns/promises', () => {
      throw new Error('No such module "node:dns/promises"')
    })
    vi.stubGlobal('fetch', ((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('dns-query'))
        return Promise.resolve(Response.json({ Status: 3 }))
      if (url.endsWith('/.well-known/atproto-did'))
        return Promise.resolve(new Response(`${DID}\n`))
      if (url.includes('plc.directory'))
        return Promise.resolve(Response.json({ service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://npmx.social' }] }))
      return Promise.resolve(Response.json({}, { status: 500 }))
    }) as typeof fetch)

    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('roe.dev')).resolves.toMatchObject({ did: DID, service: 'https://npmx.social' })
  })
})

const doc = (did: string, service: string, extra: Record<string, unknown> = {}) => ({ id: did, service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: service }], ...extra })

/** Stub `fetch` to serve DID documents, recording every URL requested. */
function serve(routes: Record<string, unknown>) {
  vi.doMock('node:dns/promises', () => ({ resolveTxt: async () => [] }))
  const calls: string[] = []
  vi.stubGlobal('fetch', ((input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const hit = routes[url]
    if (hit === undefined)
      return Promise.resolve(Response.json({ error: 'NotFound' }, { status: 404 }))
    return Promise.resolve(hit instanceof Response ? hit : typeof hit === 'string' ? new Response(hit) : Response.json(hit))
  }) as typeof fetch)
  return calls
}

describe('did:web', () => {
  it('maps a hostname, or localhost with an encoded port, to the well-known document', async () => {
    const { didWebUrl } = await identity()
    expect(didWebUrl('did:web:example.com')?.href).toBe('https://example.com/.well-known/did.json')
    expect(didWebUrl('did:web:localhost%3A2583')?.href).toBe('https://localhost:2583/.well-known/did.json')
  })

  it('rejects anything but a hostname', async () => {
    const { didWebUrl } = await identity()
    for (const did of [
      'did:web:127.0.0.1:8443',
      'did:web:127.0.0.1#@attacker.example',
      'did:web:anything@127.0.0.1:8443',
      'did:web:example.com%3A8443',
      'did:web:example.com:u:alice',
      'did:web:example.com?x=1',
      'did:web:example.com/evil',
      'did:web:evil.local',
      'did:web:',
      'did:web:exa mple.com',
    ]) {
      expect(didWebUrl(did), did).toBeUndefined()
    }
  })

  it('resolves a document and adopts a public https endpoint', async () => {
    const calls = serve({ 'https://example.com/.well-known/did.json': doc('did:web:example.com', 'https://pds.example.com') })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('did:web:example.com')).resolves.toEqual({ did: 'did:web:example.com', handle: undefined, service: 'https://pds.example.com' })
    expect(calls).toEqual(['https://example.com/.well-known/did.json'])
  })

  it('refuses a document that describes a different DID', async () => {
    serve({ 'https://example.com/.well-known/did.json': doc('did:web:other.example', 'https://pds.example.com') })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('did:web:example.com')).rejects.toThrow(/describes "did:web:other.example"/)
  })

  it('only fetches from localhost with allowPrivateNetwork', async () => {
    const calls = serve({ 'https://localhost:2583/.well-known/did.json': doc('did:web:localhost%3A2583', 'http://localhost:2583') })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('did:web:localhost%3A2583')).rejects.toThrow(/not a public hostname/)
    expect(calls).toEqual([])
    await expect(resolveIdentity('did:web:localhost%3A2583', { allowPrivateNetwork: true })).resolves.toMatchObject({ service: 'http://localhost:2583' })
  })
})

describe('network guards', () => {
  it('refuses a PDS endpoint on an address, a reserved name, an http: origin, or with a path or credentials', async () => {
    serve({
      'https://plc.directory/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa': doc('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'https://169.254.169.254'),
      'https://plc.directory/did:plc:bbbbbbbbbbbbbbbbbbbbbbbb': doc('did:plc:bbbbbbbbbbbbbbbbbbbbbbbb', 'http://pds.example.com'),
      'https://plc.directory/did:plc:cccccccccccccccccccccccc': doc('did:plc:cccccccccccccccccccccccc', 'https://pds.example.com/latest/meta-data'),
      'https://plc.directory/did:plc:dddddddddddddddddddddddd': doc('did:plc:dddddddddddddddddddddddd', 'https://[::1]'),
      'https://plc.directory/did:plc:eeeeeeeeeeeeeeeeeeeeeeee': doc('did:plc:eeeeeeeeeeeeeeeeeeeeeeee', 'https://user:pw@pds.example.com'),
      'https://plc.directory/did:plc:ffffffffffffffffffffffff': doc('did:plc:ffffffffffffffffffffffff', 'https://pds.internal'),
    })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')).rejects.toThrow(/not a public hostname/)
    await expect(resolveIdentity('did:plc:bbbbbbbbbbbbbbbbbbbbbbbb')).rejects.toThrow(/only https/)
    await expect(resolveIdentity('did:plc:cccccccccccccccccccccccc')).rejects.toThrow(/invalid #atproto_pds endpoint/)
    await expect(resolveIdentity('did:plc:dddddddddddddddddddddddd')).rejects.toThrow(/not a public hostname/)
    await expect(resolveIdentity('did:plc:eeeeeeeeeeeeeeeeeeeeeeee')).rejects.toThrow(/invalid #atproto_pds endpoint/)
    await expect(resolveIdentity('did:plc:ffffffffffffffffffffffff')).rejects.toThrow(/not a public hostname/)
  })

  it('lets a local PDS through with allowPrivateNetwork', async () => {
    serve({ 'https://plc.directory/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa': doc('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'http://localhost:2583') })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', { allowPrivateNetwork: true })).resolves.toMatchObject({ service: 'http://localhost:2583' })
  })

  it('only interpolates a well-formed handle into the well-known URL', async () => {
    const calls = serve({})
    const { resolveIdentity } = await identity()
    for (const handle of ['localhost:8443', 'localhost:8443#', 'localhost:8443/extra', 'user name', '127.0.0.1', 'evil.local', 'nodots']) {
      expect(() => resolveIdentity(handle)).toThrow(/must be a handle or a DID/)
    }
    expect(calls).toEqual([])
  })

  it('does not trust a DID the directory answers with unless it can be resolved', async () => {
    serve({ 'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=alice.example.com': { did: 'did:web:127.0.0.1:8443' } })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('alice.example.com')).rejects.toThrow(/could not resolve handle/)
  })

  it('drops an alsoKnownAs handle that is not a handle', async () => {
    serve({ 'https://plc.directory/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa': doc('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'https://pds.example.com', { alsoKnownAs: ['at://localhost:8443/x'] }) })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')).resolves.toMatchObject({ handle: undefined })
  })

  it('refuses a DID document over the size limit', async () => {
    serve({ 'https://plc.directory/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa': new Response(`{"pad":"${'x'.repeat(300 * 1024)}"}`) })
    const { resolveIdentity } = await identity()
    await expect(resolveIdentity('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')).rejects.toThrow(/byte limit/)
  })
})
