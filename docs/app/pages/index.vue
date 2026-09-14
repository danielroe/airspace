<script setup lang="ts">
import { MarkdownDocument } from '@comark/vue/components/MarkdownDocument'
import { packageUrl, repositoryUrl, siteDescription, siteName, siteUrl } from '#shared/site'

const [{ data: model }, { data: site }] = await Promise.all([
  useFetch('/api/content/sample-model'),
  useFetch('/api/content/sample-site'),
])

useSeoMeta({
  title: 'airspace: the database you already have',
  description: 'A fully-typed, atproto-native data toolkit, turning your PDS into your content layer.',
  ogTitle: 'airspace',
  ogDescription: 'The database you already have.',
  ogUrl: `${siteUrl}/`,
  ogImage: `${siteUrl}/og.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'airspace: the database you already have',
  ogType: 'website',
})

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      'name': siteName,
      'alternateName': 'airspace for atproto',
      'applicationCategory': 'DeveloperApplication',
      'operatingSystem': 'Node.js 22+',
      'description': siteDescription,
      'url': siteUrl,
      'downloadUrl': packageUrl,
      'codeRepository': repositoryUrl,
      'license': 'https://opensource.org/licenses/MIT',
      'sameAs': [repositoryUrl, packageUrl],
      'author': { '@type': 'Person', 'name': 'Daniel Roe', 'url': 'https://roe.dev' },
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    }),
  }],
})
</script>

<template>
  <div class="landing">
    <section class="hero">
      <h1>the database you already&nbsp;have.</h1>

      <p class="lede">
        every <s>Bluesky</s> <span>atmosphere</span> account comes with a personal data server: a cms, login, file storage and a
        public API that you own.
      </p>

      <p class="cta">
        <NuxtLink to="/demo" class="button primary">
          try the demo
        </NuxtLink>
        <NuxtLink to="/docs" class="button">
          get started
        </NuxtLink>
      </p>

      <p class="install">
        <code>pnpm add airspace</code>
        <span>Node 22+</span>
      </p>
    </section>

    <section class="bench">
      <div class="pane">
        <h2>define a model</h2>
        <p>lexicons in TypeScript, in your own namespace.</p>
        <MarkdownDocument v-if="model" :value="model.document" />
      </div>
      <div class="pane">
        <h2>access your data</h2>
        <p>a fully typed client over your repo and your drafts.</p>
        <MarkdownDocument v-if="site" :value="site.document" />
      </div>
    </section>

    <section class="spec">
      <h2>what you get</h2>
      <dl>
        <div>
          <dt>you own your data</dt>
          <dd>Records live in your own repo under your own schema. Switch tools or hosts &ndash; or even stop using airspace &ndash; and everything still works.</dd>
        </div>
        <div>
          <dt>no database to run</dt>
          <dd>Reads, writes, auth and images are all handled by your own PDS. airspace is a typed client.</dd>
        </div>
        <div>
          <dt>drafts built in</dt>
          <dd>Experimental permissioned spaces for private data, with a single call to publish.</dd>
        </div>
        <div>
          <dt>typed from your schema</dt>
          <dd>Define the model once. Records, keys, joins and OAuth scopes are inferred magically. ✨</dd>
        </div>
      </dl>
    </section>

    <section class="strip">
      <h2>works with what exists</h2>
      <p>airspace manages any collection you have a lexicon for, not only the ones you wrote.</p>
      <ul>
        <li>
          <a href="https://whtwnd.com"><code>com.whtwnd.blog.entry</code></a>
          <span>WhiteWind posts, drafted in a space and published to your public repo.</span>
        </li>
        <li>
          <a href="https://standard.site"><code>site.standard.*</code></a>
          <span>Publications and documents, read from a live repo.</span>
        </li>
        <li>
          <a href="https://github.com/lexicon-community/lexicon"><code>community.lexicon.calendar.*</code></a>
          <span>Events and RSVPs, joined across two accounts.</span>
        </li>
        <li>
          <code>your.own.lexicon</code>
          <span>Written with <NuxtLink to="/docs/model"><code>defineLexicons</code></NuxtLink>, or brought in as JSON.</span>
        </li>
      </ul>
      <p class="note">
        Nothing in your repo carries an airspace <code>$type</code> or is proprietary to airspace.
      </p>
    </section>

    <section class="close">
      <h2>if you already know atproto</h2>
      <p>
        airspace sits between
        <a href="https://www.npmjs.com/package/@atproto/lex-schema"><code>@atproto/lex-schema</code></a>
        and your site.
      </p>
      <p>
        Lexicons are TypeScript, and your public repo and your
        <a href="https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data">permissioned spaces</a>
        share one typed API. <code>airspace lexicons emit</code> writes the JSON when you want to publish your
        schemas. airspace itself defines no content model, renders nothing and hosts nothing.
      </p>
    </section>
  </div>
</template>

<style scoped>
.landing section {
  margin-block: var(--space-3xl);
}

s {
  color: var(--color-ink-2);
}

s + span {
  color: var(--color-ink);
}

.hero {
  margin-block: var(--space-xl) var(--space-3xl);
}

.hero h1 {
  font-size: var(--text-display);
  line-height: 1.02;
  letter-spacing: -0.035em;
  margin: 0;
  max-width: 9em;
  text-wrap: balance;
}

.lede {
  font-size: var(--text-lg);
  color: var(--color-ink-2);
  max-width: 26em;
  margin: var(--space-md) 0 0;
  text-wrap: pretty;
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
  margin: var(--space-lg) 0 0;
}

.install {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2xs) var(--space-xs);
  margin: var(--space-md) 0 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.install code {
  font-size: var(--text-sm);
  padding: 0.3rem 0.7rem;
}

.bench {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-lg);
  border-block: var(--rule);
  padding-block: var(--space-lg);
}

.pane h2,
.spec h2,
.strip h2,
.close h2 {
  border: 0;
  padding: 0;
  margin: 0 0 var(--space-sm);
  font-size: var(--text-2xl);
}

.pane > p {
  margin: 0 0 var(--space-sm);
  font-size: var(--text-sm);
  color: var(--color-ink-2);
}

.pane :deep(pre) {
  margin: 0 0 var(--space-xs);
  font-size: var(--text-xs);
}

.pane :deep(pre:last-child) {
  margin-bottom: 0;
}

.pane h2,
.spec h2,
.strip h2,
.spec dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  margin: var(--space-md) 0 0;
}

.spec dl > div {
  padding-block: var(--space-sm);
  border-top: var(--rule);
}

.spec dt {
  font-weight: 600;
}

.spec dd {
  margin: var(--space-3xs) 0 0;
  color: var(--color-ink-2);
  max-width: 23em;
  text-wrap: pretty;
}

.strip ul {
  list-style: none;
  padding: 0;
  margin: var(--space-md) 0 0;
  display: grid;
  gap: 0;
}

.strip li {
  display: grid;
  gap: var(--space-3xs);
  padding-block: var(--space-xs);
  border-top: var(--rule);
  font-size: var(--text-sm);
}

.strip li span {
  color: var(--color-ink-2);
}

.strip li > code {
  justify-self: start;
}

.strip .note,
.close p {
  color: var(--color-ink-2);
  max-width: var(--measure-wide);
  text-wrap: pretty;
}

.strip .note {
  margin-top: var(--space-sm);
  font-size: var(--text-sm);
}

@media (min-width: 52rem) {
  .bench {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-xl);
  }

  .spec dl,
  .strip ul {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: var(--space-xl);
  }

  .strip li {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
