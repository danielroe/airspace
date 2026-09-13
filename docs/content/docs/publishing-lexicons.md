# publishing your lexicons

Publishing your lexicons as `com.atproto.lexicon.schema` records lets anyone else resolve them.

```sh
airspace lexicons publish --identity roe.dev --dry-run   # no credentials needed
AIRSPACE_APP_PASSWORD=... airspace lexicons publish --identity roe.dev
```

`publish` reads `./lexicons.ts` (a `defineLexicons` module) or, failing that, `./lexicons/` (JSON); `--lexicons` points it elsewhere. The authority defaults to your reversed handle (`roe.dev` becomes `dev.roe`), and only lexicons under an authority you own are written, so vendored community schemas are never republished under your DID. The command prints the plan and the `_lexicon.<domain>` TXT records third parties need.

`airspace lexicons emit` writes the same schemas to disk as JSON, one file per NSID under `lexicons/`, without publishing anything.
