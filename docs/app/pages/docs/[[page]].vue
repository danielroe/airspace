<script setup lang="ts">
import { MarkdownDocument } from '@comark/vue/components/MarkdownDocument'
import { docsPageFor, docsPages } from '#shared/docs-nav'

const route = useRoute()
const slug = computed(() => (route.params.page as string | undefined) || 'index')

const page = computed(() => docsPageFor(slug.value))
if (!page.value)
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const index = computed(() => docsPages.findIndex(entry => entry.slug === slug.value))
const previous = computed(() => docsPages[index.value - 1])
const next = computed(() => docsPages[index.value + 1])

const { data: content } = await useFetch(() => `/api/docs/${slug.value}`)

interface OutlineNode { id: string, text: string, children: OutlineNode[] }

const outline = computed<OutlineNode[]>(() => {
  const tree: OutlineNode[] = []
  for (const entry of content.value?.toc ?? []) {
    const node: OutlineNode = { id: entry.id, text: entry.text, children: [] }
    const parent = entry.depth === 3 ? tree.at(-1) : undefined
    ;(parent ? parent.children : tree).push(node)
  }
  return tree
})

const title = computed(() => `${page.value!.title} · airspace docs`)

useSeoMeta({
  title,
  description: 'The airspace API: lexicons in TypeScript, typed reads and writes, permissioned spaces, blobs, plugins, OAuth scopes and publishing your lexicons.',
  ogTitle: title,
  ogDescription: 'The airspace API, one page at a time.',
  ogUrl: () => `https://getair.space${page.value!.path}`,
  ogImage: 'https://getair.space/og.png',
  ogType: 'article',
  twitterCard: 'summary_large_image',
})

// prerendered without the Nuxt runtime, so the outline highlight ships as inline script
useHead({
  script: [{
    tagPosition: 'bodyClose',
    innerHTML: `(() => {
  const links = [...document.querySelectorAll('.outline a')]
  const headings = links.map(a => document.getElementById(a.hash.slice(1))).filter(Boolean)
  if (!headings.length || !('IntersectionObserver' in window)) return
  const visible = new Set()
  const update = () => {
    let active = headings.find(h => visible.has(h))
    if (!active) for (const h of headings) if (h.getBoundingClientRect().top < 120) active = h
    for (const a of links) a.classList.toggle('active', !!active && a.hash === '#' + active.id)
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)
    update()
  }, { rootMargin: '-80px 0px -65% 0px' })
  for (const heading of headings) observer.observe(heading)
  update()
})()`,
  }],
})
</script>

<template>
  <div class="docs">
    <nav class="pages" aria-label="Docs">
      <p class="rubric">
        docs
      </p>
      <ul>
        <li v-for="entry of docsPages" :key="entry.slug">
          <NuxtLink :to="entry.path" :aria-current="entry.slug === slug ? 'page' : undefined">
            {{ entry.title }}
          </NuxtLink>
          <ol v-if="entry.slug === slug && outline.length" class="outline" aria-label="On this page">
            <li v-for="heading of outline" :key="heading.id">
              <a :href="`#${heading.id}`">{{ heading.text }}</a>
              <ol v-if="heading.children.length">
                <li v-for="child of heading.children" :key="child.id">
                  <a :href="`#${child.id}`">{{ child.text }}</a>
                </li>
              </ol>
            </li>
          </ol>
        </li>
      </ul>
    </nav>

    <article class="prose">
      <h1>{{ page!.title }}</h1>
      <MarkdownDocument v-if="content" :value="content.document" />

      <nav class="pager" aria-label="Pagination">
        <NuxtLink v-if="previous" :to="previous.path" class="previous">
          <span>previous</span>{{ previous.title }}
        </NuxtLink>
        <NuxtLink v-if="next" :to="next.path" class="next">
          <span>next</span>{{ next.title }}
        </NuxtLink>
      </nav>
    </article>
  </div>
</template>

<style scoped>
.docs {
  display: grid;
  gap: var(--space-lg);
  align-items: start;
}

.docs > * {
  min-width: 0;
}

.rubric {
  margin: 0 0 var(--space-2xs);
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pages ul,
.pages ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3xs);
  font-size: var(--text-sm);
}

.pages a,
.outline a {
  color: var(--color-ink-2);
  text-decoration: none;
  transition: color var(--dur-fast) var(--ease-out);
}

.pages a:hover,
.pages a:focus-visible,
.outline a:hover,
.outline a:focus-visible {
  color: var(--color-ink);
}

.pages a[aria-current='page'] {
  color: var(--color-accent);
}

.outline a.active {
  color: var(--color-accent);
}

.pages .outline {
  margin: var(--space-3xs) 0 var(--space-2xs);
  padding-inline-start: var(--space-xs);
  border-inline-start: var(--rule);
  font-size: var(--text-xs);
}

.pages .outline ol {
  margin-top: var(--space-3xs);
  padding-inline-start: var(--space-xs);
}

.prose {
  min-width: 0;
  max-width: var(--measure-wide);
}

.prose h1 {
  font-size: var(--text-3xl);
  margin: 0 0 var(--space-md);
}

.prose :deep(h2) {
  font-size: var(--text-xl);
  margin: var(--space-xl) 0 var(--space-sm);
  padding-top: var(--space-md);
  border-top: var(--rule);
  scroll-margin-top: 2rem;
}

.prose :deep(h3) {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: var(--space-lg) 0 var(--space-xs);
  scroll-margin-top: 2rem;
}

.prose :deep(blockquote) {
  margin: var(--space-md) 0;
  padding: var(--space-xs) var(--space-sm);
  border: var(--rule);
  border-inline-start: 2px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-paper-2);
}

.prose :deep(blockquote p) {
  margin: 0;
}

.prose :deep(blockquote[as='warning']) {
  border-inline-start-color: oklch(65% 0.17 45);
  background: color-mix(in oklch, oklch(65% 0.17 45) 8%, var(--color-paper-2));
}

.prose :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: var(--text-sm);
  margin: var(--space-md) 0;
}

.prose :deep(th),
.prose :deep(td) {
  text-align: start;
  padding: var(--space-3xs) var(--space-xs);
  border-bottom: var(--rule);
}

.pager {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: space-between;
  margin-top: var(--space-2xl);
  padding-top: var(--space-md);
  border-top: var(--rule);
  font-size: var(--text-sm);
}

.pager a {
  display: grid;
  gap: var(--space-3xs);
  text-decoration: none;
}

.pager .next {
  margin-inline-start: auto;
  text-align: end;
}

.pager span {
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

@media (max-width: 63.99rem) {
  .pages ul {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: var(--space-sm);
    padding-bottom: var(--space-2xs);
  }

  .pages a {
    white-space: nowrap;
  }

  .pages .outline {
    display: none;
  }
}

@media (min-width: 64rem) {
  .docs {
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: var(--space-2xl);
  }

  .pages {
    position: sticky;
    top: 2rem;
    max-height: calc(100dvh - 4rem);
    overflow-y: auto;
  }
}
</style>
