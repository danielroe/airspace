export default defineNuxtConfig({
  devtools: { enabled: false },
  runtimeConfig: {
    pds: {
      service: 'http://localhost:2583',
      identifier: 'alice.test',
      password: 'hunter2',
    },
  },
  compatibilityDate: '2025-11-01',
})
