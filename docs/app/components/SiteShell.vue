<script setup lang="ts">
import { siteUrl } from '#shared/site'

const route = useRoute()
const wide = computed(() => route.path === '/' || route.path.startsWith('/docs') || route.path.startsWith('/demo'))

const canonical = computed(() => siteUrl + (route.path === '/' ? '/' : route.path.replace(/\/$/, '')))
const markdown = computed(() => {
  const path = route.path.replace(/\/$/, '')
  if (path === '')
    return '/index.md'
  return path === '/docs' || path.startsWith('/docs/') ? `${path}.md` : undefined
})

useHead({
  link: () => [
    { rel: 'canonical', href: canonical.value },
    ...markdown.value ? [{ rel: 'alternate', type: 'text/markdown', href: markdown.value }] : [],
  ],
})
</script>

<template>
  <div class="shell">
    <header class="masthead">
      <div class="masthead-inner">
        <p class="brand">
          <NuxtLink to="/" class="wordmark">
            <span>
              airspace
              <svg class="contrail" viewBox="0 0 120 24" aria-hidden="true" preserveAspectRatio="none">
                <path d="M2 20 C 26 12, 54 22, 82 13 S 112 3, 120 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 5" vector-effect="non-scaling-stroke" />
              </svg>
            </span>
            <svg class="plane" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M6 22 26 8l-6 16-5-5-4 4v-6z" fill="currentColor" />
            </svg>
          </NuxtLink>
        </p>
        <nav>
          <DocsSearch />
          <NuxtLink to="/docs">
            docs
          </NuxtLink>
          <NuxtLink to="/demo">
            demo
          </NuxtLink>
          <a href="https://github.com/danielroe/airspace">source</a>
        </nav>
      </div>
    </header>

    <main :class="{ wide }">
      <slot />
    </main>

    <footer class="site-footer">
      <p>
        <span>made with ♥ by <a href="https://roe.dev">danielroe</a></span>
        <span>&middot;</span>
        <span>MIT</span>
        <span>&middot;</span>
        <a href="https://github.com/danielroe/airspace">source</a>
      </p>
    </footer>
  </div>
</template>
