/* eslint-disable no-console, antfu/no-top-level-await */
import process from 'node:process'

import { startTestPds } from './pds.ts'

const pds = await startTestPds({ port: Number(process.env.PDS_PORT ?? 2583) })
console.log(`# ${pds.service} (PLC ${pds.plc}). Copy into .env:`)
for (const name of ['alice', 'bob']) {
  const account = await pds.account(name)
  console.log(`PDS_SERVICE=${pds.service}\nPDS_${name.toUpperCase()}_DID=${account.did}\nPDS_${name.toUpperCase()}_HANDLE=${account.handle}\nPDS_${name.toUpperCase()}_PASSWORD=${account.password}`)
}
console.log('\nctrl-c to stop')
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await pds.close()
    process.exit(0)
  })
}
