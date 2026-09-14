import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { Client } from '@atproto/lex-client'
import { resolveIdentity } from './identity.ts'
import { authorityDomain, lexiconDnsRecords, loadLexicons, ownedLexicons, publishLexicons } from './publish.ts'
import { passwordSession } from './session.ts'

const HELP = `airspace <command>

Commands:
  lexicons emit      Write lexicon JSON from a defineLexicons() module
  lexicons publish   Publish your lexicons to your PDS as com.atproto.lexicon.schema records

Options (lexicons emit):
  --lexicons <file>         defineLexicons() module (default: ./lexicons.ts)
  --out <dir>               Output directory (default: ./lexicons)

Options (lexicons publish):
  --identity <handle|did>   Account to publish to (required)
  --lexicons <path>         defineLexicons() module or directory of JSON files (default: ./lexicons.ts, else ./lexicons)
  --authority <nsid>        Authority you own, repeatable (default: derived from the handle)
  --dry-run                 Show the plan without writing
  --prune                   Delete published schemas with no local definition
  --allow-private-network   Let the identity resolve to a local or http: PDS
  --help

Environment:
  AIRSPACE_APP_PASSWORD      App password for --identity

Installing shared lexicons and generating TypeScript from JSON is handled by @atproto/lex:
  lex install community.lexicon.app.defs
  lex build --ignore-invalid-lexicons
`

const ICON: Record<string, string> = { create: '+', update: '~', unchanged: '=', delete: '-' }

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'identity': { type: 'string' },
      'lexicons': { type: 'string' },
      'out': { type: 'string', default: './lexicons' },
      'authority': { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
      'prune': { type: 'boolean', default: false },
      'allow-private-network': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  })

  const command = positionals.join(' ')
  if (values.help || !command) {
    process.stdout.write(HELP)
    return command ? 0 : 1
  }
  const source = values.lexicons ?? (existsSync('./lexicons.ts') ? './lexicons.ts' : './lexicons')

  if (command === 'lexicons emit') {
    const lexicons = await loadLexicons(source)
    for (const { nsid, doc } of lexicons) {
      const path = join(values.out!, `${nsid.replaceAll('.', '/')}.json`)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`)
      process.stdout.write(`  ${nsid} -> ${path}\n`)
    }
    return 0
  }
  if (command !== 'lexicons publish') {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`)
    return 1
  }
  if (!values.identity) {
    process.stderr.write('--identity is required.\n')
    return 1
  }

  const identity = await resolveIdentity(values.identity, { allowPrivateNetwork: values['allow-private-network'] })
  const authorities = values.authority?.length
    ? values.authority
    : identity.handle ? [authorityDomain(identity.handle)] : []
  if (!authorities.length) {
    process.stderr.write('Could not derive an authority from the identity; pass --authority.\n')
    return 1
  }

  const lexicons = ownedLexicons(await loadLexicons(source), authorities)
  if (!lexicons.length) {
    process.stderr.write(`No lexicons under ${authorities.join(', ')} found in ${source}.\n`)
    return 1
  }

  let client: Client
  if (values['dry-run']) {
    client = new Client(identity.service)
  }
  else {
    const password = process.env.AIRSPACE_APP_PASSWORD
    if (!password) {
      process.stderr.write('Set AIRSPACE_APP_PASSWORD, or pass --dry-run.\n')
      return 1
    }
    const session = await passwordSession({ service: identity.service, identifier: identity.did, password })
    client = new Client(session)
  }

  process.stdout.write(`${identity.handle ?? identity.did} (${identity.did}) @ ${identity.service}\n\n`)

  const steps = await publishLexicons({
    client,
    did: identity.did,
    lexicons,
    prune: values.prune ? authorities : false,
    dryRun: values['dry-run'],
  })

  for (const step of steps) {
    process.stdout.write(`  ${ICON[step.action]} ${step.action.padEnd(9)} ${step.nsid}\n`)
  }
  if (values['dry-run'])
    process.stdout.write('\n(dry run, nothing written)\n')

  process.stdout.write('\nDNS records for third-party resolution:\n')
  for (const { name, type, value } of lexiconDnsRecords(lexicons.map(l => l.nsid), identity.did)) {
    process.stdout.write(`  ${name}  ${type}  "${value}"\n`)
  }
  return 0
}
