import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/lexicon.ts', 'src/live.ts', 'src/cli.ts', 'src/oauth.ts', 'src/plugins/*.ts'],
  dts: { oxc: true },
  exports: { devExports: true },
  publint: true,
  attw: {
    profile: 'esm-only',
    level: 'error',
  },
})
