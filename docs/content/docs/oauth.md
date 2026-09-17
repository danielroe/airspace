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

## in the browser

`airspace/oauth/browser` runs the same handshake in the page, so your server never sees a token. Storage is handled by `@atproto/oauth-client-browser`, in IndexedDB, so there are no stores to provide.

```ts
import { scopesFor } from 'airspace'
import { createBrowserOAuth } from 'airspace/oauth/browser' // optional peer: @atproto/oauth-client-browser

const oauth = await createBrowserOAuth({
  baseUrl: 'https://unifont.dev',
  redirectPath: '/stack',
  name: 'unifont.dev',
  scopes: scopesFor({ collections: { stacks } }),
})

const result = await oauth.init()
if (result) {
  const airspace = createAirspace({ identity: { did: result.did }, collections: { stacks }, session: result.session })
}
else {
  await oauth.signIn('danielroe.dev') // navigates to the user's PDS
}
```

`init()` handles a redirect back from the PDS, restores a stored session on a later page load, or returns `null` when there is neither. `redirectPath` is a page in your app rather than an API route. `revoke(did)` signs the user out: it revokes the tokens at their authorization server as well as dropping the stored session, the same as on the server.

### handle resolution

A browser cannot query DNS, so a handle such as `danielroe.dev` is resolved by asking a service over HTTP. That service sees every handle your users type, and by default it is `https://bsky.social`, which is a third party. Point it somewhere you trust:

```ts
handleResolver: 'https://your-pds.example.com' // any PDS resolves handles
```

DIDs are resolved directly and never go through it.

### serving the metadata document

A browser app still has to serve `/oauth-client-metadata.json`. `airspace/oauth/metadata` builds that document with no OAuth client behind it, so a server route can use it without either atproto client installed:

```ts
import { clientMetadata } from 'airspace/oauth/metadata'

export default defineEventHandler(() => clientMetadata({
  baseUrl: 'https://unifont.dev',
  redirectPath: '/stack',
  name: 'unifont.dev',
  scopes: scopesFor({ collections: { stacks } }),
}))
```

Both entry points produce the same document, so `clientMetadata` from `airspace/oauth` works too if the server already depends on `@atproto/oauth-client-node`.

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

A `space:` scope also fails the login on a PDS that does not serve spaces. `spacesSupported()` can tell if a PDS supports spaces before signing in, so make sure you leave `spaces` out of `scopesFor()` when it is false:

```ts
import { spacesSupported } from 'airspace/oauth'

const spaces = await spacesSupported(service) ? { workspace } : undefined
scopesFor({ collections: { projects, categories }, spaces })
```
