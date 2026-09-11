import type { Cid } from '@atproto/lex-data'
import type { AtUriString, CidString, DidString, Infer, InferRecordKey, RecordSchema } from '@atproto/lex-schema'

export type { DidString, Infer, InferRecordKey, RecordSchema }

type WidenString<T extends string> = string extends T ? T : Record<never, never> extends Record<T, 1> ? string : T

/**
 * A lex value as plain JSON: CIDs become `{ $link }`, bytes `{ $bytes }`, and
 * format-template strings (`datetime`, `at-uri`, `did`...) widen to `string`.
 * Literal unions such as `knownValues` and `$type` are kept.
 */
export type Plain<T> = T extends string
  ? WidenString<T>
  : T extends number | boolean | null | undefined
    ? T
    : T extends Cid
      ? { $link: string }
      : T extends Uint8Array
        ? { $bytes: string }
        : T extends (infer U)[]
          ? Plain<U>[]
          : T extends object
            ? { [K in keyof T]: Plain<T[K]> }
            : T

/** A record with its envelope. Plain JSON. */
export interface AirspaceRecord<S extends RecordSchema, M = Record<never, never>> {
  uri: AtUriString
  cid: CidString
  rkey: InferRecordKey<S>
  author: DidString
  value: Plain<Infer<S>>
  meta: M
}

/** A record fetched by URI without naming a collection, so nothing validated its value. */
export interface UnknownRecord {
  uri: AtUriString
  cid: CidString
  rkey: string
  author: DidString
  value: unknown
}

export interface WriteResult<S extends RecordSchema> {
  uri: AtUriString
  cid: CidString
  rkey: InferRecordKey<S>
  /** `false` only when `ifChanged` found the record already identical. */
  changed: boolean
}

export type RecordInput<S extends RecordSchema> = Omit<Plain<Infer<S>>, '$type'>

export type IsSingleton<S extends RecordSchema> = S['key'] extends `literal:${string}` ? true : false

export type SortSpec<T> = readonly [field: keyof T & string, direction?: 'asc' | 'desc']

/** Everything `com.atproto.repo.listRecords` can do on its own. */
export interface PageQuery {
  limit?: number
  /** The `cursor` from the previous page. */
  cursor?: string
  /** Oldest first. Records are newest first by default, because record keys are TIDs. */
  reverse?: boolean
}

export interface ListQuery<T> {
  /** Equality on top-level fields, or a predicate over the record's `value`. Applied after fetching. */
  where?: Partial<T> | ((value: T) => boolean)
  sort?: readonly SortSpec<T>[]
  limit?: number
  offset?: number
}

export interface ValidationIssue {
  path: string
  message: string
}

export type ValidationResult = { ok: true } | { ok: false, issues: ValidationIssue[] }

export interface Identity {
  did: DidString
  handle?: string
  /** PDS base URL. */
  service: string
}
