import { describe, expect, it } from 'vitest'
import { createXrpc } from '../src/xrpc.ts'

function respond(calls: string[]) {
  return async (pathname: string, init: RequestInit) => {
    calls.push(`${init.method?.toUpperCase()} ${pathname} ${new Headers(init.headers).get('authorization') ?? ''}`.trim())
    return Response.json({ ok: true })
  }
}

describe('createXrpc', () => {
  it('accepts an @atcute session', async () => {
    const calls: string[] = []
    const handle = respond(calls)
    await createXrpc({ handle }).query('com.example.get', { a: 1 })
    expect(calls).toEqual(['GET /xrpc/com.example.get?a=1'])
  })

  it('accepts an @atproto agent', async () => {
    const calls: string[] = []
    await createXrpc({ did: 'did:plc:a', fetchHandler: respond(calls) }).procedure('com.example.post', { a: 1 })
    expect(calls).toEqual(['POST /xrpc/com.example.post'])
  })

  it('accepts service options with default headers', async () => {
    const calls: string[] = []
    const fetch = (async (input: string, init: RequestInit) => respond(calls)(new URL(input).pathname, init)) as typeof globalThis.fetch
    await createXrpc({ service: 'https://pds.example', headers: { authorization: 'Bearer x' }, fetch }).query('com.example.get')
    expect(calls).toEqual(['GET /xrpc/com.example.get Bearer x'])
  })

  it('resolves a procedure with no output to undefined', async () => {
    const xrpc = createXrpc(async () => new Response(null, { status: 200 }))
    await expect(xrpc.procedure('com.example.post')).resolves.toBeUndefined()
  })
})
