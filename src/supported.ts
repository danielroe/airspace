import { boundedJson, FETCH_TIMEOUT } from './network.ts'

/**
 * Does this PDS serve permissioned spaces? Unauthenticated, so it can run before a login asks for a `space:` scope.
 *
 * A PDS that validates XRPC params before auth answers 400 naming the missing `space` param; any other answer, including
 * a wording this does not recognise, reads as unsupported.
 */
export async function spacesSupported(service: string): Promise<boolean> {
  const res = await fetch(new URL('/xrpc/com.atproto.simplespace.getSpace', service), { signal: AbortSignal.timeout(FETCH_TIMEOUT), redirect: 'error' })
  if (res.status !== 400)
    return false
  const body = await boundedJson<{ message?: unknown } | null>(res).catch(() => null)
  return typeof body?.message === 'string' && body.message.includes('"space"')
}
