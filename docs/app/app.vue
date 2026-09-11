<script setup lang="ts">
const route = useRoute()
const wide = computed(() => route.path === '/' || route.path.startsWith('/docs') || route.path.startsWith('/demo'))
</script>

<template>
  <div class="shell">
    <header class="masthead">
      <div class="masthead-inner">
        <p class="brand">
          <NuxtLink to="/" class="wordmark">
            <svg class="contrail" viewBox="0 0 120 24" aria-hidden="true" preserveAspectRatio="none">
              <path d="M2 19 C 26 9, 54 21, 80 11 S 112 3, 118 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 5" vector-effect="non-scaling-stroke" />
            </svg>
            <span>airspace</span>
          </NuxtLink>
          <span class="badge">alpha</span>
        </p>
        <nav>
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
      <NuxtPage />
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
