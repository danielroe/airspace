# your content model

Write your lexicons in TypeScript under your own namespace. The first argument is the namespace and every key is a short name, so `project` is `dev.roe.project`. Every field takes `.optional()` and `.describe()`.

```ts
// lexicons.ts
import { defineLexicons, field, space } from 'airspace/lexicon'

export default defineLexicons('dev.roe', {
  projectCategory: {
    name: field.text({ max: 64 }),
    order: field.number().optional(),
  },
  project: {
    description: 'A project on the /projects page.',
    category: field.ref('projectCategory').describe('The parent category.'),
    name: field.text(),
    createdAt: field.datetime(),
  },
  location: {
    key: 'self',
    city: field.text(),
  },
  workspace: space(['project', 'projectCategory']),
})
```

`key` defaults to `tid`; `key: 'self'` makes the record a singleton. `key` and `description` are the record's own only when they hold a record key and a string; a field under either name is just a field. `field.ref('projectCategory')` is a `com.atproto.repo.strongRef`, and a record in another namespace takes its full NSID. The other fields are `text`, `markdown`, `number`, `boolean`, `datetime`, `url`, `enum`, `list`, `object`, `union`, `blob` and `image`, each with a default maximum length or size, plus `field.raw(...)` for anything they don't cover.

`field.text({ format })` takes any lexicon string format. `@atproto/lex-schema` validates `datetime`, `uri`, `did`, `handle`, `nsid`, `tid`, `record-key`, `at-uri`, `at-identifier`, `cid` and `language`; anything else, such as `duration`, is emitted to the JSON and validated as a plain string.

## unions

`field.union([() => block])` is a closed union of typed object defs. `.open()` keeps the members you don't know:

```ts
export default defineLexicons('dev.roe', {
  document: {
    title: field.text(),
    content: field.list(field.union([() => markdown, () => image]).open()),
  },
})
```

An unknown member reads back as `{ $type, ...its data }` and survives a read-modify-write. Narrow with a member's own guard (`markdown.isTypeOf(block)`); a `switch` on `$type` can't narrow an open union.

## collections

A collection says what a record means to your app: how it sorts, what it joins to, which plugins it runs.

```ts
import { belongsTo, defineCollection, defineSpace } from 'airspace'
import lexicons from './lexicons.ts'

export const categories = defineCollection(lexicons.projectCategory, {
  sort: [['order', 'asc']],
})

export const projects = defineCollection(lexicons.project, {
  relations: { category: belongsTo(categories, 'category') },
})

// a `self` record key makes this a singleton
export const location = defineCollection(lexicons.location)

export const workspace = defineSpace(lexicons.workspace, {
  collections: { projects, categories },
})
```

`defineCollections` takes the whole lexicon map and returns a collection per record, keyed by the lexicon's short name, with per-collection options optional. The callback form hands you the collections themselves, so a relation can name a sibling:

```ts
import { belongsTo, defineCollections, defineSpace } from 'airspace'
import lexicons from './lexicons.ts'

export const { project: projects, projectCategory: categories, location } = defineCollections(lexicons, c => ({
  projectCategory: { sort: [['order', 'asc']] },
  project: { relations: { category: belongsTo(c.projectCategory, 'category') } },
}))

export const workspace = defineSpace(lexicons.workspace, { collections: { projects, categories } })
```

Spaces and permission sets in the map are skipped. `defineCollection` stays for a model that wants one collection at a time, or a collection built from a schema `lex build` generated.

## the lexicon primitives

`airspace/lexicon` also exports `l`: `@atproto/lex-schema`'s builders with `description` accepted wherever the lexicon JSON allows one, plus `record`, `token`, `space`, `openUnion` and `permissionSet` defs. Use it for unions, tokens, `knownValues`, defaults or a shape the fields don't reach. Keys are full NSIDs, a bare value is the `main` def and an object is a set of named defs. Both styles compile to the same schemas, and `field.raw(l.anything())` mixes them.

```ts
import { defineLexicons, l } from 'airspace/lexicon'

const badge = l.object({ label: l.string({ maxGraphemes: 32 }) })

export default defineLexicons({
  'dev.roe.defs': { badge },
  'dev.roe.project': l.record({
    key: 'tid',
    record: l.object({
      name: l.string(),
      state: l.string({ knownValues: ['draft', 'live'] }),
      badge: l.optional(l.ref(() => badge)),
      createdAt: l.string({ format: 'datetime' }),
    }),
  }),
  'dev.roe.workspace': l.space({ key: 'literal:self', collections: ['dev.roe.project'] }),
})
```

`npx airspace lexicons emit` writes the lexicon JSON, one file per NSID under `lexicons/`. Descriptions, `maxGraphemes`, `knownValues`, defaults, refs and unions all survive. Lexicon JSON has no inline object type, so a nested `field.object` becomes a def of its own, named after the field. `Infer<typeof lexicons.project>` is the record type.

## sharing existing schemas

Shared shapes such as `community.lexicon.app.defs#image` and `com.atproto.repo.strongRef` come from `lex install <nsid>` (in `@atproto/lex`, a devDependency), which vendors the schema and pins its CID; `lex build` then generates TypeScript. Reference the output directly: `l.ref(() => AppDefs.image)`. A generated def that isn't a typed object, such as a bare string with `knownValues`, carries no `$type` for the emitter to recover its NSID from, so name it: `l.ref(() => AppDefs.status, { nsid: 'community.lexicon.app.defs#status' })`.

`lex install` writes the schema under `lexicons/` and records its URI and CID in `lexicons.json`, dependencies included. Commit both: `lex install --ci` re-resolves every pinned NSID and exits non-zero if a CID has moved, which is the check to run in CI. An NSID only resolves if its authority publishes a `_lexicon.<domain>` DNS TXT record and a `com.atproto.lexicon.schema` record for it, so a schema whose author has not done that (`com.whtwnd.blog.entry`, at the time of writing) has to be vendored by hand from wherever they keep it.

If you already have lexicon JSON, keep it:

```sh
lex build --clear --ignore-invalid-lexicons --lib @atproto/lex-schema
```

That generates TypeScript for everything except `"type": "space"` defs, which `lex build` can't parse yet. `defineCollection(dev.roe.project.main)` takes the output as is, and a space is `defineSpace({ nsid: 'dev.roe.workspace', key: 'literal:self', collections: [...] }, { collections })`. Pass `--clear`, or a second run fails with `File already exists`. Pass `--lib` so the generated code imports `@atproto/lex-schema`, which airspace already ships, rather than `@atproto/lex`. Add `--import-ext .ts` if you run the generated files through Node's own TypeScript support rather than a bundler.
