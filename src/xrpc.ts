import type { FetchHandler, FetchHandlerObject } from '@atcute/client'
import { Client, ClientResponseError, ok, simpleFetchHandler } from '@atcute/client'

/** A session from `@atproto/oauth-client-*` or `@atproto/lex-password-session`. */
export interface AtprotoAgent {
  readonly did?: string
  fetchHandler: FetchHandler
}

/** A service to call, with optional default headers and `fetch`. */
export interface ServiceOptions {
  service: string | URL
  headers?: HeadersInit
  fetch?: typeof globalThis.fetch
}

/**
 * Anything that can make authenticated XRPC calls: an `@atproto` OAuth or
 * password session, an `@atcute` session (anything with `handle()`), a fetch
 * handler, or a service URL.
 */
export type SessionInput = AtprotoAgent | FetchHandlerObject | FetchHandler | ServiceOptions | string | URL

type Params = Record<string, unknown>

export interface Xrpc {
  query: <T = any>(nsid: string, params?: Params) => Promise<T>
  /** Resolves to `undefined` when the method has no output. */
  procedure: <T = any>(nsid: string, input?: unknown, params?: Params) => Promise<T>
  uploadBlob: (bytes: Uint8Array, mimeType: string) => Promise<{ blob: unknown }>
}

function serviceHandler({ service, headers, fetch: custom }: ServiceOptions): FetchHandler {
  // `fetch` is read per request so a dispatcher installed after construction is honoured.
  const handler = simpleFetchHandler({ service, fetch: (input, init) => (custom ?? fetch)(input, init) })
  if (!headers)
    return handler
  return (pathname, init) => {
    const merged = new Headers(headers)
    new Headers(init.headers).forEach((value, key) => merged.set(key, value))
    return handler(pathname, { ...init, headers: merged })
  }
}

function toHandler(session: SessionInput): FetchHandler | FetchHandlerObject {
  if (typeof session === 'string' || session instanceof URL)
    return serviceHandler({ service: session })
  if (typeof session === 'function')
    return session
  if ('handle' in session && typeof session.handle === 'function')
    return session
  if ('fetchHandler' in session && typeof session.fetchHandler === 'function')
    return (pathname, init) => session.fetchHandler(pathname, init)
  return serviceHandler(session as ServiceOptions)
}

export function createXrpc(session: SessionInput): Xrpc {
  const client = new Client({ handler: toHandler(session) })
  return {
    query: (nsid, params) => ok(client.get(nsid as never, { params } as never)) as Promise<any>,
    async procedure(nsid, input, params) {
      const res = await ok(client.post(nsid as never, { input, params, as: 'bytes' } as never)) as Uint8Array
      return res.byteLength ? JSON.parse(new TextDecoder().decode(res)) : undefined
    },
    uploadBlob: (bytes, mimeType) => ok(client.post('com.atproto.repo.uploadBlob' as never, { input: bytes, headers: { 'content-type': mimeType } } as never)) as Promise<any>,
  }
}

/** Run every call through `wrap`. */
export function wrapXrpc(xrpc: Xrpc, wrap: <T>(call: () => Promise<T>) => Promise<T>): Xrpc {
  return {
    query: (nsid, params) => wrap(() => xrpc.query(nsid, params)),
    procedure: (nsid, input, params) => wrap(() => xrpc.procedure(nsid, input, params)),
    uploadBlob: (bytes, mimeType) => wrap(() => xrpc.uploadBlob(bytes, mimeType)),
  }
}

export const isXrpcError = (err: unknown): err is ClientResponseError => err instanceof ClientResponseError

/** The message the service sent with an XRPC error. */
export const xrpcMessage = (err: ClientResponseError): string => err.description ?? ''
