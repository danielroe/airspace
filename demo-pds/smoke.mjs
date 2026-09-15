/* eslint-disable antfu/no-top-level-await */
import { Buffer } from 'node:buffer'
import { randomBytes, randomUUID } from 'node:crypto'
import process from 'node:process'

const service = (process.env.PDS_SERVICE ?? 'http://localhost:2583').replace(/\/$/, '')
const inviteCode = process.env.PDS_INVITE_CODE
const adminPassword = process.env.PDS_ADMIN_PASSWORD
const keep = process.env.SMOKE_KEEP_ACCOUNT === '1'

async function xrpc(method, { body, params, token, admin } = {}) {
  const url = new URL(`${service}/xrpc/${method}`)
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value)
  const headers = {}
  if (body)
    headers['content-type'] = 'application/json'
  if (token)
    headers.authorization = `Bearer ${token}`
  if (admin)
    headers.authorization = `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`
  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok)
    throw new Error(`${method} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : {}
}

const step = message => process.stdout.write(`ok  ${message}\n`)

const server = await xrpc('com.atproto.server.describeServer')
step(`describeServer: ${server.did}, handles ${server.availableUserDomains.join(' ')}, invites ${server.inviteCodeRequired ? 'required' : 'open'}`)
if (server.inviteCodeRequired && !inviteCode)
  throw new Error('this PDS requires an invite code; set PDS_INVITE_CODE')

const name = `smoke-${randomUUID().slice(0, 8)}`
const handle = `${name}${server.availableUserDomains[0]}`
const password = randomBytes(15).toString('base64url')
const account = await xrpc('com.atproto.server.createAccount', {
  body: { handle, email: `${name}@demo.invalid`, password, ...(inviteCode ? { inviteCode } : {}) },
})
const { did, accessJwt: token } = account
step(`createAccount: ${handle} is ${did}`)

const note = { $type: 'space.getair.notes.note', title: 'smoke', body: 'a public record', createdAt: new Date().toISOString() }
const created = await xrpc('com.atproto.repo.createRecord', {
  token,
  body: { repo: did, collection: note.$type, record: note, validate: false },
})
step(`createRecord: ${created.uri}`)

const space = await xrpc('com.atproto.simplespace.createSpace', {
  token,
  body: {
    type: 'space.getair.notes.workspace',
    skey: 'self',
    readPolicy: { $type: 'com.atproto.simplespace.defs#memberListPolicy' },
    writePolicy: { $type: 'com.atproto.simplespace.defs#memberListPolicy' },
    appAccess: { $type: 'com.atproto.simplespace.defs#open' },
  },
})
step(`createSpace: ${space.uri}`)

const draft = { $type: 'space.getair.notes.note', title: 'smoke draft', body: 'a space record', createdAt: new Date().toISOString() }
const write = await xrpc('com.atproto.space.createRecord', {
  token,
  body: { space: space.uri, repo: did, collection: draft.$type, record: draft, validate: false },
})
step(`space.createRecord: ${write.uri}`)

const rkey = write.uri.slice(write.uri.lastIndexOf('/') + 1)
const read = await xrpc('com.atproto.space.getRecord', {
  token,
  params: { space: space.uri, repo: did, collection: draft.$type, rkey },
})
if (read.value.title !== draft.title)
  throw new Error(`space.getRecord returned ${JSON.stringify(read.value)}`)
step(`space.getRecord: ${rkey} reads back`)

const listed = await xrpc('com.atproto.space.listRecords', {
  token,
  params: { space: space.uri, repo: did, collection: draft.$type },
})
step(`space.listRecords: ${listed.records.length} record(s)`)

if (adminPassword && !keep) {
  await xrpc('com.atproto.admin.deleteAccount', { admin: true, body: { did } })
  step(`deleteAccount: ${did} cleaned up`)
}
else {
  process.stdout.write(`--  left ${handle} (${did}) in place; set PDS_ADMIN_PASSWORD to have it deleted\n`)
}
