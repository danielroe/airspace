import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: ['src'],
      reporter: ['text', 'json', 'html'],
    },
    projects: [
      {
        test: {
          name: 'airspace',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '#shared': fileURLToPath(new URL('./docs/shared', import.meta.url)),
          },
        },
        test: {
          name: 'docs',
          root: fileURLToPath(new URL('./docs', import.meta.url)),
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
})
