<script setup lang="ts">
const { data, error: loadError, refresh } = await useFetch('/api/demo/drafts')

const form = ref<HTMLFormElement>()
const busy = ref(false)
const publishing = ref<string | null>(null)
const message = ref('')
const notice = ref('')

function errorMessage(error: unknown) {
  return (error as { data?: { message?: string }, message?: string }).data?.message
    ?? (error as { message?: string }).message
    ?? 'something went wrong'
}

async function create(event: Event) {
  busy.value = true
  message.value = ''
  notice.value = ''
  try {
    await $fetch('/api/demo/drafts', { method: 'POST', body: new FormData(event.target as HTMLFormElement) })
    form.value?.reset()
    notice.value = 'saved to the workspace space'
    await refresh()
  }
  catch (error) {
    message.value = errorMessage(error)
  }
  finally {
    busy.value = false
  }
}

async function publish(rkey: string) {
  publishing.value = rkey
  message.value = ''
  try {
    await $fetch(`/api/demo/drafts/${rkey}`, { method: 'POST' })
    await refresh()
  }
  catch (error) {
    message.value = errorMessage(error)
  }
  finally {
    publishing.value = null
  }
}

function pickTag(event: Event) {
  const select = event.target as HTMLSelectElement
  select.form!.tagCid.value = data.value?.tags.find(t => t.uri === select.value)?.cid ?? ''
}

useSeoMeta({ title: 'Drafts | airspace demo' })
</script>

<template>
  <DemoShell v-slot="{ account }">
    <div class="demo-page">
      <header>
        <span class="icon" aria-hidden="true">◐</span>
        <h1>Drafts</h1>
        <p>Private to this account, in a permissioned space. Publishing copies a draft into the public repo.</p>
      </header>

      <template v-if="account && data">
        <ul v-if="data.drafts.length" class="demo-rows">
          <li v-for="draft of data.drafts" :key="draft.rkey">
            <span class="title">{{ draft.title }}</span>
            <span v-if="draft.tag" class="tag">{{ draft.tag }}</span>
            <NuxtLink v-if="draft.published" :to="`/demo/notes/${draft.rkey}`" class="meta">
              published ↗
            </NuxtLink>
            <button v-else :disabled="busy || publishing !== null" @click="publish(draft.rkey)">
              {{ publishing === draft.rkey ? 'Publishing…' : 'Publish' }}
            </button>
          </li>
        </ul>
        <p v-else class="demo-empty">
          No drafts yet.
        </p>

        <form ref="form" class="demo-form" @submit.prevent="create">
          <h3>New draft</h3>
          <input name="title" placeholder="Title" required>
          <textarea name="body" rows="5" placeholder="Body, in markdown" required />
          <div class="row">
            <select name="tag" @change="pickTag">
              <option value="">
                No tag
              </option>
              <option v-for="tag of data.tags" :key="tag.uri" :value="tag.uri">
                {{ tag.name }}
              </option>
            </select>
            <input type="file" name="cover" accept="image/*">
          </div>
          <input type="hidden" name="tagCid">
          <footer>
            <button type="submit" :disabled="busy">
              {{ busy ? 'Saving…' : 'Save draft' }}
            </button>
            <p v-if="message" class="error" role="alert">
              {{ message }}
            </p>
            <p v-else-if="notice" class="ok" role="status">
              {{ notice }}
            </p>
          </footer>
        </form>
      </template>
      <p v-else-if="account && loadError" class="demo-empty">
        Couldn't load drafts: {{ loadError.statusMessage ?? loadError.message }}
      </p>
      <p v-else class="demo-empty">
        Press <strong>Try it</strong> to create a sandbox account first.
      </p>

      <DemoSource file="drafts.get.ts" />
      <DemoSource file="drafts.post.ts" />
    </div>
  </DemoShell>
</template>
