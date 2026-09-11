<script setup lang="ts">
const { data, error } = await useFetch('/api/demo/notes')

useSeoMeta({ title: 'airspace demo' })

const collection = 'space.getair.notes.note'
const noteUrl = (did: string, rkey: string) => `https://pdsls.dev/at://${did}/${collection}/${rkey}`
const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
</script>

<template>
  <DemoShell v-slot="{ account }">
    <div class="demo-page">
      <header>
        <span class="icon" aria-hidden="true">◇</span>
        <h1>{{ data?.profile?.displayName ?? 'Notes' }}</h1>
        <p v-if="data?.profile?.bio">
          {{ data.profile.bio }}
        </p>
        <p v-else>
          A notes app on a sandbox account on our own PDS. Published notes live in the account's public repo,
          drafts in a permissioned space. Sandbox accounts are wiped periodically. Every call these pages make
          is covered in the <NuxtLink to="/docs">
            docs
          </NuxtLink>.
        </p>
      </header>

      <template v-if="account && data">
        <ul v-if="data.notes.length" class="demo-rows">
          <li v-for="note of data.notes" :key="note.rkey">
            <NuxtLink :to="`/demo/notes/${note.rkey}`" class="title">
              {{ note.title }}
            </NuxtLink>
            <span v-if="note.tag" class="tag">{{ note.tag }}</span>
            <span v-if="note.createdAt" class="meta">{{ formatDate(note.createdAt) }}</span>
            <a :href="noteUrl(account.did, note.rkey)" class="meta" target="_blank" rel="noopener">record ↗</a>
          </li>
        </ul>
        <p v-else class="demo-empty">
          Nothing published yet. Write a draft on the <NuxtLink to="/demo/drafts">
            drafts
          </NuxtLink> page and publish it.
        </p>
      </template>
      <p v-else-if="account && error" class="demo-empty">
        Couldn't load notes: {{ error.statusMessage ?? error.message }}
      </p>
      <p v-else class="demo-empty">
        Press <strong>Try it</strong> to create a sandbox account and start writing.
      </p>

      <DemoSource file="notes.get.ts" />
      <DemoSource file="collections.ts" base="shared" />
    </div>
  </DemoShell>
</template>
