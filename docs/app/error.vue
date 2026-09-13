<script setup lang="ts">
import type { NuxtError } from 'nuxt/app'
import { docsPages } from '#shared/docs-nav'
import { siteName, siteUrl } from '#shared/site'

const props = defineProps<{ error: NuxtError }>()

const missing = props.error.statusCode === 404
const title = computed(() => `${props.error.statusCode || 500} · ${siteName}`)

useSeoMeta({
  title,
  description: missing ? `That page does not exist on ${siteName}. Start from the docs index.` : 'Something went wrong.',
  robots: 'noindex',
})
</script>

<template>
  <SiteShell>
    <div class="error">
    <p class="rubric">
      {{ error.statusCode || 500 }}
    </p>
    <h1>{{ missing ? 'that page does not exist.' : 'something went wrong.' }}</h1>

    <p v-if="missing" class="lede">
      Nothing is served at <code>{{ error.url || '' }}</code>. Every page below is also available as
      markdown: append <code>.md</code> to its URL, or send <code>Accept: text/markdown</code>.
    </p>
    <p v-else class="lede">
      Try again, or open an issue if it keeps happening.
    </p>

    <p class="cta">
      <NuxtLink to="/docs" class="button primary">
        docs index
      </NuxtLink>
      <NuxtLink to="/" class="button">
        home
      </NuxtLink>
      <a class="button" href="https://github.com/danielroe/airspace">source</a>
    </p>

    <nav v-if="missing" aria-label="Documentation">
      <p class="rubric">
        docs
      </p>
      <ul>
        <li v-for="page of docsPages" :key="page.slug">
          <NuxtLink :to="page.path">
            {{ page.title }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <p v-if="missing" class="machine">
      machine-readable:
      <a :href="`${siteUrl}/llms.txt`">llms.txt</a>,
      <a :href="`${siteUrl}/llms-full.txt`">llms-full.txt</a>,
      <a :href="`${siteUrl}/sitemap.xml`">sitemap.xml</a>
      </p>
    </div>
  </SiteShell>
</template>

<style scoped>
.error {
  max-width: var(--measure);
  margin-block: var(--space-2xl);
}

.rubric {
  margin: 0 0 var(--space-2xs);
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h1 {
  font-size: var(--text-3xl);
  margin: 0 0 var(--space-sm);
}

.lede {
  color: var(--color-ink-2);
  margin: 0 0 var(--space-lg);
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
  margin: 0 0 var(--space-xl);
}

nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3xs);
  font-size: var(--text-sm);
}

nav a {
  color: var(--color-ink-2);
  text-decoration: none;
}

nav a:hover,
nav a:focus-visible {
  color: var(--color-ink);
}

.machine {
  margin-top: var(--space-lg);
  font-size: var(--text-sm);
  color: var(--color-ink-2);
}
</style>
