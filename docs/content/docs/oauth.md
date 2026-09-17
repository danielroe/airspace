# OAuth and permission sets

An app password is fine for your own account. To act on someone else's behalf, use OAuth: they log in at their own PDS and grant your app a list of permissions, called scopes. `scopesFor` builds that list from your model.

```ts
import { scopesFor } from 'airspace'
import { createOAuth } from 'airspace/oauth' // optional peer: @atproto/oauth-client-node

const oauth = await createOAuth({
  baseUrl: 'https://roe.dev',
  redirectPath: '/api/admin/auth/callback',
  name: 'roe.dev admin',
  scopes: scopesFor({ collections: { projects, categories }, spaces: { workspace } }),
  stores: { session: mySessionStore },
})
```

Then wire up three things:

1. Serve `oauth.metadata` at `/oauth-client-metadata.json`, which is how the user's PDS identifies your app.
2. Redirect the user to `await oauth.authorize(handle)`.
3. On return, read the session with `await oauth.callback(params)` and pass it to `createAirspace({ session })`.

File scopes match the types your blob fields accept, so a model that only accepts `image/*` asks for `blob:image/*`, not `blob:*/*`.

## asking for part of the scopes

`authorize` takes a subset of the client's scopes, so login can ask for the collections and a space can be granted in a later consent. A stock PDS rejects `space:` scopes it does not know, which would otherwise break login:

```ts
const url = await oauth.authorize(handle, {
  scopes: ['atproto', 'repo:dev.example.project'],
})
```

Every consent includes `atproto`, and a scope the client did not declare throws before the request leaves your app.

## against a local PDS

Handle and account lookups go to DNS and `plc.directory`, neither of which knows about a local account such as `alice.test`. Point both at your development network:

```ts
const local = {
  allowHttp: true,
  handleResolver: 'http://localhost:2583', // the PDS resolves its own handles
  plcDirectoryUrl: 'http://localhost:41937', // the port `pnpm dev:pds` prints
}
```

## permission sets

A consent screen listing one scope per collection is hard to read. A permission set bundles them into a single named permission, so the user sees one line instead.

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

Everything in a set must sit under your own namespace, or airspace throws at definition time. To use one, pass it instead of a list of collections:

```ts
scopesFor({ collections: { projects, categories }, include: [lexicons.authFull] })
// ['atproto', 'include:dev.roe.authFull', 'blob:image/*']
```

Someone else's set works too, by name: `include: ['site.standard.authFull']`. File permissions are never part of a set, so a `blob:` scope is added alongside.

A set must be [published](/docs/publishing-lexicons) before anyone can ask for it, as must a `space:` scope. Until then, `authorize()` fails with `invalid_scope: Could not resolve Lexicon for NSID`. While developing, list your collections instead.
