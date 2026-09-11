# docs

The site at [getair.space](https://getair.space): a landing page and a live demo.

```sh
pnpm dev        # from this directory
pnpm build      # server output for Vercel
pnpm generate   # static output in .output/public, landing page only
```

Deploy on Vercel with the project root set to `docs`. Nitro detects the platform and needs no `vercel.json`.

## landing page and docs

`/` is the landing page and `/docs/...` is the reference. Both are prerendered without the client runtime (`routeRules`). The landing page has no JavaScript at all; the docs pages carry one inline script, the outline highlight in `app/pages/docs/[[page]].vue`.

The docs are authored in `content/docs/`, one Markdown file per page. `shared/docs-nav.ts` gives the order, the titles and the URLs, and drives the sidebar, the prev/next links and the prerendered routes. Adding a page means adding a file and an entry there.

Markdown under `content/` is parsed with [comark](https://comark.dev) and highlighted with [rangi](https://github.com/pi0/rangi) in `server/api/content/[page].get.ts` and `server/api/docs/[page].get.ts`, which also return a table of contents built from the `h2` and `h3` ids. `server/utils/markdown.ts` holds the highlighting config: rangi's `cssVariables` theme, whose `--shj-*` custom properties are defined against the site palette in `assets/css/tokens.css`, light and dark.

`content/` renders through `<MarkdownDocument>` with no custom components registered, so the files must be plain Markdown plus inline HTML. Comark block components such as `::note` would parse but render as nothing.

`> [!WARNING]` blockquotes parse to `<blockquote as="warning">` and are styled as callouts.

`pnpm check:links` walks `.output/public` after a build and fails if an internal link has no page behind it.

`public/og.png` was rasterised from `scripts/og-image.svg` and committed. Regenerate it with any SVG rasteriser at 1200x630 if the wording changes.

## demo

`/demo` is the shared notes app: published notes in a sandbox account's public repo, drafts in a permissioned space, a profile singleton. Every demo page has a panel showing the source of the server route that produced its data, read from the file at build time through `nitro.serverAssets`.

"Try it" creates a throwaway account on the demo PDS with `com.atproto.server.createAccount` and keeps its credentials in an encrypted cookie (`useSession`). There is no OAuth and no way to sign in with a real account. "Reset" deletes the visitor's notes and drafts.

The drafts page writes to a space, so the demo PDS must run atproto's `permissioned-data` branch. `pnpm dev:pds` in the repository root starts one on port 2583. The public one, at `pds.demo.getair.space`, is in `demo-pds/`.

Copy `.env.example` to `.env`:

- `NUXT_PDS_SERVICE`, the demo PDS. `http://localhost:2583` locally.
- `NUXT_PDS_INVITE_CODE`, only if that PDS requires invite codes.
- `NUXT_SESSION_PASSWORD`, at least 32 random characters, sealing the session cookie.

## deployment

On Vercel, with the project root set to `docs`, the same three variables are the whole configuration:

- `NUXT_PDS_SERVICE=https://pds.demo.getair.space`
- `NUXT_PDS_INVITE_CODE`, a code minted with `pnpm invite` in `demo-pds/`. The demo PDS requires one, and without it every "Try it" fails with a 502.
- `NUXT_SESSION_PASSWORD`, 32 or more random characters. Changing it logs every visitor out of their sandbox account.

All three are runtime configuration, so they can be changed without a rebuild. None is a build-time secret and none belongs in `vercel.json`.

The model lives in `shared/lexicons.ts` and `shared/collections.ts`, the same two files every example uses.
