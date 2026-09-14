# errors

Every error airspace throws extends `AirspaceError`, and all of them are exported from `airspace`, so you can catch them by class.

| Error | Thrown when | Carries |
| --- | --- | --- |
| `ValidationError` | a value fails its schema, on read or write | `collection`, `rkey`, `issues` |
| `ConflictError` | the record changed since you read it, and `ifMatch` was rejected | `collection`, `rkey`, `cid` |
| `ScopeError` | the session was authorized before a collection in your model existed | `missingScope` |
| `SpacesUnsupportedError` | a space call against a PDS without space support | |

After a `ConflictError`, re-read the record, merge, and try again. See [concurrent writes](/docs/reading-and-writing#concurrent-writes).

A `ScopeError` means the user has to authorize again. See [OAuth and permission sets](/docs/oauth).
