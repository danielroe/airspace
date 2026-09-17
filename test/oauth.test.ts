import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineCollection, defineSpace, scopesFor } from '../src/index.ts'
import { clientMetadata, createOAuth } from '../src/oauth.ts'
import { createBrowserOAuth } from '../src/oauth/browser.ts'
import { clientMetadata as bareClientMetadata } from '../src/oauth/metadata.ts'
import { authFull, gallery, location, project, projectCategory } from './fixtures/lex.ts'

const categories = defineCollection(projectCategory)
const projects = defineCollection(project)
const current = defineCollection(location)
const workspace = defineSpace({ nsid: 'dev.example.workspace', key: 'literal:self', collections: ['dev.example.project'] }, {
  collections: { projects, current },
})
describe('scopesFor', () => {
  it('covers collections and spaces beyond their declaration', () => {
    expect(scopesFor({ collections: { projects, categories }, spaces: { workspace } })).toEqual([
      'atproto',
      'repo:dev.example.project',
      'repo:dev.example.projectCategory',
      'space:dev.example.workspace?skey=self&collection=dev.example.location&manage=create',
    ])
    expect(scopesFor({ collections: [projects] })).toEqual(['atproto', 'repo:dev.example.project'])
  })

  it('narrows blob scope to the accepted MIME patterns, behind a ref thunk', () => {
    expect(scopesFor({ collections: [defineCollection(gallery)] })).toContain('blob:image/*')
    expect(scopesFor({ collections: [categories] }).some(s => s.startsWith('blob:'))).toBe(false)
  })

  it('asks for one include instead of the repo scopes a permission set covers', () => {
    expect(scopesFor({ collections: { projects, categories, current }, include: [authFull] })).toEqual([
      'atproto',
      'include:dev.example.authFull',
      'repo:dev.example.location',
    ])
  })

  it('treats a set named by NSID alone as covering its own authority', () => {
    expect(scopesFor({ collections: [projects], include: ['dev.example.authFull'] })).toEqual([
      'atproto',
      'include:dev.example.authFull',
    ])
    expect(scopesFor({ collections: [projects], include: ['site.standard.authFull'] })).toContain('repo:dev.example.project')
  })
})

describe('clientMetadata', () => {
  const scopes = scopesFor({ collections: [projects] })

  it('encodes loopback clients inline', () => {
    const meta = clientMetadata({ baseUrl: 'http://127.0.0.1:3000', redirectPath: '/api/auth/callback', name: 'dev', scopes })
    const id = new URL(meta.client_id!)
    expect(id.origin).toBe('http://localhost')
    expect(id.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/api/auth/callback')
    expect(id.searchParams.get('scope')).toBe('atproto repo:dev.example.project')
    expect(meta.client_uri).toBeUndefined()
  })

  it('points public clients at the hosted metadata document', () => {
    const meta = clientMetadata({ baseUrl: 'https://roe.dev/', redirectPath: '/api/admin/auth/callback', name: 'roe.dev admin', scopes })
    expect(meta).toMatchObject({
      client_id: 'https://roe.dev/oauth-client-metadata.json',
      client_uri: 'https://roe.dev',
      redirect_uris: ['https://roe.dev/api/admin/auth/callback'],
      scope: 'atproto repo:dev.example.project',
      token_endpoint_auth_method: 'none',
      dpop_bound_access_tokens: true,
    })
  })

  it('serves one document, whichever entry point builds it', () => {
    const options = { baseUrl: 'https://unifont.dev', redirectPath: '/stack', name: 'unifont.dev', scopes } as const
    expect(bareClientMetadata(options)).toEqual(clientMetadata(options))
  })
})

describe('createOAuth', () => {
  let fetchedHosts: string[] = []
  beforeEach(() => {
    fetchedHosts = []
    vi.stubGlobal('fetch', ((input: RequestInfo | URL) => {
      fetchedHosts.push(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).host)
      return Promise.resolve(Response.json({ error: 'offline' }, { status: 502 }))
    }) as typeof fetch)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('builds a NodeOAuthClient that accepts the metadata', async () => {
    const oauth = await createOAuth({
      baseUrl: 'https://roe.dev',
      redirectPath: '/cb',
      name: 'test',
      scopes: scopesFor({ collections: [projects], spaces: [workspace] }),
      stores: { session: { get: async () => undefined, set: async () => {}, del: async () => {} } },
    })
    expect(oauth.metadata.scope).toContain('space:dev.example.workspace')
    expect(oauth.client.clientMetadata.client_id).toBe('https://roe.dev/oauth-client-metadata.json')
    await expect(oauth.restore('did:plc:nobody')).rejects.toThrow()
  })

  it('resolves identities where it is told to, so a local PDS works', async () => {
    const oauth = await createOAuth({
      baseUrl: 'http://127.0.0.1:3000',
      redirectPath: '/cb',
      name: 'test',
      scopes: scopesFor({ collections: [projects] }),
      stores: { session: { get: async () => undefined, set: async () => {}, del: async () => {} } },
      allowHttp: true,
      handleResolver: 'http://localhost:2583',
      plcDirectoryUrl: 'http://localhost:2582',
    })
    await oauth.client.identityResolver.resolve('alice.test').catch(() => {})
    await oauth.client.identityResolver.resolve('did:plc:o7sgbrqrvs3sjizryttaqml4').catch(() => {})
    expect(fetchedHosts).toEqual(['localhost:2583', 'localhost:2582'])
  })
})

describe('createBrowserOAuth', () => {
  const scopes = scopesFor({ collections: [projects] })

  beforeEach(() => {
    vi.stubGlobal('indexedDB', { open: () => ({ addEventListener() {}, removeEventListener() {} }) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('builds a BrowserOAuthClient that accepts the metadata, with no handle resolver configured', async () => {
    const oauth = await createBrowserOAuth({
      baseUrl: 'https://unifont.dev',
      redirectPath: '/stack',
      name: 'unifont.dev',
      scopes,
    })
    expect(oauth.client.clientMetadata.client_id).toBe('https://unifont.dev/oauth-client-metadata.json')
    expect(oauth.client.clientMetadata.scope).toBe('atproto repo:dev.example.project')
  })
})
