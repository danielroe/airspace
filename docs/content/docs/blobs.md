# blobs and images

Files are not stored inside records. Upload a file to your PDS, then store the reference you get back. Your PDS serves the file, so you need no object storage or CDN.

```ts
const { blob, cid, mimeType, size, aspectRatio } = await airspace.blobs.upload(file, { maxBytes: 2_000_000 })
await airspace.projects.put(rkey, { ...value, images: [{ alt: 'Screenshot', image: blob }] })

await airspace.blobs.image(project.value.images?.[0]) // { url, alt, width, height }
await airspace.blobs.image(project.value.cover) // a bare blob field works too, with an empty alt
await airspace.blobs.url(blob) // the URL alone
```

Image dimensions are read from the file header, without decoding the image. `image()` and `url()` are async, because both need the PDS URL.

In a server-rendered app, resolve images in the loader and send the result to the client. See [server-rendered frameworks](/docs/reading-and-writing#server-rendered-frameworks).
