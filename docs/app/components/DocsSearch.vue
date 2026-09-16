<script setup lang="ts">
import '@pagefind/default-ui/css/ui.css'

const isDevelopment = import.meta.dev
const baseURL = useRuntimeConfig().app.baseURL

const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const search = useTemplateRef<HTMLElement>('search')
const isApplePlatform = ref(false)
const isLoading = ref(false)
const loadFailed = ref(false)

let initialized = false

function pagefindBundlePath() {
  return `${baseURL.replace(/\/$/, '')}/pagefind/`
}

async function loadSearch() {
  if (isDevelopment || initialized || isLoading.value)
    return

  isLoading.value = true
  loadFailed.value = false

  try {
    await nextTick()
    const { PagefindUI } = await import('@pagefind/default-ui')
    if (!search.value)
      return

    new PagefindUI({
      element: search.value,
      bundlePath: pagefindBundlePath(),
      showImages: false,
      showSubResults: true,
      autofocus: true,
    })
    initialized = true
  }
  catch {
    loadFailed.value = true
  }
  finally {
    isLoading.value = false
  }
}

async function open() {
  if (!dialog.value?.open)
    dialog.value?.showModal()

  document.body.classList.add('docs-search-open')
  await loadSearch()
}

function close() {
  dialog.value?.close()
}

function onSearchClick(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('a[href]'))
    close()
}

function onClose() {
  document.body.classList.remove('docs-search-open')
  trigger.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    dialog.value?.open ? close() : open()
  }
}

onMounted(() => {
  isApplePlatform.value = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.body.classList.remove('docs-search-open')
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="docs-search">
    <button
      ref="trigger"
      type="button"
      class="docs-search-trigger"
      aria-haspopup="dialog"
      aria-controls="docs-search-dialog"
      aria-keyshortcuts="Control+K Meta+K"
      @click="open"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
      </svg>
      <span class="docs-search-label">Search docs</span>
      <kbd aria-hidden="true">{{ isApplePlatform ? '⌘' : 'Ctrl' }} K</kbd>
    </button>

    <dialog
      id="docs-search-dialog"
      ref="dialog"
      aria-labelledby="docs-search-title"
      @click.self="close"
      @close="onClose"
    >
      <div class="docs-search-panel">
        <header class="docs-search-header">
          <div>
            <p class="docs-search-rubric">
              airspace documentation
            </p>
            <h2 id="docs-search-title">
              Search docs
            </h2>
          </div>
          <button type="button" class="docs-search-close" aria-label="Close search" @click="close">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <p v-if="isDevelopment" class="docs-search-message" role="status">
          Search is unavailable during development. Build or preview the docs to search the generated index.
        </p>
        <p v-else-if="loadFailed" class="docs-search-message" role="alert">
          The search index could not be loaded. Please try again after rebuilding the docs.
        </p>
        <div v-else class="docs-search-results" @click="onSearchClick">
          <p v-if="isLoading" class="docs-search-loading" role="status">
            Loading search…
          </p>
          <div ref="search" aria-label="Documentation search results" />
        </div>
      </div>
    </dialog>
  </div>
</template>

<style>
body.docs-search-open {
  overflow: hidden;
}

.docs-search {
  display: contents;
}

.docs-search-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  margin: -0.25rem -0.4rem;
  padding: 0.25rem 0.4rem;
  border: 0;
  background: transparent;
  color: var(--color-ink-2);
  font-weight: 400;
  line-height: inherit;
  white-space: nowrap;
}

.docs-search-trigger:hover {
  background: var(--color-paper-2);
  color: var(--color-ink);
}

.docs-search-trigger svg {
  width: 1.05rem;
  height: 1.05rem;
}

.docs-search-trigger kbd {
  padding: 0.06rem 0.3rem;
  border: var(--rule);
  border-radius: var(--radius-xs);
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1.25;
}

.docs-search dialog {
  width: min(42rem, calc(100% - 2rem));
  max-height: min(43rem, calc(100dvh - 4rem));
  margin: 4rem auto;
  padding: 0;
  overflow: hidden;
  border: var(--rule-strong);
  border-radius: var(--radius-md);
  background: var(--color-paper);
  color: var(--color-ink);
  box-shadow: 0 1.5rem 4rem color-mix(in oklch, var(--color-ink) 25%, transparent);
}

.docs-search dialog::backdrop {
  background: color-mix(in oklch, var(--color-ink) 32%, transparent);
  backdrop-filter: blur(0.2rem);
}

.docs-search-panel {
  display: grid;
  max-height: inherit;
  overflow: auto;
  padding: var(--space-md);
}

.docs-search-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.docs-search-header h2,
.docs-search-rubric {
  margin: 0;
}

.docs-search-header h2 {
  font-size: var(--text-xl);
}

.docs-search-rubric {
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.docs-search-close {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  place-items: center;
  border-color: transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--color-ink-2);
  font-size: var(--text-xl);
  line-height: 1;
}

.docs-search-close:hover {
  background: var(--color-paper-2);
  color: var(--color-ink);
}

.docs-search-message {
  margin: 0;
  padding: var(--space-lg) var(--space-md);
  border: 1px dashed var(--color-rule-strong);
  border-radius: var(--radius-md);
  color: var(--color-ink-2);
  text-align: center;
  text-wrap: pretty;
}

.docs-search-loading {
  margin: 0 0 var(--space-sm);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.docs-search-results {
  --pagefind-ui-primary: var(--color-accent);
  --pagefind-ui-text: var(--color-ink);
  --pagefind-ui-font: var(--font-body);
  --pagefind-ui-background: var(--color-paper);
  --pagefind-ui-border: var(--color-rule);
  --pagefind-ui-tag: var(--color-accent-wash);
  --pagefind-ui-border-width: 1px;
  --pagefind-ui-border-radius: var(--radius-sm);
  --pagefind-ui-scale: 0.9;
}

.docs-search-results .pagefind-ui__search-input {
  color: var(--color-ink);
}

.docs-search-results .pagefind-ui__search-input:focus {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--color-focus) 25%, transparent);
  outline: 0;
}

.docs-search-results .pagefind-ui__result-link {
  color: var(--color-ink);
}

.docs-search-results .pagefind-ui__result-link:hover {
  color: var(--color-accent);
}

.docs-search-results .pagefind-ui__search-clear {
  padding-inline: calc(0.5rem * var(--pagefind-ui-scale));
}

.docs-search-results mark {
  background: var(--color-accent-wash);
  color: inherit;
  font-weight: 600;
}

@media (max-width: 42rem) {
  .docs-search-label,
  .docs-search-trigger kbd {
    display: none;
  }

  .docs-search dialog {
    width: 100%;
    max-height: 100dvh;
    height: 100dvh;
    margin: 0;
    border: 0;
    border-radius: 0;
  }

  .docs-search-panel {
    padding: var(--space-sm);
  }
}
</style>
