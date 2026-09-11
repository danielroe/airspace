import type { MarkdownDocument, ParserOptions } from 'comark'
import type { Plugin } from '../plugin.ts'

import { createMarkdownParser } from 'comark'
import { AirspaceError } from '../errors.ts'
import { schemaFields } from '../model.ts'
import { definePlugin } from '../plugin.ts'

export interface MarkdownPluginOptions extends Omit<ParserOptions, 'plugins'> {
  plugins?: ParserOptions['plugins']
}

/** Parse a string field with comark into `record.meta.markdown` (`null` when absent). */
export function markdown(field: string, options: MarkdownPluginOptions = {}): Plugin<{ markdown: MarkdownDocument | null }> {
  const parse = createMarkdownParser(options as ParserOptions)
  return definePlugin<{ markdown: MarkdownDocument | null }>({
    name: `markdown:${field}`,
    async read(record, ctx) {
      const fields = schemaFields(ctx.collection.schema)
      if (fields && !fields.has(field))
        throw new AirspaceError(`${ctx.collection.nsid} has no field "${field}" to parse as markdown`)
      const source = (record.value as Record<string, unknown>)[field]
      return { markdown: typeof source === 'string' ? await parse(source) : null }
    },
  })
}
