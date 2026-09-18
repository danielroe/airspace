/* eslint-disable antfu/no-top-level-await */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { Database, PlcServer } from '@did-plc/server'

const port = Number(process.env.PDS_PORT ?? 2583)
const plcPort = Number(process.env.PLC_PORT ?? 2582)
const directory = process.env.PDS_DATA_DIRECTORY ?? mkdtempSync(join(tmpdir(), 'demo-pds-'))
const ephemeral = !process.env.PDS_DATA_DIRECTORY

const plc = PlcServer.create({ db: Database.mock(), port: plcPort })
await plc.start()

Object.assign(process.env, {
  PDS_HOSTNAME: 'localhost',
  PDS_PORT: String(port),
  PDS_DEV_MODE: '1',
  PDS_DATA_DIRECTORY: directory,
  PDS_BLOBSTORE_DISK_LOCATION: join(directory, 'blobs'),
  PDS_SERVICE_HANDLE_DOMAINS: '.test',
  PDS_DID_PLC_URL: `http://localhost:${plcPort}`,
  PDS_INVITE_REQUIRED: '1',
  PDS_JWT_SECRET: randomBytes(32).toString('hex'),
  PDS_DPOP_SECRET: randomBytes(32).toString('hex'),
  PDS_ADMIN_PASSWORD: process.env.PDS_ADMIN_PASSWORD ?? 'admin',
  PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX: randomBytes(32).toString('hex'),
})

const { PDS } = await import('@atproto/pds')

await PDS.run({
  onStarted: () => {
    process.stdout.write(`local pds on http://localhost:${port}, plc on http://localhost:${plcPort}, data in ${directory}\n`)
  },
})

await plc.destroy()
if (ephemeral)
  rmSync(directory, { recursive: true, force: true })
