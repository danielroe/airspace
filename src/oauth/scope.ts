import { AirspaceError } from '../errors.ts'

/** The `scope` to request, narrowed to `requested` when given. Falls back to the client's full scope. */
export function consentScope(declared: readonly string[], requested: readonly string[] | undefined, fallback: string | undefined): string | undefined {
  if (!requested)
    return fallback
  const unknown = requested.find(scope => !declared.includes(scope))
  if (unknown !== undefined)
    throw new AirspaceError(`"${unknown}" is not among the client's scopes`)
  if (!requested.includes('atproto'))
    throw new AirspaceError('every consent must include the "atproto" scope')
  return requested.join(' ')
}
