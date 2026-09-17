import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/lexicon.ts', 'src/live.ts', 'src/cli.ts', 'src/oauth.ts', 'src/oauth/browser.ts', 'src/oauth/metadata.ts', 'src/plugins/*.ts'],
  dts: { generator: 'oxc' },
  exports: { devExports: true },
  publint: true,
  attw: {
    profile: 'esm-only',
    level: 'error',
  },
})
