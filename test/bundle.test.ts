import { resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')

/** Bundle a snippet the way an app bundler would: code-split, deps kept external. `eager` is the entry plus every chunk it imports statically. */
async function chunks(contents: string) {
  const result = await build({
    stdin: { contents, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    write: false,
    outdir: 'out',
  })
  const files = new Map(result.outputFiles.map(f => [f.path.slice(f.path.lastIndexOf('/') + 1), f.text]))
  const eagerNames = new Set<string>()
  const visit = (name: string) => {
    if (eagerNames.has(name))
      return
    eagerNames.add(name)
    for (const m of files.get(name)!.matchAll(/^import[^;]*?from\s*"\.\/([^"]+)"|^import\s*"\.\/([^"]+)"/gm)) visit(m[1] ?? m[2]!)
  }
  visit('stdin.js')
  const text = (names: Iterable<string>) => [...names].map(n => files.get(n)!).join('\n')
  return { eager: text(eagerNames), lazy: text([...files.keys()].filter(n => !eagerNames.has(n))) }
}

const app = `import { createAirspace } from './src/index.ts'; export const airspace = createAirspace({ identity: 'example.com' })`

describe('bundle boundaries', () => {
  it('loads image-meta only behind blobs.upload()', async () => {
    const { eager } = await chunks(app)
    expect(eager).not.toMatch(/from\s*["']image-meta["']/)
    expect(eager).toMatch(/import\(["']image-meta["']\)/)
  })

  it('keeps the vendored com.atproto.space lexicons out of the eager chunks', async () => {
    const { eager, lazy } = await chunks(app)
    expect(eager).not.toContain('com.atproto.simplespace')
    expect(eager).not.toContain('com.atproto.space.getRecord')
    expect(lazy).toContain('com.atproto.simplespace.createSpace')
  })

  it('loads the password session helper lazily', async () => {
    const { eager } = await chunks(`export { passwordSession } from './src/index.ts'`)
    expect(eager).not.toMatch(/from\s*["']@atproto\/lex-password-session["']/)
    expect(eager).toMatch(/import\(["']@atproto\/lex-password-session["']\)/)
  })

  it('keeps the lexicon DSL free of the client', async () => {
    const { eager } = await chunks(`export { defineLexicons, l } from './src/lexicon.ts'`)
    expect(eager).not.toContain('@atproto/lex-client')
    expect(eager).not.toContain('com.atproto.space.getRecord')
  })

  it('ships no lexicon schemas for a model() built from an import type', async () => {
    const valued = await chunks(`
      import lexicons from './test/fixtures/lexicons.ts'
      import { defineCollection } from './src/index.ts'
      export const notes = defineCollection(lexicons.note)
    `)
    expect(valued.eager).toContain('maxGraphemes')

    const typeOnly = await chunks(`
      import type lexicons from './test/fixtures/lexicons.ts'
      import { defineCollection, model } from './src/index.ts'
      const lex = model<typeof lexicons>('space.getair.notes')
      export const notes = defineCollection(lex.note)
    `)
    expect(typeOnly.eager).not.toContain('maxGraphemes')
    expect(typeOnly.eager).not.toContain('com.atproto.repo.strongRef')
  })

  it('keeps each OAuth entry free of the other environment\'s client', async () => {
    const node = await chunks(`export { createOAuth } from './src/oauth.ts'`)
    expect(node.eager + node.lazy).not.toContain('@atproto/oauth-client-browser')
    const browser = await chunks(`export { createBrowserOAuth } from './src/oauth/browser.ts'`)
    expect(browser.eager + browser.lazy).not.toContain('@atproto/oauth-client-node')
    expect(browser.eager).not.toMatch(/from\s*["']@atproto\/oauth-client-browser["']/)
    expect(browser.eager).toMatch(/import\("@atproto\/oauth-client-browser"\)/)
  })

  it('builds the metadata document with no OAuth client in the graph', async () => {
    const result = await build({
      stdin: { contents: `export { clientMetadata } from './src/oauth/metadata.ts'`, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      outdir: 'out',
      metafile: true,
    })
    expect(Object.keys(result.metafile.inputs).sort()).toEqual(['<stdin>', 'src/oauth/metadata.ts'])
  })

  it('bundles for a worker with no Node built-in it cannot do without', async () => {
    const result = await build({
      stdin: {
        contents: `
          import { createAirspace, defineCollection } from './src/index.ts'
          import lexicons from './test/fixtures/lexicons.ts'
          import { subscribe } from './src/live.ts'
          const airspace = createAirspace({ identity: 'roe.dev', collections: { notes: defineCollection(lexicons.note) } })
          export default { fetch: async () => Response.json({ notes: await airspace.notes.list(), live: typeof subscribe }) }
        `,
        resolveDir: ROOT,
        loader: 'ts',
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      conditions: ['worker', 'browser'],
      write: false,
      outdir: 'out',
    })
    const code = result.outputFiles[0]!.text

    // A static one would break the worker on load; the DNS probe is dynamic and falls back to DoH.
    expect(code).not.toMatch(/^import[^;]*["']node:/m)
    expect(code.match(/import\("node:[^"]+"\)/g)).toEqual(['import("node:dns/promises")'])
    expect(code).not.toMatch(/\brequire\("node:/)
  })

  it('keeps airspace/live runnable in a browser', async () => {
    const result = await build({
      stdin: { contents: `export { subscribe, invalidateOn } from './src/live.ts'`, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      conditions: ['worker', 'browser'],
      write: false,
      outdir: 'out',
      metafile: true,
    })
    expect(Object.keys(result.metafile.inputs).sort()).toEqual(['<stdin>', 'src/live.ts'])
    expect(result.outputFiles[0]!.text).not.toMatch(/require\(|node:/)
  })
})
