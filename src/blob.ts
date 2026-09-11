import type { Client } from '@atproto/lex-client'
import type { BlobRef } from '@atproto/lex-data'
import type { DidString, Plain } from './types.ts'
import { lexToJson } from '@atproto/lex-json'
import { AirspaceError } from './errors.ts'

/** CID from a blob ref in any encoding: lex, IPLD-JSON (`$link`), DAG-JSON (`/`) or legacy `{ cid }`. */
export function cidFromBlob(blob: unknown): string | null {
  if (!blob || typeof blob !== 'object')
    return null
  const b = blob as Record<string, unknown>
  const ref = b.ref ?? b.cid
  if (!ref)
    return null
  if (typeof ref === 'string')
    return ref
  if (typeof ref === 'object') {
    const r = ref as Record<string, unknown>
    if (typeof r.$link === 'string')
      return r.$link
    if (typeof r['/'] === 'string')
      return r['/']
    const s = String(ref)
    if (s && s !== '[object Object]')
      return s
  }
  return null
}

export function blobUrl(service: string, did: DidString, cid: string): string {
  return `${service.replace(/\/$/, '')}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

export type BlobInput = Blob | Uint8Array | ArrayBuffer

export interface UploadBlobOptions {
  mimeType?: string
  maxBytes?: number
}

export interface UploadedBlob {
  /** Embed this in a record's blob field. Plain JSON. */
  blob: Plain<BlobRef>
  cid: string
  mimeType: string
  size: number
  /** Read from the image header when possible. */
  aspectRatio?: { width: number, height: number }
}

async function toBytes(input: BlobInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array)
    return input
  if (input instanceof ArrayBuffer)
    return new Uint8Array(input)
  return new Uint8Array(await input.arrayBuffer())
}

/** Upload to the PDS. */
export async function uploadBlob(client: Client, input: BlobInput, options: UploadBlobOptions = {}): Promise<UploadedBlob> {
  const bytes = await toBytes(input)
  const mimeType = options.mimeType ?? ((input instanceof Blob && input.type) || 'application/octet-stream')
  if (options.maxBytes !== undefined && bytes.byteLength > options.maxBytes) {
    throw new AirspaceError(`blob is ${bytes.byteLength} bytes, over the ${options.maxBytes} byte limit`)
  }
  const res = await client.uploadBlob(bytes, { encoding: mimeType as `${string}/${string}` })
  const blob = res.body.blob
  return {
    blob: lexToJson(blob) as Plain<BlobRef>,
    cid: cidFromBlob(blob)!,
    mimeType,
    size: bytes.byteLength,
    ...await imageDimensions(bytes, mimeType),
  }
}

async function imageDimensions(bytes: Uint8Array, mimeType: string): Promise<Pick<UploadedBlob, 'aspectRatio'>> {
  if (!mimeType.startsWith('image/'))
    return {}
  try {
    const { imageMeta } = await import('image-meta')
    const { width, height } = imageMeta(bytes)
    return width && height ? { aspectRatio: { width, height } } : {}
  }
  catch {
    return {}
  }
}
