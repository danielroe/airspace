#!/usr/bin/env node
import { existsSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Falls back to source so the bin works in this repo's workspace before a build.
const dist = new URL('../dist/cli.mjs', import.meta.url)
const entry = existsSync(fileURLToPath(dist)) ? dist.href : new URL('../src/cli.ts', import.meta.url).href

import(entry)
  .then(({ main }) => main())
  .then((code) => {
    process.exitCode = code
  })
