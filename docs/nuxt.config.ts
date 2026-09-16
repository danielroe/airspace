import { docsPages } from './shared/docs-nav.ts'

export default defineNuxtConfig({
  modules: ['@nuxt/fonts'],
  css: ['~/assets/css/tokens.css', '~/assets/css/base.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'alternate', type: 'text/plain', href: '/llms.txt', title: 'llms.txt' },
      ],
      meta: [
        { name: 'theme-color', content: '#f9fafb', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#111721', media: '(prefers-color-scheme: dark)' },
      ],
    },
  },
  features: {
    inlineStyles: true,
  },
  fonts: {
    processCSSVariables: true,
    defaults: {
      preload: { subsets: ['latin'] },
    },
    families: [
      { name: 'Space Grotesk', provider: 'google', weights: [500], styles: ['normal'], subsets: ['latin'] },
      { name: 'Instrument Sans', provider: 'google', weights: [400, 500, 600], styles: ['normal'], subsets: ['latin'] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400], styles: ['normal'], subsets: ['latin'] },
      { name: 'Caveat', provider: 'google', weights: [500], styles: ['normal'], subsets: ['latin'], glyphs: 'airspace' },
    ],
  },
  runtimeConfig: {
    pdsService: 'http://localhost:2583',
    pdsInviteCode: '',
    sessionPassword: '',
  },
  routeRules: {
    '/': { noScripts: true },
    '/docs': { noScripts: true },
    '/docs/**': { noScripts: true },
    '/demo/**': { prerender: false },
  },
  nitro: {
    prerender: {
      routes: [
        '/',
        '/llms.txt',
        '/llms-full.txt',
        '/robots.txt',
        '/sitemap.xml',
        '/api/content/sample-model',
        '/api/content/sample-site',
        ...docsPages.map(page => page.path),
        ...docsPages.map(page => `/api/docs/${page.slug}`),
      ],
    },
    serverAssets: [
      { baseName: 'content', dir: './content' },
      { baseName: 'demoRoutes', dir: './server/api/demo' },
      { baseName: 'demoShared', dir: './shared' },
      { baseName: 'demoProxy', dir: './server/routes/xrpc' },
    ],
  },
  compatibilityDate: '2026-09-01',
})
