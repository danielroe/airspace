<script setup lang="ts">
const { data, refresh } = await useFetch('/api/drafts')
const form = ref<HTMLFormElement>()

async function create() {
  await $fetch('/api/drafts', { method: 'POST', body: new FormData(form.value!) })
  form.value!.reset()
  await refresh()
}

async function publish(rkey: string) {
  await $fetch(`/api/drafts/${rkey}/publish`, { method: 'POST' })
  await refresh()
}
</script>

<template>
  <div v-if="data">
    <h1>Drafts</h1>
    <form ref="form" @submit.prevent="create">
      <p><input name="title" placeholder="Title" required></p>
      <p><textarea name="body" placeholder="# Markdown body" /></p>
      <p>
        <select name="tag">
          <option value="">
            no tag
          </option>
          <option v-for="tag in data.tags" :key="tag.rkey" :value="tag.rkey">
            {{ tag.name }}
          </option>
        </select>
        <input name="newTag" placeholder="or a new tag">
      </p>
      <p><input type="file" name="cover" accept="image/*"></p>
      <button type="submit">
        Create draft
      </button>
    </form>

    <article v-for="draft in data.drafts" :key="draft.uri">
      <h2>{{ draft.value.title }}</h2>
      <p v-if="draft.published">
        published
      </p>
      <button v-else @click="publish(draft.rkey)">
        Publish
      </button>
    </article>
  </div>
</template>
