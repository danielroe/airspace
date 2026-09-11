/* eslint-disable no-console */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * A user project with `n` collections: each has a relation to the previous
 * one and its own plugin, and the usage touches every typed surface.
 */
function project(n: number, pluginsPer = 1): string {
  const lines = [
    `import { belongsTo, createAirspace, defineCollection, definePlugin, defineSpace } from '../../src/index.ts'`,
    `import { defineLexicons, l } from '../../src/lexicon.ts'`,
    ``,
    `const shared = definePlugin({ name: 'shared', read: () => ({ shared: 1 }) })`,
    `const strongRef = l.object({ uri: l.string({ format: 'at-uri' }), cid: l.string({ format: 'cid' }) })`,
    `const lexicons = defineLexicons({`,
    ...Array.from({ length: n }, (_, i) => `  'dev.example.c${i}': l.record({ key: 'tid', record: l.object({ title: l.string(), ref: l.optional(l.ref(() => strongRef)), createdAt: l.string({ format: 'datetime' }) }) }),`),
    `  'dev.example.space': l.space({ key: 'literal:self' }),`,
    `})`,
  ]
  for (let i = 0; i < n; i++) {
    lines.push(
      `const s${i} = lexicons['dev.example.c${i}']`,
      `const p${i} = definePlugin({ name: 'p${i}', read: () => ({ m${i}: '${i}' as const }) })`,
      ...Array.from({ length: pluginsPer - 1 }, (_, k) => `const p${i}_${k} = definePlugin({ name: 'p${i}_${k}', read: () => ({ x${i}_${k}: ${k} }) })`),
    )
    const plugins = [`p${i}`, ...Array.from({ length: pluginsPer - 1 }, (_, k) => `p${i}_${k}`)].join(', ')
    lines.push(
      i === 0
        ? `const c0 = defineCollection(s0, { plugins: [${plugins}] })`
        : `const c${i} = defineCollection(s${i}, { relations: { prev: belongsTo(c${i - 1}, 'ref') }, plugins: [${plugins}] })`,
    )
  }
  const names = Array.from({ length: n }, (_, i) => `c${i}`).join(', ')
  lines.push(
    `const space = defineSpace(lexicons['dev.example.space'], { collections: { ${names} } })`,
    `export const airspace = createAirspace({ identity: 'example.com', collections: { ${names} }, spaces: { space }, plugins: [shared] })`,
  )
  for (let i = 0; i < n; i++) {
    lines.push(
      `const r${i} = await airspace.c${i}.get('rkey')`,
      `r${i}!.meta.m${i}.toUpperCase(); r${i}!.meta.shared.toFixed()`,
      `await airspace.c${i}.create({ title: 'x', createdAt: new Date().toISOString() })`,
      `await airspace.space.c${i}.list()`,
    )
    if (i > 0)
      lines.push(`const [j${i}] = await airspace.c${i}.list({ with: ['prev'] }); j${i}!.related.prev!.meta.m${i - 1}.toUpperCase()`)
  }
  return lines.join('\n')
}

interface Stats {
  types: number
  instantiations: number
  checkMs: number
}

async function check(source: string): Promise<Stats> {
  const dir = await mkdtemp(join(ROOT, 'test/.types-'))
  const file = join(dir, 'project.ts')
  await writeFile(file, source)
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.Preserve,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    types: ['node'],
  })
  const t0 = performance.now()
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const checkMs = performance.now() - t0
  const errors = diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
  expect(errors).toEqual([])
  await rm(dir, { recursive: true, force: true })
  return { types: program.getTypeCount(), instantiations: program.getInstantiationCount(), checkMs }
}

describe('type-checking cost', () => {
  it('stays bounded for a realistic model and scales roughly linearly', async () => {
    const small = await check(project(5))
    const large = await check(project(40))
    console.info(`types: ${small.types} -> ${large.types}; instantiations: ${small.instantiations} -> ${large.instantiations}; check: ${Math.round(small.checkMs)}ms -> ${Math.round(large.checkMs)}ms`)

    expect(large.instantiations).toBeLessThan(225_000)
    expect(large.types).toBeLessThan(55_000)
    expect((large.instantiations - small.instantiations) / 35).toBeLessThan(2_200)
  }, 120_000)

  it('does not blow up with many plugins on one collection', async () => {
    const one = await check(project(5, 1))
    const many = await check(project(5, 10))
    console.info(`10 plugins per collection: instantiations ${one.instantiations} -> ${many.instantiations}`)
    expect(many.instantiations - one.instantiations).toBeLessThan(8_000)
  }, 120_000)
})
