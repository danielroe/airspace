<script setup lang="ts">
const { data: profile, error: loadError, refresh } = await useFetch('/api/demo/profile')

const displayName = ref(profile.value?.displayName ?? '')
const bio = ref(profile.value?.bio ?? '')
const busy = ref(false)
const message = ref('')
const notice = ref('')

watch(profile, (value) => {
  displayName.value = value?.displayName ?? ''
  bio.value = value?.bio ?? ''
})

async function save() {
  busy.value = true
  message.value = ''
  notice.value = ''
  try {
    await $fetch('/api/demo/profile', { method: 'PUT', body: { displayName: displayName.value, bio: bio.value } })
    await refresh()
    notice.value = 'saved'
  }
  catch (error) {
    message.value = (error as { data?: { message?: string }, message?: string }).data?.message
      ?? (error as { message?: string }).message
      ?? 'could not save the profile'
  }
  finally {
    busy.value = false
  }
}

interface Credentials {
  did: string
  handle: string
  service: string
  token: string
  expiresAt: string
  scopes: string[]
}

const credentials = ref<Credentials>()
const minting = ref(false)
const copied = ref('')
const credentialsError = ref('')

const snippet = computed(() => credentials.value
  ? [
      `import { createAirspace } from 'airspace'`,
      `import { notes, profile, tags, workspace } from './collections.ts'`,
      ``,
      `const service = '${credentials.value.service}'`,
      `const did = '${credentials.value.did}'`,
      ``,
      `export const airspace = createAirspace({`,
      `  identity: { did, service },`,
      `  collections: { notes, tags, profile },`,
      `  spaces: { workspace },`,
      `  session: {`,
      `    did,`,
      `    service,`,
      `    headers: { authorization: 'Bearer ${credentials.value.token}' },`,
      `  },`,
      `})`,
    ].join('\n')
  : '')

async function mint() {
  minting.value = true
  credentialsError.value = ''
  try {
    credentials.value = await $fetch('/api/demo/credentials', { method: 'POST' })
  }
  catch (error) {
    credentialsError.value = (error as { data?: { message?: string }, message?: string }).data?.message
      ?? (error as { message?: string }).message
      ?? 'could not issue credentials'
  }
  finally {
    minting.value = false
  }
}

async function copy(what: string, value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = what
  setTimeout(() => {
    if (copied.value === what)
      copied.value = ''
  }, 2000)
}

useSeoMeta({ title: 'Profile | airspace demo' })
</script>

<template>
  <DemoShell v-slot="{ account }">
    <div class="demo-page">
      <header>
        <span class="icon" aria-hidden="true">○</span>
        <h1>Profile</h1>
        <p>One record at a <code>literal:self</code> key, so the collection is a singleton and takes no record key.</p>
      </header>

      <template v-if="account">
        <dl class="demo-props">
          <dt>handle</dt>
          <dd><code>{{ account.handle }}</code></dd>
          <dt>did</dt>
          <dd><code>{{ account.did }}</code></dd>
          <dt>record</dt>
          <dd>
            <a :href="`https://pdsls.dev/at://${account.did}/space.getair.notes.profile/self`" target="_blank" rel="noopener">view on pdsls ↗</a>
          </dd>
        </dl>

        <form class="demo-form" @submit.prevent="save">
          <h3>Edit</h3>
          <input v-model="displayName" placeholder="Display name" required>
          <textarea v-model="bio" rows="3" placeholder="Bio" />
          <footer>
            <button type="submit" :disabled="busy">
              {{ busy ? 'Saving…' : 'Save' }}
            </button>
            <p v-if="message" class="error" role="alert">
              {{ message }}
            </p>
            <p v-else-if="notice" class="ok" role="status">
              {{ notice }}
            </p>
          </footer>
        </form>
        <p v-if="loadError" class="demo-empty">
          Couldn't load the profile: {{ loadError.statusMessage ?? loadError.message }}
        </p>

        <section class="demo-form">
          <h3>Use this account from your own app</h3>
          <p class="credentials-hint">
            The account password stays on the server. These credentials are a bearer token for a proxy that serves this demo's collections and space and nothing else, so the same records show up in your app without opening the account to the rest of the network.
          </p>
          <template v-if="credentials">
            <dl class="demo-props">
              <dt>service</dt>
              <dd><code>{{ credentials.service }}</code></dd>
              <dt>token</dt>
              <dd><code>{{ credentials.token }}</code></dd>
              <dt>expires</dt>
              <dd>{{ new Date(credentials.expiresAt).toLocaleTimeString() }}</dd>
              <dt>covers</dt>
              <dd><code>{{ credentials.scopes.join(' ') }}</code></dd>
            </dl>
            <pre class="credentials-snippet"><code>{{ snippet }}</code></pre>
          </template>
          <footer>
            <button type="button" :disabled="minting" @click="mint">
              {{ minting ? 'Issuing…' : credentials ? 'Issue new credentials' : 'Show credentials' }}
            </button>
            <template v-if="credentials">
              <button type="button" @click="copy('snippet', snippet)">
                {{ copied === 'snippet' ? 'Copied' : 'Copy snippet' }}
              </button>
              <button type="button" @click="copy('token', credentials.token)">
                {{ copied === 'token' ? 'Copied' : 'Copy token' }}
              </button>
            </template>
            <p v-if="credentialsError" class="error" role="alert">
              {{ credentialsError }}
            </p>
          </footer>
        </section>
      </template>
      <p v-else class="demo-empty">
        Press <strong>Try it</strong> to create a sandbox account first.
      </p>

      <DemoSource file="profile.get.ts" />
      <DemoSource file="profile.put.ts" />
      <DemoSource file="credentials.post.ts" />
      <DemoSource file="[method].ts" base="proxy" />
    </div>
  </DemoShell>
</template>
