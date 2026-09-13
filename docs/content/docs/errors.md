# errors

Every error airspace throws extends `AirspaceError`, and all of them are exported from `airspace`, so you never catch a `@atproto/lex` error.

| Error | Thrown when | Carries |
| --- | --- | --- |
| `ValidationError` | a value fails its schema, on read or write | `collection`, `rkey`, `issues` |
| `ConflictError` | the PDS rejected an `ifMatch` | `collection`, `rkey`, `cid` |
| `ScopeError` | the session's grant predates a collection in your model | `missingScope` |
| `SpacesUnsupportedError` | a space call against a PDS that does not serve spaces | |

A `ScopeError` means the user has to authorize again.
