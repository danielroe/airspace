# publishing your lexicons

Your app works fine with lexicons that only exist in your codebase. Publish them and anyone can look up `dev.roe.project` and see what your records hold. It is also required before a [permission set](/docs/oauth#permission-sets) or a space scope can be used at login.

Publishing writes each schema into your own repo as a `com.atproto.lexicon.schema` record:

```sh
airspace lexicons publish --identity roe.dev --dry-run   # no credentials needed
AIRSPACE_APP_PASSWORD=... airspace lexicons publish --identity roe.dev
```

This reads `./lexicons.ts`, or failing that `./lexicons/`; use `--lexicons` for another path. The namespace defaults to your reversed handle, so `roe.dev` publishes `dev.roe.*`. Nothing outside your own namespace is written, so schemas copied from other people are never republished under your account.

The command also prints the `_lexicon.<domain>` DNS TXT record to add, which proves the domain and the account have the same owner. Without it, nobody can look up your schemas.

To write the same JSON to disk without publishing, run `airspace lexicons emit`.
