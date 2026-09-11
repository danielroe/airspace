<script lang="ts">
  import type { PageData } from './$types'
  import { Markdown } from '@comark/svelte'

  let { data }: { data: PageData } = $props()
</script>

<h1>{data.note.value.title}</h1>
{#if data.tag}<p>tagged {data.tag}</p>{/if}
{#if data.cover}<img src={data.cover} alt={data.note.value.title} />{/if}
{#if data.note.meta.markdown}<Markdown value={data.note.meta.markdown} />{/if}
<p><a href="/">back</a></p>

<style>
  img { max-width: 100%; height: auto; }
</style>
