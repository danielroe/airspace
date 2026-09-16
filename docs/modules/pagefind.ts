import { join } from 'node:path'
import { defineNuxtModule, useLogger } from 'nuxt/kit'

/**
 * Indexes the prerendered documentation with {@link https://pagefind.app | Pagefind}.
 *
 * Nitro assembles its public asset manifest after prerendering, so the index has to be
 * written in `prerender:done` for the server to serve it.
 */
export default defineNuxtModule({
  meta: { name: 'pagefind' },
  setup(_options, nuxt) {
    if (nuxt.options.dev)
      return

    const logger = useLogger('pagefind')

    nuxt.hook('nitro:init', (nitro) => {
      nitro.hooks.hook('prerender:done', async () => {
        const publicDir = nitro.options.output.publicDir
        const pagefind = await import('pagefind')
        const { index, errors } = await pagefind.createIndex()

        if (!index)
          throw new Error(`Could not create the search index.\n${errors.join('\n')}`)

        try {
          const added = await index.addDirectory({ path: publicDir, glob: 'docs/**/*.html' })
          if (added.errors.length)
            throw new Error(`Could not index the documentation.\n${added.errors.join('\n')}`)

          const written = await index.writeFiles({ outputPath: join(publicDir, 'pagefind') })
          if (written.errors.length)
            throw new Error(`Could not write the search index.\n${written.errors.join('\n')}`)

          logger.success(`Indexed ${added.page_count} documentation pages for search.`)
        }
        finally {
          await pagefind.close()
        }
      })
    })
  },
})
