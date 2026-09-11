## a type-only model

Importing `lexicons.ts` puts `@atproto/lex-schema` and every one of your field definitions in the bundle. If that matters more than validation does, `model` carries the NSIDs and nothing else, with the types coming from an `import type` that disappears at build time.

```ts
import type lexicons from './lexicons.ts'
import { defineCollection, model } from 'airspace'

const lex = model<typeof lexicons>('dev.roe')
export const notes = defineCollection(lex.note)
```

Pass no namespace when your keys are already NSIDs. What you give up:

- Nothing is validated client side. `validate()` is absent from the type, and writes into a space are validated by nobody ([atproto#5433](https://github.com/bluesky-social/atproto/issues/5433)).
- `scopesFor` cannot see your blob fields, so add `blob:*/*` (or the pattern you accept) yourself if you upload.
- Singletons are a type-level fact only. The type enforces `get()` over `get(rkey)`, but at runtime both work, with `self` as the key when you pass none.

The rest of these docs assume the validating path.

## workers and other edge runtimes

`airspace`, `airspace/lexicon`, `airspace/live` and the plugins bundle for Cloudflare Workers, Deno and the browser with no Node built-in in the graph. Handle resolution loads `node:dns` with a dynamic `import()`, and falls back to DNS over HTTPS (`cloudflare-dns.com`) for the `_atproto` TXT lookup where there is no such module. Passing `identity: { did, service }` does no resolution at all.

`airspace/oauth` will not bundle: `@atproto/oauth-client-node` needs `node:crypto`, `node:net` and `node:dns`. Run the OAuth handshake on a Node runtime, or use `@atproto/oauth-client-browser` and hand the resulting session to `createAirspace`.

## bundle size

Minified and gzipped, measured by `pnpm size`: esbuild, code-split, optional peers (`comark`, `@atproto/oauth-client-node`) external. "Lazy" chunks only load when spaces, `blobs.upload()` or `passwordSession()` are used.

| Import | airspace only | with runtime deps |
| --- | --- | --- |
| `airspace` | 9.2 kB (+5.5 kB lazy) | 36.2 kB (+10.5 kB lazy) |
| `airspace/lexicon` | 3.3 kB | 22.7 kB |
| `airspace/live` | 0.7 kB | 0.7 kB |
| `airspace/oauth` | 0.7 kB | 0.7 kB |
| `airspace/plugins/markdown` | 0.3 kB | 0.3 kB |
| `airspace/plugins/timestamps` | 0.2 kB | 0.2 kB |

The runtime dependencies are `@atproto/lex-schema` (validation), `@atproto/lex-client` (XRPC), `@atproto/lex-data` and `@atproto/lex-json` (record values to and from JSON, with `multiformats` for CIDs behind them), `@atproto/lex-password-session` and `image-meta`. The last two are only ever in the lazy column: `passwordSession()` and `blobs.upload()` are the only things that load them.
