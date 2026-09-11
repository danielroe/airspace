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
