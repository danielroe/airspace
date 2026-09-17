# advanced

## a type-only model

Importing `lexicons.ts` pulls the schema library and all your field definitions into the bundle, because validation needs them. To avoid that, use `model`: record type names only, with the types coming from a pure `import type` that has no impact on your bundle.

```ts
import type lexicons from './lexicons.ts'
import { defineCollection, model } from 'airspace'

const lex = model<typeof lexicons>('dev.roe')
export const notes = defineCollection(lex.note)
```

The trade-off is that nothing is validated on the client, `scopesFor` cannot see your blob fields, so you will need to add `blob:*/*` yourself, and singletons will be enforced in types only. The rest of these docs assume validation is on.

## workers and other edge runtimes

`airspace`, `airspace/lexicon`, `airspace/live` and the plugins bundle for Cloudflare Workers, Deno and the browser, with no Node built-ins in the graph. Handle lookups import `node:dns` dynamically, falling back to DNS over HTTPS elsewhere.

`airspace/oauth` will not bundle: `@atproto/oauth-client-node` needs `node:crypto`, `node:net` and `node:dns`. Run the OAuth handshake on Node, or use [`airspace/oauth/browser`](/docs/oauth#in-the-browser), which wraps `@atproto/oauth-client-browser` and produces the same kind of session.

## bundle size

Minified and gzipped, measured by `pnpm size`. Lazy chunks load only when spaces, `blobs.upload()` or `passwordSession()` are used.

| Import | airspace only | with runtime deps |
| --- | --- | --- |
| `airspace` | 10.4 kB (+5.7 kB lazy) | 37.5 kB (+10.7 kB lazy) |
| `airspace/lexicon` | 3.6 kB | 23.0 kB |
| `airspace/live` | 0.7 kB | 0.7 kB |
| `airspace/oauth` | 1.2 kB | 1.2 kB |
| `airspace/oauth/browser` | 1.2 kB | 1.2 kB |
| `airspace/oauth/metadata` | 0.4 kB | 0.4 kB |
| `airspace/plugins/markdown` | 0.3 kB | 0.3 kB |
| `airspace/plugins/timestamps` | 0.2 kB | 0.2 kB |
