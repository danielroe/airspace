<script setup lang="ts">
import { MarkdownDocument } from '@comark/vue/components/MarkdownDocument'

const route = useRoute()
const rkey = route.params.rkey as string
const { data: note, error } = await useFetch(`/api/demo/notes/${rkey}`)

useSeoMeta({ title: () => `${note.value?.title ?? 'Note'} | airspace demo` })

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <DemoShell v-slot="{ account }">
    <div class="demo-page">
      <template v-if="note">
        <header>
          <NuxtLink to="/demo" class="back">
            ← Notes
          </NuxtLink>
          <h1>{{ note.title }}</h1>
        </header>

        <dl class="demo-props">
          <template v-if="note.tag">
            <dt>tag</dt>
            <dd><span class="tag">{{ note.tag }}</span></dd>
          </template>
          <template v-if="note.createdAt">
            <dt>created</dt>
            <dd>{{ formatDate(note.createdAt) }}</dd>
          </template>
          <dt>record</dt>
          <dd>
            <code>{{ rkey }}</code>
            <a v-if="account" :href="`https://pdsls.dev/at://${account.did}/space.getair.notes.note/${rkey}`" target="_blank" rel="noopener">view on pdsls ↗</a>
          </dd>
        </dl>

        <img v-if="note.cover" :src="note.cover" :alt="note.title" class="demo-cover">
        <div class="demo-body">
          <MarkdownDocument v-if="note.body" :value="note.body" />
        </div>
      </template>
      <template v-else>
        <header>
          <NuxtLink to="/demo" class="back">
            ← Notes
          </NuxtLink>
          <h1>Note</h1>
        </header>
        <p class="demo-empty">
          {{ account ? (error?.statusMessage ?? error?.message ?? 'no such note') : 'Press Try it to create a sandbox account first.' }}
        </p>
      </template>

      <DemoSource file="notes/[rkey].get.ts" />
    </div>
  </DemoShell>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: var(--space-xs);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  text-decoration: none;
}

.back:hover {
  color: var(--color-ink);
}

.demo-props dd a {
  margin-inline-start: var(--space-2xs);
  font-size: var(--text-xs);
}
</style>
