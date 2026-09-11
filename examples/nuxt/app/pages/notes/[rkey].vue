<script setup lang="ts">
import { Markdown } from '@comark/vue'

const route = useRoute()
const { data } = await useFetch(`/api/notes/${route.params.rkey}`)
</script>

<template>
  <article v-if="data">
    <h1>{{ data.note.value.title }}</h1>
    <p v-if="data.tag">
      tagged {{ data.tag }}
    </p>
    <img v-if="data.cover" :src="data.cover" :alt="data.note.value.title">
    <Markdown v-if="data.note.meta.markdown" :value="data.note.meta.markdown" />
  </article>
</template>
