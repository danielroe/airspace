<script setup lang="ts">
const { data } = await useFetch('/api/notes')
</script>

<template>
  <div v-if="data">
    <h1>{{ data.profile?.displayName ?? 'Notes' }}</h1>
    <p v-if="data.profile?.bio">
      {{ data.profile.bio }}
    </p>
    <ul>
      <li v-for="note in data.notes" :key="note.uri">
        <NuxtLink :to="`/notes/${note.rkey}`">
          {{ note.value.title }}
        </NuxtLink>
        <em v-if="note.related.tag"> {{ note.related.tag.value.name }}</em>
      </li>
    </ul>
  </div>
</template>
