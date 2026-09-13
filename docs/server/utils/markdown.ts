import type { MarkdownDocument, Node } from 'comark'
import type { MarkdownRoute } from '#shared/site'
import { parseMarkdown } from 'comark'
import rangi from 'comark/plugins/rangi'
import { useStorage } from 'nitro/storage'
import { cssVariables } from 'rangi/themes'
import { landingMarkdown } from '#shared/site'

export interface TocEntry {
  id: string
  depth: 2 | 3
  text: string
}

/**
 * Parse markdown with the site's syntax highlighting. Tokens are emitted as
 * `--shj-*` custom properties, defined against the site palette in `tokens.css`
 * so light and dark come from the same markup.
 */
export function parseSiteMarkdown(source: string) {
  return parseMarkdown(source, {
    plugins: [rangi({ theme: cssVariables })],
  })
}

function textOf(node: Node | string): string {
  if (typeof node === 'string')
    return node
  return node.slice(2).map(child => textOf(child as Node | string)).join('')
}

/** The `h2` and `h3` headings of a parsed document, in order. */
export function tableOfContents(document: MarkdownDocument): TocEntry[] {
  const entries: TocEntry[] = []
  for (const node of document.nodes) {
    if (typeof node === 'string')
      continue
    const [tag, props] = node
    if (tag !== 'h2' && tag !== 'h3')
      continue
    const id = (props as { id?: string }).id
    if (id)
      entries.push({ id, depth: tag === 'h2' ? 2 : 3, text: textOf(node) })
  }
  return entries
}

/** The markdown source behind a page. */
export async function markdownFor(route: MarkdownRoute): Promise<string | undefined> {
  const content = useStorage('assets:content')
  if (!route.page) {
    const [model, site] = await Promise.all([
      content.getItem<string>('sample-model.md'),
      content.getItem<string>('sample-site.md'),
    ])
    return landingMarkdown({ model: model || '', site: site || '' })
  }
  const source = await content.getItem<string>(`docs/${route.page.slug}.md`)
  return source?.trim() ? `${source.trim()}\n` : undefined
}
