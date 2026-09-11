<script lang="ts">
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<h1>{data.profile?.displayName ?? 'Notes'}</h1>
{#if data.profile?.bio}<p>{data.profile.bio}</p>{/if}
<ul>
  {#each data.notes as note (note.uri)}
    <li>
      <a href="/notes/{note.rkey}">{note.value.title}</a>
      {#if note.related.tag}<em>{note.related.tag.value.name}</em>{/if}
    </li>
  {/each}
</ul>
