import { createAirspace, passwordSession } from 'airspace'
import { timestamps } from 'airspace/plugins/timestamps'

import { profile, workspace } from '../../collections.ts'

export async function createNotesAirspace() {
  const { pds } = useRuntimeConfig()
  const session = await passwordSession({
    service: pds.service,
    identifier: pds.identifier,
    password: pds.password,
  })
  const airspace = createAirspace({
    identity: { did: session.did, service: pds.service },
    collections: { profile },
    spaces: { workspace },
    plugins: [timestamps()],
    session,
    cache: { ttl: 5_000 },
  })
  await airspace.workspace.manage.ensure()
  return airspace
}

let pending: ReturnType<typeof createNotesAirspace> | undefined

export function setAirspace(airspace: ReturnType<typeof createNotesAirspace>): void {
  pending = airspace
}

export function useAirspace(): ReturnType<typeof createNotesAirspace> {
  if (!pending)
    throw createError({ statusCode: 503, statusMessage: 'airspace is not ready' })
  return pending
}
