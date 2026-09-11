<script setup lang="ts">
const { data: profile, error: loadError, refresh } = await useFetch('/api/demo/profile')

const displayName = ref(profile.value?.displayName ?? '')
const bio = ref(profile.value?.bio ?? '')
const busy = ref(false)
const message = ref('')
const notice = ref('')

watch(profile, (value) => {
  displayName.value = value?.displayName ?? ''
  bio.value = value?.bio ?? ''
})

async function save() {
  busy.value = true
  message.value = ''
  notice.value = ''
  try {
    await $fetch('/api/demo/profile', { method: 'PUT', body: { displayName: displayName.value, bio: bio.value } })
    await refresh()
    notice.value = 'saved'
  }
  catch (error) {
    message.value = (error as { data?: { message?: string }, message?: string }).data?.message
      ?? (error as { message?: string }).message
      ?? 'could not save the profile'
  }
  finally {
    busy.value = false
  }
}

useSeoMeta({ title: 'Profile | airspace demo' })
</script>

<template>
  <DemoShell v-slot="{ account }">
    <div class="demo-page">
      <header>
        <span class="icon" aria-hidden="true">○</span>
        <h1>Profile</h1>
        <p>One record at a <code>literal:self</code> key, so the collection is a singleton and takes no record key.</p>
      </header>

      <template v-if="account">
        <dl class="demo-props">
          <dt>handle</dt>
          <dd><code>{{ account.handle }}</code></dd>
          <dt>did</dt>
          <dd><code>{{ account.did }}</code></dd>
          <dt>record</dt>
          <dd>
            <a :href="`https://pdsls.dev/at://${account.did}/space.getair.notes.profile/self`" target="_blank" rel="noopener">view on pdsls ↗</a>
          </dd>
        </dl>

        <form class="demo-form" @submit.prevent="save">
          <h3>Edit</h3>
          <input v-model="displayName" placeholder="Display name" required>
          <textarea v-model="bio" rows="3" placeholder="Bio" />
          <footer>
            <button type="submit" :disabled="busy">
              {{ busy ? 'Saving…' : 'Save' }}
            </button>
            <p v-if="message" class="error" role="alert">
              {{ message }}
            </p>
            <p v-else-if="notice" class="ok" role="status">
              {{ notice }}
            </p>
          </footer>
        </form>
        <p v-if="loadError" class="demo-empty">
          Couldn't load the profile: {{ loadError.statusMessage ?? loadError.message }}
        </p>
      </template>
      <p v-else class="demo-empty">
        Press <strong>Try it</strong> to create a sandbox account first.
      </p>

      <DemoSource file="profile.get.ts" />
      <DemoSource file="profile.put.ts" />
    </div>
  </DemoShell>
</template>
