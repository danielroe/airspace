# your content model

Lexicons are the schemas for your records. Collections add what your app needs on top: sort order, relations, plugins.

## your lexicons

The first argument is your namespace: a domain you own, reversed. So `project` here defines the record type `dev.roe.project`. Every field takes `.optional()` and `.describe()`.

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
    key: 'self', // a singleton: only one record
    city: field.text(),
  },
  workspace: space(['project', 'projectCategory']),
})
```

`field.ref()` points at another record. For another namespace, use the full name: `field.ref('com.whtwnd.blog.entry')`.

`key` and `description` belong to the record itself only when they hold a record key and a string; anything else under those names is an ordinary field. For a record with both a `description` field and a description of its own, write `record(fields, { description })`.

The field types are `text`, `markdown`, `number`, `boolean`, `datetime`, `url`, `enum`, `list`, `object`, `union`, `blob` and `image`, each with a default maximum length or size, plus `field.raw(...)` for anything else. `field.text({ format })` takes any lexicon string format, though only the standard ones are checked as more than a string.

### unions

A union field holds one of several shapes, which suits block-based content:

```ts
content: field.list(field.union([() => markdown, () => image]).open())
```

`.open()` keeps members you don't know about, so another app's block type is not lost when you read a record and write it back. Narrow the type with a member's own guard, such as `markdown.isTypeOf(block)`; a `switch` on `$type` cannot narrow an open union.

## your collections

A collection is what you call `list()`, `get()`, `create()` and the rest on:

```ts
import { belongsTo, defineCollections, defineSpace } from 'airspace'
import lexicons from './lexicons.ts'

export const { project: projects, projectCategory: categories, location } = defineCollections(lexicons, c => ({
  projectCategory: { sort: [['order', 'asc']] },
  project: { relations: { category: belongsTo(c.projectCategory, 'category') } },
}))

export const workspace = defineSpace(lexicons.workspace, { collections: { projects, categories } })
```

The callback form is only needed when a relation names a sibling; otherwise pass a plain object, or use `defineCollection(lexicons.project, options)` one at a time.

## lower-level schemas

For a shape the `field` helpers don't cover, use `l`, also from `airspace/lexicon`: the underlying schema builders, plus `record`, `token`, `space`, `openUnion` and `permissionSet`. Keys are full record type names, a bare value is the `main` definition, and an object is a set of named ones.

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
    }),
  }),
  'dev.roe.workspace': l.space({ key: 'literal:self', collections: ['dev.roe.project'] }),
})
```

`npx airspace lexicons emit` writes your schemas as JSON, one file per record type. Lexicon JSON has no inline object type, so a nested `field.object` becomes a definition of its own, named after the field.

## schemas someone else wrote

Any record type on the network works, given its schema: WhiteWind blog posts, community calendar events, anything.

`lex install <nsid>` (from `@atproto/lex`, a devDependency) downloads a schema and pins its hash. `lex build` then generates TypeScript, which you reference directly: `l.ref(() => AppDefs.image)`. A generated def that isn't a typed object, such as a bare string with `knownValues`, carries no `$type` to recover its name from, so pass one: `l.ref(() => AppDefs.status, { nsid: 'community.lexicon.app.defs#status' })`. Commit `lexicons/` and `lexicons.json`, and run `lex install --ci` in CI to catch a changed hash. This only works for published schemas; copy the rest in by hand.

If you already have lexicon JSON, keep it:

```sh
lex build --clear --ignore-invalid-lexicons --lib @atproto/lex-schema
```

Pass the output straight to `defineCollection(dev.roe.project.main)`. Spaces are the exception, since `lex build` cannot yet parse them: use `defineSpace({ nsid: 'dev.roe.workspace', key: 'literal:self', collections: [...] }, { collections })`.

The flags: `--clear`, or a second run fails with `File already exists`; `--lib`, so the generated code imports the schema library airspace already ships; and `--import-ext .ts` if you run the output through Node directly.
