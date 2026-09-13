import { addPrerenderRoutes, defineNuxtModule } from 'nuxt/kit'
import { documentRoutes } from '../shared/site.ts'

const vary = 'Accept, Accept-Encoding'
const accept = '.*text/(x-)?markdown.*'

/** Headers that let a cache tell the HTML and markdown variants of a document apart. */
export function markdownRouteRules(): Record<string, { headers: Record<string, string> }> {
  return Object.fromEntries(documentRoutes.flatMap(route => [
    [route.path, { headers: { vary, link: `<${route.markdownPath}>; rel="alternate"; type="text/markdown"` } }],
    [route.markdownPath, { headers: { vary } }],
  ]))
}

/** Rewrites to the markdown variant before the CDN answers a document with its prerendered HTML. */
export function vercelMarkdownRoutes() {
  return documentRoutes.map(route => ({
    src: `^${route.path}$`,
    has: [{ type: 'header', key: 'accept', value: accept }],
    dest: route.markdownPath,
    headers: { vary },
  }))
}

/**
 * Publishes the markdown variant of every document, per {@link https://acceptmarkdown.com}.
 *
 * The server negotiates in `server/plugins/markdown.ts`, which only runs for pages the server
 * answers. Prerendered pages are served by the host, so the rewrite has to be repeated in its
 * config: Vercel can match on `Accept`, and other hosts need their own equivalent.
 */
export default defineNuxtModule({
  meta: { name: 'markdown' },
  setup(_options, nuxt) {
    const routeRules = nuxt.options.routeRules ||= {}
    for (const [path, rules] of Object.entries(markdownRouteRules()))
      routeRules[path] = { ...rules, ...routeRules[path] }

    const vercel = nuxt.options.nitro.vercel ||= {}
    vercel.config = {
      version: 3,
      ...vercel.config,
      // `has` conditions are part of the build output API, but missing from nitro's route type
      routes: [...vercelMarkdownRoutes() as never[], ...vercel.config?.routes || []],
    }
    addPrerenderRoutes(documentRoutes.map(route => route.markdownPath))
  },
})
