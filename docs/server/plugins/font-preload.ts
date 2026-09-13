import { definePlugin } from 'nitro'

/**
 * Hotfix until Nuxt v4.6
 */
export default definePlugin((nitro) => {
  nitro.hooks.hook('render:html', (html: { head: string[] }) => {
    const head = html.head.join('')

    const preloaded = new Set<string>()
    for (const [, url] of head.matchAll(/rel="preload"[^>]*href="([^"]+)"/g)) {
      preloaded.add(url!)
    }

    const urls = new Set<string>()
    for (const [, url] of head.matchAll(/url\((\/_fonts\/[^)"']+\.woff2)\)/g)) {
      if (!preloaded.has(url!)) {
        urls.add(url!)
      }
    }

    if (!urls.size) {
      return
    }

    html.head.unshift([...urls].map(url => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${url}">`).join(''))
  })
})
