<script setup lang="ts">
const { data } = await useFetch('/api/profile')
const displayName = ref(data.value?.displayName ?? '')
const bio = ref(data.value?.bio ?? '')
const saved = ref(false)

async function save() {
  await $fetch('/api/profile', { method: 'PUT', body: { displayName: displayName.value, bio: bio.value } })
  saved.value = true
}
</script>

<template>
  <form @submit.prevent="save">
    <h1>Profile</h1>
    <p><input v-model="displayName" placeholder="Display name" required></p>
    <p><textarea v-model="bio" placeholder="Bio" /></p>
    <button type="submit">
      Save
    </button>
    <p v-if="saved">
      Saved
    </p>
  </form>
</template>
