import type { DocsPage } from './docs-nav.ts'
import { docsPages } from './docs-nav.ts'

export const siteUrl = 'https://getair.space'
export const siteName = 'airspace'
export const siteDescription = 'A fully-typed, atproto-native CMS toolkit, turning your PDS into your content layer.'
export const repositoryUrl = 'https://github.com/danielroe/airspace'
export const packageUrl = 'https://www.npmjs.com/package/airspace'

const renderedRoutes = [/^\/demo(\/|$)/, /^\/api\//, /^\/_/]

function quality(header: string | null | undefined, type: string): number {
  let best = 0
  for (const part of header?.split(',') ?? []) {
    const [media, ...parameters] = part.split(';').map(segment => segment.trim())
    if (media?.toLowerCase() !== type)
      continue
    const q = parameters.find(parameter => parameter.startsWith('q='))?.slice(2)
    best = Math.max(best, q === undefined ? 1 : Number.parseFloat(q) || 0)
  }
  return best
}

/** Whether a request asked for markdown over HTML, per {@link https://acceptmarkdown.com}. */
export function prefersMarkdown(header: string | null | undefined): boolean {
  const markdown = Math.max(quality(header, 'text/markdown'), quality(header, 'text/x-markdown'))
  return markdown > 0 && markdown >= quality(header, 'text/html')
}

/** Whether the client can render the HTML error page, as browsers can and command-line agents mostly cannot. */
export function acceptsHtml(header: string | null | undefined): boolean {
  return quality(header, 'text/html') > 0
}

export interface MarkdownRoute {
  path: string
  markdownPath: string
  page?: DocsPage
}

/** Every page with a markdown variant: the landing page, and each docs page. */
export const documentRoutes: MarkdownRoute[] = [
  { path: '/', markdownPath: '/index.md' },
  ...docsPages.map(page => ({ path: page.path, markdownPath: `${page.path}.md`, page })),
]

/** Resolve a request path to the document it serves, asked for as either `/docs/spaces` or `/docs/spaces.md`. */
export function markdownRouteFor(pathname: string): MarkdownRoute | undefined {
  let path = pathname.replace(/\.md$/, '')
  if (path.length > 1)
    path = path.replace(/\/$/, '')
  if (path === '' || path === '/index')
    path = '/'
  return documentRoutes.find(route => route.path === path)
}

/** Whether a path is served by the app, or is a file request, and so is not a missing page. */
export function isKnownRoute(pathname: string): boolean {
  if (markdownRouteFor(pathname) || renderedRoutes.some(pattern => pattern.test(pathname)))
    return true
  const file = pathname.split('/').pop() || ''
  return file.includes('.') && !file.endsWith('.md')
}

export function notFoundMarkdown(pathname: string): string {
  return `# 404 · ${siteName}

\`${pathname}\` does not exist on ${siteUrl}.

Where to look next:

- [Documentation index](${siteUrl}/docs): every page is also available as markdown at the same URL with \`.md\` appended, or with \`Accept: text/markdown\`.
- [llms.txt](${siteUrl}/llms.txt): the machine-readable map of this site.
- [sitemap.xml](${siteUrl}/sitemap.xml): every indexable URL.
- [Source and issues](${repositoryUrl})
`
}

/** The landing page as markdown, section for section, given the code samples it renders. */
export function landingMarkdown(samples: { model: string, site: string }): string {
  return `# ${siteName}: the database you already have.

every ~~Bluesky~~ atmosphere account comes with a personal data server: a cms, login, file storage and a
public API that you own.

- [try the demo](${siteUrl}/demo)
- [get started](${siteUrl}/docs)

\`\`\`sh
pnpm add airspace
\`\`\`

Node 22+

## define a model

lexicons in TypeScript, in your own namespace.

${samples.model.trim()}

## access your data

a fully typed client over your repo and your drafts.

${samples.site.trim()}

## what you get

- **you own your data.** Records live in your own repo under your own schema. Switch tools or hosts, or even stop using airspace, and everything still works.
- **no database to run.** Reads, writes, auth and images are all handled by your own PDS. airspace is a typed client.
- **drafts built in.** Experimental permissioned spaces for private data, with a single call to publish.
- **typed from your schema.** Define the model once. Records, keys, joins and OAuth scopes are inferred magically. ✨

## works with what exists

airspace manages any collection you have a lexicon for, not only the ones you wrote.

- [\`com.whtwnd.blog.entry\`](https://whtwnd.com): WhiteWind posts, drafted in a space and published to your public repo.
- [\`site.standard.*\`](https://standard.site): Publications and documents, read from a live repo.
- [\`community.lexicon.calendar.*\`](https://github.com/lexicon-community/lexicon): Events and RSVPs, joined across two accounts.
- \`your.own.lexicon\`: Written with [\`defineLexicons\`](${siteUrl}/docs/model), or brought in as JSON.

Nothing in your repo carries an airspace \`$type\` or is proprietary to airspace.

## if you already know atproto

airspace sits between [\`@atproto/lex-schema\`](https://www.npmjs.com/package/@atproto/lex-schema) and your site.

Lexicons are TypeScript, and your public repo and your [permissioned spaces](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data)
share one typed API. \`airspace lexicons emit\` writes the JSON when you want to publish your
schemas. airspace itself defines no content model, renders nothing and hosts nothing.

## docs

${docsPages.map(page => `- [${page.title}](${siteUrl}${page.path})`).join('\n')}

## elsewhere

- [interactive demo](${siteUrl}/demo)
- [source and issues](${repositoryUrl})
- [\`airspace\` on npm](${packageUrl})
`
}

export function buildLlmsTxt(): string {
  return `# ${siteName}

> ${siteDescription}

\`airspace\` turns an atproto personal data server into your content layer: lexicons written in
TypeScript, typed reads and writes, experimental permissioned spaces for drafts, blobs, plugins and
OAuth scopes inferred from your model.

Every page on this site is available as markdown: append \`.md\` to the URL, or send
\`Accept: text/markdown\`.

## Docs

${docsPages.map(page => `- [${page.title}](${siteUrl}${page.path}.md)`).join('\n')}

## Optional

- [Interactive demo](${siteUrl}/demo): a notes app running against a live PDS.
- [Source and issues](${repositoryUrl}): the \`airspace\` repository on GitHub.
- [\`airspace\` on npm](${packageUrl}): installation and release history.
`
}

export function buildRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`
}

export function buildSitemap(): string {
  const paths = ['/', ...docsPages.map(page => page.path)]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(path => `  <url><loc>${siteUrl}${path}</loc></url>`).join('\n')}
</urlset>
`
}
