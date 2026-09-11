import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { AirspaceError, ValidationError } from 'airspace'

import { useAirspace } from './airspace.ts'

const HELP = `node cli.ts <command>

  list                 published notes, joined to their tag
  show <rkey>          one note: markdown body and cover image
  drafts               notes in the workspace, and whether each one is live
  draft <title>        create a draft in the workspace
  publish <rkey>       copy a draft into the public repo
  profile              show the profile singleton, or edit it with --name/--bio

Options:
  --body <text>        markdown body for \`draft\`
  --tag <name>         tag to attach to a draft, created if it does not exist
  --cover <path>       image file to upload as the draft's cover
  --name <text>        displayName for \`profile\`
  --bio <text>         bio for \`profile\`

Environment: PDS_SERVICE, PDS_ALICE_HANDLE, PDS_ALICE_PASSWORD
`

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map(r => r[i]!.length)))
  return rows.map(r => r.map((cell, i) => cell.padEnd(widths[i]!)).join('  ')).join('\n')
}

async function list() {
  const airspace = await useAirspace()
  const [me, all] = await Promise.all([airspace.profile.get(), airspace.notes.list({ with: ['tag'] })])
  console.log(`${me?.value.displayName ?? 'Notes'}${me?.value.bio ? ` - ${me.value.bio}` : ''}\n`)
  if (!all.length)
    return console.log('no published notes')
  console.log(table([
    ['RKEY', 'TITLE', 'TAG'],
    ...all.map(note => [note.rkey, note.value.title, note.related.tag?.value.name ?? '-']),
  ]))
}

async function show(rkey: string) {
  const airspace = await useAirspace()
  const note = await airspace.notes.get(rkey)
  if (!note) {
    console.error(`No note ${rkey}`)
    return 1
  }
  const tag = await airspace.notes.resolve(note, 'tag')
  console.log(note.value.title)
  console.log(note.uri)
  console.log(`tag    ${tag?.value.name ?? '-'}`)
  console.log(`cover  ${await airspace.blobs.url(note.value.cover) ?? '-'}`)
  console.log(`\n${note.value.body}`)
  console.log(`\n(${note.meta.markdown?.nodes.length ?? 0} markdown nodes)`)
  return 0
}

async function drafts() {
  const airspace = await useAirspace()
  const [all, live] = await Promise.all([airspace.workspace.notes.list(), airspace.workspace.notes.published()])
  if (!all.length)
    return console.log('no drafts')
  console.log(table([
    ['RKEY', 'TITLE', 'LIVE'],
    ...all.map(note => [note.rkey, note.value.title, live.includes(note.rkey) ? 'yes' : 'no']),
  ]))
}

async function tagNamed(name: string) {
  const airspace = await useAirspace()
  const existing = (await airspace.workspace.tags.list()).find(tag => tag.value.name === name)
  if (existing)
    return existing
  const { uri, cid } = await airspace.workspace.tags.create({ name })
  return { uri, cid }
}

async function draft(title: string, options: { body?: string, tag?: string, cover?: string }) {
  const airspace = await useAirspace()
  const tag = options.tag ? await tagNamed(options.tag) : null
  const cover = options.cover
    ? (await airspace.blobs.upload(await readFile(options.cover), { mimeType: 'image/png' })).blob
    : undefined
  const created = await airspace.workspace.notes.create({
    title,
    body: options.body ?? '',
    tag: tag ? { uri: tag.uri, cid: tag.cid } : undefined,
    cover,
  })
  console.log(`drafted ${created.rkey}\n${created.uri}`)
}

async function publish(rkey: string) {
  const airspace = await useAirspace()
  const draft = await airspace.workspace.notes.get(rkey)
  const tagRkey = draft?.value.tag?.uri.split('/').pop()
  if (tagRkey && !(await airspace.workspace.tags.published()).includes(tagRkey))
    await airspace.workspace.tags.publish(tagRkey)
  const published = await airspace.workspace.notes.publish(rkey)
  console.log(`published ${published.uri}`)
}

async function editProfile(options: { name?: string, bio?: string }) {
  const airspace = await useAirspace()
  if (options.name === undefined && options.bio === undefined) {
    const current = await airspace.profile.get()
    console.log(current ? `${current.value.displayName}\n${current.value.bio ?? ''}` : 'no profile yet')
    return
  }
  const current = await airspace.profile.get()
  await airspace.profile.put({
    displayName: options.name ?? current?.value.displayName ?? 'Anonymous',
    bio: options.bio ?? current?.value.bio,
  })
  console.log('profile saved')
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      body: { type: 'string' },
      tag: { type: 'string' },
      cover: { type: 'string' },
      name: { type: 'string' },
      bio: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  const [command, arg] = positionals
  if (values.help || !command) {
    process.stdout.write(HELP)
    return command ? 0 : 1
  }
  if (['show', 'draft', 'publish'].includes(command) && !arg) {
    process.stderr.write(`${command} needs an argument.\n\n${HELP}`)
    return 1
  }
  switch (command) {
    case 'list':
      await list()
      return 0
    case 'show':
      return await show(arg!)
    case 'drafts':
      await drafts()
      return 0
    case 'draft':
      await draft(arg!, values)
      return 0
    case 'publish':
      await publish(arg!)
      return 0
    case 'profile':
      await editProfile(values)
      return 0
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}`)
      return 1
  }
}

process.exitCode = await main().catch((error) => {
  if (!(error instanceof AirspaceError))
    throw error
  console.error(error.message)
  if (error instanceof ValidationError) {
    for (const issue of error.issues) console.error(`  ${issue.path}: ${issue.message}`)
  }
  return 1
})
