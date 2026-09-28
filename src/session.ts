import type { PasswordSession, PasswordSessionLoginCredentials, PasswordSessionLoginOptions } from '@atcute/password-session'

export type { PasswordSessionLoginOptions, PasswordSessionLoginCredentials as PasswordSessionOptions }

/**
 * Log in with an app password and return the session to pass to `createAirspace`.
 * `@atcute/password-session` is loaded on first call, so a read-only build
 * never pays for it.
 */
export async function passwordSession(credentials: PasswordSessionLoginCredentials | string | URL, options?: PasswordSessionLoginOptions): Promise<PasswordSession> {
  const { PasswordSession } = await import('@atcute/password-session')
  return await PasswordSession.login(credentials, options)
}
