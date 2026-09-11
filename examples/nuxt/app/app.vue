<script setup lang="ts">
</script>

<template>
  <div>
    <nav>
      <NuxtLink to="/">
        notes
      </NuxtLink>
      ·
      <NuxtLink to="/drafts">
        drafts
      </NuxtLink>
      ·
      <NuxtLink to="/profile">
        profile
      </NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>

<style>
body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 40rem; line-height: 1.5; }
nav { margin-bottom: 2rem; }
img { max-width: 100%; height: auto; }
</style>
