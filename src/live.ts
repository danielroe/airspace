/** One repo commit, as Jetstream reports it. `record` is absent on a delete. */
export interface Commit {
  did: string
  /** Microseconds since the epoch. Pass the last one you saw back as `cursor` to resume. */
  timeUs: number
  operation: 'create' | 'update' | 'delete'
  collection: string
  rkey: string
  cid?: string
  record?: Record<string, unknown>
}

export interface SubscribeOptions {
  /** DIDs to watch. At least one is required here; watching the whole firehose is not what this is for. */
  did: string | readonly string[]
  /** NSIDs to watch. Every collection in the repo when omitted. */
  collections?: readonly string[]
  onCommit: (commit: Commit) => void
  /** Defaults to `wss://jetstream1.us-east.bsky.network`. */
  service?: string
  /** Microseconds since the epoch. Jetstream replays from here inclusive, so the commit at exactly this time is delivered again. */
  cursor?: number
  /** Called for a socket error or a message that will not parse. The subscription stays up. */
  onError?: (error: unknown) => void
  /** Reconnect delay in milliseconds, doubling up to a minute. Pass 0 for no reconnect. */
  retry?: number
  /** For a runtime whose `WebSocket` is not global. */
  WebSocket?: typeof globalThis.WebSocket
}

const DEFAULT_SERVICE = 'wss://jetstream1.us-east.bsky.network'
const MAX_RETRY = 60_000

const list = (value: string | readonly string[]): readonly string[] => typeof value === 'string' ? [value] : value

/** The URL a subscription connects to, exported so it can be asserted without a socket. */
export function subscribeUrl(options: Pick<SubscribeOptions, 'did' | 'collections' | 'service' | 'cursor'>): string {
  const url = new URL('/subscribe', options.service ?? DEFAULT_SERVICE)
  for (const did of list(options.did)) url.searchParams.append('wantedDids', did)
  for (const nsid of options.collections ?? []) url.searchParams.append('wantedCollections', nsid)
  if (options.cursor !== undefined)
    url.searchParams.set('cursor', String(options.cursor))
  return url.toString()
}

interface JetstreamMessage {
  did?: string
  time_us?: number
  kind?: string
  commit?: { operation?: string, collection?: string, rkey?: string, cid?: string, record?: Record<string, unknown> }
}

/** A commit, or `undefined` for anything that is not one. Exported for the same reason as `subscribeUrl`. */
export function toCommit(data: string): Commit | undefined {
  const message = JSON.parse(data) as JetstreamMessage
  const commit = message.commit
  if (message.kind !== 'commit' || !commit?.collection || !commit.rkey || !message.did)
    return undefined
  const operation = commit.operation
  if (operation !== 'create' && operation !== 'update' && operation !== 'delete')
    return undefined
  return {
    did: message.did,
    timeUs: message.time_us ?? 0,
    operation,
    collection: commit.collection,
    rkey: commit.rkey,
    cid: commit.cid,
    record: commit.record,
  }
}

/**
 * Watch one or more repos over Jetstream and call `onCommit` for every write.
 *
 * Nothing here is specific to airspace: it takes DIDs and NSIDs and hands back parsed commits, so it
 * runs in a browser, a worker or a server. Returns a function that closes the socket for good.
 */
export function subscribe(options: SubscribeOptions): () => void {
  const Socket = options.WebSocket ?? globalThis.WebSocket
  if (!Socket)
    throw new Error('[airspace] no WebSocket in this runtime; pass one as `WebSocket`')

  const base = options.retry ?? 1000
  let cursor = options.cursor
  let closed = false
  let delay = base
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const connect = (): void => {
    if (closed)
      return
    socket = new Socket(subscribeUrl({ ...options, cursor }))
    socket.onopen = () => {
      delay = base
    }
    socket.onmessage = (event: MessageEvent) => {
      try {
        const commit = toCommit(String(event.data))
        if (!commit)
          return
        // Jetstream's cursor is inclusive, so resuming from the last `timeUs` redelivers that commit.
        cursor = commit.timeUs + 1
        options.onCommit(commit)
      }
      catch (error) {
        options.onError?.(error)
      }
    }
    socket.onerror = event => options.onError?.(event)
    socket.onclose = () => {
      if (closed || !base)
        return
      timer = setTimeout(connect, delay)
      delay = Math.min(delay * 2, MAX_RETRY)
    }
  }

  connect()

  return () => {
    closed = true
    if (timer)
      clearTimeout(timer)
    socket?.close()
  }
}

/**
 * Keep an airspace's cache honest by dropping a collection when its repo commits. Structural in `airspace`,
 * so this file still pulls in nothing from the client.
 */
export function invalidateOn(
  airspace: { invalidate: (collection?: string) => void },
  options: Omit<SubscribeOptions, 'onCommit'> & { onCommit?: SubscribeOptions['onCommit'] },
): () => void {
  return subscribe({
    ...options,
    onCommit: (commit) => {
      airspace.invalidate(commit.collection)
      options.onCommit?.(commit)
    },
  })
}
