# airspace and plain Node

From the repo root:

```sh
pnpm install
pnpm dev:pds   # a PDS on port 2583, with credentials for alice and bob
```

Then in this directory:

```sh
cp .env.example .env   # its defaults are what dev:pds prints for alice
pnpm cli profile --name "Alice" --bio "Writes notes"
pnpm cli draft "My note" --body "# hello" --tag ideas
pnpm cli drafts
pnpm cli publish <rkey>
pnpm cli list
pnpm cli show <rkey>
pnpm lex:emit          # lexicon JSON for publishing
```
