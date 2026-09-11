export default defineEventHandler(async (event) => {
  const airspace = await useAirspace()
  const body = await readBody<{ displayName: string, bio?: string }>(event)
  return await airspace.profile.put({ displayName: body.displayName, bio: body.bio || undefined })
})
