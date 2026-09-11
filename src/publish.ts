import type { Client } from '@atproto/lex-client'
import type { LexMap } from '@atproto/lex-data'
import type { DidString } from '@atproto/lex-schema'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { XrpcResponseError } from '@atproto/lex-client'
import { AirspaceError } from './errors.ts'
import { toLexiconJson } from './lexicon.ts'

const LEXICON_COLLECTION = 'com.atproto.lexicon.schema'

export interface LexiconFile {
  nsid: string
  doc: Record<string, unknown>
}

/** Lexicon documents from a `defineLexicons` module (its default export) or a directory of JSON files. */
export async function loadLexicons(source: string): Promise<LexiconFile[]> {
  const path = resolve(source)
  if ((await stat(path)).isDirectory())
    return loadLexiconDir(path)
  const mod = await import(pathToFileURL(path).href).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ERR_UNKNOWN_FILE_EXTENSION')
      throw new AirspaceError(`loading ${source} needs Node 22.18 or newer (native TypeScript), or point --lexicons at a directory of JSON`, { cause: err })
    throw err
  }) as { default?: unknown }
  if (!mod.default || typeof mod.default !== 'object')
    throw new AirspaceError(`${source} has no default export; export the result of defineLexicons()`)
  return toLexiconJson(mod.default as Record<string, unknown>).map(doc => ({ nsid: doc.id, doc: { ...doc } })).sort((a, b) => a.nsid.localeCompare(b.nsid))
}

async function loadLexiconDir(dir: string): Promise<LexiconFile[]> {
  const out: LexiconFile[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...await loadLexiconDir(path))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.json'))
      continue
    const doc = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    if (typeof doc.id !== 'string')
      throw new AirspaceError(`${path} has no string \`id\``)
    out.push({ nsid: doc.id, doc })
  }
  return out.sort((a, b) => a.nsid.localeCompare(b.nsid))
}

/** `dev.roe.project` -> `dev.roe` */
const nsidAuthority = (nsid: string): string => nsid.slice(0, nsid.lastIndexOf('.'))

/** Reverses the segments: `dev.roe` <-> `roe.dev`. */
export const authorityDomain = (authority: string): string => authority.split('.').reverse().join('.')

function isOwnedBy(nsid: string, authorities: readonly string[]): boolean {
  const authority = nsidAuthority(nsid)
  return authorities.some(a => authority === a || authority.startsWith(`${a}.`))
}

/** Lexicons under one of `authorities` (including sub-authorities). */
export function ownedLexicons(lexicons: readonly LexiconFile[], authorities: readonly string[]): LexiconFile[] {
  return lexicons.filter(l => isOwnedBy(l.nsid, authorities))
}

/** The `com.atproto.lexicon.schema` record for a lexicon document. */
function toSchemaRecord(doc: Record<string, unknown>): LexMap & { $type: typeof LEXICON_COLLECTION } {
  return {
    $type: LEXICON_COLLECTION,
    lexicon: doc.lexicon,
    id: doc.id,
    defs: doc.defs,
  } as LexMap & { $type: typeof LEXICON_COLLECTION }
}

type PublishAction = 'create' | 'update' | 'unchanged' | 'delete'

export interface PublishStep {
  nsid: string
  action: PublishAction
  record?: ReturnType<typeof toSchemaRecord>
}

export interface PublishPlanOptions {
  client: Client
  did: DidString
  lexicons: readonly LexiconFile[]
  /** Also delete published schemas under these authorities that have no local file. */
  prune?: readonly string[] | false
}

/** Diff local files against the repo without writing. */
export async function planLexiconPublish(options: PublishPlanOptions): Promise<PublishStep[]> {
  const { client, did, lexicons } = options
  const steps: PublishStep[] = []

  for (const { nsid, doc } of lexicons) {
    const record = toSchemaRecord(doc)
    const existing = await getPublished(client, did, nsid)
    steps.push({
      nsid,
      record,
      action: existing === undefined ? 'create' : sameJson(existing, record) ? 'unchanged' : 'update',
    })
  }

  if (options.prune) {
    const local = new Set(lexicons.map(l => l.nsid))
    for await (const nsid of listPublished(client, did)) {
      if (local.has(nsid) || !isOwnedBy(nsid, options.prune))
        continue
      steps.push({ nsid, action: 'delete' })
    }
  }

  return steps
}

export interface PublishOptions extends PublishPlanOptions {
  dryRun?: boolean
}

/** Publish lexicons as `com.atproto.lexicon.schema` records keyed by NSID. Returns the applied plan. */
export async function publishLexicons(options: PublishOptions): Promise<PublishStep[]> {
  const steps = await planLexiconPublish(options)
  if (options.dryRun)
    return steps

  for (const step of steps) {
    switch (step.action) {
      case 'create':
      case 'update':
        await options.client.putRecord(step.record!, step.nsid, { repo: options.did, validate: false })
        break
      case 'delete':
        await options.client.deleteRecord(LEXICON_COLLECTION, step.nsid, { repo: options.did })
        break
    }
  }
  return steps
}

export interface DnsRecord {
  name: string
  type: 'TXT'
  value: string
}

/** `_lexicon.<domain>` TXT records for these NSIDs, one per authority (resolution is not hierarchical). */
export function lexiconDnsRecords(nsids: readonly string[], did: DidString): DnsRecord[] {
  const authorities = [...new Set(nsids.map(nsidAuthority))].sort()
  return authorities.map(a => ({ name: `_lexicon.${authorityDomain(a)}`, type: 'TXT', value: `did=${did}` }))
}

async function getPublished(client: Client, did: DidString, nsid: string): Promise<unknown> {
  try {
    const res = await client.getRecord(LEXICON_COLLECTION, nsid, { repo: did })
    return res.body.value
  }
  catch (err) {
    if (err instanceof XrpcResponseError && (err.status === 404 || err.error === 'RecordNotFound'))
      return undefined
    throw err
  }
}

async function* listPublished(client: Client, did: DidString): AsyncGenerator<string> {
  let cursor: string | undefined
  do {
    const res = await client.listRecords(LEXICON_COLLECTION, { repo: did, limit: 100, cursor })
    for (const record of res.body.records) yield record.uri.slice(record.uri.lastIndexOf('/') + 1)
    cursor = res.body.cursor
  } while (cursor)
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys((value as Record<string, unknown>)[k])]))
  }
  return value
}
