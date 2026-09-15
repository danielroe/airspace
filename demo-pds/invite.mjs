/* eslint-disable antfu/no-top-level-await */
import { Buffer } from 'node:buffer'
import process from 'node:process'

const service = (process.env.PDS_SERVICE ?? 'http://localhost:2583').replace(/\/$/, '')
const password = process.env.PDS_ADMIN_PASSWORD
const useCount = Number(process.env.INVITE_USE_COUNT ?? 100000)

if (!password) {
  process.stderr.write('set PDS_ADMIN_PASSWORD to the admin password of the PDS you are minting a code on\n')
  process.exit(1)
}

const res = await fetch(`${service}/xrpc/com.atproto.server.createInviteCode`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'authorization': `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`,
  },
  body: JSON.stringify({ useCount }),
})
if (!res.ok) {
  process.stderr.write(`${res.status} ${await res.text()}\n`)
  process.exit(1)
}

const { code } = await res.json()
process.stdout.write(`${code}\n`)
