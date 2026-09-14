export interface DocsPage {
  /** The `content/docs/<slug>.md` file, and the last segment of the URL. `index` is `/docs`. */
  slug: string
  path: string
  title: string
}

const pages = [
  ['index', 'getting started'],
  ['concepts', 'atproto in five minutes'],
  ['model', 'your content model'],
  ['reading-and-writing', 'reading and writing'],
  ['spaces', 'spaces'],
  ['blobs', 'blobs and images'],
  ['plugins', 'plugins'],
  ['oauth', 'OAuth and permission sets'],
  ['publishing-lexicons', 'publishing your lexicons'],
  ['validation', 'validation and migrations'],
  ['errors', 'errors'],
  ['advanced', 'advanced'],
] as const

export const docsPages: DocsPage[] = pages.map(([slug, title]) => ({
  slug,
  path: slug === 'index' ? '/docs' : `/docs/${slug}`,
  title,
}))

export function docsPageFor(slug: string | undefined): DocsPage | undefined {
  return docsPages.find(page => page.slug === (slug || 'index'))
}
