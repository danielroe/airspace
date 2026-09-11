export default defineEventHandler(async () => {
  const airspace = await useAirspace()
  return (await airspace.profile.get())?.value ?? null
})
