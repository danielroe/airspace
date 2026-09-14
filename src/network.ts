import { AirspaceError } from './errors.ts'

export const FETCH_TIMEOUT = 5000
const MAX_BODY = 256 * 1024

export interface ResolveOptions {
  /** Let a resolved identity live on a loopback, private or `http:` address, for a local PDS. */
  allowPrivateNetwork?: boolean
}

/** The response body as text, refusing anything over `limit` bytes. */
export async function boundedText(res: Response, limit: number = MAX_BODY): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (declared > limit)
    throw new AirspaceError(`response body is ${declared} bytes, over the ${limit} byte limit`)
  if (!res.body)
    return ''
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > limit)
        throw new AirspaceError(`response body is over the ${limit} byte limit`)
      chunks.push(value)
    }
  }
  finally {
    reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export async function boundedJson<T>(res: Response, limit: number = MAX_BODY): Promise<T> {
  return JSON.parse(await boundedText(res, limit)) as T
}

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const RESERVED_TLD = /\.(?:alt|arpa|corp|example|home|internal|intranet|invalid|lan|local|localhost|onion)$/i

/** A DNS name of at least two labels, not an address and not under a reserved TLD. */
export const isPublicHostname = (value: unknown): value is string => typeof value === 'string' && value.length <= 253 && HOSTNAME.test(value) && !RESERVED_TLD.test(value)

/** Throw unless the URL is `https:` on a public hostname, or `allowPrivateNetwork` is set. */
export function assertPublicUrl(url: URL, options: ResolveOptions = {}): void {
  if (url.username || url.password)
    throw new AirspaceError(`refusing to fetch ${url.host}: the URL carries credentials`)
  if (options.allowPrivateNetwork) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      throw new AirspaceError(`refusing to fetch ${url.href}: not an http(s) URL`)
    return
  }
  if (url.protocol !== 'https:')
    throw new AirspaceError(`refusing to fetch ${url.href}: only https is allowed; pass \`allowPrivateNetwork\` for a local PDS`)
  if (!isPublicHostname(url.hostname))
    throw new AirspaceError(`refusing to fetch ${url.host}: not a public hostname; pass \`allowPrivateNetwork\` for a local PDS`)
}
