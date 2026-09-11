The PDS can't validate lexicons it doesn't know, particularly inside spaces ([atproto#5433](https://github.com/bluesky-social/atproto/issues/5433)), so airspace validates every write against the schema before sending it.

```ts
const result = await airspace.projects.validate(value) // { ok: true } | { ok: false, issues }
```

`validate()` is async: it runs the whole write path, write plugins and the space ref rewrite included.

Writes throw [`ValidationError`](/docs/errors), which names the collection and record key and carries the normalised `issues`.

Lexicons are open, so unknown fields you write are kept. If your input comes from a form, validate it yourself before it reaches `create()`.

Reads are validated too. `get()` throws `ValidationError` naming the record. `list()` skips a record the schema rejects, so one record left over from an older shape doesn't empty a page.

## migrations

`migrate` rewrites a collection after a lexicon change:

```ts
const report = await airspace.projects.migrate(value => ({ ...value, slug: slugify(value.name) }), { dryRun: true })
// { scanned: 120, changed: 118, unchanged: 2, failed: { '3kabc...': [{ path: 'slug', message: '...' }] } }
```

Records whose transformed value fails validation are named in `failed` and left alone; the rest are written in batches of 200.

The scan itself doesn't validate. After adding a required field every existing record fails the new schema, so `list()` returns nothing and `get()` throws until they're rewritten; `migrate` reads them anyway and validates only what your transform produced. It works the same inside a space, and running it twice is safe.
