import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

/**
 * Minified + gzipped size of each subpath export, as an app bundler would ship
 * it: code-split, so lazily imported chunks (spaces, image-meta) are reported
 * separately from what loads eagerly. "airspace only" keeps every dependency
 * external; "with deps" bundles the runtime dependencies too. Optional peers
 * (comark, the atproto OAuth clients) stay external in both.
 */
const ENTRIES: Record<string, string> = {
  'airspace': 'src/index.ts',
  'airspace/lexicon': 'src/lexicon.ts',
  'airspace/live': 'src/live.ts',
  'airspace/oauth': 'src/oauth.ts',
  'airspace/oauth/browser': 'src/oauth/browser.ts',
  'airspace/oauth/metadata': 'src/oauth/metadata.ts',
  'airspace/plugins/markdown': 'src/plugins/markdown.ts',
  'airspace/plugins/timestamps': 'src/plugins/timestamps.ts',
}
const PEERS = ['comark', '@atproto/oauth-client-node', '@atproto/oauth-client-browser']

interface Size { eager: number, lazy: number }

async function measure(entry: string, withDeps: boolean): Promise<Size> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    splitting: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    write: false,
    outdir: 'out',
    ...(withDeps ? { external: PEERS } : { packages: 'external' }),
  })
  const files = new Map(result.outputFiles.map(f => [f.path.slice(f.path.lastIndexOf('/') + 1), f.text]))
  const entryName = [...files.keys()].find(n => !n.startsWith('chunk-') && !n.includes('-'))!
  const eager = new Set<string>()
  const visit = (name: string) => {
    if (eager.has(name))
      return
    eager.add(name)
    for (const m of files.get(name)!.matchAll(/import[^;]*?from"\.\/([^"]+)"|import"\.\/([^"]+)"/g)) visit(m[1] ?? m[2]!)
  }
  visit(entryName)
  const gz = (names: Iterable<string>) => {
    const text = [...names].map(n => files.get(n)!).join('\n')
    return text ? gzipSync(text).byteLength : 0
  }
  return { eager: gz(eager), lazy: gz([...files.keys()].filter(n => !eager.has(n))) }
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`
const cell = ({ eager, lazy }: Size) => lazy ? `${kb(eager)} (+${kb(lazy)} lazy)` : kb(eager)

const rows = ['| Import | airspace only | with deps |', '| --- | --- | --- |']
for (const [name, entry] of Object.entries(ENTRIES)) {
  const [alone, deps] = await Promise.all([measure(entry, false), measure(entry, true)])
  rows.push(`| \`${name}\` | ${cell(alone)} | ${cell(deps)} |`)
}
console.log(rows.join('\n'))
