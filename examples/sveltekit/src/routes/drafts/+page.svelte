<script lang="ts">
  import type { ActionData, PageData } from './$types'
  import { enhance } from '$app/forms'

  let { data, form }: { data: PageData, form: ActionData } = $props()
</script>

<h1>Drafts</h1>
<p><code>{data.space}</code></p>
{#if form?.message}<p>{form.message}</p>{/if}

<form method="POST" action="?/create" enctype="multipart/form-data" use:enhance>
  <p><input name="title" placeholder="Title" required /></p>
  <p><textarea name="body" placeholder="# Markdown body"></textarea></p>
  <p>
    <select name="tag">
      <option value="">no tag</option>
      {#each data.tags as tag (tag.rkey)}<option value={tag.rkey}>{tag.name}</option>{/each}
    </select>
    <input name="newTag" placeholder="or a new tag" />
  </p>
  <p><input type="file" name="cover" accept="image/*" /></p>
  <button type="submit">Create draft</button>
</form>

{#each data.drafts as draft (draft.uri)}
  <article>
    <h2>{draft.value.title}</h2>
    {#if draft.published}
      <p>published</p>
    {:else}
      <form method="POST" action="?/publish" use:enhance>
        <input type="hidden" name="rkey" value={draft.rkey} />
        <button type="submit">Publish</button>
      </form>
    {/if}
  </article>
{/each}
