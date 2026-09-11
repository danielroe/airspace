import { env } from '$env/dynamic/private'
import { createAirspace, passwordSession } from 'airspace'
import { timestamps } from 'airspace/plugins/timestamps'

import { profile, workspace } from '../../collections.ts'

async function create() {
  const service = env.PDS_SERVICE || 'http://localhost:2583'
  const session = await passwordSession({
    service,
    identifier: env.PDS_ALICE_HANDLE || 'alice.test',
    password: env.PDS_ALICE_PASSWORD || 'hunter2',
  })
  const airspace = createAirspace({
    identity: { did: session.did, service },
    collections: { profile },
    spaces: { workspace },
    plugins: [timestamps()],
    session,
    cache: { ttl: 5_000 },
  })
  await airspace.workspace.manage.ensure()
  return airspace
}

let pending: ReturnType<typeof create> | undefined

export function useAirspace() {
  return pending ??= create()
}
