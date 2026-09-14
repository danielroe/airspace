# atproto in five minutes

airspace is built on atproto, the protocol behind Bluesky. These are the only terms you need.

**PDS** Your personal data server: the machine holding your account, your data, your login and your files. Run your own, or use one someone else runs, such as `bsky.social`.

**Handle and DID** Two names for your account. A handle, such as `roe.dev`, is a domain you control. A DID, such as `did:plc:jbeaa5kdaladzwq3r7f5xgwe`, never changes, and your data is filed under it.

**Repo** All of your data, stored on your PDS as JSON. Anyone can read it; only you can write to it.

**Collection and record** A repo is split into collections. A collection holds records, and a record is one JSON object.

**Record key** Identifies a record in its collection, and often shortened to `rkey`. It defaults to a timestamp, so records sort by creation time. The fixed key `self` is for something there is only one of, such as a profile.

**AT URI** The address of one record: `at://did:plc:jbeaa…/dev.roe.project/3kabc…`.

**Lexicon** The schema for a record type, written in TypeScript in airspace.

**Namespace** Collection names are domains in reverse, so `roe.dev` owns everything under `dev.roe`.

**Blob** A file, stored on your PDS. Records hold a reference to it.

**Space** A private area of your repo, for drafts. [Experimental](/docs/spaces).
