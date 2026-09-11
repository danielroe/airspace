# airspace

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> The database you already have.

[getair.space](https://getair.space)

Every ~~Bluesky~~ atmosphere account comes with a personal data server: a cms, login, file storage and a public API that you own.

- **you own your data.** Records live in your own repo under your own schema. Switch tools or hosts – or even stop using airspace – and everything still works.
- **no database to run.** Reads, writes, auth and images are all handled by your own PDS. airspace is a typed client.
- **drafts built in.** Experimental permissioned spaces for private data, with a single call to publish.
- **typed from your schema.** Define the model once. Records, keys, joins and OAuth scopes are inferred magically. ✨

## example

```ts
// lexicons.ts
import { defineLexicons, field } from 'airspace/lexicon'

export default defineLexicons('dev.roe', {
  note: {
    title: field.text(),
    body: field.markdown(),
    createdAt: field.datetime(),
  },
})
```

```ts
// notes.ts
import { createAirspace, defineCollection, passwordSession } from 'airspace'
import lexicons from './lexicons.ts'

const notes = defineCollection(lexicons.note)

export const airspace = createAirspace({
  identity: 'roe.dev',
  collections: { notes },
  session: await passwordSession({ service: 'https://pds.example', identifier: 'roe.dev', password: process.env.PDS_APP_PASSWORD! }),
})

const published = await airspace.notes.list({ limit: 10 })
await airspace.notes.create({ title: 'Hello', body: '# hi', createdAt: new Date().toISOString() })
```

> [!WARNING]
> Permissioned spaces, where drafts and private records live, are experimental. They need a PDS running prerelease software: atproto's `permissioned-data` branch, or the `@atproto/pds` spaces alpha. Hosted PDSes, including `bsky.social`, do not support them yet. The API may change.

## docs

[getair.space/docs](https://getair.space/docs).

## examples

- [`examples/nuxt`](./examples/nuxt): a Nitro plugin providing an airspace client + server routes +`@comark/vue`.
- [`examples/astro`](./examples/astro): static generation + `getStaticPaths` + Astro actions for writing.
- [`examples/sveltekit`](./examples/sveltekit): `load` functions + form actions with field-level validation.
- [`examples/node`](./examples/node): a CLI with no framework and no build step.

The [demo on getair.space](https://getair.space/demo) is the same app, running against a sandbox account on a demo PDS.

## development

- Clone this repository
- Install dependencies with `pnpm install`
- Run the tests with `pnpm dev`. They run against a real PDS with permissioned spaces, booted in process with `@atproto/dev-env`
- Run `pnpm dev:pds` for a PDS on port 2583 that stays up, printing dotenv-shaped credentials for two accounts
- Run `pnpm lex:build` to regenerate `src/lex` from `lexicons/`
- Run `pnpm size` to print the bundle size table in the docs

## credits

Many thanks to [**@mkrl**](https://github.com/mkrl) for the name idea 🙏

## license

Made with ❤️

Published under [MIT License](./LICENCE).

<!-- Badges -->

[npm-version-src]: https://npmx.dev/api/registry/badge/version/airspace
[npm-version-href]: https://npmx.dev/package/airspace
[npm-downloads-src]: https://npmx.dev/api/registry/badge/downloads/airspace
[npm-downloads-href]: https://npm.chart.dev/airspace
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/danielroe/airspace/ci.yml?branch=main&style=flat-square
[github-actions-href]: https://github.com/danielroe/airspace/actions?query=workflow%3Aci
[codecov-src]: https://img.shields.io/codecov/c/gh/danielroe/airspace/main?style=flat-square
[codecov-href]: https://codecov.io/gh/danielroe/airspace
