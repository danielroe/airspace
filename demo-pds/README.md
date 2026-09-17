# demo-pds

This is the PDS behind the demo at [getair.space/demo](https://getair.space/demo): the reference atproto PDS from the permissioned spaces alpha, invite-only, holding throwaway accounts that a daily job deletes.

`@atproto/pds` reads its whole configuration from the environment and exports `PDS.run()`, so `server.mjs` is six lines and everything else is an environment variable. `.env.example` lists every one this deployment sets, with a comment on each.

```sh
pnpm install
pnpm dev          # localhost:2583, in-memory PLC, throwaway data directory
pnpm invite       # mint an invite code (needs PDS_ADMIN_PASSWORD)
pnpm smoke        # create an account, write a record, create a space, write and read a space record
pnpm reset        # delete every account older than 24 hours

# to run as deployed: no defaults, no local PLC, everything from the environment
pnpm start
```

Secrets live in `fly secrets`, never in this repo. Generate them with `openssl rand --hex 32`, or `--hex 16` for `PDS_ADMIN_PASSWORD`.

## deployment

Deployed to [Fly](https://fly.io) as `airspace-demo-pds`, on a push to `main` that touches this directory. `fly.toml` mounts a 1 GB volume at `/data`, serves `[http_service]` on 443, and health-checks `/xrpc/_health`.

First-time setup:

```sh
fly volumes create pds_data --size 1
fly secrets set PDS_JWT_SECRET=... PDS_DPOP_SECRET=... PDS_ADMIN_PASSWORD=... PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=...
fly certs add pds.demo.getair.space
fly certs add '*.demo.getair.space'
```

Both `pds.demo.getair.space` and `*.demo.getair.space` need `A`/`AAAA` records and TLS. Handle resolution fetches `https://<handle>/.well-known/atproto-did`, which the PDS answers from the `Host` header, so every handle it hands out has to reach it.

`PDS_HOSTNAME` is baked into each account's `did:plc` genesis operation as its service endpoint, so changing it orphans every existing account. The same goes for `PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX`.

## reset job

`reset.mjs` pages `com.atproto.sync.listRepos`, batches them through `com.atproto.admin.getAccountInfos`, and deletes anything older than `RESET_MAX_AGE_HOURS` (default 24). `RESET_KEEP` spares a comma-separated list of DIDs or handles; `RESET_DRY_RUN=1` prints what it would do. On Fly, as a scheduled machine on the app's image:

```sh
fly machine run --schedule daily --command "node reset.mjs" \
  --env PDS_SERVICE=https://pds.demo.getair.space registry.fly.io/airspace-demo-pds:latest
```

## notes

- `@atproto/pds@0.0.0-spaces-alpha-20260910230440`, the published build of atproto's `permissioned-data` branch. Those packages depend on each other with `^0.0.0-spaces-alpha-*` ranges, which also match unrelated broken `0.0.0` releases, so `pnpm-workspace.yaml` pins every one of them. The airspace test suite pins `@atproto/dev-env` to the same build.
- `PDS_DEV_MODE` is local only, set by `local.mjs`, because the PDS refuses to start on `http://` without it. It also turns off SSRF protection, so never set it on the deployed host.
- Invite codes cannot be chosen: `pnpm invite` mints one and prints it, and the docs deployment passes it as `NUXT_PDS_INVITE_CODE`. To cut the demo off, mint a fresh code and change that variable, or call `com.atproto.admin.disableInviteCodes`.
- `local.mjs` runs `@did-plc/server` in memory on port 2582, so local runs never write to `plc.directory`. The real directory is public and permanent: every throwaway account leaves a `did:plc` behind that deleting the account does not remove.
- Space writes create the space, so an owner writing to their own space needs no `createSpace` call, and `com.atproto.simplespace.getSpace` answers `SpaceNotFound` for such a space even while `listSpaces` lists it.
- The PDS does not validate third-party lexicons in spaces ([atproto#5433](https://github.com/bluesky-social/atproto/issues/5433)), which is why `smoke.mjs` passes `validate: false` and airspace validates space records itself.
- `better-sqlite3` is the only native dependency and must match the running node. The `Dockerfile` compiles it in a builder stage because there are no musl prebuilds for alpine.
