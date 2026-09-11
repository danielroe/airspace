<script lang="ts">
  let { children } = $props()
</script>

<nav>
  <a href="/">notes</a> · <a href="/drafts">drafts</a> · <a href="/profile">profile</a>
</nav>
{@render children()}

<style>
  :global(body) { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 40rem; line-height: 1.5; }
  nav { margin-bottom: 2rem; }
</style>
