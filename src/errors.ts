import type { LexValidationError } from '@atproto/lex-schema'

import type { ValidationIssue } from './types.ts'

export class AirspaceError extends Error {
  override name = 'AirspaceError'
  constructor(message: string, options?: ErrorOptions) {
    super(`[airspace] ${message}`, options)
  }
}

/** The PDS does not serve permissioned spaces. */
export class SpacesUnsupportedError extends AirspaceError {
  override name = 'SpacesUnsupportedError'
  readonly service: string
  constructor(service: string, options?: ErrorOptions) {
    super(`${service} does not serve permissioned spaces`, options)
    this.service = service
  }
}

/** A record failed schema validation before it reached the PDS. */
export class ValidationError extends AirspaceError {
  override name = 'ValidationError'
  readonly issues: ValidationIssue[]
  constructor(context: string, cause: LexValidationError) {
    super(`${context}: ${cause.message}`, { cause })
    this.issues = issuesOf(cause)
  }
}

/** A write with `ifMatch` reached a record the PDS says has a different CID. */
export class ConflictError extends AirspaceError {
  override name = 'ConflictError'
  readonly collection: string
  readonly rkey: string
  /** The CID passed as `ifMatch`, which is no longer the record's. */
  readonly cid: string
  constructor(collection: string, rkey: string, cid: string, options?: ErrorOptions) {
    super(`${collection}/${rkey} has changed since ${cid}`, options)
    this.collection = collection
    this.rkey = rkey
    this.cid = cid
  }
}

/** The session's grant predates a collection in the model, so the PDS refused the write. */
export class ScopeError extends AirspaceError {
  override name = 'ScopeError'
  readonly missingScope: string
  constructor(missingScope: string, options?: ErrorOptions) {
    super(`the session is missing the "${missingScope}" scope; the user has to authorize again`, options)
    this.missingScope = missingScope
  }
}

function issuesOf(error: LexValidationError): ValidationIssue[] {
  return error.issues.map((issue) => {
    const path = [...issue.path, ...('key' in issue && typeof issue.key === 'string' ? [issue.key] : [])]
    return { path: path.map(String).join('.'), message: issue.message }
  })
}
