import type { Actions, PageServerLoad } from './$types'
import { useAirspace } from '$lib/airspace.server.ts'
import { fail } from '@sveltejs/kit'
import { parseAtUri, ValidationError } from 'airspace'

export const load: PageServerLoad = async () => {
  const airspace = await useAirspace()
  const [drafts, live, tags] = await Promise.all([
    airspace.workspace.notes.list(),
    airspace.workspace.notes.published(),
    airspace.workspace.tags.list(),
  ])

  return {
    space: await airspace.workspace.uri(),
    drafts: drafts.map(draft => ({ ...draft, published: live.includes(draft.rkey) })),
    tags: tags.map(tag => ({ rkey: tag.rkey, name: tag.value.name })),
  }
}

export const actions: Actions = {
  async create({ request }) {
    const form = await request.formData()
    const airspace = await useAirspace()

    const newTag = String(form.get('newTag') ?? '').trim()
    const tagRkey = String(form.get('tag') ?? '')
    const tag = newTag
      ? await airspace.workspace.tags.create({ name: newTag })
      : tagRkey
        ? await airspace.workspace.tags.get(tagRkey)
        : null

    const file = form.get('cover')
    const cover = file instanceof File && file.size ? (await airspace.blobs.upload(file)).blob : undefined

    const value = {
      title: String(form.get('title') ?? '').trim(),
      body: String(form.get('body') ?? ''),
      tag: tag ? { uri: tag.uri, cid: tag.cid } : undefined,
      cover,
    }
    try {
      await airspace.workspace.notes.create(value)
    }
    catch (err) {
      if (err instanceof ValidationError)
        return fail(400, { message: err.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ') })
      throw err
    }
    return { message: `Draft "${value.title}" created in the space` }
  },

  async publish({ request }) {
    const form = await request.formData()
    const rkey = String(form.get('rkey') ?? '')
    if (!rkey)
      return fail(400, { message: 'rkey is required' })

    const airspace = await useAirspace()
    const draft = await airspace.workspace.notes.get(rkey)
    const tagRkey = draft?.value.tag ? parseAtUri(draft.value.tag.uri).rkey : undefined
    if (tagRkey && !(await airspace.workspace.tags.published()).includes(tagRkey))
      await airspace.workspace.tags.publish(tagRkey)

    const { uri } = await airspace.workspace.notes.publish(rkey)
    return { message: `Published to ${uri}` }
  },
}
