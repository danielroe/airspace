# blobs and images

```ts
const { blob, cid, mimeType, size, aspectRatio } = await airspace.blobs.upload(file, { maxBytes: 2_000_000 })
await airspace.projects.put(rkey, { ...value, images: [{ alt: 'Screenshot', image: blob }] })

await airspace.blobs.image(project.value.images?.[0]) // { url, alt, width, height }
await airspace.blobs.image(project.value.cover) // a bare blob field works too, with an empty alt
```

Image dimensions come from the file header, without decoding; the parser only loads when you call `upload()`. The token values of a `community.lexicon.app.defs` array live on the generated constants: `community.lexicon.app.defs.purposeScreenshot.value`.

`airspace.blobs.url(blob)` is async, since it needs the resolved PDS URL.
