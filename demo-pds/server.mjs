/* eslint-disable antfu/no-top-level-await */
import process from 'node:process'
import { PDS } from '@atproto/pds'

await PDS.run({
  onStarted: (pds) => {
    process.stdout.write(`pds listening on ${pds.ctx.cfg.service.publicUrl} (did ${pds.ctx.cfg.service.did})\n`)
  },
})
