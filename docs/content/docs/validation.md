# validation and migrations

A PDS only checks record types it knows about, which won't include yours, and inside a space it checks nothing ([atproto#5433](https://github.com/bluesky-social/atproto/issues/5433)). So airspace checks every write against your schema before sending it, and every record read back.

```ts
const result = await airspace.projects.validate(value) // { ok: true } | { ok: false, issues }
```

`validate()` is async, because it runs the full write path, including write plugins. A failed write throws [`ValidationError`](/docs/errors), naming the collection and record key. On read, `get()` throws, and `list()` skips records that fail, so one stale record doesn't empty a page.

Lexicons are open, so unknown fields are kept rather than dropped, and a typo in a field name passes validation. Check form input yourself.

## migrations

Records already in your repo keep their old shape after a schema change. `migrate` rewrites them:

```ts
const report = await airspace.projects.migrate(value => ({ ...value, slug: slugify(value.name) }), { dryRun: true })
// { scanned: 120, changed: 118, unchanged: 2, failed: { '3kabc...': [{ path: 'slug', message: '...' }] } }
```

Records whose new value fails validation are listed in `failed` and left alone; the rest are written in batches of 200.

The scan itself skips validation, which is what makes this work: after adding a required field, every existing record fails the new schema, so `list()` returns nothing and `get()` throws until they are rewritten. Only your transform's output is validated. Running a migration twice is safe.
