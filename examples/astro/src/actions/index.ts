import { parseAtUri } from 'airspace'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'

import { useAirspace } from '../lib/airspace.ts'

export const server = {
  draft: defineAction({
    accept: 'form',
    input: z.object({
      title: z.string().min(1),
      body: z.string().default(''),
      tag: z.string().optional(),
      newTag: z.string().optional(),
      cover: z.instanceof(File).optional(),
    }),
    async handler({ title, body, tag, newTag, cover }) {
      const airspace = await useAirspace()
      const ref = newTag?.trim()
        ? await airspace.workspace.tags.create({ name: newTag.trim() })
        : tag
          ? await airspace.workspace.tags.get(tag)
          : null
      const uploaded = cover?.size ? await airspace.blobs.upload(cover) : undefined
      const draft = await airspace.workspace.notes.create({
        title,
        body,
        tag: ref ? { uri: ref.uri, cid: ref.cid } : undefined,
        cover: uploaded?.blob,
      })
      return { uri: draft.uri }
    },
  }),

  publish: defineAction({
    accept: 'form',
    input: z.object({ rkey: z.string().min(1) }),
    async handler({ rkey }) {
      const airspace = await useAirspace()
      const draft = await airspace.workspace.notes.get(rkey)
      if (!draft)
        throw new ActionError({ code: 'NOT_FOUND', message: `no draft ${rkey}` })

      const tagRkey = draft.value.tag ? parseAtUri(draft.value.tag.uri).rkey : undefined
      if (tagRkey && !(await airspace.workspace.tags.published()).includes(tagRkey))
        await airspace.workspace.tags.publish(tagRkey)

      const published = await airspace.workspace.notes.publish(rkey)
      return { uri: published.uri }
    },
  }),

  profile: defineAction({
    accept: 'form',
    input: z.object({ displayName: z.string().min(1), bio: z.string().optional() }),
    async handler({ displayName, bio }) {
      const airspace = await useAirspace()
      await airspace.profile.put({ displayName, bio: bio || undefined })
      return { displayName }
    },
  }),
}
