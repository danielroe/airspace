import process from 'node:process'

import { createAirspace, passwordSession } from 'airspace'
import { timestamps } from 'airspace/plugins/timestamps'

import { profile, workspace } from './collections.ts'

function env(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`Set ${name}; \`pnpm dev:pds\` in the repo root prints a .env for it.`)
  return value
}

let pending: ReturnType<typeof create> | undefined

async function create() {
  const service = env('PDS_SERVICE')
  const session = await passwordSession({
    service,
    identifier: env('PDS_ALICE_HANDLE'),
    password: env('PDS_ALICE_PASSWORD'),
  })
  const airspace = createAirspace({
    identity: { did: session.did, service },
    collections: { profile },
    spaces: { workspace },
    plugins: [timestamps()],
    session,
  })
  await airspace.workspace.manage.ensure()
  return airspace
}

export function useAirspace() {
  return pending ??= create()
}
