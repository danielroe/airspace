<script setup lang="ts">
const { data: account, refresh } = await useFetch('/api/demo/session')

type Task = 'start' | 'reset' | 'signOut' | null
const task = ref<Task>(null)
const error = ref('')

const steps = ['asking the PDS for an account', 'signing in', 'writing a profile and two tags']
const step = ref(0)

async function run(name: Exclude<Task, null>, action: () => Promise<unknown>) {
  task.value = name
  error.value = ''
  step.value = 0
  const advance = () => {
    step.value = Math.min(step.value + 1, steps.length - 1)
  }
  const ticker = name === 'start' ? setInterval(advance, 1500) : undefined
  try {
    await action()
    await refresh()
    await refreshNuxtData()
  }
  catch (cause) {
    const detail = cause as { data?: { message?: string }, message?: string }
    error.value = detail.data?.message ?? detail.message ?? 'something went wrong'
  }
  finally {
    clearInterval(ticker)
    task.value = null
  }
}

const start = () => run('start', () => $fetch('/api/demo/session', { method: 'POST' }))
const signOut = () => run('signOut', () => $fetch('/api/demo/session', { method: 'DELETE' }))
const reset = () => run('reset', () => $fetch('/api/demo/reset', { method: 'POST' }))

const busy = computed(() => task.value !== null)
const repoUrl = computed(() => account.value ? `https://pdsls.dev/at://${account.value.did}` : '')
</script>

<template>
  <div class="demo">
    <aside class="side">
      <div class="who">
        <template v-if="account">
          <span class="avatar" aria-hidden="true">{{ account.handle.slice(5, 6) }}</span>
          <span class="handle">
            <strong>{{ account.handle.split('.')[0] }}</strong>
            <small>{{ account.handle.slice(account.handle.indexOf('.')) }}</small>
          </span>
        </template>
        <template v-else>
          <span class="avatar empty" aria-hidden="true" />
          <span class="handle"><strong>no account</strong><small>sandbox</small></span>
        </template>
      </div>

      <nav v-if="account" class="side-nav" aria-label="Demo">
        <NuxtLink to="/demo">
          <span aria-hidden="true">◇</span>Notes
        </NuxtLink>
        <NuxtLink to="/demo/drafts">
          <span aria-hidden="true">◐</span>Drafts
        </NuxtLink>
        <NuxtLink to="/demo/profile">
          <span aria-hidden="true">○</span>Profile
        </NuxtLink>
        <a :href="repoUrl" target="_blank" rel="noopener"><span aria-hidden="true">↗</span>Public repo on pdsls</a>
      </nav>

      <div class="side-actions">
        <template v-if="account">
          <button :disabled="busy" @click="reset">
            {{ task === 'reset' ? 'Resetting…' : 'Reset notes' }}
          </button>
          <button :disabled="busy" @click="signOut">
            {{ task === 'signOut' ? 'Signing out…' : 'Sign out' }}
          </button>
        </template>
        <template v-else>
          <button class="primary" :disabled="busy" @click="start">
            {{ task === 'start' ? 'Creating…' : 'Try it' }}
          </button>
          <p class="hint">
            Makes a throwaway account on our demo PDS and keeps its credentials in an encrypted cookie. Your own account isn't touched.
          </p>
        </template>
      </div>

      <div v-if="task === 'start'" class="progress" role="status" aria-live="polite">
        <div class="bar" aria-hidden="true">
          <span :style="{ width: `${((step + 1) / (steps.length + 1)) * 100}%` }" />
        </div>
        <p>{{ steps[step] }}…</p>
      </div>

      <p v-if="error" class="error" role="alert">
        {{ error }}
        <button class="link" :disabled="busy" @click="error = ''">
          dismiss
        </button>
      </p>
    </aside>

    <section class="page">
      <slot :account="account" :busy="busy" />
    </section>
  </div>
</template>

<style scoped>
.demo {
  display: grid;
  gap: var(--space-lg);
  align-items: start;
}

.side {
  display: grid;
  gap: var(--space-sm);
  align-content: start;
  padding: var(--space-sm);
  border: var(--rule);
  border-radius: var(--radius-md);
  background: var(--color-paper-2);
  font-size: var(--text-sm);
}

.who {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  min-width: 0;
}

.avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-accent-ink);
  font-family: var(--font-display);
  font-weight: 500;
  text-transform: uppercase;
}

.avatar.empty {
  background: transparent;
  border: 1px dashed var(--color-rule-strong);
}

.handle {
  display: grid;
  min-width: 0;
  line-height: 1.2;
}

.handle strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.handle small {
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.side-nav {
  display: grid;
  gap: 1px;
}

.side-nav a {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: 0.3rem 0.5rem;
  border-radius: var(--radius-sm);
  color: var(--color-ink-2);
  text-decoration: none;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.side-nav a span {
  width: 1.1em;
  text-align: center;
  color: var(--color-ink-2);
}

.side-nav a:hover,
.side-nav a:focus-visible {
  background: var(--color-paper);
  color: var(--color-ink);
}

.side-nav a.router-link-exact-active {
  background: var(--color-paper);
  color: var(--color-ink);
  font-weight: 500;
  box-shadow: inset 0 0 0 1px var(--color-rule);
}

.side-actions {
  display: grid;
  gap: var(--space-2xs);
  padding-top: var(--space-xs);
  border-top: var(--rule);
}

.side-actions button {
  text-align: start;
}

.side-actions .primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-ink);
  text-align: center;
}

.side-actions .primary:hover:not(:disabled) {
  background: color-mix(in oklch, var(--color-accent) 88%, var(--color-ink));
}

.hint {
  margin: 0;
  color: var(--color-ink-2);
  font-size: var(--text-xs);
  text-wrap: pretty;
}

.progress {
  display: grid;
  gap: var(--space-3xs);
}

.progress p {
  margin: 0;
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.bar {
  position: relative;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-rule);
}

.bar span {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width 600ms var(--ease-out);
}

.bar span::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, oklch(100% 0 0 / 0.5), transparent);
  animation: shimmer 1.2s infinite;
}

@keyframes shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

.error {
  margin: 0;
  padding: var(--space-2xs) var(--space-xs);
  border: 1px solid oklch(60% 0.16 25 / 0.5);
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, oklch(60% 0.16 25) 8%, var(--color-paper));
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

.error .link {
  margin-inline-start: var(--space-3xs);
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-ink-2);
  font-size: inherit;
  text-decoration: underline;
}

.page {
  min-width: 0;
}

@media (min-width: 52rem) {
  .demo {
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: var(--space-2xl);
  }

  .side {
    position: sticky;
    top: 2rem;
  }
}
</style>
