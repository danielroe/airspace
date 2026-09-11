import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'

// The vendored permissioned-data lexicons use `space-ref`, and return
// space-shaped `at-uri` values, neither of which the stable @atproto/lex
// validators accept. Both are mapped to `uri`, which every space ref
// satisfies, so the generated client stays on the stable release.
const source = 'lexicons'
const staged = await mkdtemp(join(tmpdir(), 'airspace-lex-'))
for (const entry of await readdir(source, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile())
    continue
  const path = join(entry.parentPath, entry.name)
  const json = (await readFile(path, 'utf8')).replaceAll('"format": "space-ref"', '"format": "uri"').replaceAll('"format": "at-uri"', '"format": "uri"')
  const target = join(staged, relative(source, path))
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, json)
}
const result = spawnSync('pnpm', ['lex', 'build', '--lexicons', staged, '--out', './src/lex', '--clear', '--index-file', '--no-pretty', '--import-ext', '.ts', '--lib', '@atproto/lex-schema'], { stdio: 'inherit' })
await rm(staged, { recursive: true, force: true })
process.exit(result.status ?? 1)
