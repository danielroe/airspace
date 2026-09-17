<script setup lang="ts">
import { MarkdownDocument } from '@comark/vue/components/MarkdownDocument'

const { file, base = 'route' } = defineProps<{ file: string, base?: 'route' | 'shared' | 'proxy' }>()

const dirs = { route: 'server/api/demo/', shared: '', proxy: 'server/routes/xrpc/' }

const open = ref(false)
const { data: source, execute } = await useFetch('/api/demo/source', {
  query: { file, base },
  immediate: false,
})

watch(open, () => open.value && execute())
</script>

<template>
  <details class="demo-source" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>How this page is rendered: <code>{{ `${dirs[base]}${file}` }}</code></summary>
    <MarkdownDocument v-if="source" :value="source" />
  </details>
</template>
