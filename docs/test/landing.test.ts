import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { landingMarkdown } from '../shared/site.ts'

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const samples = { model: read('../content/sample-model.md'), site: read('../content/sample-site.md') }

/** Lowercased, punctuation-light text, so that markdown syntax and HTML markup compare equal. */
function normalise(text: string) {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&ndash;', ',')
    .replaceAll('&middot;', ' ')
    .replaceAll(/[`*~#]/g, '')
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/ ([,.])/g, '$1')
    .toLowerCase()
    .trim()
}

/** The prose of the landing page template, one entry per block element. */
function landingProse() {
  const template = read('../app/pages/index.vue').match(/<template>([\s\S]+?)<\/template>/)![1]!
  return template
    .replaceAll(/<\/(?:p|dd|dt|li|span|h1|h2|a|code)>/g, '\n')
    .replaceAll(/<[^>]+>/g, '')
    .split('\n')
    .map(line => normalise(line).replace(/^[,.]\s*/, ''))
    .filter(line => line.length > 24)
}

describe('landing page', () => {
  it('should say the same things in markdown as in html', () => {
    const markdown = normalise(landingMarkdown(samples))
    const prose = landingProse()

    expect(prose.length).toBeGreaterThan(10)
    for (const line of prose)
      expect(markdown).toContain(line)
  })

  it('should carry the code samples the page renders', () => {
    const markdown = landingMarkdown(samples)
    expect(markdown).toContain(samples.model.trim())
    expect(markdown).toContain(samples.site.trim())
  })
})
