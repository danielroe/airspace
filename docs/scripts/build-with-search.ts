import { spawn } from 'node:child_process'
import { cp, rm } from 'node:fs/promises'
import process from 'node:process'

const command = process.argv[2]
if (command !== 'build' && command !== 'generate')
  throw new Error('Expected either "build" or "generate".')

const stagedIndex = new URL('../public/pagefind', import.meta.url)
const generatedIndex = new URL('../.output/public/pagefind', import.meta.url)

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0)
        resolve()
      else
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

try {
  await rm(stagedIndex, { recursive: true, force: true })
  await run('pnpm', ['exec', 'nuxt', command])
  await run('pnpm', ['exec', 'pagefind', '--site', '.output/public', '--glob', 'docs/**/*.html'])

  // Nitro discovers public assets while building its server bundle. Stage Pagefind's
  // post-prerender output, then rebuild so both preview and deployed servers can serve it.
  await cp(generatedIndex, stagedIndex, { recursive: true })
  await run('pnpm', ['exec', 'nuxt', command])
}
finally {
  await rm(stagedIndex, { recursive: true, force: true })
}
