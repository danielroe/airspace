`scopesFor` derives the scopes your model needs, before any session exists.

```ts
import { scopesFor } from 'airspace'
import { createOAuth } from 'airspace/oauth' // optional peer: @atproto/oauth-client-node

const oauth = await createOAuth({
  baseUrl: 'https://roe.dev',
  redirectPath: '/api/admin/auth/callback',
  name: 'roe.dev admin',
  scopes: scopesFor({ collections: { projects, categories }, spaces: { workspace } }),
  stores: { session: mySessionStore },
  allowHttp: true, // only for a local http PDS
})
```

Serve `oauth.metadata` at `/oauth-client-metadata.json`, redirect to `await oauth.authorize(handle)`, and on return `const { session } = await oauth.callback(params)`. That session goes straight into `createAirspace({ session })`.

`blob:` scopes are narrowed to the MIME patterns your blob fields accept, so a model whose images are all `accept: ['image/*']` asks for `blob:image/*` rather than `blob:*/*`.

## against a local PDS

`allowHttp` isn't enough on its own: `@atproto/oauth-client-node` resolves the handle through DNS and the DID through `plc.directory`, and neither knows about `alice.test`. Point both at the development network:

```ts
const local = {
  allowHttp: true,
  handleResolver: 'http://localhost:2583', // the PDS serves `resolveHandle`
  plcDirectoryUrl: 'http://localhost:41937', // the port `pnpm dev:pds` prints
}
```

## permission sets

A published lexicon family can declare its whole OAuth surface as one `"type": "permission-set"` def, so the consent screen shows one line instead of a scope list. Declare yours next to the records it covers:

```ts
import { defineLexicons, field, permissions } from 'airspace/lexicon'

export default defineLexicons('dev.roe', {
  project: { name: field.text(), cover: field.image().optional() },
  projectCategory: { name: field.text() },
  authFull: permissions({
    collections: ['project', 'projectCategory'],
    title: 'Manage projects',
    detail: 'Read and write your projects and their categories.',
  }),
})
```

`airspace lexicons emit` and `airspace lexicons publish` handle it like any other def. Everything a set grants has to sit under its own authority; airspace throws at definition time rather than publishing a set that grants less than it says.

On the consuming side, pass the set instead of letting `scopesFor` derive a scope per collection:

```ts
scopesFor({ collections: { projects, categories }, include: [lexicons.authFull] })
// ['atproto', 'include:dev.roe.authFull', 'blob:image/*']
```

Someone else's set works too, by NSID: `include: ['site.standard.authFull']` covers every collection under `site.standard.`. Blob permissions are not part of an `include:`, so a `blob:` scope is still emitted alongside.

A set has to be [published](/docs/publishing-lexicons) before anyone can ask for it. The authorization server resolves the NSID at `authorize()` time, and until the schema is published and `_lexicon.<domain>` points at your DID, the request fails with `invalid_scope: Could not resolve Lexicon for NSID`. The same is true of a `space:` scope. Derive scopes from the collections while developing and switch to `include:` once the lexicons are published.
