import { useRuntimeConfig } from 'nitro/runtime-config'
import { createError, defineEventHandler, getRequestHeader, getRequestURL } from 'nuxt/server'
import { blobLimit, inspect, repoMatches } from '../../utils/demo-proxy.ts'
import { accountForGrant, sessionFor } from '../../utils/demo.ts'

const forwarded = new Set(['content-type', 'accept', 'atproto-accept-labelers', 'atproto-proxy'])

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const method = url.pathname.split('/xrpc/')[1]
  if (!method || !/^[a-z][\w.-]*$/i.test(method))
    throw createError({ statusCode: 404, message: 'unknown xrpc method' })
  const read = event.req.method === 'GET' || event.req.method === 'HEAD'
  const type = getRequestHeader(event, 'content-type') ?? ''
  const raw = read ? undefined : new Uint8Array(await event.req.arrayBuffer())

  if (raw && raw.byteLength > blobLimit)
    throw createError({ statusCode: 413, message: `the demo proxy accepts at most ${blobLimit} bytes` })

  let body: unknown
  if (raw?.byteLength && type.includes('json')) {
    try {
      body = JSON.parse(new TextDecoder().decode(raw))
    }
    catch {
      throw createError({ statusCode: 400, message: 'the request body is not valid JSON' })
    }
  }

  const decision = inspect({ method, params: url.searchParams, body })
  if (!decision.ok)
    throw createError({ statusCode: decision.status, message: decision.message })

  const token = getRequestHeader(event, 'authorization')?.match(/^Bearer (.+)$/i)?.[1]
  const account = accountForGrant(token)
  if (decision.authenticated && !account)
    throw createError({ statusCode: 401, message: 'the demo credentials are missing or expired; copy them again from the profile page' })
  if (account && !repoMatches(account.did, { params: url.searchParams, body }))
    throw createError({ statusCode: 403, message: 'the demo grant can only write to its own repo' })

  const headers = new Headers()
  for (const name of forwarded) {
    const value = getRequestHeader(event, name)
    if (value)
      headers.set(name, value)
  }

  const path = `/xrpc/${method}${url.search}`
  const response = account
    ? await (await sessionFor(account)).fetchHandler(path, { method: event.req.method, headers, body: raw })
    : await fetch(new URL(path, useRuntimeConfig().pdsService), { method: event.req.method, headers, body: raw })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
})
