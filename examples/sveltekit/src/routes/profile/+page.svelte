<script lang="ts">
  import type { ActionData, PageData } from './$types'
  import { enhance } from '$app/forms'

  let { data, form }: { data: PageData, form: ActionData } = $props()
</script>

<h1>Profile</h1>
{#if form?.message}<p>{form.message}</p>{/if}
<form method="POST" use:enhance>
  <p><input name="displayName" value={data.profile?.displayName ?? ''} placeholder="Display name" required /></p>
  <p><textarea name="bio" placeholder="Bio">{data.profile?.bio ?? ''}</textarea></p>
  <button type="submit">Save</button>
</form>
