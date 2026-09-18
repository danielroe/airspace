/* eslint-disable antfu/no-top-level-await */
import { Buffer } from 'node:buffer'
import process from 'node:process'

const service = (process.env.PDS_SERVICE ?? 'http://localhost:2583').replace(/\/$/, '')
const password = process.env.PDS_ADMIN_PASSWORD
const maxAgeHours = Number(process.env.RESET_MAX_AGE_HOURS ?? 24)
const keep = new Set((process.env.RESET_KEEP ?? '').split(',').map(value => value.trim()).filter(Boolean))
const dryRun = process.env.RESET_DRY_RUN === '1'

if (!password) {
  process.stderr.write('set PDS_ADMIN_PASSWORD to the admin password of the PDS you are resetting\n')
  process.exit(1)
}

const admin = { authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` }

async function xrpc(method, { params, body } = {}) {
  const url = new URL(`${service}/xrpc/${method}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    for (const one of Array.isArray(value) ? value : [value]) url.searchParams.append(key, one)
  }
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { ...admin, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok)
    throw new Error(`${method} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : {}
}

const dids = []
let cursor
do {
  const page = await xrpc('com.atproto.sync.listRepos', { params: { limit: 500, ...(cursor ? { cursor } : {}) } })
  dids.push(...page.repos.map(repo => repo.did))
  cursor = page.cursor
} while (cursor)

const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000
const stale = []
for (let i = 0; i < dids.length; i += 100) {
  const { infos } = await xrpc('com.atproto.admin.getAccountInfos', { params: { dids: dids.slice(i, i + 100) } })
  for (const info of infos) {
    if (keep.has(info.did) || keep.has(info.handle))
      continue
    if (Date.parse(info.indexedAt) < cutoff)
      stale.push(info)
  }
}

process.stdout.write(`${dids.length} account(s) on ${service}, ${stale.length} older than ${maxAgeHours}h\n`)

for (const info of stale) {
  if (dryRun) {
    process.stdout.write(`would delete ${info.handle} (${info.did}, created ${info.indexedAt})\n`)
    continue
  }
  await xrpc('com.atproto.admin.deleteAccount', { body: { did: info.did } })
  process.stdout.write(`deleted ${info.handle} (${info.did}, created ${info.indexedAt})\n`)
}
