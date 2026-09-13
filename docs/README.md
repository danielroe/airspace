# docs

This is the source for [getair.space](https://getair.space).

```sh
# run the docs locally
cp .env.example .env
# if you want to run the demo app
pnpm -w dev:pds
# this will print out a list of environment vars
# which you can append to `.env`
# then, launch in a new terminal
pnpm dev

# to build for production
pnpm build
```

## deployment

To deploy on Vercel, set the project root to `docs` and configure the following three environment variables:

- `NUXT_PDS_SERVICE=https://pds.demo.getair.space`
- `NUXT_PDS_INVITE_CODE` - this is used to create throwaway accounts on-demand and should be created on your PDS
- `NUXT_SESSION_PASSWORD` - 32 or more random characters

You can deploy many other places, in many cases with zero-configuration - Nuxt uses [Nitro to deploy](https://nitro.build/deploy).
