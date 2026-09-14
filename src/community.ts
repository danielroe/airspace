/** `community.lexicon.app.defs#image` */
export interface ImageLike {
  alt?: string
  uri?: string
  image?: unknown
  purpose?: string
  aspectRatio?: { width: number, height: number }
}

/** A blob ref in any of the encodings `cidFromBlob` reads. */
export interface BlobLike {
  $type?: string
  ref?: unknown
  mimeType?: string
}

/** An image def, or a bare blob field. */
export type ImageSource = ImageLike | BlobLike

export interface ResolvedImage {
  url: string
  alt: string
  width?: number
  height?: number
}

const isBlobRef = (value: object): value is BlobLike => (value as BlobLike).$type === 'blob' || ('ref' in value && !('image' in value) && !('uri' in value))

function webUrl(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null
  }
  catch {
    return null
  }
}

/** Renderable source for an image def or a bare blob, whichever of `image` or `uri` it carries. Only `https:` and `http:` sources are returned. */
export function resolveImage(source: ImageSource | undefined | null, blobUrl: (blob: unknown) => string | null): ResolvedImage | null {
  if (!source)
    return null
  const image: ImageLike = isBlobRef(source) ? { image: source } : source
  const url = image.image ? blobUrl(image.image) : webUrl(image.uri)
  if (!url)
    return null
  return {
    url,
    alt: image.alt ?? '',
    width: image.aspectRatio?.width,
    height: image.aspectRatio?.height,
  }
}
