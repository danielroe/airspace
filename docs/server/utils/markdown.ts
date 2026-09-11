import type { MarkdownDocument, Node } from 'comark'
import { parseMarkdown } from 'comark'
import rangi from 'comark/plugins/rangi'
import { cssVariables } from 'rangi/themes'

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
