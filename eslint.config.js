import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    'PROPOSAL.md',
    'demo-pds/fly.toml',
    '.github/workflows/*.yml',
    'src/lex/**',
    'test/fixtures/live/**',
    'examples/*/lex/**',
    'examples/*/lexicons/**',
    'examples/*/.astro/**',
    'examples/*/.svelte-kit/**',
    'examples/*/.nuxt/**',
    'examples/*/.output/**',
    'examples/*/dist/**',
  ],
})
