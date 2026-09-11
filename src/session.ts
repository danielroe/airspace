import type { LoginOptions, PasswordSession } from '@atproto/lex-password-session'

export type { LoginOptions as PasswordSessionOptions }

/**
 * Log in with an app password and return the session to pass to `createAirspace`.
 * `@atproto/lex-password-session` is loaded on first call, so a read-only build
 * never pays for it.
 */
export async function passwordSession(options: LoginOptions | string | URL): Promise<PasswordSession> {
  const { PasswordSession } = await import('@atproto/lex-password-session')
  return await PasswordSession.login(options)
}
